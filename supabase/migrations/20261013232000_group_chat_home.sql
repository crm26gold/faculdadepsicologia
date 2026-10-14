-- Networking: conversa do grupo, parte 3 de 3. Depende das partes 1 e 2.
-- Avisos (ligar e desligar a conversa), início da conta com as mensagens novas e "Baixar meus dados".

-- 1. Avisos: liga ou desliga a conversa junto das outras preferências (chat vazio mantém como está).
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

-- 2. Início da conta: as mensagens novas de cada grupo.
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

-- 3. "Baixar meus dados" traz as mensagens escritas e as fotos ainda guardadas.
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

-- 4. Invólucros e permissões.
create function public.save_alerts(network boolean, from_time time, to_time time, muted uuid[], chat boolean default null) returns void
language sql security invoker set search_path = '' as $$ select private.save_alerts(network, from_time, to_time, muted, chat) $$;

revoke all on function private.my_messages(), private.my_message_photos(), private.save_alerts(boolean, time, time, uuid[], boolean),
  public.save_alerts(boolean, time, time, uuid[], boolean) from public, anon, authenticated;
grant execute on function private.my_messages(), private.my_message_photos(), private.save_alerts(boolean, time, time, uuid[], boolean),
  public.save_alerts(boolean, time, time, uuid[], boolean) to authenticated;
