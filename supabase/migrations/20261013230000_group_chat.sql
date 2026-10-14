-- Networking: a conversa dentro de cada grupo, com resposta e foto. Só as pessoas do próprio grupo leem e escrevem,
-- e cada uma lê a partir de quando entrou (como no WhatsApp); a entrada aparece na conversa ("Fulano entrou no grupo"),
-- então ninguém entra escondido para ler. A administração vê apenas o trecho de uma mensagem denunciada. A foto fica no servidor pelo prazo de
-- platform_settings.chat_photo_days (vazio = para sempre) e no aparelho de quem já viu.
-- Decisões: docs/VISAO_E_FUNDACAO_2026-09-30.md (conversa do grupo, 13/10).

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

-- 6. Notificação: uma por conversa, resumindo o que chegou; não toca para quem está lendo agora, no silêncio,
-- no grupo silenciado, com o aviso da conversa desligado ou para mensagem de quem foi bloqueado.
create function private.chat_push_claim(server_secret text, batch integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare picked jsonb;
begin
  perform private.bot_check(server_secret);
  -- Um envio por vez: dois disparos juntos não repetem a notificação.
  if not pg_try_advisory_xact_lock(hashtext('jornada-chat-push')) then
    return '[]';
  end if;
  with pending as (
    select m.user_id, m.space_id, count(*) as total, (array_agg(g.id order by g.created_at desc))[1] as last_id
      from public.space_members m
      join public.spaces s on s.id = m.space_id and s.kind = 'group' and s.archived_at is null and 'conversa' = any(s.tools)
      join public.space_messages g on g.space_id = m.space_id and g.kind = 'text' and g.created_at > now() - interval '1 hour' and g.deleted_at is null
        and g.author_id is distinct from m.user_id and g.created_at > m.joined_at
      left join public.space_reads r on r.user_id = m.user_id and r.space_id = m.space_id
      left join public.profiles f on f.user_id = m.user_id
     where g.created_at > coalesce(greatest(r.read_at, r.pushed_at), '-infinity')
       and (r.read_at is null or r.read_at < now() - interval '25 seconds')
       and (r.pushed_at is null or r.pushed_at < now() - interval '30 seconds')
       and coalesce(f.alerts_chat, true)
       and not private.in_quiet(f.quiet_from, f.quiet_to, now())
       and not coalesce(m.space_id = any(f.muted_spaces), false)
       and not private.blocked_between(g.author_id, m.user_id)
       and exists (select 1 from private.push_subscriptions p where p.owner_id = m.user_id)
     group by m.user_id, m.space_id
     order by min(g.created_at)
     limit least(greatest(batch, 1), 200)
  ), marked as (
    insert into public.space_reads(user_id, space_id, pushed_at) select p.user_id, p.space_id, now() from pending p
      on conflict (user_id, space_id) do update set pushed_at = now()
  )
  select coalesce(jsonb_agg(jsonb_build_object('user', p.user_id, 'space', p.space_id, 'group', s.name, 'count', p.total,
      'author', (select a.display_name from public.accounts a where a.user_id = g.author_id),
      'excerpt', left(g.body, 80), 'photo', g.photo_width is not null,
      'devices', (select jsonb_agg(jsonb_build_object('endpoint', d.endpoint, 'p256dh', d.p256dh, 'auth', d.auth))
        from private.push_subscriptions d where d.owner_id = p.user_id))), '[]')
    into picked
    from pending p join public.spaces s on s.id = p.space_id join public.space_messages g on g.id = p.last_id;
  return picked;
end;
$$;

-- 7. Denunciar uma mensagem: o trecho vai para a administração, como nas publicações.
create function private.report_message(target uuid, why text, details text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  msg public.space_messages;
begin
  select * into msg from public.space_messages where id = target and kind = 'text';
  if me is null or not found or msg.author_id is null or msg.author_id = me or private.chat_role(msg.space_id, me) is null
     or not exists (select 1 from public.space_members m where m.space_id = msg.space_id and m.user_id = me and m.joined_at <= msg.created_at) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if (select count(*) from public.network_reports where reporter_id = me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many reports' using errcode = 'PT429';
  end if;
  if exists (select 1 from public.network_reports where reporter_id = me and target_message = target and status = 'aberta') then
    return;
  end if;
  insert into public.network_reports(reporter_id, target_user, target_message, post_excerpt, reason, note)
  values (me, msg.author_id, target, left(msg.body, 300), why, btrim(coalesce(details, '')));
end;
$$;

-- A administração apaga a publicação ou a mensagem denunciada; tudo vai para o histórico.
create or replace function private.admin_resolve_report(target uuid, outcome text) returns void
language plpgsql security definer set search_path = ''
as $$
declare report public.network_reports;
begin
  if not private.is_master() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into report from public.network_reports where id = target and status = 'aberta' for update;
  if not found or outcome is null or outcome not in ('apagar', 'resolvida', 'descartada') then
    raise exception 'Invalid report' using errcode = '22023';
  end if;
  if outcome = 'apagar' then
    if report.target_post is not null then
      delete from public.network_posts where id = report.target_post;
    elsif report.target_message is not null then
      delete from public.space_message_photos where message_id = report.target_message;
      update public.space_messages set body = '', photo_width = null, photo_height = null, photo_alt = '',
        deleted_at = coalesce(deleted_at, now()), deleted_by = auth.uid(), changed_at = now() where id = report.target_message;
    else
      raise exception 'Invalid report' using errcode = '22023';
    end if;
  end if;
  update public.network_reports set status = case when outcome = 'descartada' then 'descartada' else 'resolvida' end,
    resolved_by = auth.uid(), resolved_at = now() where id = target;
  perform private.audit('resolve_report', report.target_user, null,
    jsonb_build_object('report', target, 'outcome', outcome, 'reason', report.reason, 'post', report.target_post, 'message', report.target_message));
end;
$$;

create or replace function private.open_reports() returns jsonb
language sql stable security definer set search_path = ''
as $$ select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'reason', r.reason, 'note', r.note, 'created_at', r.created_at,
    'reporter', (select a.display_name from public.accounts a where a.user_id = r.reporter_id),
    'target', private.avatar_of(r.target_user), 'post', r.target_post, 'excerpt', r.post_excerpt,
    'post_exists', exists (select 1 from public.network_posts p where p.id = r.target_post),
    'message', r.target_message,
    'message_exists', exists (select 1 from public.space_messages g where g.id = r.target_message and g.deleted_at is null),
    'space', (select s.name from public.space_messages g join public.spaces s on s.id = g.space_id where g.id = r.target_message))
    order by r.created_at desc), '[]')
  from public.network_reports r where r.status = 'aberta' and private.is_master() $$;

