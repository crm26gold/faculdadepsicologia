-- Networking, etapa 3a: fotos nas publicações e stories que somem em 24 horas.
-- Decisões: docs/VISAO_E_FUNDACAO_2026-09-30.md (13/10/2026). A foto chega já reduzida pelo aparelho e fica no banco,
-- presa à publicação: apagar a publicação, ou o story vencer, apaga a foto junto, sem arquivo esquecido no Storage.

-- 1. Story é uma publicação com prazo. Com foto, a legenda é opcional.
alter table public.network_posts drop constraint network_posts_body_check;
alter table public.network_posts add constraint network_posts_body_check check (char_length(body) <= 2200),
  add column expires_at timestamptz;
create index network_posts_expires_idx on public.network_posts(expires_at) where expires_at is not null;

-- 2. Fotos: até 4 por publicação e 1 por story, JPEG ou WebP de até 300 KB. Só as funções abaixo leem.
create table public.network_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.network_posts(id) on delete cascade,
  position smallint not null check (position between 0 and 3),
  mime text not null check (mime in ('image/jpeg', 'image/webp')),
  bytes bytea not null check (octet_length(bytes) between 64 and 307200),
  width smallint not null check (width between 1 and 4096),
  height smallint not null check (height between 1 and 4096),
  created_at timestamptz not null default now(),
  unique (post_id, position),
  constraint photo_format check (case mime when 'image/jpeg' then substring(bytes from 1 for 3) = '\xffd8ff'::bytea
    else substring(bytes from 1 for 4) = '\x52494646'::bytea and substring(bytes from 9 for 4) = '\x57454250'::bytea end)
);
alter table public.network_media enable row level security;
revoke all on public.network_media from anon, authenticated;

-- 3. Story vencido não aparece para ninguém, nem recebe reação.
create or replace function private.can_see_post(post public.network_posts, viewer uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select (post.expires_at is null or post.expires_at > now()) and (post.author_id = viewer or case post.audience
    when 'private' then false
    when 'group' then exists (select 1 from public.space_members m where m.space_id = post.space_id and m.user_id = viewer)
      or private.staff_of(post.space_id, viewer)
    when 'followers' then private.follows_accepted(viewer, post.author_id)
    when 'public' then not coalesce((select p.closed from public.profiles p where p.user_id = post.author_id), true)
      or private.follows_accepted(viewer, post.author_id)
    else false end)
$$;

create or replace function private.post_card(post public.network_posts, viewer uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', post.id, 'author', private.avatar_of(post.author_id), 'body', post.body, 'style', post.style,
    'audience', post.audience, 'topics', post.topics, 'created_at', post.created_at, 'expires_at', post.expires_at,
    'space', case when post.space_id is not null then (select jsonb_build_object('id', s.id, 'name', s.name) from public.spaces s where s.id = post.space_id) end,
    'photos', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'w', m.width, 'h', m.height) order by m.position)
      from public.network_media m where m.post_id = post.id), '[]'),
    'counts', jsonb_build_object(
      'gostei', (select count(*) from public.post_reactions r where r.post_id = post.id and r.kind = 'gostei'),
      'util', (select count(*) from public.post_reactions r where r.post_id = post.id and r.kind = 'util')),
    'mine', coalesce((select jsonb_agg(r.kind) from public.post_reactions r where r.post_id = post.id and r.user_id = viewer), '[]'))
$$;

-- 4. Publicar com fotos ou como story.
drop function public.create_network_post(text, text, text, uuid, text[]);
drop function private.create_network_post(text, text, text, uuid, text[]);
create function private.create_network_post(post_body text, post_style text, post_audience text, post_space uuid, post_topics text[],
  post_photos jsonb, is_story boolean) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  photos jsonb := coalesce(post_photos, '[]');
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
  -- Freio contra spam: até 30 publicações e stories por dia.
  if (select count(*) from public.network_posts where author_id = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many posts today' using errcode = 'PT429';
  end if;
  -- Freios do espaço grátis: 25 MB de fotos por pessoa e 300 MB no total.
  if jsonb_array_length(photos) > 0 then
    select sum(octet_length(decode(x->>'data', 'base64'))) into added from jsonb_array_elements(photos) x;
    if added + (select coalesce(sum(octet_length(m.bytes)), 0) from public.network_media m join public.network_posts p on p.id = m.post_id
        where p.author_id = me) > 25 * 1024 * 1024 then
      raise exception 'Photo quota' using errcode = 'PT413';
    end if;
    if added + (select coalesce(sum(octet_length(m.bytes)), 0) from public.network_media m) > 300 * 1024 * 1024 then
      raise exception 'Photo space full' using errcode = 'PT507';
    end if;
  end if;
  insert into public.network_posts(author_id, body, style, audience, space_id, topics, expires_at)
  values (me, btrim(coalesce(post_body, '')), coalesce(post_style, 'text'), post_audience, case when post_audience = 'group' then post_space end,
    coalesce(post_topics, '{}'), case when is_story then now() + interval '24 hours' end)
  returning id into created;
  insert into public.network_media(post_id, position, mime, bytes, width, height)
  select created, (x.n - 1)::smallint, x.photo->>'mime', decode(x.photo->>'data', 'base64'), (x.photo->>'width')::smallint, (x.photo->>'height')::smallint
    from jsonb_array_elements(photos) with ordinality as x(photo, n);
  return created;
end;
$$;

-- 5. Leituras: o feed e os #temas mostram publicações; os stories têm leitura própria.
create or replace function private.network_feed(feed text, target uuid, before timestamptz) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if feed = 'space' and not private.can_view_space(target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(private.post_card(p, me) order by p.created_at desc) from (
    select * from public.network_posts p
     where p.created_at < coalesce(before, 'infinity') and p.expires_at is null
       and case feed
         when 'following' then (p.author_id = me or private.follows_accepted(me, p.author_id)) and p.audience <> 'group'
         when 'groups' then p.space_id in (select m.space_id from public.space_members m where m.user_id = me)
         when 'space' then p.space_id = target
         when 'person' then p.author_id = target
         else false end
       and private.can_see_post(p, me)
     order by p.created_at desc limit 30) p), '[]');
