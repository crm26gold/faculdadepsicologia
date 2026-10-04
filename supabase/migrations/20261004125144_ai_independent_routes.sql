-- Independent credentials and explicit task routes. No secret is decrypted during migration.
alter table public.ai_providers drop constraint ai_providers_id_check;
alter table public.ai_providers add constraint ai_providers_id_check check(id in
 ('gemini','vertex','google_cloud','openai','anthropic','deepseek','xai','mistral','groq','openrouter','compatible'));
insert into public.ai_providers(id) values('google_cloud'),('deepseek'),('xai'),('mistral'),('groq'),('openrouter') on conflict do nothing;
alter table private.ai_connections add column base_url text not null default '' check(char_length(base_url)<=300 and (base_url='' or base_url ~ '^https://')),
 add column gcp_project text not null default '' check(char_length(gcp_project)<=100),
 add column gcp_location text not null default '' check(char_length(gcp_location)<=40);
update private.ai_connections c set base_url=p.base_url,gcp_project=p.gcp_project,gcp_location=p.gcp_location
 from public.ai_providers p where p.id=c.provider;
alter table public.ai_tasks add column connection_id uuid references private.ai_connections(id) on delete set null,
 add column routing_mode text not null default 'legacy' check(routing_mode in('legacy','fixed','fallback')),
 add column fallbacks jsonb not null default '[]' check(jsonb_typeof(fallbacks)='array' and jsonb_array_length(fallbacks)<=2);

