-- Networking: a conversa dentro de cada grupo, com resposta e foto. Só as pessoas do próprio grupo leem e escrevem,
-- e cada uma lê a partir de quando entrou (como no WhatsApp); a entrada aparece na conversa ("Fulano entrou no grupo"),
-- então ninguém entra escondido para ler. A administração vê apenas o trecho de uma mensagem denunciada. A foto fica no servidor pelo prazo de
-- platform_settings.chat_photo_days (vazio = para sempre) e no aparelho de quem já viu.
-- Decisões: docs/VISAO_E_FUNDACAO_2026-09-30.md (conversa do grupo, 13/10).
-- Parte 1 de 3 (tabelas, ler, enviar, apagar). A parte 2 (20261013231000_group_chat_alerts.sql) traz notificação,
-- denúncia e relógio; a parte 3 (20261013232000_group_chat_home.sql), Avisos, início da conta e exportação.
-- Três partes para caber na cópia pelo celular.

-- 1. Prazo das fotos da conversa e o aviso da conversa nas preferências da pessoa.
alter table public.platform_settings
  add column chat_photo_days integer default 90 check (chat_photo_days is null or chat_photo_days between 1 and 3650);
alter table public.profiles add column alerts_chat boolean not null default true;

-- 2. Mensagens. Apagar deixa o lugar ("Mensagem apagada"), sem o texto e sem a foto.
create table public.space_messages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  -- text: mensagem; joined: a linha "Fulano entrou no grupo", escrita pelo banco quando alguém entra.
  kind text not null default 'text' check (kind in ('text', 'joined')),
  body text not null default '' check (char_length(body) <= 4000),
  reply_to uuid references public.space_messages(id) on delete set null,
  photo_width smallint check (photo_width between 1 and 4096),
  photo_height smallint check (photo_height between 1 and 4096),
  photo_alt text not null default '' check (char_length(photo_alt) <= 300),
  created_at timestamptz not null default now(),
  changed_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint photo_size check ((photo_width is null) = (photo_height is null))
);
create index space_messages_space_idx on public.space_messages(space_id, created_at desc);
create index space_messages_changed_idx on public.space_messages(space_id, changed_at);
create index space_messages_recent_idx on public.space_messages(created_at);
create index space_messages_author_idx on public.space_messages(author_id);
create index space_messages_reply_idx on public.space_messages(reply_to);
create index space_messages_deleted_by_idx on public.space_messages(deleted_by);
alter table public.space_messages enable row level security;
revoke all on public.space_messages from anon, authenticated;

-- A foto, à parte: o prazo apaga só a foto, e a mensagem continua com o tamanho e a descrição.
create table public.space_message_photos (
  message_id uuid primary key references public.space_messages(id) on delete cascade,
  mime text not null check (mime in ('image/jpeg', 'image/webp')),
  bytes bytea not null check (octet_length(bytes) between 64 and 307200),
  created_at timestamptz not null default now(),
  constraint photo_format check (case mime when 'image/jpeg' then substring(bytes from 1 for 3) = '\xffd8ff'::bytea
    else substring(bytes from 1 for 4) = '\x52494646'::bytea and substring(bytes from 9 for 4) = '\x57454250'::bytea end)
);
create index space_message_photos_created_idx on public.space_message_photos(created_at);
alter table public.space_message_photos enable row level security;
revoke all on public.space_message_photos from anon, authenticated;

-- Até onde cada pessoa leu e quando foi avisada pela última vez.
create table public.space_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  read_at timestamptz,
  pushed_at timestamptz,
  primary key (user_id, space_id)
);
create index space_reads_space_idx on public.space_reads(space_id);
alter table public.space_reads enable row level security;
revoke all on public.space_reads from anon, authenticated;

-- Denúncia de mensagem.
alter table public.network_reports add column target_message uuid references public.space_messages(id) on delete set null;
create index network_reports_message_idx on public.network_reports(target_message);

