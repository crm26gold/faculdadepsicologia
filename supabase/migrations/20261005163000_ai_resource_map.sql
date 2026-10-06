-- Resource map (batch A1). The owner sees every connected resource and which ones actually serve
-- each task, computed by the same functions the router uses. A source's privacy declaration (it
-- may receive personal data) is now separate from its audience (only the owner, or members too).
-- No key, route, permission or existing declaration changes behaviour: rows created by the member
-- sharing control keep the members audience.

alter table private.ai_member_base_sources
  add column audience text not null default 'members' check (audience in ('owner','members'));
comment on table private.ai_member_base_sources is
  'Privacy declaration for one credential revision (cipher_hash) and its audience: owner = the owner''s routes only; members = also the member base when it is enabled.';

-- Members receive a base source only when the owner offered it to members, not merely declared it.
create or replace function private.ai_runtime_for(person uuid,task_id text) returns jsonb
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
      and approved.audience='members' and approved.cipher_hash=encode(extensions.digest(row->>'key_ciphertext','sha256'),'hex')) then
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

-- One owner action per source: the declaration and the audience are saved together and audited.
create function private.ai_set_source_policy(provider_id text,connection_id uuid,next_privacy_basis text,next_audience text) returns void
language plpgsql security definer set search_path='' as $$
declare source_key text; current_key text;
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 if next_audience is null or next_audience not in('owner','members') then raise exception 'Invalid audience' using errcode='22023'; end if;
 if next_privacy_basis is not null and (next_privacy_basis not in('paid','no_training') or (provider_id='gemini' and next_privacy_basis<>'paid')) then
  raise exception 'Invalid privacy basis' using errcode='22023'; end if;
 source_key:=case when connection_id is null then 'provider:'||provider_id else 'connection:'||connection_id::text end;
 if next_privacy_basis is null then delete from private.ai_member_base_sources a where a.source_id=source_key;
 else
  if provider_id not in('gemini','groq','mistral','deepseek','xai','openrouter','openai','anthropic') then raise exception 'Declaration unavailable for this provider' using errcode='22023'; end if;
  if connection_id is null then select p.key_ciphertext into current_key from public.ai_providers p where p.id=provider_id and p.enabled;
  else select c.key_ciphertext into current_key from private.ai_connections c where c.id=connection_id and c.provider=provider_id and c.enabled; end if;
  if current_key is null or current_key='' then raise exception 'Connection unavailable' using errcode='22023'; end if;
  insert into private.ai_member_base_sources(source_id,provider,connection_id,cipher_hash,privacy_basis,audience)
   values(source_key,provider_id,connection_id,encode(extensions.digest(current_key,'sha256'),'hex'),next_privacy_basis,next_audience)
   on conflict(source_id) do update set cipher_hash=excluded.cipher_hash,privacy_basis=excluded.privacy_basis,audience=excluded.audience,updated_at=now();
 end if;
 perform private.audit('ai_source_policy',null,null,jsonb_build_object('provider',provider_id,'connection',connection_id,
  'privacy_basis',next_privacy_basis,'audience',case when next_privacy_basis is null then null else next_audience end));
end;
$$;
-- The earlier control keeps its meaning: declaring through it offers the source to members.
create or replace function public.ai_set_member_base_source(provider_id text,connection_id uuid,next_privacy_basis text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.ai_set_source_policy(provider_id,connection_id,next_privacy_basis,'members');
end;
$$;
-- Members' key metadata is unchanged. The owner's base list reports only sources offered to members.
create or replace function public.ai_my_keys() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); owner boolean; sources jsonb;
begin
 if actor is null or not exists(select 1 from public.accounts where user_id=actor) then raise exception 'Authentication required' using errcode='42501'; end if;
 owner:=private.is_owner();
 if owner then
  select coalesce(jsonb_agg(jsonb_build_object('provider',c.provider,'connection_id',c.connection_id,'label',c.label,
   'privacy_basis',(select a.privacy_basis from private.ai_member_base_sources a where a.source_id=c.source_id and a.audience='members' and a.cipher_hash=encode(extensions.digest(c.key_ciphertext,'sha256'),'hex'))) order by c.provider,c.label),'[]'::jsonb)
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

