-- Explicit same-provider reserves. Existing credentials and task selections stay in place.
create table private.ai_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null references public.ai_providers(id),
  label text not null check (char_length(label) between 1 and 60),
  enabled boolean not null default false,
  position integer not null check (position between 1 and 5),
  key_ciphertext text not null check (char_length(key_ciphertext) between 1 and 20000),
  key_hint text not null check (char_length(key_hint) <= 12),
  updated_at timestamptz not null default now(),
  unique(provider, position)
);
alter table private.ai_connections enable row level security;
revoke all on private.ai_connections from public, anon, authenticated;

-- Internal helper. Neither browser nor authenticated clients may call it directly.
create function private.ai_task_config(task_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('provider',p.id,'model',t.model,'base_url',p.base_url,
    'gcp_project',p.gcp_project,'gcp_location',p.gcp_location,'key_ciphertext',p.key_ciphertext,
    'alternatives',coalesce((select jsonb_agg(jsonb_build_object('provider',p.id,'model',t.model,
      'base_url',p.base_url,'gcp_project',p.gcp_project,'gcp_location',p.gcp_location,
      'key_ciphertext',c.key_ciphertext) order by c.position) from private.ai_connections c
      where c.provider=p.id and c.enabled),'[]'::jsonb))
  from public.ai_tasks t join public.ai_providers p on p.id=t.provider
  where t.id=task_id and t.enabled and p.enabled and p.key_ciphertext<>'' and t.model<>'';
$$;
revoke all on function private.ai_task_config(text) from public, anon, authenticated;

create or replace function private.ai_runtime(task_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner() then return null; end if;
  return private.ai_task_config(task_id);
end;
$$;

create or replace function private.ai_admin_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
  return jsonb_build_object(
    'providers',(select jsonb_agg(jsonb_build_object('id',p.id,'enabled',p.enabled,'label',p.label,
      'base_url',p.base_url,'gcp_project',p.gcp_project,'gcp_location',p.gcp_location,
      'has_key',p.key_ciphertext<>'','key_hint',p.key_hint,'updated_at',p.updated_at) order by p.id) from public.ai_providers p),
    'tasks',(select jsonb_agg(jsonb_build_object('id',t.id,'provider',t.provider,'model',t.model,
      'enabled',t.enabled,'updated_at',t.updated_at) order by t.id) from public.ai_tasks t),
    'connections',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'provider',c.provider,
      'label',c.label,'enabled',c.enabled,'position',c.position,'key_hint',c.key_hint,
      'updated_at',c.updated_at) order by c.provider,c.position) from private.ai_connections c),'[]'::jsonb));
end;
$$;

create function private.ai_save_connection(connection_id uuid,provider_id text,next_label text,
  next_enabled boolean,next_position integer,next_ciphertext text,next_hint text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare saved uuid;
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
  if connection_id is null then
    if next_ciphertext is null or next_ciphertext='' then raise exception 'Key required' using errcode='22023'; end if;
    insert into private.ai_connections(provider,label,enabled,position,key_ciphertext,key_hint)
      values(provider_id,next_label,next_enabled,next_position,next_ciphertext,coalesce(next_hint,'')) returning id into saved;
  else
    update private.ai_connections set label=next_label,enabled=next_enabled,position=next_position,
      key_ciphertext=coalesce(next_ciphertext,key_ciphertext),
      key_hint=case when next_ciphertext is null then key_hint else coalesce(next_hint,'') end,updated_at=now()
      where id=connection_id and provider=provider_id returning id into saved;
    if not found then raise exception 'Connection not found' using errcode='P0002'; end if;
  end if;
  perform private.audit('ai_connection',null,null,jsonb_build_object('provider',provider_id,'enabled',next_enabled,'position',next_position));
  return saved;
end;
$$;
create function private.ai_remove_connection(connection_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
  delete from private.ai_connections where id=connection_id;
  if not found then raise exception 'Connection not found' using errcode='P0002'; end if;
  perform private.audit('ai_connection_removed',null,null,'{}'::jsonb);
end;
$$;
create function public.ai_save_connection(connection_id uuid,provider_id text,next_label text,
  next_enabled boolean,next_position integer,next_ciphertext text,next_hint text) returns uuid
language sql security invoker set search_path = '' as $$
  select private.ai_save_connection(connection_id,provider_id,next_label,next_enabled,next_position,next_ciphertext,next_hint);
$$;
create function public.ai_remove_connection(connection_id uuid) returns void
language sql security invoker set search_path = '' as $$ select private.ai_remove_connection(connection_id); $$;
revoke all on function private.ai_save_connection(uuid,text,text,boolean,integer,text,text),private.ai_remove_connection(uuid),
  public.ai_save_connection(uuid,text,text,boolean,integer,text,text),public.ai_remove_connection(uuid) from public,anon;
grant execute on function private.ai_save_connection(uuid,text,text,boolean,integer,text,text),private.ai_remove_connection(uuid),
  public.ai_save_connection(uuid,text,text,boolean,integer,text,text),public.ai_remove_connection(uuid) to authenticated;

-- Inspect one saved credential on the server, including a disabled reserve. Only the owner may test it.
create function private.ai_connection_runtime(connection_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode='42501'; end if;
  return (select jsonb_build_object('provider',p.id,'base_url',p.base_url,'gcp_project',p.gcp_project,
    'gcp_location',p.gcp_location,'key_ciphertext',c.key_ciphertext)
    from private.ai_connections c join public.ai_providers p on p.id=c.provider where c.id=connection_id);
end;
$$;
create function public.ai_connection_runtime(connection_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.ai_connection_runtime(connection_id); $$;
revoke all on function private.ai_connection_runtime(uuid),public.ai_connection_runtime(uuid) from public,anon;
grant execute on function private.ai_connection_runtime(uuid),public.ai_connection_runtime(uuid) to authenticated;

create or replace function private.bot_context(server_secret text,channel_id text,chat text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare person uuid; runtime jsonb;
begin
  perform private.bot_check(server_secret);
  select l.user_id into person from public.messenger_links l where l.channel=channel_id and l.chat_id=chat;
  if person is null then return null; end if;
  if exists(select 1 from public.app_owner o where o.user_id=person) then runtime:=private.ai_task_config('assistente'); end if;
  return jsonb_build_object('user_id',person,
    'workspace',(select jsonb_build_object('data',w.data,'revision',w.revision) from public.personal_workspaces w where w.owner_id=person),
    'ai',runtime,'history',coalesce((select jsonb_agg(jsonb_build_object('role',h.role,'text',h.body) order by h.id)
      from(select m.id,m.role,m.body from public.messenger_messages m where m.user_id=person and m.channel=channel_id order by m.id desc limit 12)h),'[]'::jsonb),
    'last_applied',(select m.applied from public.messenger_messages m where m.user_id=person and m.channel=channel_id and m.role='assistant' order by m.id desc limit 1));
end;
$$;
