-- Mensageiros (Telegram agora, WhatsApp depois). O robô não tem sessão de usuário: o servidor prova quem é com um
-- segredo derivado do AI_KEYS_SECRET (o banco guarda só o hash) e cada conversa só alcança a conta que a vinculou.

create table public.messenger_settings (
  channel text primary key check (channel in ('telegram', 'whatsapp')),
  enabled boolean not null default false,
  bot_username text not null default '' check (char_length(bot_username) <= 64),
  token_ciphertext text not null default '' check (char_length(token_ciphertext) <= 4000),
  token_hint text not null default '' check (char_length(token_hint) <= 12),
  updated_at timestamptz not null default now()
);
insert into public.messenger_settings(channel) values ('telegram'), ('whatsapp');

create table private.bot_server (
  id boolean primary key default true check (id),
  secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

create table public.messenger_links (
  channel text not null check (channel in ('telegram', 'whatsapp')),
  chat_id text not null check (char_length(chat_id) between 1 and 64),
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (channel, chat_id),
  unique (user_id, channel)
);

create table public.messenger_link_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'whatsapp')),
  expires_at timestamptz not null
);
create index messenger_link_codes_user_idx on public.messenger_link_codes(user_id);

create table public.messenger_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('telegram', 'whatsapp')),
  update_id text check (char_length(update_id) <= 80),
  role text not null check (role in ('user', 'assistant')),
  body text not null check (char_length(body) <= 4000),
  applied jsonb check (applied is null or jsonb_typeof(applied) = 'array'),
  created_at timestamptz not null default now(),
  unique (channel, update_id)
);
create index messenger_messages_user_idx on public.messenger_messages(user_id, channel, id desc);

alter table public.messenger_settings enable row level security;
alter table public.messenger_links enable row level security;
alter table public.messenger_link_codes enable row level security;
alter table public.messenger_messages enable row level security;
revoke all on public.messenger_settings, public.messenger_links, public.messenger_link_codes, public.messenger_messages from public, anon, authenticated;
revoke all on private.bot_server from public, anon, authenticated;

-- O servidor do robô: compara o hash do segredo recebido com o guardado.
create function private.bot_check(server_secret text) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if server_secret is null or char_length(server_secret) < 32 or not exists (
    select 1 from private.bot_server s where s.secret_hash = encode(extensions.digest(server_secret, 'sha256'), 'hex')) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

-- Painel do proprietário.
create function private.messenger_admin_state() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'channels', (select jsonb_agg(jsonb_build_object('channel', m.channel, 'enabled', m.enabled, 'bot_username', m.bot_username,
      'has_token', m.token_ciphertext <> '', 'token_hint', m.token_hint, 'updated_at', m.updated_at,
      'links', (select count(*) from public.messenger_links l where l.channel = m.channel)) order by m.channel) from public.messenger_settings m),
    'server_ready', exists (select 1 from private.bot_server));
end;
$$;

-- next_ciphertext null mantém o token; '' remove. server_hash null mantém o segredo do servidor.
create function private.messenger_save(channel_id text, next_enabled boolean, next_username text, next_ciphertext text, next_hint text, server_hash text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  update public.messenger_settings
     set enabled = coalesce(next_enabled, false), bot_username = coalesce(next_username, bot_username),
         token_ciphertext = coalesce(next_ciphertext, token_ciphertext),
         token_hint = case when next_ciphertext is null then token_hint else coalesce(next_hint, '') end,
         updated_at = now()
   where channel = channel_id;
  if not found then raise exception 'Unknown channel' using errcode = '22023'; end if;
  if server_hash is not null then
    insert into private.bot_server(id, secret_hash) values (true, server_hash)
    on conflict (id) do update set secret_hash = excluded.secret_hash, updated_at = now();
  end if;
end;
$$;

-- Quem usa: por enquanto só a conta proprietária (é a única com IA ligada).
create function private.messenger_create_code(channel_id text, code_hash text) returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null or not private.is_owner() then raise exception 'Not authorized' using errcode = '42501'; end if;
  if channel_id not in ('telegram', 'whatsapp') then raise exception 'Unknown channel' using errcode = '22023'; end if;
  delete from public.messenger_link_codes c where c.user_id = me or c.expires_at < now();
  insert into public.messenger_link_codes(code_hash, user_id, channel, expires_at) values (code_hash, me, channel_id, now() + interval '15 minutes');
end;
$$;

create function private.messenger_status() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'channels', (select jsonb_agg(jsonb_build_object('channel', m.channel, 'enabled', m.enabled and m.token_ciphertext <> '', 'bot_username', m.bot_username,
      'linked', exists (select 1 from public.messenger_links l where l.channel = m.channel and l.user_id = (select auth.uid()))) order by m.channel)
      from public.messenger_settings m),
    'owner', private.is_owner())