-- 8. Publicar foto no feed também conta o espaço das fotos da conversa.
create or replace function private.create_network_post(post_body text, post_style text, post_audience text, post_space uuid, post_topics text[],
  post_photos jsonb, is_story boolean) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  photos jsonb := coalesce(post_photos, '[]');
  limits public.platform_settings;
  created uuid;
  added bigint;
begin
  if me is null or not exists (select 1 from public.profiles where user_id = me) then
    raise exception 'Create the profile first' using errcode = '42501';
  end if;
  if post_audience = 'group' and not exists (select 1 from public.space_members m join public.spaces s on s.id = m.space_id
      where m.space_id = post_space and m.user_id = me and s.archived_at is null) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(photos) <> 'array' or jsonb_array_length(photos) > (case when is_story then 1 else 4 end)
     or (btrim(coalesce(post_body, '')) = '' and jsonb_array_length(photos) = 0) or (is_story and post_audience = 'private') then
    raise exception 'Invalid post' using errcode = '22023';
  end if;
  select * into limits from public.platform_settings;
  if (select count(*) from public.network_posts where author_id = me and created_at > now() - interval '1 day') >= limits.posts_per_day then
    raise exception 'Too many posts today' using errcode = 'PT429';
  end if;
  if jsonb_array_length(photos) > 0 then
    select sum(octet_length(decode(x->>'data', 'base64'))) into added from jsonb_array_elements(photos) x;
    perform private.photo_room(me, added);
  end if;
  insert into public.network_posts(author_id, body, style, audience, space_id, topics, expires_at)
  values (me, btrim(coalesce(post_body, '')), coalesce(post_style, 'text'), post_audience, case when post_audience = 'group' then post_space end,
    coalesce(post_topics, '{}'), case when is_story then now() + interval '24 hours' end)
  returning id into created;
  insert into public.network_media(post_id, position, mime, bytes, width, height, alt)
  select created, (x.n - 1)::smallint, x.photo->>'mime', decode(x.photo->>'data', 'base64'), (x.photo->>'width')::smallint, (x.photo->>'height')::smallint,
    btrim(coalesce(x.photo->>'alt', ''))
    from jsonb_array_elements(photos) with ordinality as x(photo, n);
  return created;
end;
$$;

