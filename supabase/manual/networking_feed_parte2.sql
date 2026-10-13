-- Parte 2 de 3 (depois da parte 1).
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