-- Explanations only: the router keeps its own functions. Each helper reuses the router's predicates.
create function private.ai_source_reason(provider_id text,connection_id uuid,model text) returns text
language plpgsql stable security definer set search_path='' as $$
declare ciphertext text; is_enabled boolean; source_key text;
begin
 if connection_id is null then
  select p.key_ciphertext,p.enabled into ciphertext,is_enabled from public.ai_providers p where p.id=provider_id;
  if not found then return 'missing'; end if;
  if ciphertext='' then return 'no_key'; end if;
 else
  select c.key_ciphertext,c.enabled,c.provider into ciphertext,is_enabled,provider_id from private.ai_connections c where c.id=connection_id;
  if not found then return 'missing'; end if;
 end if;
 if not is_enabled then return 'disabled'; end if;
 if coalesce(model,'')='' then return 'no_model'; end if;
 if not private.ai_automatic_source_allowed(provider_id,connection_id,ciphertext) then
  source_key:=case when connection_id is null then 'provider:'||provider_id else 'connection:'||connection_id::text end;
  return case when exists(select 1 from private.ai_member_base_sources a where a.source_id=source_key) then 'declaration_stale' else 'declaration_missing' end;
 end if;
 return null;
end;
$$;
create function private.ai_source_declaration(source_key text,ciphertext text) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('privacy_basis',a.privacy_basis,'audience',a.audience,
   'current',coalesce(ciphertext,'')<>'' and a.cipher_hash=encode(extensions.digest(ciphertext,'sha256'),'hex'))
   from private.ai_member_base_sources a where a.source_id=source_key),
  jsonb_build_object('privacy_basis',null,'audience',null,'current',false));
$$;
-- Ordered candidates without credentials. Personal candidates carry no source_id in the runtime.
create function private.ai_chain(runtime jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('source_id',coalesce(x.e->>'source_id','personal:'||(x.e->>'provider')),'provider',x.e->>'provider',
   'model',x.e->>'model','source',coalesce(x.e->>'source','owner')) order by x.ord),'[]'::jsonb)
 from jsonb_array_elements(case when runtime is null then '[]'::jsonb
   else jsonb_build_array(runtime-'alternatives'-'routing')||coalesce(runtime->'alternatives','[]'::jsonb) end) with ordinality x(e,ord);