-- 9. Avisos: liga ou desliga a conversa junto das outras preferências (chat vazio mantém como está).
drop function public.save_alerts(boolean, time, time, uuid[]);
drop function private.save_alerts(boolean, time, time, uuid[]);
create function private.save_alerts(network boolean, from_time time, to_time time, muted uuid[], chat boolean default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  update public.profiles set alerts_network = coalesce(network, true), alerts_chat = coalesce(chat, alerts_chat),
    quiet_from = from_time, quiet_to = to_time,
    muted_spaces = coalesce((select array_agg(distinct m.space_id) from public.space_members m where m.user_id = me and m.space_id = any(coalesce(muted, '{}'))), '{}'),
    updated_at = now()
   where user_id = me;
  if not found then
    raise exception 'Create the profile first' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.reminders_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'devices', coalesce((select jsonb_agg(jsonb_build_object('label', p.label, 'created_at', p.created_at) order by p.created_at)
      from private.push_subscriptions p where p.owner_id = me), '[]'::jsonb),
    'telegram', exists (select 1 from public.messenger_links l where l.channel = 'telegram' and l.user_id = me),
    'whatsapp', exists (select 1 from public.messenger_links l where l.channel = 'whatsapp' and l.user_id = me),
    'bridge_online', exists (select 1 from private.whatsapp_bridge b where b.enabled and b.state = 'ready' and b.heartbeat > now() - interval '90 seconds'),
    'network', (select jsonb_build_object('enabled', f.alerts_network, 'chat', f.alerts_chat, 'quiet_from', to_char(f.quiet_from, 'HH24:MI'),
      'quiet_to', to_char(f.quiet_to, 'HH24:MI'), 'muted', to_jsonb(f.muted_spaces)) from public.profiles f where f.user_id = me),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
      from public.space_members m join public.spaces s on s.id = m.space_id where m.user_id = me and s.archived_at is null), '[]'::jsonb),
    'upcoming', coalesce((select jsonb_agg(x.item order by x.next_at) from (
      select r.next_at, jsonb_build_object('id', r.id, 'title', r.title, 'event_at', r.event_at, 'next_at', r.next_at, 'level', r.level, 'status', r.status) item
      from private.reminders r where r.owner_id = me and r.next_at is not null order by r.next_at limit 10) x), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(x.item order by x.due_at desc) from (
      select r.due_at, jsonb_build_object('id', r.id, 'title', r.title, 'due_at', r.due_at, 'status', r.status, 'log', r.log) item
      from private.reminders r where r.owner_id = me and r.next_at is null and r.status in ('visto', 'encerrado') order by r.due_at desc limit 5) x), '[]'::jsonb));
end $$;

-- 10. Início da conta: as mensagens novas de cada grupo.
create or replace function public.app_home() returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'account', (select to_jsonb(a) from public.accounts a where a.user_id = me),
    'settings', (select jsonb_build_object('open_access', s.open_access) from public.platform_settings s),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('document', c.document, 'version', c.version))
      from public.consents c where c.user_id = me), '[]'),
    'profile', (select jsonb_build_object('kind', f.avatar_kind, 'value', f.avatar_value, 'photo', f.avatar_photo, 'bio', f.bio,
        'closed', f.closed, 'discoverable', f.discoverable, 'show_follows', f.show_follows)
      from public.profiles f where f.user_id = me),
    'spaces', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'name', s.name,
        'description', s.description, 'color', s.color, 'parent_id', s.parent_id, 'archived_at', s.archived_at,
        'my_role', m.role, 'template', s.template, 'visibility', s.visibility, 'official', s.official_at is not null,
        'topics', s.topics, 'origin', s.origin,
        'requests', case when m.role is not null then (select count(*) from public.space_join_requests r where r.space_id = s.id and r.user_id <> me) else 0 end)
        order by s.kind, s.name)
      from public.spaces s left join public.space_members m on m.space_id = s.id and m.user_id = me
     where private.member_view(s.id)), '[]'),
    'join_requests', (select count(*) from public.space_join_requests r where r.user_id <> me and private.can_manage_space(r.space_id)),
    'updates', (select count(*) from public.network_events e where e.user_id = me and e.read_at is null and e.kind <> 'follow_request')
      + (select count(*) from public.follows f where f.followee_id = me and not f.accepted),
    'chat', private.my_chat_unread(),
    'my_parts', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'status', p.status,
        'assignment_id', a.id, 'assignment_title', a.title, 'due_date', a.due_date, 'space_id', a.space_id)
        order by a.due_date nulls last, a.title)
      from public.assignment_parts p join public.assignments a on a.id = p.assignment_id
     where p.assignee_id = me and p.status <> 'approved' and a.status = 'open'), '[]'),
    'to_review', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title,
        'assignment_id', a.id, 'assignment_title', a.title, 'space_id', a.space_id, 'submitted_at', p.submitted_at)
        order by p.submitted_at)
      from public.assignment_parts p join public.assignments a on a.id = p.assignment_id
     where p.status = 'submitted' and a.status = 'open' and p.assignee_id is distinct from me
       and private.member_lead(a.space_id)), '[]')
  );