create function private.ai_effective_connection(connection_id uuid,provider_id text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('provider',p.id,'base_url',p.base_url,'gcp_project',p.gcp_project,'gcp_location',p.gcp_location,'key_ciphertext',p.key_ciphertext)
 from public.ai_providers p where connection_id is null and p.id=provider_id and p.enabled and p.key_ciphertext<>''
 union all
 select jsonb_build_object('provider',c.provider,'base_url',c.base_url,'gcp_project',c.gcp_project,'gcp_location',c.gcp_location,'key_ciphertext',c.key_ciphertext)
 from private.ai_connections c where c.id=connection_id and c.enabled;
$$;
revoke all on function private.ai_effective_connection(uuid,text) from public,anon,authenticated;

create or replace function private.ai_task_config(task_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t public.ai_tasks; primary_config jsonb; candidates jsonb := '[]'; item jsonb; candidate jsonb;
begin
 select * into t from public.ai_tasks where id=task_id and enabled and model<>'';
 if not found then return null; end if;
 primary_config:=private.ai_effective_connection(t.connection_id,t.provider);
 if primary_config is not null then candidates:=jsonb_build_array(primary_config||jsonb_build_object('model',t.model)); end if;
 if t.routing_mode='legacy' and primary_config is not null then
   for item in select to_jsonb(c) from private.ai_connections c where c.provider=t.provider and c.enabled order by c.position limit 2 loop
     candidate:=private.ai_effective_connection((item->>'id')::uuid,t.provider);
     candidates:=candidates||jsonb_build_array(candidate||jsonb_build_object('model',t.model));
   end loop;
 elsif t.routing_mode='fallback' then
   for item in select value from jsonb_array_elements(t.fallbacks) loop
     candidate:=private.ai_effective_connection((item->>'connection_id')::uuid,null);
     if candidate is not null then candidates:=candidates||jsonb_build_array(candidate||jsonb_build_object('model',item->>'model')); end if;
   end loop;
 end if;
 if jsonb_array_length(candidates)=0 then return null; end if;
 return (candidates->0)||jsonb_build_object('alternatives',candidates-0);
end;
$$;

create function private.ai_save_connection_details(connection_id uuid,provider_id text,next_label text,next_enabled boolean,
 next_position integer,next_ciphertext text,next_hint text,next_base_url text,next_project text,next_location text) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
 saved:=private.ai_save_connection(connection_id,provider_id,next_label,next_enabled,next_position,next_ciphertext,next_hint);
 update private.ai_connections set base_url=coalesce(next_base_url,''),gcp_project=coalesce(next_project,''),gcp_location=coalesce(next_location,'') where id=saved;
 return saved;
end;
$$;
create function public.ai_save_connection_details(connection_id uuid,provider_id text,next_label text,next_enabled boolean,
 next_position integer,next_ciphertext text,next_hint text,next_base_url text,next_project text,next_location text) returns uuid
language sql security invoker set search_path='' as $$
 select private.ai_save_connection_details(connection_id,provider_id,next_label,next_enabled,next_position,next_ciphertext,next_hint,next_base_url,next_project,next_location);
$$;

create function private.ai_save_route(task_id text,next_provider text,next_connection uuid,next_model text,next_enabled boolean,next_mode text,next_fallbacks jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; company text;
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 if next_mode not in('fixed','fallback') or next_mode is null or next_fallbacks is null or jsonb_typeof(next_fallbacks)<>'array' or jsonb_array_length(next_fallbacks)>2 or char_length(next_model) not between 1 and 120 then raise exception 'Invalid route' using errcode='22023'; end if;
 if next_connection is not null and not exists(select 1 from private.ai_connections c where c.id=next_connection and c.provider=next_provider) then raise exception 'Connection does not belong to provider' using errcode='22023'; end if;
 if task_id='voz' and (next_provider not in('gemini','openai') or (next_provider='openai' and next_model<>'gpt-live-1') or (next_provider='gemini' and next_model<>'auto:rapido' and next_model !~ '^gemini-[a-z0-9.-]*live[a-z0-9.-]*$')) then raise exception 'Unsupported live route' using errcode='22023'; end if;
 if (select count(distinct value->>'connection_id') from jsonb_array_elements(next_fallbacks))<>jsonb_array_length(next_fallbacks) then raise exception 'Duplicate fallback' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(next_fallbacks) loop
   select c.provider into company from private.ai_connections c where c.id=(item->>'connection_id')::uuid;
   if not found or (item->>'connection_id')::uuid=next_connection or coalesce(char_length(item->>'model'),0) not between 1 and 120 then raise exception 'Invalid fallback' using errcode='22023'; end if;
   -- A live transport may only fail over inside its selected company. Text can switch companies.
   if task_id='voz' and (company<>next_provider or (company='openai' and item->>'model'<>'gpt-live-1') or (company='gemini' and item->>'model'<>'auto:rapido' and item->>'model' !~ '^gemini-[a-z0-9.-]*live[a-z0-9.-]*$')) then raise exception 'Unsupported live fallback' using errcode='22023'; end if;
 end loop;
 update public.ai_tasks set provider=next_provider,connection_id=next_connection,model=next_model,enabled=next_enabled,
 routing_mode=next_mode,fallbacks=case when next_mode='fallback' then next_fallbacks else '[]'::jsonb end,updated_at=now() where id=task_id;
 if not found then raise exception 'Task not found' using errcode='P0002'; end if;
 perform private.audit('ai_route',null,null,jsonb_build_object('task',task_id,'provider',next_provider,'mode',next_mode,'alternatives',jsonb_array_length(next_fallbacks)));
end;
$$;
create function public.ai_save_route(task_id text,next_provider text,next_connection uuid,next_model text,next_enabled boolean,next_mode text,next_fallbacks jsonb) returns void
language sql security invoker set search_path='' as $$ select private.ai_save_route(task_id,next_provider,next_connection,next_model,next_enabled,next_mode,next_fallbacks); $$;
revoke all on function private.ai_save_connection_details(uuid,text,text,boolean,integer,text,text,text,text,text),public.ai_save_connection_details(uuid,text,text,boolean,integer,text,text,text,text,text),
 private.ai_save_route(text,text,uuid,text,boolean,text,jsonb),public.ai_save_route(text,text,uuid,text,boolean,text,jsonb) from public,anon;
grant execute on function private.ai_save_connection_details(uuid,text,text,boolean,integer,text,text,text,text,text),public.ai_save_connection_details(uuid,text,text,boolean,integer,text,text,text,text,text),
 private.ai_save_route(text,text,uuid,text,boolean,text,jsonb),public.ai_save_route(text,text,uuid,text,boolean,text,jsonb) to authenticated;

create or replace function private.ai_connection_runtime(connection_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 return (select jsonb_build_object('provider',c.provider,'base_url',c.base_url,'gcp_project',c.gcp_project,'gcp_location',c.gcp_location,'key_ciphertext',c.key_ciphertext) from private.ai_connections c where c.id=connection_id);
end;
$$;
create table private.ai_connectors (
 id uuid primary key default gen_random_uuid(),label text not null check(char_length(label) between 1 and 60),
 url text not null check(char_length(url) between 1 and 300 and url ~ '^https://'),
 protocol text not null check(protocol in('2026-07-28','2025-11-25')),enabled boolean not null default false,
 key_ciphertext text not null default '' check(char_length(key_ciphertext)<=18000),key_hint text not null default '' check(char_length(key_hint)<=12),updated_at timestamptz not null default now()
);
alter table private.ai_connectors enable row level security;
revoke all on private.ai_connectors from public,anon,authenticated;
create function private.ai_save_connector(connector_id uuid,next_label text,next_url text,next_protocol text,next_enabled boolean,next_ciphertext text,next_hint text) returns uuid
language plpgsql security definer set search_path='' as $$
declare saved uuid;
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 if connector_id is null then
   if (select count(*) from private.ai_connectors)>=20 then raise exception 'Connector limit reached' using errcode='22023'; end if;
   insert into private.ai_connectors(label,url,protocol,enabled,key_ciphertext,key_hint) values(next_label,next_url,next_protocol,next_enabled,coalesce(next_ciphertext,''),coalesce(next_hint,'')) returning id into saved;
 else
   update private.ai_connectors set label=next_label,url=next_url,protocol=next_protocol,enabled=next_enabled,key_ciphertext=coalesce(next_ciphertext,key_ciphertext),key_hint=coalesce(next_hint,key_hint),updated_at=now() where id=connector_id returning id into saved;
   if not found then raise exception 'Connector not found' using errcode='P0002'; end if;
 end if;
 perform private.audit('ai_connector',null,null,jsonb_build_object('enabled',next_enabled,'protocol',next_protocol));
 return saved;
end;
$$;
create function public.ai_save_connector(connector_id uuid,next_label text,next_url text,next_protocol text,next_enabled boolean,next_ciphertext text,next_hint text) returns uuid
language sql security invoker set search_path='' as $$ select private.ai_save_connector(connector_id,next_label,next_url,next_protocol,next_enabled,next_ciphertext,next_hint); $$;
create function private.ai_connector_runtime(connector_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 return (select to_jsonb(c) from private.ai_connectors c where c.id=connector_id);
end;
$$;
create function public.ai_connector_runtime(connector_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.ai_connector_runtime(connector_id); $$;
create function private.ai_remove_connector(connector_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 delete from private.ai_connectors where id=connector_id;
 if not found then raise exception 'Connector not found' using errcode='P0002'; end if;
 perform private.audit('ai_connector_removed',null,null,'{}'::jsonb);
end;
$$;
create function public.ai_remove_connector(connector_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.ai_remove_connector(connector_id); $$;
revoke all on function private.ai_save_connector(uuid,text,text,text,boolean,text,text),public.ai_save_connector(uuid,text,text,text,boolean,text,text),
 private.ai_connector_runtime(uuid),public.ai_connector_runtime(uuid),private.ai_remove_connector(uuid),public.ai_remove_connector(uuid) from public,anon;
grant execute on function private.ai_save_connector(uuid,text,text,text,boolean,text,text),public.ai_save_connector(uuid,text,text,text,boolean,text,text),
 private.ai_connector_runtime(uuid),public.ai_connector_runtime(uuid),private.ai_remove_connector(uuid),public.ai_remove_connector(uuid) to authenticated;

create or replace function private.ai_admin_state() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 return jsonb_build_object(
 'connectors',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'label',c.label,'url',c.url,'protocol',c.protocol,'enabled',c.enabled,'has_key',c.key_ciphertext<>'','key_hint',c.key_hint,'updated_at',c.updated_at) order by c.label) from private.ai_connectors c),'[]'::jsonb),
 'providers',(select jsonb_agg(jsonb_build_object('id',p.id,'enabled',p.enabled,'label',p.label,'base_url',p.base_url,'gcp_project',p.gcp_project,'gcp_location',p.gcp_location,'has_key',p.key_ciphertext<>'','key_hint',p.key_hint,'updated_at',p.updated_at) order by p.id) from public.ai_providers p),
 'tasks',(select jsonb_agg(jsonb_build_object('id',t.id,'provider',t.provider,'model',t.model,'enabled',t.enabled,'updated_at',t.updated_at,'connection_id',t.connection_id,'routing_mode',t.routing_mode,'fallbacks',t.fallbacks) order by t.id) from public.ai_tasks t),
 'connections',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'provider',c.provider,'label',c.label,'enabled',c.enabled,'position',c.position,'key_hint',c.key_hint,'updated_at',c.updated_at,'base_url',c.base_url,'gcp_project',c.gcp_project,'gcp_location',c.gcp_location) order by c.provider,c.position) from private.ai_connections c),'[]'::jsonb));
end;
$$;
create or replace function private.ai_remove_connection(connection_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 update public.ai_tasks set enabled=false,updated_at=now() where public.ai_tasks.connection_id=ai_remove_connection.connection_id;
 delete from private.ai_connections where id=connection_id;
 if not found then raise exception 'Connection not found' using errcode='P0002'; end if;
 perform private.audit('ai_connection_removed',null,null,'{}'::jsonb);
end;
$$;
-- Old clients explicitly return to the legacy routing mode when saving their task.
create or replace function private.ai_save_task(task_id text,next_provider text,next_model text,next_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
 update public.ai_tasks set provider=nullif(next_provider,''),model=coalesce(next_model,''),enabled=next_enabled,connection_id=null,routing_mode='legacy',fallbacks='[]',updated_at=now() where id=task_id;
 if not found then raise exception 'Task not found' using errcode='P0002'; end if;
 perform private.audit('ai_task',null,null,jsonb_build_object('task',task_id,'provider',next_provider,'enabled',next_enabled));
end;
$$;
