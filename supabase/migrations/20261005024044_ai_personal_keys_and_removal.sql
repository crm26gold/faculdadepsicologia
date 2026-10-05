-- Pending remote application: deploy compatible code first, then apply and align this version.
-- Personal ciphertext is never readable through the Data API, including by the owner.
create table private.ai_user_keys (
 user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in('gemini','groq','mistral','deepseek','xai','openrouter','openai','anthropic')),
 key_ciphertext text not null check(char_length(key_ciphertext) between 1 and 20000),
 key_hint text not null check(char_length(key_hint) between 1 and 12),
 enabled boolean not null default false,privacy_basis text check(privacy_basis in('paid','no_training')),
 check(not enabled or (privacy_basis is not null and (provider<>'gemini' or privacy_basis='paid'))),
 updated_at timestamptz not null default now(),primary key(user_id,provider)
);
alter table private.ai_user_keys enable row level security;
revoke all on private.ai_user_keys from public,anon,authenticated;
create table private.ai_member_policy (
 id boolean primary key default true check(id),base_enabled boolean not null default false,updated_at timestamptz not null default now()
);
insert into private.ai_member_policy default values;
alter table private.ai_member_policy enable row level security;
revoke all on private.ai_member_policy from public,anon,authenticated;
-- Approval names a particular credential revision. Replacing the credential cannot inherit approval.
create table private.ai_member_base_sources (
 source_id text primary key,provider text not null references public.ai_providers(id),
 connection_id uuid references private.ai_connections(id) on delete cascade,
 cipher_hash text not null check(cipher_hash ~ '^[a-f0-9]{64}$'),
 privacy_basis text not null check(privacy_basis in('paid','no_training') and (provider<>'gemini' or privacy_basis='paid')),
 updated_at timestamptz not null default now(),
 check(source_id=case when connection_id is null then 'provider:'||provider else 'connection:'||connection_id::text end),
 check(provider in('gemini','groq','mistral','deepseek','xai','openrouter','openai','anthropic'))
);
alter table private.ai_member_base_sources enable row level security;
revoke all on private.ai_member_base_sources from public,anon,authenticated;

create function private.ai_personal_candidates(person uuid,task_id text) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('provider',k.provider,'model',m.model,'base_url','','gcp_project','','gcp_location','',
 'key_ciphertext',k.key_ciphertext,'source','personal') order by private.ai_auto_rank(task_id,k.provider)),'[]'::jsonb)
 from private.ai_user_keys k cross join lateral(select private.ai_auto_model(task_id,k.provider,'auto:rapido') model)m
 where k.user_id=person and k.enabled and m.model is not null and task_id in('assistente','organizar','voz')
 and (task_id<>'voz' or k.provider in('gemini','openai','xai'));
