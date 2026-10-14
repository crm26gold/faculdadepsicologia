-- Networking: desafios, parte 3 de 3. Depende das partes 1 e 2.
-- A aba Conquistas do perfil: a pessoa vê todas as suas; os outros, só as que ela abriu (Público ou Seguidores), e só se
-- ela não escondeu a aba. O nome do grupo fica só para a dona da medalha: um grupo pode dizer mais do que ela quer mostrar. "Baixar meus dados" traz os desafios, os dias marcados e as medalhas.

-- 1. Ler as conquistas de alguém. Público segue a regra das publicações: perfil aberto, ou quem segue.
create function private.person_achievements(target uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  mine boolean := me = target;
  shown boolean;
  follows boolean;
  open_profile boolean;
begin
  if me is null or target is null or not (mine or private.can_reach_profile(me, target)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select coalesce(f.show_achievements, true), not coalesce(f.closed, true) into shown, open_profile from public.profiles f where f.user_id = target;
  follows := private.follows_accepted(me, target);
  return jsonb_build_object('shown', coalesce(shown, true), 'items', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind,
      'title', a.title, 'detail', case when mine then a.detail else a.detail - 'space' end, 'audience', case when mine then a.audience end,
      'created_at', a.created_at) order by a.created_at desc)
    from public.achievements a
   where a.user_id = target and (mine or (coalesce(shown, true) and (
     (a.audience = 'public' and (coalesce(open_profile, false) or follows)) or (a.audience = 'followers' and follows))))), '[]'));
end;
$$;

-- 2. Quem vê cada medalha, e mostrar ou esconder a aba inteira.
create function private.achievement_audience(target uuid, next_audience text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if next_audience is null or next_audience not in ('public', 'followers', 'private') then
    raise exception 'Invalid audience' using errcode = '22023';
  end if;
  update public.achievements set audience = next_audience where id = target and user_id = auth.uid();
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function private.show_achievements(shown boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set show_achievements = coalesce(shown, true), updated_at = now() where user_id = auth.uid();
  if not found then
    raise exception 'Create the profile first' using errcode = '42501';
  end if;
end;
$$;

-- 3. "Baixar meus dados": os desafios de que a pessoa participa, os dias marcados e as medalhas.
create function private.my_challenges_export() returns jsonb
language sql stable security definer set search_path = ''
as $$ select jsonb_build_object(
  'joined', coalesce((select jsonb_agg(jsonb_build_object('challenge', c.title, 'group', s.name, 'joined_at', m.joined_at,
      'days', (select coalesce(jsonb_agg(jsonb_build_object('day', k.day, 'amount', k.amount) order by k.day), '[]')
        from public.challenge_checkins k where k.challenge_id = c.id and k.user_id = m.user_id)) order by m.joined_at)
    from public.challenge_members m join public.challenges c on c.id = m.challenge_id join public.spaces s on s.id = c.space_id
   where m.user_id = (select auth.uid())), '[]'),
  'created', coalesce((select jsonb_agg(jsonb_build_object('title', c.title, 'description', c.description, 'starts_on', c.starts_on, 'ends_on', c.ends_on) order by c.created_at)
    from public.challenges c where c.created_by = (select auth.uid())), '[]'),
  'achievements', coalesce((select jsonb_agg(jsonb_build_object('title', a.title, 'detail', a.detail, 'audience', a.audience, 'created_at', a.created_at) order by a.created_at)
    from public.achievements a where a.user_id = (select auth.uid())), '[]')) $$;

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
    'challenges', private.my_challenges_export(),
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

-- 4. Invólucros e permissões.
create function public.person_achievements(target uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.person_achievements(target) $$;
create function public.achievement_audience(target uuid, next_audience text) returns void
language sql security invoker set search_path = '' as $$ select private.achievement_audience(target, next_audience) $$;
create function public.show_achievements(shown boolean) returns void
language sql security invoker set search_path = '' as $$ select private.show_achievements(shown) $$;

revoke all on function private.person_achievements(uuid), private.achievement_audience(uuid, text), private.show_achievements(boolean),
  private.my_challenges_export(), public.person_achievements(uuid), public.achievement_audience(uuid, text), public.show_achievements(boolean)
  from public, anon, authenticated;
grant execute on function private.person_achievements(uuid), private.achievement_audience(uuid, text), private.show_achievements(boolean),
  private.my_challenges_export(), public.person_achievements(uuid), public.achievement_audience(uuid, text), public.show_achievements(boolean)
  to authenticated;
