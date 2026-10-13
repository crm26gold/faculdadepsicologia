-- Parte 3 de 3 (depois da parte 2).
create or replace function public.space_overview(target uuid) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  leads boolean;
begin
  if not private.can_view_space(target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  leads := private.can_lead_space(target);
  return jsonb_build_object(
    'space', (select jsonb_build_object('id', s.id, 'kind', s.kind, 'name', s.name, 'description', s.description,
      'color', s.color, 'parent_id', s.parent_id, 'archived_at', s.archived_at, 'created_at', s.created_at,
      'call_url', s.call_url, 'call_set_by', s.call_set_by, 'call_set_at', s.call_set_at,
      'template', s.template, 'tools', s.tools, 'topics', s.topics, 'origin', s.origin, 'visibility', s.visibility,
      'join_approval', s.join_approval, 'join_asks_email', s.join_asks_email, 'official_at', s.official_at,
      'has_password', private.group_has_password(target))
      from public.spaces s where s.id = target),
    'path', (select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'name', p.name) order by p.depth desc)
      from private.space_path(target) p),
    'access', jsonb_build_object('can_lead', leads, 'can_manage', private.can_manage_space(target), 'is_master', private.is_master(),
      'can_set_call', private.can_set_space_call(target), 'is_staff', private.staff_of(target, auth.uid())),
    'my_role', (select m.role from public.space_members m where m.space_id = target and m.user_id = auth.uid()),
    'people', coalesce((select jsonb_agg(to_jsonb(p) order by p.display_name) from private.space_people(target) p), '[]'),
    'avatars', private.space_avatars(target),
    'requests', private.space_join_queue(target),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'description', g.description,
        'color', g.color, 'archived_at', g.archived_at, 'official', g.official_at is not null,
        'members', (select count(*) from public.space_members gm where gm.space_id = g.id)) order by g.name)
      from public.spaces g where g.parent_id = target), '[]'),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'title', p.title, 'body', p.body,
        'link_url', p.link_url, 'event_date', p.event_date, 'pinned', p.pinned, 'author_id', p.author_id,
        'created_at', p.created_at) order by p.pinned desc, p.created_at desc)
      from public.space_posts p where p.space_id = target), '[]'),
    'polls', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'options', q.options,
        'closes_at', q.closes_at, 'author_id', q.author_id, 'created_at', q.created_at,
        'my_vote', (select v.option_index from public.poll_votes v where v.poll_id = q.id and v.user_id = auth.uid()),
        'results', coalesce((select jsonb_agg(jsonb_build_object('option_index', r.option_index, 'votes', r.votes))
          from private.poll_results(target) r where r.poll_id = q.id), '[]')) order by q.created_at desc)
      from public.polls q where q.space_id = target), '[]'),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'subject_name', a.subject_name,
        'due_date', a.due_date, 'status', a.status, 'space_id', a.space_id, 'space_name', s.name, 'batch_id', a.batch_id,
        'parts_total', (select count(*) from public.assignment_parts p where p.assignment_id = a.id),
        'parts_submitted', (select count(*) from public.assignment_parts p where p.assignment_id = a.id and p.status in ('submitted', 'approved')),
        'parts_approved', (select count(*) from public.assignment_parts p where p.assignment_id = a.id and p.status = 'approved'))
        order by a.due_date nulls last, a.created_at desc)
      from public.assignments a join public.spaces s on s.id = a.space_id
     where a.space_id = target or s.parent_id = target), '[]'),
    'invitations', case when leads then coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'role', i.role,
        'max_uses', i.max_uses, 'uses', i.uses, 'expires_at', i.expires_at, 'revoked_at', i.revoked_at,
        'created_at', i.created_at) order by i.created_at desc)
      from public.space_invitations i where i.space_id = target), '[]') else '[]'::jsonb end
  );
end;
$$;

