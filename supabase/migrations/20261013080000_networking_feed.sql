-- Networking, etapa 2: seguir pessoas, publicações com público escolhido, Gostei e Útil, atualizações.
-- Decisões: docs/VISAO_E_FUNDACAO_2026-09-30.md (13/10/2026). Privado por padrão: perfil novo é fechado
-- (seguir pede aceite) e fica fora da busca de pessoas; cada publicação tem o público que a pessoa escolhe.

-- 1. Privacidade do perfil, decidida pela pessoa.
alter table public.profiles
  add column closed boolean not null default true,
  add column discoverable boolean not null default false,
  add column show_follows boolean not null default false;

-- 2. Seguir. Perfil fechado recebe pedido; aberto, seguidor direto.
create table public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows(followee_id, accepted);
alter table public.follows enable row level security;
revoke all on public.follows from anon, authenticated;
grant select on public.follows to authenticated;
create policy "Own follows" on public.follows for select to authenticated
  using (follower_id = (select auth.uid()) or followee_id = (select auth.uid()));

-- 3. Publicações: texto ou card de texto (gerado na tela, sem arquivo). Fotos vêm na etapa 3.
create table public.network_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2200),
  style text not null default 'text' check (style in ('text', 'card_blue', 'card_sand', 'card_lavender', 'card_rose', 'card_green')),
  audience text not null default 'followers' check (audience in ('public', 'followers', 'group', 'private')),
  space_id uuid references public.spaces(id) on delete cascade,
  topics text[] not null default '{}' check (private.valid_topics(topics)),
  created_at timestamptz not null default now(),
  constraint post_group check ((audience = 'group') = (space_id is not null))
);
create index network_posts_author_idx on public.network_posts(author_id, created_at desc);
create index network_posts_space_idx on public.network_posts(space_id, created_at desc) where space_id is not null;
create index network_posts_topics_idx on public.network_posts using gin (topics);

create table public.post_reactions (
  post_id uuid not null references public.network_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('gostei', 'util')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);
create index post_reactions_user_idx on public.post_reactions(user_id);

-- 4. Atualizações: pedidos, novos seguidores, Gostei e Útil, pedidos de grupo. Ficam 90 dias.
create table public.network_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('follow', 'follow_request', 'follow_accepted', 'gostei', 'util', 'join_request', 'join_approved')),
  post_id uuid references public.network_posts(id) on delete cascade,
  space_id uuid references public.spaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index network_events_user_idx on public.network_events(user_id, created_at desc);
create index network_events_actor_idx on public.network_events(actor_id);
create index network_events_post_idx on public.network_events(post_id);
create index network_events_space_idx on public.network_events(space_id);

-- Leitura sempre pelas funções abaixo; nas tabelas, cada um vê só o que é seu.
alter table public.network_posts enable row level security;
alter table public.post_reactions enable row level security;
alter table public.network_events enable row level security;
revoke all on public.network_posts, public.post_reactions, public.network_events from anon, authenticated;
grant select on public.network_posts, public.post_reactions, public.network_events to authenticated;
create policy "Own posts" on public.network_posts for select to authenticated using (author_id = (select auth.uid()));
create policy "Own reactions" on public.post_reactions for select to authenticated using (user_id = (select auth.uid()));
create policy "Own updates" on public.network_events for select to authenticated using (user_id = (select auth.uid()));

-- 5. Regras de quem vê o quê.
create function private.follows_accepted(viewer uuid, author uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.follows f where f.follower_id = viewer and f.followee_id = author and f.accepted) $$;

-- Pessoas que dividem um grupo ou sala (membros diretos do mesmo espaço).
create function private.share_space(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.space_members x join public.space_members y on y.space_id = x.space_id
  where x.user_id = a and y.user_id = b) $$;