-- 3. Quem lê e escreve: só quem está no próprio grupo, com a conversa ligada, e a partir de quando entrou.
-- Dono e líderes moderam.
create function private.chat_role(target uuid, who uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case when m.role in ('owner', 'teacher', 'assistant', 'leader') then 'moderator' else 'member' end
    from public.spaces s join public.space_members m on m.space_id = s.id and m.user_id = who
   where s.id = target and s.kind = 'group' and 'conversa' = any(s.tools)
$$;

-- Quem entra no grupo aparece na conversa. Quem criou o grupo, não (a conversa começa com essa pessoa).
create function private.chat_joined() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.space_messages(space_id, author_id, kind, created_at, changed_at)
  select new.space_id, new.user_id, 'joined', new.joined_at, new.joined_at from public.spaces s
   where s.id = new.space_id and s.kind = 'group' and 'conversa' = any(s.tools) and s.created_by is distinct from new.user_id;
  return null;
end;
$$;
create trigger space_members_chat_joined after insert on public.space_members for each row execute function private.chat_joined();

-- Espaço das fotos (publicações e conversa juntas): por pessoa e no total, com os valores da configuração.
create function private.photo_room(who uuid, added bigint) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare limits public.platform_settings;
begin
  select * into limits from public.platform_settings;
  if added + (select coalesce(sum(octet_length(m.bytes)), 0) from public.network_media m join public.network_posts p on p.id = m.post_id where p.author_id = who)
      + (select coalesce(sum(octet_length(f.bytes)), 0) from public.space_message_photos f join public.space_messages g on g.id = f.message_id where g.author_id = who)
      > limits.photo_mb_per_person::bigint * 1024 * 1024 then
    raise exception 'Photo quota' using errcode = 'PT413';
  end if;
  if added + (select coalesce(sum(octet_length(m.bytes)), 0) from public.network_media m)
      + (select coalesce(sum(octet_length(f.bytes)), 0) from public.space_message_photos f) > limits.photo_mb_total::bigint * 1024 * 1024 then
    raise exception 'Photo space full' using errcode = 'PT507';
  end if;
end;
$$;

-- A mensagem como a tela mostra. Quem a pessoa bloqueou aparece recolhido.
create function private.message_card(msg public.space_messages, viewer uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', msg.id, 'author', msg.author_id, 'created_at', msg.created_at, 'changed_at', msg.changed_at,
    'body', case when msg.deleted_at is null then msg.body else '' end,
    'kind', msg.kind,
    'deleted', case when msg.deleted_at is null then null when msg.deleted_by is not distinct from msg.author_id then 'author' else 'moderation' end,
    'reply', (select jsonb_build_object('id', r.id, 'author', r.author_id, 'excerpt', case when r.deleted_at is null and not hidden then left(r.body, 120) else '' end,
        'photo', r.deleted_at is null and not hidden and r.photo_width is not null, 'deleted', r.deleted_at is not null, 'blocked', hidden)
      from public.space_messages r, lateral (select exists (select 1 from public.blocks b where b.blocker_id = viewer and b.blocked_id = r.author_id) as hidden) h
     where r.id = msg.reply_to),
    'photo', case when msg.deleted_at is null and msg.photo_width is not null then jsonb_build_object('width', msg.photo_width, 'height', msg.photo_height,
        'alt', msg.photo_alt, 'stored', exists (select 1 from public.space_message_photos f where f.message_id = msg.id)) end,
    'blocked', exists (select 1 from public.blocks b where b.blocker_id = viewer and b.blocked_id = msg.author_id))
$$;

-- 4. Ler: as 40 mais recentes, as anteriores (before) ou o que mudou (after, com folga para o que chegou junto).
-- seen marca como lido até agora.
create function private.chat_messages(target uuid, after timestamptz, before timestamptz, seen boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  role text := private.chat_role(target, me);
  joined timestamptz;
  previous timestamptz;
  found_rows jsonb;
begin
  if me is null or role is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select m.joined_at, greatest(r.read_at, m.joined_at) into joined, previous from public.space_members m
    left join public.space_reads r on r.user_id = me and r.space_id = target
   where m.space_id = target and m.user_id = me;
  if after is not null then
    select coalesce(jsonb_agg(private.message_card(x, me) order by x.changed_at), '[]') into found_rows from (
      select * from public.space_messages g where g.space_id = target and g.created_at >= joined and g.changed_at > after - interval '15 seconds'
       order by g.changed_at limit 200) x;
  else
    select coalesce(jsonb_agg(private.message_card(x, me) order by x.created_at), '[]') into found_rows from (
      select * from public.space_messages g where g.space_id = target and g.created_at >= joined and (before is null or g.created_at < before)
       order by g.created_at desc limit 40) x;
  end if;
  if seen then
    insert into public.space_reads(user_id, space_id, read_at) values (me, target, now())
      on conflict (user_id, space_id) do update set read_at = now();
  end if;
  return jsonb_build_object('messages', found_rows,
    'people', coalesce((select jsonb_object_agg(p.id, private.avatar_of(p.id)) from (
        select distinct (e->>'author')::uuid as id from jsonb_array_elements(found_rows) e
        union select distinct (e->'reply'->>'author')::uuid from jsonb_array_elements(found_rows) e) p
      where p.id is not null), '{}'),
    'read_at', previous, 'moderator', role = 'moderator',
    'open', (select s.archived_at is null from public.spaces s where s.id = target),
    'muted', coalesce((select target = any(f.muted_spaces) from public.profiles f where f.user_id = me), false),
    'photo_days', (select s.chat_photo_days from public.platform_settings s));
end;
$$;

-- 5. Enviar: texto até 4.000 letras, resposta a uma mensagem do mesmo grupo e até 1 foto. Grupo arquivado só lê.
create function private.send_message(target uuid, message_body text, reply uuid, photo jsonb) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean text := btrim(coalesce(message_body, ''));
  created public.space_messages;
begin
  if me is null or private.chat_role(target, me) is null or exists (select 1 from public.spaces s where s.id = target and s.archived_at is not null) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if char_length(clean) > 4000 or (clean = '' and photo is null)
     or (reply is not null and not exists (select 1 from public.space_messages r join public.space_members m on m.space_id = r.space_id and m.user_id = me
       where r.id = reply and r.space_id = target and r.kind = 'text' and r.created_at >= m.joined_at))
     or (photo is not null and (jsonb_typeof(photo) <> 'object' or coalesce(photo->>'mime', '') not in ('image/jpeg', 'image/webp')
       or coalesce(photo->>'data', '') = '' or coalesce(photo->>'width', '') !~ '^[0-9]{1,4}$' or coalesce(photo->>'height', '') !~ '^[0-9]{1,4}$')) then
    raise exception 'Invalid message' using errcode = '22023';
  end if;
  -- Freio contra enxurrada: 30 mensagens por minuto (PT420, "espere um pouco") e 1.000 por dia.
  if (select count(*) from public.space_messages where author_id = me and kind = 'text' and created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Too many messages now' using errcode = 'PT420';
  end if;
  if (select count(*) from public.space_messages where author_id = me and kind = 'text' and created_at > now() - interval '1 day') >= 1000 then
    raise exception 'Too many messages today' using errcode = 'PT429';
  end if;
  if photo is not null then
    perform private.photo_room(me, octet_length(decode(photo->>'data', 'base64')));
  end if;
  insert into public.space_messages(space_id, author_id, body, reply_to, photo_width, photo_height, photo_alt)
  values (target, me, clean, reply, (photo->>'width')::smallint, (photo->>'height')::smallint, left(btrim(coalesce(photo->>'alt', '')), 300))
  returning * into created;
  if photo is not null then
    insert into public.space_message_photos(message_id, mime, bytes) values (created.id, photo->>'mime', decode(photo->>'data', 'base64'));
  end if;
  insert into public.space_reads(user_id, space_id, read_at) values (me, target, now())
    on conflict (user_id, space_id) do update set read_at = now();
  return private.message_card(created, me);
end;
$$;

-- Apagar: quem escreveu ou quem modera o grupo, com o grupo ativo. A foto sai junto.
create function private.delete_message(target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  msg public.space_messages;
  role text;
begin
  select * into msg from public.space_messages where id = target and deleted_at is null and kind = 'text' for update;
  if me is null or not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  role := private.chat_role(msg.space_id, me);
  if role is null or not coalesce(msg.author_id = me or role = 'moderator', false)
     or exists (select 1 from public.spaces s where s.id = msg.space_id and s.archived_at is not null)
     or not exists (select 1 from public.space_members m where m.space_id = msg.space_id and m.user_id = me and m.joined_at <= msg.created_at) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  delete from public.space_message_photos where message_id = target;
  update public.space_messages set body = '', photo_width = null, photo_height = null, photo_alt = '',
    deleted_at = now(), deleted_by = me, changed_at = now() where id = target;
end;
$$;

-- A foto, para quem está no grupo desde antes dela.
create function private.chat_photo(target uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$ select jsonb_build_object('mime', f.mime, 'data', encode(f.bytes, 'base64'))
  from public.space_message_photos f join public.space_messages g on g.id = f.message_id
  join public.space_members m on m.space_id = g.space_id and m.user_id = (select auth.uid())
 where f.message_id = target and g.deleted_at is null and g.created_at >= m.joined_at
   and private.chat_role(g.space_id, (select auth.uid())) is not null $$;

-- Silenciar ou não um grupo, direto da conversa.
create function private.mute_space(target uuid, muted boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null or not exists (select 1 from public.space_members m where m.space_id = target and m.user_id = me) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.profiles set muted_spaces = case when muted then array(select distinct x from unnest(muted_spaces || target) x)
      else array_remove(muted_spaces, target) end, updated_at = now()
   where user_id = me;
  if not found then
    raise exception 'Create the profile first' using errcode = '42501';
  end if;
end;
$$;

-- Mensagens novas por grupo (até 100 cada), sem contar as próprias nem as de quem a pessoa bloqueou.
create function private.my_chat_unread() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.space_id, x.unread), '{}') from (
    select m.space_id, (select count(*) from (select 1 from public.space_messages g
        where g.space_id = m.space_id and g.kind = 'text' and g.deleted_at is null and g.author_id is distinct from m.user_id
          and g.created_at > greatest(r.read_at, m.joined_at)
          and not exists (select 1 from public.blocks b where b.blocker_id = m.user_id and b.blocked_id = g.author_id)
        limit 100) c) as unread
      from public.space_members m
      join public.spaces s on s.id = m.space_id and s.kind = 'group' and 'conversa' = any(s.tools)
      left join public.space_reads r on r.user_id = m.user_id and r.space_id = m.space_id
     where m.user_id = (select auth.uid())) x
   where x.unread > 0
$$;

-- 6. Invólucros e permissões.
create function public.chat_messages(target uuid, after timestamptz, before timestamptz, seen boolean) returns jsonb
language sql security invoker set search_path = '' as $$ select private.chat_messages(target, after, before, seen) $$;
create function public.send_message(target uuid, message_body text, reply uuid, photo jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select private.send_message(target, message_body, reply, photo) $$;
create function public.delete_message(target uuid) returns void
language sql security invoker set search_path = '' as $$ select private.delete_message(target) $$;
create function public.chat_photo(target uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.chat_photo(target) $$;
create function public.mute_space(target uuid, muted boolean) returns void
language sql security invoker set search_path = '' as $$ select private.mute_space(target, muted) $$;

revoke all on function private.chat_role(uuid, uuid), private.chat_joined(), private.photo_room(uuid, bigint), private.message_card(public.space_messages, uuid),
  private.chat_messages(uuid, timestamptz, timestamptz, boolean), private.send_message(uuid, text, uuid, jsonb), private.delete_message(uuid),
  private.chat_photo(uuid), private.mute_space(uuid, boolean), private.my_chat_unread(),
  public.chat_messages(uuid, timestamptz, timestamptz, boolean), public.send_message(uuid, text, uuid, jsonb), public.delete_message(uuid),
  public.chat_photo(uuid), public.mute_space(uuid, boolean) from public, anon, authenticated;
grant execute on function private.chat_messages(uuid, timestamptz, timestamptz, boolean), private.send_message(uuid, text, uuid, jsonb),
  private.delete_message(uuid), private.chat_photo(uuid), private.mute_space(uuid, boolean), private.my_chat_unread(),
  public.chat_messages(uuid, timestamptz, timestamptz, boolean), public.send_message(uuid, text, uuid, jsonb), public.delete_message(uuid),
  public.chat_photo(uuid), public.mute_space(uuid, boolean) to authenticated;
