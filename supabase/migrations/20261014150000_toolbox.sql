-- Caixa de ferramentas: o início da conta diz, de cada sala e grupo, as ferramentas ligadas e se a pessoa conduz (publica
-- no mural, cria enquete). A Caixa usa isso para listar só os grupos onde a ferramenta funciona. Nada mais muda.

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
        'topics', s.topics, 'origin', s.origin, 'tools', s.tools, 'can_lead', private.member_lead(s.id),
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