-- Início: o próprio perfil, o modelo e o selo de cada espaço e quantos pedidos esperam resposta.
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
    'profile', (select jsonb_build_object('kind', f.avatar_kind, 'value', f.avatar_value, 'photo', f.avatar_photo, 'bio', f.bio)
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

-- Exportação da conta passa a trazer o perfil e os pedidos para entrar.
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
create function public.create_group(group_name text, parent uuid, group_description text, group_color text,
  group_template text, group_tools text[], group_topics text[], group_origin text, group_visibility text,
  approval boolean, asks_email boolean, password text) returns uuid
language sql security invoker set search_path = ''
as $$ select private.create_group(group_name, parent, group_description, group_color, group_template, group_tools,
  group_topics, group_origin, group_visibility, approval, asks_email, password) $$;
create function public.update_group_settings(target uuid, group_template text, group_tools text[], group_topics text[],
  group_origin text, group_visibility text, approval boolean, asks_email boolean, password text) returns void
language sql security invoker set search_path = ''
as $$ select private.update_group_settings(target, group_template, group_tools, group_topics, group_origin,
  group_visibility, approval, asks_email, password) $$;
create function public.discover_groups(search text) returns jsonb
language sql stable security invoker set search_path = ''
as $$ select private.discover_groups(search) $$;
create function public.join_group(target uuid, password text, share_email boolean) returns text
language sql security invoker set search_path = ''
as $$ select private.join_group(target, password, share_email) $$;
create function public.decide_join_request(target uuid, member uuid, approve boolean) returns void
language sql security invoker set search_path = ''
as $$ select private.decide_join_request(target, member, approve) $$;
create function public.withdraw_join_request(target uuid) returns void
language sql security invoker set search_path = ''
as $$ delete from public.space_join_requests where space_id = target and user_id = (select auth.uid()) $$;
create function public.set_space_official(target uuid, official boolean) returns void
language sql security invoker set search_path = ''
as $$ select private.set_space_official(target, official) $$;

revoke all on function private.staff_of(uuid, uuid), private.check_group_settings(uuid, text, text),
  private.create_group(text, uuid, text, text, text, text[], text[], text, text, boolean, boolean, text),
  private.update_group_settings(uuid, text, text[], text[], text, text, boolean, boolean, text),
  private.discoverable_group(public.spaces, uuid), private.discover_groups(text), private.join_group(uuid, text, boolean),
  private.decide_join_request(uuid, uuid, boolean), private.set_space_official(uuid, boolean),
  private.space_avatars(uuid), private.space_join_queue(uuid), private.group_has_password(uuid),
  public.save_my_profile(text, text, text, text),
  public.create_group(text, uuid, text, text, text, text[], text[], text, text, boolean, boolean, text),
  public.update_group_settings(uuid, text, text[], text[], text, text, boolean, boolean, text),
  public.discover_groups(text), public.join_group(uuid, text, boolean), public.decide_join_request(uuid, uuid, boolean),
  public.withdraw_join_request(uuid), public.set_space_official(uuid, boolean) from public, anon;
grant execute on function private.staff_of(uuid, uuid), private.check_group_settings(uuid, text, text),
  private.create_group(text, uuid, text, text, text, text[], text[], text, text, boolean, boolean, text),
  private.update_group_settings(uuid, text, text[], text[], text, text, boolean, boolean, text),
  private.discoverable_group(public.spaces, uuid), private.discover_groups(text), private.join_group(uuid, text, boolean),
  private.decide_join_request(uuid, uuid, boolean), private.set_space_official(uuid, boolean),
  private.space_avatars(uuid), private.space_join_queue(uuid), private.group_has_password(uuid),
  public.save_my_profile(text, text, text, text),
  public.create_group(text, uuid, text, text, text, text[], text[], text, text, boolean, boolean, text),
  public.update_group_settings(uuid, text, text[], text[], text, text, boolean, boolean, text),
  public.discover_groups(text), public.join_group(uuid, text, boolean), public.decide_join_request(uuid, uuid, boolean),
  public.withdraw_join_request(uuid), public.set_space_official(uuid, boolean) to authenticated;