end;
$$;

create or replace function private.topic_posts(tag text, before timestamptz) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((select jsonb_agg(private.post_card(p, (select auth.uid())) order by p.created_at desc) from (
    select * from public.network_posts p
     where p.topics @> array[ltrim(lower(btrim(tag)), '#')] and p.created_at < coalesce(before, 'infinity') and p.expires_at is null
       and p.audience = 'public' and private.can_see_post(p, (select auth.uid()))
     order by p.created_at desc limit 30) p), '[]')
$$;

-- Stories por aba: em "Seguindo", os de quem a pessoa segue (e os dela); em "Meus grupos", os dos grupos dela.
create function private.network_stories(feed text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('author', private.avatar_of(s.author_id), 'stories', s.cards)
      order by s.author_id <> me, s.latest desc) from (
    select p.author_id, max(p.created_at) as latest, jsonb_agg(private.post_card(p, me) order by p.created_at) as cards
      from public.network_posts p
     where p.expires_at > now()
       and case feed
         when 'following' then (p.author_id = me or private.follows_accepted(me, p.author_id)) and p.audience <> 'group'
         when 'groups' then p.space_id in (select m.space_id from public.space_members m where m.user_id = me)
         else false end
       and private.can_see_post(p, me)
     group by p.author_id order by max(p.created_at) desc limit 50) s), '[]');
end;
$$;

-- Uma foto, só para quem pode ver a publicação. Sem os bytes, serve para confirmar o acesso a uma cópia já guardada.
create function private.network_photo(target uuid, with_data boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('mime', m.mime, 'data', case when with_data then encode(m.bytes, 'base64') end)
    from public.network_media m join public.network_posts p on p.id = m.post_id
   where m.id = target and private.can_see_post(p, (select auth.uid()))
$$;

-- As fotos da própria pessoa, para "Baixar meus dados".
create function private.my_network_photos() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('post', m.post_id, 'position', m.position, 'mime', m.mime, 'data', encode(m.bytes, 'base64'))
    order by m.created_at, m.position), '[]')
    from public.network_media m join public.network_posts p on p.id = m.post_id where p.author_id = (select auth.uid())
$$;

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

-- 6. Invólucros chamados pela API.
create function public.create_network_post(post_body text, post_style text, post_audience text, post_space uuid, post_topics text[],
  post_photos jsonb, is_story boolean) returns uuid
language sql security invoker set search_path = ''
as $$ select private.create_network_post(post_body, post_style, post_audience, post_space, post_topics, post_photos, is_story) $$;
create function public.network_stories(feed text) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.network_stories(feed) $$;
create function public.network_photo(target uuid, with_data boolean) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.network_photo(target, with_data) $$;

revoke all on function private.create_network_post(text, text, text, uuid, text[], jsonb, boolean), private.network_stories(text),
  private.network_photo(uuid, boolean), private.my_network_photos(),
  public.create_network_post(text, text, text, uuid, text[], jsonb, boolean), public.network_stories(text), public.network_photo(uuid, boolean)
  from public, anon;
grant execute on function private.create_network_post(text, text, text, uuid, text[], jsonb, boolean), private.network_stories(text),
  private.network_photo(uuid, boolean), private.my_network_photos(),
  public.create_network_post(text, text, text, uuid, text[], jsonb, boolean), public.network_stories(text), public.network_photo(uuid, boolean)
  to authenticated;

-- 7. A cada hora, os stories vencidos saem do banco com as fotos, as reações e as atualizações ligadas a eles.
do $stories$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    return;
  end if;
  perform cron.schedule('jornada-stories', '7 * * * *', $job$ delete from public.network_posts where expires_at < now() $job$);
end $stories$;