$$;

create function private.messenger_unlink(channel_id text) returns void
language sql security definer set search_path = ''
as $$ delete from public.messenger_links l where l.user_id = (select auth.uid()) and l.channel = channel_id $$;

-- Funções do robô (sem sessão; exigem o segredo do servidor).
create function private.bot_settings(server_secret text, channel_id text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.bot_check(server_secret);
  return (select jsonb_build_object('enabled', m.enabled, 'bot_username', m.bot_username, 'token_ciphertext', m.token_ciphertext)
            from public.messenger_settings m where m.channel = channel_id);
end;
$$;

create function private.bot_link(server_secret text, channel_id text, chat text, code text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare person uuid;
begin
  perform private.bot_check(server_secret);
  delete from public.messenger_link_codes c
   where c.code_hash = code and c.channel = channel_id and c.expires_at > now()
  returning c.user_id into person;
  if person is null then return false; end if;
  delete from public.messenger_links l where (l.channel = channel_id and l.chat_id = chat) or (l.user_id = person and l.channel = channel_id);
  insert into public.messenger_links(channel, chat_id, user_id) values (channel_id, chat, person);
  return true;
end;
$$;

create function private.bot_unlink(server_secret text, channel_id text, chat text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.bot_check(server_secret);
  delete from public.messenger_links l where l.channel = channel_id and l.chat_id = chat;
  return found;
end;
$$;

-- Tudo o que o robô precisa para responder: espaço pessoal, IA da conversa (só para a conta proprietária) e histórico curto.
create function private.bot_context(server_secret text, channel_id text, chat text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare person uuid; runtime jsonb;
begin
  perform private.bot_check(server_secret);
  select l.user_id into person from public.messenger_links l where l.channel = channel_id and l.chat_id = chat;
  if person is null then return null; end if;
  if exists (select 1 from public.app_owner o where o.user_id = person) then
    select to_jsonb(r) into runtime from (
      select t.model, p.id as provider, p.base_url, p.gcp_project, p.gcp_location, p.key_ciphertext
        from public.ai_tasks t join public.ai_providers p on p.id = t.provider
       where t.id = 'assistente' and t.enabled and p.enabled and p.key_ciphertext <> '' and t.model <> '') r;
  end if;
  return jsonb_build_object(
    'user_id', person,
    'workspace', (select jsonb_build_object('data', w.data, 'revision', w.revision) from public.personal_workspaces w where w.owner_id = person),
    'ai', runtime,
    'history', coalesce((select jsonb_agg(jsonb_build_object('role', h.role, 'text', h.body) order by h.id)
      from (select m.id, m.role, m.body from public.messenger_messages m where m.user_id = person and m.channel = channel_id order by m.id desc limit 12) h), '[]'::jsonb),
    'last_applied', (select m.applied from public.messenger_messages m where m.user_id = person and m.channel = channel_id and m.role = 'assistant' order by m.id desc limit 1));
end;
$$;

-- Mesmas regras do salvamento pelo aplicativo, com revisão otimista.
create function private.bot_save(server_secret text, channel_id text, chat text, next_data jsonb, expected_revision integer) returns integer
language plpgsql security definer set search_path = ''
as $$
declare person uuid; next_revision integer;
begin
  perform private.bot_check(server_secret);
  select l.user_id into person from public.messenger_links l where l.channel = channel_id and l.chat_id = chat;
  if person is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 or next_data is null or jsonb_typeof(next_data) <> 'object'
     or (next_data->>'version') is distinct from '1'
     or jsonb_typeof(next_data->'subjects') is distinct from 'array' or jsonb_typeof(next_data->'notes') is distinct from 'array'
     or jsonb_typeof(next_data->'tasks') is distinct from 'array' or jsonb_typeof(next_data->'sessions') is distinct from 'array'
     or octet_length(next_data::text) > 2000000 then
    raise exception 'Invalid payload' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    begin
      insert into public.personal_workspaces(owner_id, data, revision) values (person, next_data, 1);
      return 1;
    exception when unique_violation then
      raise exception 'Workspace conflict' using errcode = '40001';
    end;
  end if;
  update public.personal_workspaces set data = next_data, revision = revision + 1, updated_at = now()
   where owner_id = person and revision = expected_revision
  returning revision into next_revision;
  if next_revision is null then raise exception 'Workspace conflict' using errcode = '40001'; end if;
  return next_revision;
end;
$$;

-- Registra uma mensagem. Devolve false quando a atualização já foi tratada (o Telegram reenvia em caso de falha).
create function private.bot_log(server_secret text, channel_id text, chat text, update_ref text, message_role text, message_body text, message_applied jsonb)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare person uuid;
begin
  perform private.bot_check(server_secret);
  select l.user_id into person from public.messenger_links l where l.channel = channel_id and l.chat_id = chat;
  if person is null then return false; end if;
  begin
    insert into public.messenger_messages(user_id, channel, update_id, role, body, applied)
    values (person, channel_id, update_ref, message_role, left(coalesce(message_body, ''), 4000), message_applied);
  exception when unique_violation then return false;
  end;
  delete from public.messenger_messages m where m.user_id = person and m.channel = channel_id
     and m.id not in (select k.id from public.messenger_messages k where k.user_id = person and k.channel = channel_id order by k.id desc limit 60);
  return true;
end;
$$;

-- Wrappers públicos (security invoker) e permissões.
create function public.messenger_admin_state() returns jsonb language sql security invoker set search_path = '' as $$ select private.messenger_admin_state() $$;
create function public.messenger_save(channel_id text, next_enabled boolean, next_username text, next_ciphertext text, next_hint text, server_hash text) returns void
language sql security invoker set search_path = '' as $$ select private.messenger_save(channel_id, next_enabled, next_username, next_ciphertext, next_hint, server_hash) $$;
create function public.messenger_create_code(channel_id text, code_hash text) returns void language sql security invoker set search_path = '' as $$ select private.messenger_create_code(channel_id, code_hash) $$;
create function public.messenger_status() returns jsonb language sql security invoker set search_path = '' as $$ select private.messenger_status() $$;
create function public.messenger_unlink(channel_id text) returns void language sql security invoker set search_path = '' as $$ select private.messenger_unlink(channel_id) $$;
create function public.bot_settings(server_secret text, channel_id text) returns jsonb language sql security definer set search_path = '' as $$ select private.bot_settings(server_secret, channel_id) $$;
create function public.bot_link(server_secret text, channel_id text, chat text, code text) returns boolean language sql security definer set search_path = '' as $$ select private.bot_link(server_secret, channel_id, chat, code) $$;
create function public.bot_unlink(server_secret text, channel_id text, chat text) returns boolean language sql security definer set search_path = '' as $$ select private.bot_unlink(server_secret, channel_id, chat) $$;
create function public.bot_context(server_secret text, channel_id text, chat text) returns jsonb language sql security definer set search_path = '' as $$ select private.bot_context(server_secret, channel_id, chat) $$;
create function public.bot_save(server_secret text, channel_id text, chat text, next_data jsonb, expected_revision integer) returns integer
language sql security definer set search_path = '' as $$ select private.bot_save(server_secret, channel_id, chat, next_data, expected_revision) $$;
create function public.bot_log(server_secret text, channel_id text, chat text, update_ref text, message_role text, message_body text, message_applied jsonb) returns boolean
language sql security definer set search_path = '' as $$ select private.bot_log(server_secret, channel_id, chat, update_ref, message_role, message_body, message_applied) $$;

revoke all on function private.bot_check(text), private.messenger_admin_state(), private.messenger_save(text, boolean, text, text, text, text),
  private.messenger_create_code(text, text), private.messenger_status(), private.messenger_unlink(text),
  private.bot_settings(text, text), private.bot_link(text, text, text, text), private.bot_unlink(text, text, text), private.bot_context(text, text, text),
  private.bot_save(text, text, text, jsonb, integer), private.bot_log(text, text, text, text, text, text, jsonb) from public;
revoke all on function public.messenger_admin_state(), public.messenger_save(text, boolean, text, text, text, text), public.messenger_create_code(text, text),
  public.messenger_status(), public.messenger_unlink(text), public.bot_settings(text, text), public.bot_link(text, text, text, text),
  public.bot_unlink(text, text, text), public.bot_context(text, text, text), public.bot_save(text, text, text, jsonb, integer),
  public.bot_log(text, text, text, text, text, text, jsonb) from public;
grant execute on function private.messenger_admin_state(), private.messenger_save(text, boolean, text, text, text, text), private.messenger_create_code(text, text),
  private.messenger_status(), private.messenger_unlink(text) to authenticated;
grant execute on function public.messenger_admin_state(), public.messenger_save(text, boolean, text, text, text, text), public.messenger_create_code(text, text),
  public.messenger_status(), public.messenger_unlink(text) to authenticated;
-- The private bot functions are reached only through the public definer wrappers below (anon has no access to "private").
grant execute on function public.bot_settings(text, text), public.bot_link(text, text, text, text), public.bot_unlink(text, text, text),
  public.bot_context(text, text, text), public.bot_save(text, text, text, jsonb, integer), public.bot_log(text, text, text, text, text, text, jsonb) to anon, authenticated;
