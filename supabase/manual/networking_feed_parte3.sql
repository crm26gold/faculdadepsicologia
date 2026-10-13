-- Parte 3 de 3 (depois da parte 2).
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