end;
$$;

-- 11. "Baixar meus dados" traz as mensagens escritas e as fotos ainda guardadas.
create function private.my_messages() returns jsonb
language sql stable security definer set search_path = ''
as $$ select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'group', s.name, 'body', g.body, 'created_at', g.created_at,
    'deleted', g.deleted_at is not null) order by g.created_at), '[]')
  from public.space_messages g join public.spaces s on s.id = g.space_id where g.author_id = (select auth.uid()) and g.kind = 'text' $$;
create function private.my_message_photos() returns jsonb
language sql stable security definer set search_path = ''
as $$ select coalesce(jsonb_agg(jsonb_build_object('message', f.message_id, 'mime', f.mime, 'data', encode(f.bytes, 'base64')) order by f.created_at), '[]')
  from public.space_message_photos f join public.space_messages g on g.id = f.message_id where g.author_id = (select auth.uid()) $$;

create or replace function public.export_my_data() returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select to_jsonb(a) from public.accounts a where a.user_id = me),
    'profile', (select to_jsonb(f) from public.profiles f where f.user_id = me),
    'consents', coalesce((select jsonb_agg(to_jsonb(c)) from public.consents c where c.user_id = me), '[]'),
    'personal_workspace', (select w.data from public.personal_workspaces w where w.owner_id = me),
    'assistant_conversations', coalesce((select jsonb_agg(to_jsonb(c) order by c.updated_at, c.id) from public.assistant_conversations c where c.user_id = me), '[]'),
    'assistant_jobs', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'conversation_id', j.conversation_id,
      'input', j.input, 'status', j.status, 'result', j.result, 'created_at', j.created_at, 'updated_at', j.updated_at) order by j.created_at, j.id)
      from public.assistant_jobs j where j.user_id = me), '[]'),
    'contacts', coalesce((select jsonb_agg(to_jsonb(c)) from public.contacts c where c.owner_id = me), '[]'),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('space', s.name, 'kind', s.kind, 'role', m.role, 'joined_at', m.joined_at,
        'email_shared', m.email_shared))
      from public.space_members m join public.spaces s on s.id = m.space_id where m.user_id = me), '[]'),
    'join_requests', coalesce((select jsonb_agg(jsonb_build_object('space', s.name, 'share_email', r.share_email, 'created_at', r.created_at))
      from public.space_join_requests r join public.spaces s on s.id = r.space_id where r.user_id = me), '[]'),
    'follows', coalesce((select jsonb_agg(jsonb_build_object('follower', f.follower_id, 'followee', f.followee_id, 'accepted', f.accepted, 'created_at', f.created_at))
      from public.follows f where f.follower_id = me or f.followee_id = me), '[]'),
    'network_posts', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.network_posts p where p.author_id = me), '[]'),
    'network_photos', private.my_network_photos(),
    'saved_posts', private.my_saved_posts(),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('blocked', b.blocked_id, 'created_at', b.created_at)) from public.blocks b where b.blocker_id = me), '[]'),
    'reports', private.my_reports(),
    'group_messages', private.my_messages(),
    'group_message_photos', private.my_message_photos(),
    'reactions', coalesce((select jsonb_agg(jsonb_build_object('post', r.post_id, 'kind', r.kind, 'created_at', r.created_at)) from public.post_reactions r where r.user_id = me), '[]'),
    'parts', coalesce((select jsonb_agg(jsonb_build_object('assignment', a.title, 'title', p.title, 'status', p.status, 'content', p.content))
      from public.assignment_parts p join public.assignments a on a.id = p.assignment_id where p.assignee_id = me or p.submitted_by = me), '[]'),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('body', c.body, 'kind', c.kind, 'created_at', c.created_at)) from public.part_comments c where c.author_id = me), '[]'),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('title', p.title, 'body', p.body, 'created_at', p.created_at)) from public.space_posts p where p.author_id = me), '[]'),
    'votes', coalesce((select jsonb_agg(jsonb_build_object('question', q.question, 'choice', q.options[v.option_index + 1]))
      from public.poll_votes v join public.polls q on q.id = v.poll_id where v.user_id = me), '[]')
  );
end;
$$;