$$;
create function private.ai_source_state(t public.ai_tasks,resource jsonb,chain jsonb,route_items jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sid text:=resource->>'source_id'; provider_id text:=resource->>'provider'; conn uuid:=(resource->>'connection_id')::uuid;
 pos bigint; routed jsonb; capable boolean; reason text; fallback_reason text;
begin
 select x.ord into pos from jsonb_array_elements(chain) with ordinality x(e,ord) where x.e->>'source_id'=sid limit 1;
 select e into routed from jsonb_array_elements(route_items) e where e->>'source_id'=sid limit 1;
 if pos is not null then
  return jsonb_build_object('source_id',sid,'state','active','position',pos,
   'role',coalesce(routed->>'role',case when resource->>'kind'='personal' then 'personal' else 'auto' end));
 end if;
 capable:=case when t.id='voz' then provider_id in('gemini','openai','xai','elevenlabs') else provider_id<>'elevenlabs' end;
 if resource->>'kind'='personal' then
  if t.id='voz' then return jsonb_build_object('source_id',sid,'state','unusable','reason','owner_voice_uses_admin'); end if;
  return jsonb_build_object('source_id',sid,'state','unusable','reason',case when (resource->>'enabled')::boolean then 'not_selected' else 'disabled' end);
 end if;
 if not capable then
  return case when (resource->>'configured')::boolean or routed is not null then jsonb_build_object('source_id',sid,'state','incapable','reason','capability') end;
 end if;
 if not (resource->>'configured')::boolean and routed is null then return null; end if;
 fallback_reason:=case when not t.enabled then 'task_disabled' else 'not_selected' end;
 if routed is not null then
  reason:=private.ai_source_reason(provider_id,conn,routed->>'model');
  return jsonb_build_object('source_id',sid,'state','blocked','role',routed->>'role','reason',coalesce(reason,fallback_reason));
 end if;
 if t.routing_mode='auto' then
  if private.ai_auto_model(t.id,provider_id,t.model) is null then return jsonb_build_object('source_id',sid,'state','unusable','reason','auto_unsupported'); end if;
  reason:=private.ai_source_reason(provider_id,conn,private.ai_auto_model(t.id,provider_id,t.model));
  return jsonb_build_object('source_id',sid,'state','blocked','role','auto','reason',coalesce(reason,fallback_reason));
 end if;
 reason:=private.ai_source_reason(provider_id,conn,'auto:rapido');
 if reason is not null then return jsonb_build_object('source_id',sid,'state','unusable','reason',reason); end if;
 return jsonb_build_object('source_id',sid,'state','available');
end;
$$;

create function private.ai_resource_map() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare owner_id uuid; base_on boolean; resources jsonb; routes jsonb:='[]'::jsonb; t public.ai_tasks; route_items jsonb; raw jsonb;
 owner_runtime jsonb; chain jsonb; members_chain jsonb; cfg private.whatsapp_bridge; stt_provider text; stt_conn uuid; stt_reason text; bridge jsonb;
 assistant_runtime jsonb; assistant_members jsonb:='[]'::jsonb; served_by text; members_served_by text;
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 select a.user_id into owner_id from public.app_owner a limit 1;
 base_on:=coalesce((select base_enabled from private.ai_member_policy where id),false);
 select coalesce(jsonb_agg(s.r order by s.r->>'kind',s.r->>'provider',s.r->>'label'),'[]'::jsonb) into resources from (
  select jsonb_build_object('source_id','provider:'||p.id,'kind','api','provider',p.id,'connection_id',null,'label',p.label,
   'configured',p.key_ciphertext<>'','enabled',p.enabled,'key_hint',p.key_hint,'updated_at',p.updated_at,
   'declaration',private.ai_source_declaration('provider:'||p.id,p.key_ciphertext),
   'personal_data_ok',p.key_ciphertext<>'' and private.ai_automatic_source_allowed(p.id,null,p.key_ciphertext)) r
  from public.ai_providers p
  union all
  select jsonb_build_object('source_id','connection:'||c.id::text,'kind','connection','provider',c.provider,'connection_id',c.id,'label',c.label,
   'configured',c.key_ciphertext<>'','enabled',c.enabled,'key_hint',c.key_hint,'updated_at',c.updated_at,'position',c.position,
   'declaration',private.ai_source_declaration('connection:'||c.id::text,c.key_ciphertext),
   'personal_data_ok',private.ai_automatic_source_allowed(c.provider,c.id,c.key_ciphertext))
  from private.ai_connections c
  union all
  select jsonb_build_object('source_id','personal:'||k.provider,'kind','personal','provider',k.provider,'connection_id',null,'label','',
   'configured',true,'enabled',k.enabled,'key_hint',k.key_hint,'updated_at',k.updated_at,
   'declaration',jsonb_build_object('privacy_basis',k.privacy_basis,'audience','owner','current',k.privacy_basis is not null),
   'personal_data_ok',k.enabled)
  from private.ai_user_keys k where k.user_id=owner_id
 ) s;
 for t in select * from public.ai_tasks order by array_position(array['assistente','organizar','voz'],id) loop
  raw:=private.ai_task_config(t.id);
  route_items:=case when coalesce(t.provider,'')<>'' then jsonb_build_array(jsonb_build_object('source_id',
   case when t.connection_id is null then 'provider:'||t.provider else 'connection:'||t.connection_id::text end,'role','primary','model',t.model)) else '[]'::jsonb end;
  if t.routing_mode='fallback' then
   route_items:=route_items||coalesce((select jsonb_agg(jsonb_build_object('source_id','connection:'||(e.f->>'connection_id'),'role','fallback','model',e.f->>'model') order by e.ord)
    from jsonb_array_elements(t.fallbacks) with ordinality e(f,ord)),'[]'::jsonb);
  elsif t.routing_mode='legacy' and raw is not null then
   -- Same selection as ai_task_config: the first two enabled reserves, only behind a working primary.
   route_items:=route_items||coalesce((select jsonb_agg(jsonb_build_object('source_id','connection:'||c.id::text,'role','reserve','model',t.model) order by c.position)
    from (select x.id,x.position from private.ai_connections x where x.provider=t.provider and x.enabled order by x.position limit 2) c),'[]'::jsonb);
  end if;
  owner_runtime:=private.ai_runtime_for(owner_id,t.id);
  members_chain:=case when base_on and t.id<>'voz' and raw is not null then (
   select coalesce(jsonb_agg(x.e->>'source_id' order by x.ord),'[]'::jsonb)
   from jsonb_array_elements(jsonb_build_array(raw-'alternatives'-'routing')||coalesce(raw->'alternatives','[]'::jsonb)) with ordinality x(e,ord)
   where exists(select 1 from private.ai_member_base_sources a where a.source_id=x.e->>'source_id' and a.provider=x.e->>'provider' and a.audience='members'
    and a.cipher_hash=encode(extensions.digest(x.e->>'key_ciphertext','sha256'),'hex'))) else '[]'::jsonb end;
  -- /api/ai/organize serves Organizar with the assistant route whenever Organizar resolves to nothing.
  served_by:=null; members_served_by:=null;
  if t.id='assistente' then assistant_runtime:=owner_runtime; assistant_members:=members_chain;
  elsif t.id='organizar' then
   if owner_runtime is null and assistant_runtime is not null then owner_runtime:=assistant_runtime; served_by:='assistente'; end if;
   if jsonb_array_length(members_chain)=0 and jsonb_array_length(assistant_members)>0 then members_chain:=assistant_members; members_served_by:='assistente'; end if;
  end if;
  chain:=private.ai_chain(owner_runtime);
  routes:=routes||jsonb_build_array(jsonb_build_object('task',t.id,'enabled',t.enabled,'mode',t.routing_mode,'provider',t.provider,'model',t.model,
   'routing_effective',owner_runtime->>'routing','chain',chain,'configured_chain',private.ai_chain(raw),'served_by',served_by,
   'members_chain',members_chain,'members_served_by',members_served_by,'members_note',case when t.id='voz' then 'voice_not_shared' when not base_on then 'base_off' end,
   'sources',(select coalesce(jsonb_agg(s.v order by (s.v->>'position')::int nulls last,s.v->>'source_id'),'[]'::jsonb)
    from (select private.ai_source_state(t,r.value,chain,route_items) v from jsonb_array_elements(resources) r) s where s.v is not null)));
 end loop;
 select * into cfg from private.whatsapp_bridge where singleton;
 if found then
  stt_conn:=case when cfg.stt_connection ~ '^[a-f0-9-]{36}$' then cfg.stt_connection::uuid end;
  stt_provider:=case when cfg.stt_connection like '%:primary' then split_part(cfg.stt_connection,':',1)
   when stt_conn is not null then (select c.provider from private.ai_connections c where c.id=stt_conn) end;
  stt_reason:=case when cfg.stt_connection='' then 'not_configured' when stt_provider is null then 'missing'
   when stt_provider not in('gemini','vertex','google_cloud','groq','openai') then 'capability'
   else private.ai_source_reason(stt_provider,stt_conn,cfg.stt_model) end;
  bridge:=jsonb_build_object('enabled',cfg.enabled,'configured',cfg.token_hash<>'',
   'state',case when cfg.heartbeat is null or cfg.heartbeat<now()-interval '90 seconds' then 'offline' else cfg.state end,'heartbeat',cfg.heartbeat,
   'stt',jsonb_build_object('source_id',case when stt_conn is not null then 'connection:'||stt_conn::text when stt_provider is not null then 'provider:'||stt_provider end,
    'provider',stt_provider,'model',cfg.stt_model,'state',case when stt_reason is null then 'active' else 'blocked' end,'reason',stt_reason));
 end if;
 return jsonb_build_object('version',1,'generated_at',now(),'base_enabled',base_on,'resources',resources,'routes',routes,
  'channels',coalesce((select jsonb_agg(jsonb_build_object('channel',m.channel,'enabled',m.enabled,'bot',m.bot_username,
    'owner_linked',exists(select 1 from public.messenger_links l where l.channel=m.channel and l.user_id=owner_id),
    'member_links',(select count(*) from public.messenger_links l where l.channel=m.channel and l.user_id is distinct from owner_id)) order by m.channel)
   from public.messenger_settings m),'[]'::jsonb),
  'whatsapp',bridge,
  'mcp_inbound',(select jsonb_build_object(
    'owner_tokens',count(*) filter(where m.user_id=owner_id and m.client_id is null),
    'owner_oauth',count(*) filter(where m.user_id=owner_id and m.client_id is not null),
    'owner_can_write',count(*) filter(where m.user_id=owner_id and m.can_write),
    'owner_last_used',max(m.last_used_at) filter(where m.user_id=owner_id),
    'members_with_access',count(distinct m.user_id) filter(where m.user_id is distinct from owner_id))
   from private.mcp_tokens m where m.revoked_at is null
    and (coalesce(m.expires_at,'infinity'::timestamptz)>now() or coalesce(m.refresh_expires_at,'-infinity'::timestamptz)>now())),
  'mcp_outbound',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'label',c.label,'host',substring(c.url from '^https://([^/:?#]+)'),
    'protocol',c.protocol,'enabled',c.enabled,'has_key',c.key_ciphertext<>'') order by c.label) from private.ai_connectors c),'[]'::jsonb),
  'members',jsonb_build_object('accounts',(select count(*) from public.accounts a where a.user_id is distinct from owner_id),
   'with_personal_keys',(select count(distinct k.user_id) from private.ai_user_keys k where k.enabled and k.user_id is distinct from owner_id)));
end;
$$;

create function public.ai_resource_map() returns jsonb language sql security invoker set search_path=''
as $$ select private.ai_resource_map() $$;
create function public.ai_set_source_policy(provider_id text,connection_id uuid,next_privacy_basis text,next_audience text) returns void
language sql security invoker set search_path=''
as $$ select private.ai_set_source_policy(provider_id,connection_id,next_privacy_basis,next_audience) $$;

revoke all on function private.ai_source_reason(text,uuid,text),private.ai_source_declaration(text,text),private.ai_chain(jsonb),
 private.ai_source_state(public.ai_tasks,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.ai_resource_map(),private.ai_set_source_policy(text,uuid,text,text),
 public.ai_resource_map(),public.ai_set_source_policy(text,uuid,text,text) from public,anon;
grant execute on function private.ai_resource_map(),private.ai_set_source_policy(text,uuid,text,text),
 public.ai_resource_map(),public.ai_set_source_policy(text,uuid,text,text) to authenticated;