-- Um perfil é alcançável por quem: é a própria pessoa, a pessoa deixou aparecer na busca,
-- dividem um grupo, ou já existe um vínculo de seguir entre as duas.
create function private.can_reach_profile(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select viewer = target or exists (select 1 from public.profiles p where p.user_id = target and (p.discoverable
    or private.share_space(viewer, target)
    or exists (select 1 from public.follows f where (f.follower_id = viewer and f.followee_id = target) or (f.follower_id = target and f.followee_id = viewer))))
$$;

-- Público da publicação: "Todos" num perfil fechado vale só para quem segue.
create function private.can_see_post(post public.network_posts, viewer uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select post.author_id = viewer or case post.audience
    when 'private' then false
    when 'group' then exists (select 1 from public.space_members m where m.space_id = post.space_id and m.user_id = viewer)
      or private.staff_of(post.space_id, viewer)
    when 'followers' then private.follows_accepted(viewer, post.author_id)
    when 'public' then not coalesce((select p.closed from public.profiles p where p.user_id = post.author_id), true)
      or private.follows_accepted(viewer, post.author_id)
    else false end
$$;

create function private.avatar_of(person uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$ select jsonb_build_object('id', a.user_id, 'name', a.display_name,
  'avatar', (select jsonb_build_object('kind', f.avatar_kind, 'value', f.avatar_value, 'photo', f.avatar_photo) from public.profiles f where f.user_id = a.user_id))
  from public.accounts a where a.user_id = person $$;

create function private.post_card(post public.network_posts, viewer uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', post.id, 'author', private.avatar_of(post.author_id), 'body', post.body, 'style', post.style,
    'audience', post.audience, 'topics', post.topics, 'created_at', post.created_at,
    'space', case when post.space_id is not null then (select jsonb_build_object('id', s.id, 'name', s.name) from public.spaces s where s.id = post.space_id) end,
    'counts', jsonb_build_object(
      'gostei', (select count(*) from public.post_reactions r where r.post_id = post.id and r.kind = 'gostei'),
      'util', (select count(*) from public.post_reactions r where r.post_id = post.id and r.kind = 'util')),
    'mine', coalesce((select jsonb_agg(r.kind) from public.post_reactions r where r.post_id = post.id and r.user_id = viewer), '[]'))
$$;

create function private.notify(recipient uuid, event_kind text, post uuid, space uuid) returns void
language sql security definer set search_path = ''
as $$
  insert into public.network_events(user_id, actor_id, kind, post_id, space_id)
  select recipient, (select auth.uid()), event_kind, post, space
   where recipient is distinct from (select auth.uid())
     and not exists (select 1 from public.network_events e where e.user_id = recipient and e.actor_id = (select auth.uid())
       and e.kind = event_kind and e.post_id is not distinct from post and e.space_id is not distinct from space
       and e.created_at > now() - interval '1 day')
$$;

-- 6. Ações.
create function private.save_my_privacy(is_closed boolean, is_discoverable boolean, follows_visible boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  update public.profiles set closed = is_closed, discoverable = is_discoverable, show_follows = follows_visible, updated_at = now()
   where user_id = me;
  if not found then
    raise exception 'Create the profile first' using errcode = 'P0002';
  end if;
  -- Abrir o perfil aceita os pedidos que estavam esperando.
  if not is_closed then
    update public.follows set accepted = true where followee_id = me and not accepted;
  end if;
end;
$$;

create function private.follow(target uuid) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  is_closed boolean;
begin
  if me is null or target = me or not private.can_reach_profile(me, target)
     or not exists (select 1 from public.profiles where user_id = me) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select p.closed into is_closed from public.profiles p where p.user_id = target;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into public.follows(follower_id, followee_id, accepted) values (me, target, not is_closed)
  on conflict (follower_id, followee_id) do nothing;
  if found then
    perform private.notify(target, case when is_closed then 'follow_request' else 'follow' end, null, null);
  end if;
  return case when (select f.accepted from public.follows f where f.follower_id = me and f.followee_id = target) then 'following' else 'requested' end;
end;
$$;

create function private.answer_follow(follower uuid, accept boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if accept then
    update public.follows set accepted = true where follower_id = follower and followee_id = auth.uid() and not accepted;
    if found then
      perform private.notify(follower, 'follow_accepted', null, null);
    end if;
  else
    delete from public.follows where follower_id = follower and followee_id = auth.uid() and not accepted;
  end if;
end;
$$;

-- Deixar de seguir (ou desistir do pedido) e tirar alguém dos seguidores.
create function private.unfollow(target uuid) returns void
language sql security definer set search_path = ''
as $$ delete from public.follows where follower_id = (select auth.uid()) and followee_id = target $$;
create function private.remove_follower(follower uuid) returns void
language sql security definer set search_path = ''
as $$ delete from public.follows where follower_id = follower and followee_id = (select auth.uid()) $$;

create function private.create_network_post(post_body text, post_style text, post_audience text, post_space uuid, post_topics text[]) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  created uuid;
begin
  if me is null or not exists (select 1 from public.profiles where user_id = me) then
    raise exception 'Create the profile first' using errcode = '42501';
  end if;
  if post_audience = 'group' and not exists (select 1 from public.space_members m join public.spaces s on s.id = m.space_id
      where m.space_id = post_space and m.user_id = me and s.archived_at is null) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- Freio contra spam: até 30 publicações por dia.
  if (select count(*) from public.network_posts where author_id = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Too many posts today' using errcode = '22023';
  end if;
  insert into public.network_posts(author_id, body, style, audience, space_id, topics)
  values (me, btrim(post_body), coalesce(post_style, 'text'), post_audience, case when post_audience = 'group' then post_space end, coalesce(post_topics, '{}'))
  returning id into created;
  return created;
end;
$$;

-- Apaga quem escreveu; num grupo, também quem gerencia o grupo.
create function private.delete_network_post(target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.network_posts p where p.id = target
     and (p.author_id = auth.uid() or (p.space_id is not null and private.can_manage_space(p.space_id)));
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function private.toggle_reaction(target uuid, reaction text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  post public.network_posts;
begin
  select * into post from public.network_posts where id = target;
  if not found or me is null or not private.can_see_post(post, me) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  delete from public.post_reactions where post_id = target and user_id = me and kind = reaction;
  if found then
    return false;
  end if;
  insert into public.post_reactions(post_id, user_id, kind) values (target, me, reaction);
  perform private.notify(post.author_id, reaction, target, null);
  return true;
end;
$$;

-- 7. Leituras.
create function private.network_feed(feed text, target uuid, before timestamptz) returns jsonb
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
     where p.created_at < coalesce(before, 'infinity')
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

-- Publicações abertas a todos com um #tema.
create function private.topic_posts(tag text, before timestamptz) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((select jsonb_agg(private.post_card(p, (select auth.uid())) order by p.created_at desc) from (
    select * from public.network_posts p
     where p.topics @> array[ltrim(lower(btrim(tag)), '#')] and p.created_at < coalesce(before, 'infinity')
       and p.audience = 'public' and private.can_see_post(p, (select auth.uid()))
     order by p.created_at desc limit 30) p), '[]')
$$;

create function private.search_people(term text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  wanted text := lower(btrim(coalesce(term, '')));
begin
  if me is null or not exists (select 1 from public.profiles where user_id = me) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if char_length(wanted) < 2 or char_length(wanted) > 60 then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(private.avatar_of(p.user_id) || jsonb_build_object('bio', left(p.bio, 120)) order by a.display_name) from (
    select p.* from public.profiles p join public.accounts a on a.user_id = p.user_id
     where p.user_id <> me and strpos(lower(a.display_name), wanted) > 0
       and (p.discoverable or private.share_space(me, p.user_id))
     limit 30) p join public.accounts a on a.user_id = p.user_id), '[]');
end;
$$;

create function private.person_profile(target uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  person public.profiles;
  status text;
begin
  select * into person from public.profiles where user_id = target;
  if me is null or not found or not private.can_reach_profile(me, target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select case when f.accepted then 'following' else 'requested' end into status from public.follows f where f.follower_id = me and f.followee_id = target;
  return private.avatar_of(target) || jsonb_build_object(
    'bio', person.bio, 'closed', person.closed, 'is_me', target = me,
    'discoverable', case when target = me then person.discoverable end,
    'show_follows', person.show_follows,
    'status', coalesce(status, 'none'),
    'follows_me', private.follows_accepted(target, me),
    'requested_me', exists (select 1 from public.follows f where f.follower_id = target and f.followee_id = me and not f.accepted),
    'followers', (select count(*) from public.follows f where f.followee_id = target and f.accepted),
    'following', (select count(*) from public.follows f where f.follower_id = target and f.accepted),
    'posts', private.network_feed('person', target, null));
end;
$$;

-- Listas de seguidores e de quem a pessoa segue: só ela, ou todos que alcançam o perfil se ela mostrar.
create function private.follow_list(target uuid, which text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not (target = me or (private.can_reach_profile(me, target)
      and coalesce((select p.show_follows from public.profiles p where p.user_id = target), false))) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(private.avatar_of(case when which = 'followers' then f.follower_id else f.followee_id end) order by f.created_at desc)
    from public.follows f where f.accepted and case when which = 'followers' then f.followee_id = target else f.follower_id = target end), '[]');
end;
$$;

create function private.network_updates() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'requests', coalesce((select jsonb_agg(private.avatar_of(f.follower_id) order by f.created_at desc)
      from public.follows f where f.followee_id = (select auth.uid()) and not f.accepted), '[]'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'kind', e.kind, 'created_at', e.created_at, 'read', e.read_at is not null,
        'actor', private.avatar_of(e.actor_id),
        'post', case when e.post_id is not null then (select jsonb_build_object('id', p.id, 'body', left(p.body, 80)) from public.network_posts p where p.id = e.post_id) end,
        'space', case when e.space_id is not null then (select jsonb_build_object('id', s.id, 'name', s.name) from public.spaces s where s.id = e.space_id) end)
        order by e.created_at desc)
      from (select * from public.network_events where user_id = (select auth.uid()) order by created_at desc limit 50) e), '[]'))
$$;

create function private.mark_updates_read() returns void
language sql security definer set search_path = ''
as $$ update public.network_events set read_at = now() where user_id = (select auth.uid()) and read_at is null $$;

-- 8. Pedidos de grupo também viram atualização: para quem cuida do grupo e para quem foi aceito.
create or replace function private.join_group(target uuid, password text, share_email boolean) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  g public.spaces;
  secret text;
  shared boolean;
  owner_id uuid;
begin
  if me is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into g from public.spaces where id = target;
  if not found or not private.discoverable_group(g, me) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if exists (select 1 from public.space_members where space_id = target and user_id = me) then
    return 'joined';
  end if;
  shared := g.join_asks_email and coalesce(share_email, false);
  if g.join_asks_email and not shared then
    return 'email_required';
  end if;
  select password_hash into secret from private.space_join_secrets where space_id = target;
  if secret is not null then
    delete from private.join_attempts where user_id = me and at < now() - interval '1 hour';
    if (select count(*) from private.join_attempts where user_id = me and space_id = target) >= 5 then
      return 'too_many_attempts';
    end if;
    if password is null or extensions.crypt(password, secret) <> secret then
      insert into private.join_attempts(user_id, space_id) values (me, target);
      return 'wrong_password';
    end if;
  end if;
  if g.join_approval then
    insert into public.space_join_requests(space_id, user_id, share_email) values (target, me, shared)
    on conflict (space_id, user_id) do update set share_email = excluded.share_email;
    for owner_id in select m.user_id from public.space_members m where m.space_id = target and m.role = 'owner' loop
      perform private.notify(owner_id, 'join_request', null, target);
    end loop;
    return 'requested';
  end if;
  insert into public.space_members(space_id, user_id, role, email_shared) values (target, me, 'student', shared);
  return 'joined';
end;
$$;

create or replace function private.decide_join_request(target uuid, member uuid, approve boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  shared boolean;
begin
  if not private.can_manage_space(target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  delete from public.space_join_requests where space_id = target and user_id = member returning share_email into shared;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if approve then
    insert into public.space_members(space_id, user_id, role, added_by, email_shared)
    values (target, member, 'student', auth.uid(), shared)
    on conflict (space_id, user_id) do nothing;
    perform private.notify(member, 'join_approved', null, target);
  end if;
end;
$$;

-- Início ganha o contador de atualizações; a exportação, o que a pessoa fez na rede.
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

-- 9. Invólucros chamados pela API.
create function public.save_my_privacy(is_closed boolean, is_discoverable boolean, follows_visible boolean) returns void
language sql security invoker set search_path = '' as $$ select private.save_my_privacy(is_closed, is_discoverable, follows_visible) $$;
create function public.follow_person(target uuid) returns text
language sql security invoker set search_path = '' as $$ select private.follow(target) $$;
create function public.unfollow_person(target uuid) returns void
language sql security invoker set search_path = '' as $$ select private.unfollow(target) $$;
create function public.answer_follow(follower uuid, accept boolean) returns void
language sql security invoker set search_path = '' as $$ select private.answer_follow(follower, accept) $$;
create function public.remove_follower(follower uuid) returns void
language sql security invoker set search_path = '' as $$ select private.remove_follower(follower) $$;
create function public.create_network_post(post_body text, post_style text, post_audience text, post_space uuid, post_topics text[]) returns uuid
language sql security invoker set search_path = '' as $$ select private.create_network_post(post_body, post_style, post_audience, post_space, post_topics) $$;
create function public.delete_network_post(target uuid) returns void
language sql security invoker set search_path = '' as $$ select private.delete_network_post(target) $$;
create function public.toggle_reaction(target uuid, reaction text) returns boolean
language sql security invoker set search_path = '' as $$ select private.toggle_reaction(target, reaction) $$;
create function public.network_feed(feed text, target uuid, before timestamptz) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.network_feed(feed, target, before) $$;
create function public.topic_posts(tag text, before timestamptz) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.topic_posts(tag, before) $$;
create function public.search_people(term text) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.search_people(term) $$;
create function public.person_profile(target uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.person_profile(target) $$;
create function public.follow_list(target uuid, which text) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.follow_list(target, which) $$;
create function public.network_updates() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.network_updates() $$;
create function public.mark_updates_read() returns void
language sql security invoker set search_path = '' as $$ select private.mark_updates_read() $$;

revoke all on function private.follows_accepted(uuid, uuid), private.share_space(uuid, uuid), private.can_reach_profile(uuid, uuid),
  private.can_see_post(public.network_posts, uuid), private.avatar_of(uuid), private.post_card(public.network_posts, uuid),
  private.notify(uuid, text, uuid, uuid), private.save_my_privacy(boolean, boolean, boolean), private.follow(uuid),
  private.answer_follow(uuid, boolean), private.unfollow(uuid), private.remove_follower(uuid),
  private.create_network_post(text, text, text, uuid, text[]), private.delete_network_post(uuid),
  private.toggle_reaction(uuid, text), private.network_feed(text, uuid, timestamptz), private.topic_posts(text, timestamptz),
  private.search_people(text), private.person_profile(uuid), private.follow_list(uuid, text), private.network_updates(),
  private.mark_updates_read(),
  public.save_my_privacy(boolean, boolean, boolean), public.follow_person(uuid), public.unfollow_person(uuid),
  public.answer_follow(uuid, boolean), public.remove_follower(uuid), public.create_network_post(text, text, text, uuid, text[]),
  public.delete_network_post(uuid), public.toggle_reaction(uuid, text), public.network_feed(text, uuid, timestamptz),
  public.topic_posts(text, timestamptz), public.search_people(text), public.person_profile(uuid), public.follow_list(uuid, text),
  public.network_updates(), public.mark_updates_read() from public, anon;
grant execute on function private.follows_accepted(uuid, uuid), private.share_space(uuid, uuid), private.can_reach_profile(uuid, uuid),
  private.can_see_post(public.network_posts, uuid), private.avatar_of(uuid), private.post_card(public.network_posts, uuid),
  private.notify(uuid, text, uuid, uuid), private.save_my_privacy(boolean, boolean, boolean), private.follow(uuid),
  private.answer_follow(uuid, boolean), private.unfollow(uuid), private.remove_follower(uuid),
  private.create_network_post(text, text, text, uuid, text[]), private.delete_network_post(uuid),
  private.toggle_reaction(uuid, text), private.network_feed(text, uuid, timestamptz), private.topic_posts(text, timestamptz),
  private.search_people(text), private.person_profile(uuid), private.follow_list(uuid, text), private.network_updates(),
  private.mark_updates_read(),
  public.save_my_privacy(boolean, boolean, boolean), public.follow_person(uuid), public.unfollow_person(uuid),
  public.answer_follow(uuid, boolean), public.remove_follower(uuid), public.create_network_post(text, text, text, uuid, text[]),
  public.delete_network_post(uuid), public.toggle_reaction(uuid, text), public.network_feed(text, uuid, timestamptz),
  public.topic_posts(text, timestamptz), public.search_people(text), public.person_profile(uuid), public.follow_list(uuid, text),
  public.network_updates(), public.mark_updates_read() to authenticated;

-- 10. Faxina diária (03:23 em São Paulo): atualizações com mais de 90 dias e tentativas de senha antigas.
do $faxina$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    return;
  end if;
  perform cron.schedule('jornada-faxina-networking', '23 6 * * *', $job$
    delete from public.network_events where created_at < now() - interval '90 days';
    delete from private.join_attempts where at < now() - interval '1 day'
  $job$);
end $faxina$;