-- 12. Invólucros e permissões. O pedido do servidor vem sem sessão e é protegido pelo segredo dele.
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
create function public.report_message(target uuid, why text, details text) returns void
language sql security invoker set search_path = '' as $$ select private.report_message(target, why, details) $$;
create function public.save_alerts(network boolean, from_time time, to_time time, muted uuid[], chat boolean default null) returns void
language sql security invoker set search_path = '' as $$ select private.save_alerts(network, from_time, to_time, muted, chat) $$;
create function public.chat_push_claim(server_secret text, batch integer) returns jsonb
language sql security definer set search_path = '' as $$ select private.chat_push_claim(server_secret, batch) $$;

revoke all on function private.chat_role(uuid, uuid), private.chat_joined(), private.photo_room(uuid, bigint), private.message_card(public.space_messages, uuid),
  private.chat_messages(uuid, timestamptz, timestamptz, boolean), private.send_message(uuid, text, uuid, jsonb), private.delete_message(uuid),
  private.chat_photo(uuid), private.mute_space(uuid, boolean), private.my_chat_unread(), private.chat_push_claim(text, integer),
  private.report_message(uuid, text, text), private.my_messages(), private.my_message_photos(),
  private.save_alerts(boolean, time, time, uuid[], boolean),
  public.chat_messages(uuid, timestamptz, timestamptz, boolean), public.send_message(uuid, text, uuid, jsonb), public.delete_message(uuid),
  public.chat_photo(uuid), public.mute_space(uuid, boolean), public.report_message(uuid, text, text),
  public.save_alerts(boolean, time, time, uuid[], boolean), public.chat_push_claim(text, integer) from public, anon, authenticated;
grant execute on function private.chat_messages(uuid, timestamptz, timestamptz, boolean), private.send_message(uuid, text, uuid, jsonb),
  private.delete_message(uuid), private.chat_photo(uuid), private.mute_space(uuid, boolean), private.my_chat_unread(),
  private.report_message(uuid, text, text), private.my_messages(), private.my_message_photos(),
  private.save_alerts(boolean, time, time, uuid[], boolean),
  public.chat_messages(uuid, timestamptz, timestamptz, boolean), public.send_message(uuid, text, uuid, jsonb), public.delete_message(uuid),
  public.chat_photo(uuid), public.mute_space(uuid, boolean), public.report_message(uuid, text, text),
  public.save_alerts(boolean, time, time, uuid[], boolean) to authenticated;
grant execute on function public.chat_push_claim(text, integer) to anon, authenticated;

-- 13. Relógio: o disparo de cada minuto também roda por 3 minutos depois de cada mensagem num grupo com alguém de
-- notificação ligada (quem estava lendo e saiu ainda recebe; o aviso não repete), e a faxina diária
-- apaga as fotos da conversa que passaram do prazo.
do $clock$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then return; end if;
  if not exists (select 1 from cron.job where jobname = 'jornada-lembretes') then return; end if;
  perform cron.alter_job((select jobid from cron.job where jobname = 'jornada-lembretes'), command := $job$
    select net.http_post(
      url := 'https://faculdadepsicologia.vercel.app/api/reminders/dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-jornada-clock', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'jornada_reminders_clock')),
      body := '{}'::jsonb, timeout_milliseconds := 25000)
    where exists (select 1 from private.reminders r where r.next_at <= now() and r.status in ('agendado', 'avisando'))
      or exists (select 1 from public.network_events e where e.pushed_at is null and e.created_at > now() - interval '1 hour'
        and exists (select 1 from private.push_subscriptions s where s.owner_id = e.user_id))
      or exists (select 1 from public.space_messages g join public.space_members m on m.space_id = g.space_id and m.user_id is distinct from g.author_id
        where g.created_at > now() - interval '3 minutes' and g.kind = 'text' and g.deleted_at is null
          and exists (select 1 from private.push_subscriptions s where s.owner_id = m.user_id))
      or exists (select 1 from private.google_agenda_links l join public.personal_state s on s.owner_id = l.user_id
        where l.problem <> 'revoked' and l.synced_revision is distinct from s.revision
          and (l.sync_started_at is null or l.sync_started_at < now() - interval '90 seconds')
          and (l.problem = '' or l.synced_at is null or l.synced_at < now() - interval '5 minutes'))
  $job$);
end $clock$;

do $fotos$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then return; end if;
  perform cron.schedule('jornada-fotos-conversa', '29 6 * * *', $job$
    delete from public.space_message_photos f using public.platform_settings s
     where s.chat_photo_days is not null and f.created_at < now() - make_interval(days => s.chat_photo_days)
  $job$);
end $fotos$;