$$;
create function private.ai_runtime_for(person uuid,task_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare personal jsonb; configured jsonb; candidates jsonb; row jsonb; is_owner boolean;
begin
 if person is null or not exists(select 1 from public.accounts where user_id=person) or task_id not in('assistente','organizar','voz') then return null; end if;
 select exists(select 1 from public.app_owner where user_id=person) into is_owner;
 personal:=case when is_owner and task_id='voz' then '[]'::jsonb else private.ai_personal_candidates(person,task_id) end;candidates:=personal;
 if is_owner or (task_id<>'voz' and coalesce((select base_enabled from private.ai_member_policy where id),false)) then
  configured:=private.ai_task_config(task_id);
  if configured is not null then
   for row in select value from jsonb_array_elements(jsonb_build_array(configured-'alternatives'-'routing')||coalesce(configured->'alternatives','[]'::jsonb)) loop
    if is_owner or exists(select 1 from private.ai_member_base_sources approved where approved.source_id=row->>'source_id' and approved.provider=row->>'provider'
      and approved.cipher_hash=encode(extensions.digest(row->>'key_ciphertext','sha256'),'hex')) then
     candidates:=candidates||jsonb_build_array(row||jsonb_build_object('source',case when is_owner then 'owner' else 'base' end));
    end if;
   end loop;
  end if;
 end if;
 if jsonb_array_length(candidates)=0 then return null; end if;
 select jsonb_agg(e.value order by e.ord) into candidates from jsonb_array_elements(candidates) with ordinality e(value,ord) where e.ord<=8;
 return (candidates->0)||jsonb_build_object('alternatives',candidates-0,'routing',case when jsonb_array_length(personal)>0 then 'auto' else coalesce(configured->>'routing','fixed') end);
end;
$$;
revoke all on function private.ai_personal_candidates(uuid,text),private.ai_runtime_for(uuid,text) from public,anon,authenticated;
create or replace function private.ai_runtime(task_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_owner() then return null; end if;
 -- The administration tests its configured routes. Personal priority is resolved only by the server-proof RPC.
 return private.ai_task_config(task_id);
end;
$$;
-- The authenticated browser only receives metadata. Runtime ciphertext additionally requires the server proof.
create function public.ai_runtime_for_current(server_secret text,task_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.jornada_budget_check(server_secret);
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 return private.ai_runtime_for(auth.uid(),task_id);
end;
$$;
create or replace function private.bot_context(server_secret text,channel_id text,chat text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare person uuid; runtime jsonb;
begin
 perform private.bot_check(server_secret);
 select l.user_id into person from public.messenger_links l where l.channel=channel_id and l.chat_id=chat;
 if person is null then return null; end if;
 runtime:=private.ai_runtime_for(person,'assistente');
 return jsonb_build_object('user_id',person,'workspace',(select jsonb_build_object('data',w.data,'revision',w.revision) from public.personal_workspaces w where w.owner_id=person),
  'ai',runtime,'history',coalesce((select jsonb_agg(jsonb_build_object('role',h.role,'text',h.body) order by h.id)
  from(select m.id,m.role,m.body from public.messenger_messages m where m.user_id=person and m.channel=channel_id order by m.id desc limit 12)h),'[]'::jsonb),
  'last_applied',(select m.applied from public.messenger_messages m where m.user_id=person and m.channel=channel_id and m.role='assistant' order by m.id desc limit 1));
end;
$$;

create function public.ai_my_keys() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner boolean; sources jsonb;
begin
 if actor is null or not exists(select 1 from public.accounts where user_id=actor) then raise exception 'Authentication required' using errcode='42501'; end if;
 owner:=private.is_owner();
 if owner then
  select coalesce(jsonb_agg(jsonb_build_object('provider',c.provider,'connection_id',c.connection_id,'label',c.label,
   'privacy_basis',(select a.privacy_basis from private.ai_member_base_sources a where a.source_id=c.source_id and a.cipher_hash=encode(extensions.digest(c.key_ciphertext,'sha256'),'hex'))) order by c.provider,c.label),'[]'::jsonb)
  into sources from (
   select p.id provider,null::uuid connection_id,coalesce(nullif(p.label,''),p.id) label,'provider:'||p.id source_id,p.key_ciphertext
    from public.ai_providers p where p.enabled and p.key_ciphertext<>'' and p.id in('gemini','groq','mistral','deepseek','xai','openrouter','openai','anthropic')
   union all select c.provider,c.id,c.label,'connection:'||c.id::text,c.key_ciphertext from private.ai_connections c
    where c.enabled and c.provider in('gemini','groq','mistral','deepseek','xai','openrouter','openai','anthropic')
  )c;
 end if;
 return jsonb_build_object('available',true,'isOwner',owner,'baseEnabled',coalesce((select base_enabled from private.ai_member_policy where id),false),
  'keys',coalesce((select jsonb_agg(jsonb_build_object('provider',provider,'enabled',enabled,'key_hint',key_hint,'updated_at',updated_at,'privacy_basis',privacy_basis) order by provider) from private.ai_user_keys where user_id=actor),'[]'::jsonb),
  'baseSources',coalesce(sources,'[]'::jsonb));
end;
$$;
create function public.ai_my_key_save(server_secret text,provider_id text,next_ciphertext text,next_hint text,next_enabled boolean,next_privacy_basis text default null) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 perform private.jornada_budget_check(server_secret);
 if actor is null or not exists(select 1 from public.accounts where user_id=actor) then raise exception 'Authentication required' using errcode='42501'; end if;
 if next_enabled and (next_privacy_basis is null or (provider_id='gemini' and next_privacy_basis<>'paid')) then raise exception 'Confirm eligible API privacy terms before enabling' using errcode='22023'; end if;
 insert into private.ai_user_keys(user_id,provider,key_ciphertext,key_hint,enabled,privacy_basis) values(actor,provider_id,next_ciphertext,next_hint,next_enabled,next_privacy_basis)
 on conflict(user_id,provider) do update set key_ciphertext=excluded.key_ciphertext,key_hint=excluded.key_hint,enabled=excluded.enabled,privacy_basis=excluded.privacy_basis,updated_at=now();
end;
$$;
create function public.ai_my_key_runtime(server_secret text,provider_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.jornada_budget_check(server_secret);
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 return(select jsonb_build_object('provider',provider,'model','auto:rapido','base_url','','gcp_project','','gcp_location','',
  'key_ciphertext',key_ciphertext,'source','personal') from private.ai_user_keys where user_id=auth.uid() and provider=provider_id);
end;
$$;
create function public.ai_my_key_set(provider_id text,next_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if next_enabled and exists(select 1 from private.ai_user_keys where user_id=auth.uid() and provider=provider_id and (privacy_basis is null or (provider='gemini' and privacy_basis<>'paid'))) then raise exception 'Confirm eligible API privacy terms before enabling' using errcode='22023'; end if;
 update private.ai_user_keys set enabled=next_enabled,updated_at=now() where user_id=auth.uid() and provider=provider_id;
 if not found then raise exception 'Key not found' using errcode='P0002'; end if;
end;
$$;
create function public.ai_my_key_remove(provider_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 delete from private.ai_user_keys where user_id=auth.uid() and provider=provider_id;
 if not found then raise exception 'Key not found' using errcode='P0002'; end if;
end;
$$;
create function public.ai_set_member_base(next_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 if next_enabled is null then raise exception 'Invalid policy' using errcode='22023'; end if;
 update private.ai_member_policy set base_enabled=next_enabled,updated_at=now() where id;
 perform private.audit('ai_member_base',null,null,jsonb_build_object('enabled',next_enabled));
end;
$$;
create function public.ai_set_member_base_source(provider_id text,connection_id uuid,next_privacy_basis text) returns void
language plpgsql security definer set search_path='' as $$
declare source_key text; current_key text;
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 source_key:=case when connection_id is null then 'provider:'||provider_id else 'connection:'||connection_id::text end;
 if next_privacy_basis is null then delete from private.ai_member_base_sources a where a.source_id=source_key;
 else
  if connection_id is null then select p.key_ciphertext into current_key from public.ai_providers p where p.id=provider_id and p.enabled;
  else select c.key_ciphertext into current_key from private.ai_connections c where c.id=connection_id and c.provider=provider_id and c.enabled; end if;
  if current_key is null or current_key='' then raise exception 'Connection unavailable' using errcode='22023'; end if;
  insert into private.ai_member_base_sources(source_id,provider,connection_id,cipher_hash,privacy_basis)
   values(source_key,provider_id,connection_id,encode(extensions.digest(current_key,'sha256'),'hex'),next_privacy_basis)
   on conflict(source_id) do update set cipher_hash=excluded.cipher_hash,privacy_basis=excluded.privacy_basis,updated_at=now();
 end if;
 perform private.audit('ai_member_base_source',null,null,jsonb_build_object('provider',provider_id,'connection',connection_id,'privacy_basis',next_privacy_basis));
end;
$$;

-- Personal APIs do not spend the owner's shared quota. Account limits remain atomic across channels.
create function private.reserve_jornada_budget_source(actor uuid,budget_scope text,budget_units integer,credential_source text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 current_at timestamptz:=clock_timestamp();minute_at timestamptz:=date_trunc('minute',current_at);
 day_at timestamptz:=date_trunc('day',current_at at time zone 'UTC') at time zone 'UTC';
 minute_limit integer;day_limit integer;accepted boolean;row_state private.jornada_request_limits%rowtype;
begin
 if credential_source in('base','owner') then return private.reserve_jornada_budget(actor,budget_scope,budget_units); end if;
 if credential_source is distinct from 'personal' then raise exception 'Invalid credential source' using errcode='22023'; end if;
 if actor is null or not exists(select 1 from public.accounts where user_id=actor) then raise exception 'Authentication required' using errcode='42501'; end if;
 if budget_scope='ai' then minute_limit:=40;day_limit:=400;
 elsif budget_scope='live' then minute_limit:=4;day_limit:=40;
 else raise exception 'Invalid personal scope' using errcode='22023'; end if;
 if budget_units is distinct from 1 then raise exception 'Invalid units' using errcode='22023'; end if;
 insert into private.jornada_request_limits as existing(user_id,scope,minute_start,minute_count,day_start,day_count)
 values(actor,budget_scope,minute_at,budget_units,day_at,budget_units)
 on conflict(user_id,scope) do update set minute_start=minute_at,
 minute_count=case when existing.minute_start=minute_at then existing.minute_count+budget_units else budget_units end,
 day_start=day_at,day_count=case when existing.day_start=day_at then existing.day_count+budget_units else budget_units end
 where (existing.minute_start<>minute_at or existing.minute_count<=minute_limit-budget_units)
 and (existing.day_start<>day_at or existing.day_count<=day_limit-budget_units) returning true into accepted;
 if accepted then return jsonb_build_object('allowed',true); end if;
 select * into row_state from private.jornada_request_limits where user_id=actor and scope=budget_scope;
 return jsonb_build_object('allowed',false,'limited_by','account','retry_after',greatest(1,ceil(extract(epoch from
 (case when row_state.day_start=day_at and row_state.day_count>day_limit-budget_units then day_at+interval '1 day' else minute_at+interval '1 minute' end)-current_at))));
end;
$$;
revoke all on function private.reserve_jornada_budget_source(uuid,text,integer,text) from public,anon,authenticated;
create function public.app_consume_jornada_budget_source(server_secret text,budget_scope text,budget_units integer default 1,credential_source text default 'owner') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.jornada_budget_check(server_secret);
 return private.reserve_jornada_budget_source(auth.uid(),budget_scope,budget_units,credential_source);
end;
$$;
create function public.bot_consume_jornada_budget_source(server_secret text,channel_id text,chat text,budget_scope text,budget_units integer default 1,credential_source text default 'owner') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 perform private.bot_check(server_secret);
 if budget_scope not in('ai','upload') then raise exception 'Invalid bot scope' using errcode='22023'; end if;
 select user_id into actor from public.messenger_links where channel=channel_id and chat_id=chat;
 return private.reserve_jornada_budget_source(actor,budget_scope,budget_units,credential_source);
end;
$$;
revoke all on function public.bot_consume_jornada_budget_source(text,text,text,text,integer,text) from public,authenticated;
grant execute on function public.bot_consume_jornada_budget_source(text,text,text,text,integer,text) to anon;

-- Explicit deletion, rather than relying on an empty save field which means "keep".
create function public.ai_remove_provider(provider_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 update public.ai_providers set key_ciphertext='',key_hint='',enabled=false,updated_at=now() where id=provider_id;
 if not found then raise exception 'Provider not found' using errcode='P0002'; end if;
 update public.ai_tasks set enabled=false,updated_at=now() where provider=provider_id and connection_id is null;
 delete from private.ai_member_base_sources where provider=provider_id and connection_id is null;
 update private.whatsapp_bridge set stt_connection='' where stt_connection=provider_id||':primary';
 perform private.audit('ai_provider_removed',null,null,jsonb_build_object('provider',provider_id));
end;
$$;
create or replace function private.ai_remove_connection(connection_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 update public.ai_tasks set enabled=false,connection_id=null,updated_at=now() where ai_tasks.connection_id=ai_remove_connection.connection_id;
 update public.ai_tasks t set fallbacks=coalesce((select jsonb_agg(e.value) from jsonb_array_elements(t.fallbacks)e(value) where e.value->>'connection_id'<>ai_remove_connection.connection_id::text),'[]'::jsonb),updated_at=now()
  where t.fallbacks @> jsonb_build_array(jsonb_build_object('connection_id',ai_remove_connection.connection_id::text));
 delete from private.ai_connections c where c.id=connection_id;
 if not found then raise exception 'Connection not found' using errcode='P0002'; end if;
 update private.whatsapp_bridge set stt_connection='' where stt_connection=ai_remove_connection.connection_id::text;
 perform private.audit('ai_connection_removed',null,null,jsonb_build_object('connection',connection_id));
end;
$$;
-- Every registered account may link its own chat. Codes remain short-lived and single-use.
create or replace function private.messenger_create_code(channel_id text,code_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 if me is null or not exists(select 1 from public.accounts where user_id=me) then raise exception 'Not authorized' using errcode='42501'; end if;
 if channel_id not in('telegram','whatsapp') or code_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid link code' using errcode='22023'; end if;
 delete from public.messenger_link_codes c where c.user_id=me or c.expires_at<now();
 insert into public.messenger_link_codes(code_hash,user_id,channel,expires_at) values(code_hash,me,channel_id,now()+interval '15 minutes');
end;
$$;
create or replace function private.bot_link(server_secret text,channel_id text,chat text,code text) returns boolean
language plpgsql security definer set search_path='' as $$
declare person uuid;
begin
 perform private.bot_check(server_secret);
 delete from public.messenger_link_codes c where c.code_hash=code and c.channel=channel_id and c.expires_at>now() returning c.user_id into person;
 if person is null or not exists(select 1 from public.accounts where user_id=person) then return false; end if;
 delete from public.messenger_links l where (l.channel=channel_id and l.chat_id=chat) or (l.user_id=person and l.channel=channel_id);
 insert into public.messenger_links(channel,chat_id,user_id) values(channel_id,chat,person);
 return true;
end;
$$;
revoke all on function public.ai_my_keys(),public.ai_my_key_save(text,text,text,text,boolean,text),public.ai_my_key_runtime(text,text),
 public.ai_my_key_set(text,boolean),public.ai_my_key_remove(text),public.ai_set_member_base(boolean),public.ai_set_member_base_source(text,uuid,text),
 public.app_consume_jornada_budget_source(text,text,integer,text),public.ai_remove_provider(text),public.ai_runtime_for_current(text,text) from public,anon;
grant execute on function public.ai_my_keys(),public.ai_my_key_save(text,text,text,text,boolean,text),public.ai_my_key_runtime(text,text),
 public.ai_my_key_set(text,boolean),public.ai_my_key_remove(text),public.ai_set_member_base(boolean),public.ai_set_member_base_source(text,uuid,text),
 public.app_consume_jornada_budget_source(text,text,integer,text),public.ai_remove_provider(text),public.ai_runtime_for_current(text,text) to authenticated;
