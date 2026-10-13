-- Link da chamada (Meet, Zoom, Teams…) de uma sala ou grupo. No grupo, qualquer pessoa que o vê
-- coloca ou tira o link; na sala e na instituição, só quem conduz. Fica registrado quem colocou e quando.
-- A coluna não tem permissão de escrita direta: só public.set_space_call grava.
alter table public.spaces
  add column call_url text check (call_url ~ '^https://\S+$' and char_length(call_url) <= 500),
  add column call_set_by uuid references auth.users(id) on delete set null,
  add column call_set_at timestamptz;
create index spaces_call_set_by_idx on public.spaces (call_set_by);

create function private.can_set_space_call(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case (select kind from public.spaces where id = target)
    when 'group' then private.can_view_space(target)
    else private.can_lead_space(target) end
$$;

create function public.set_space_call(target uuid, url text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  clean text := nullif(btrim(coalesce(url, '')), '');
begin
  if auth.uid() is null or not coalesce(private.can_set_space_call(target), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if clean is not null and (clean !~ '^https://\S+$' or char_length(clean) > 500) then
    raise exception 'Invalid call link' using errcode = '22023';
  end if;
  update public.spaces
     set call_url = clean,
         call_set_by = case when clean is null then null else auth.uid() end,
         call_set_at = case when clean is null then null else now() end
   where id = target;
end;
$$;

revoke all on function private.can_set_space_call(uuid), public.set_space_call(uuid, text) from public, anon;
grant execute on function private.can_set_space_call(uuid), public.set_space_call(uuid, text) to authenticated;

-- A visão da sala passa a trazer o link da chamada e se a pessoa pode mudá-lo.
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
      'call_url', s.call_url, 'call_set_by', s.call_set_by, 'call_set_at', s.call_set_at)
      from public.spaces s where s.id = target),
    'path', (select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'name', p.name) order by p.depth desc)
      from private.space_path(target) p),
    'access', jsonb_build_object('can_lead', leads, 'can_manage', private.can_manage_space(target), 'is_master', private.is_master(),
      'can_set_call', private.can_set_space_call(target)),
    'my_role', (select m.role from public.space_members m where m.space_id = target and m.user_id = auth.uid()),
    'people', coalesce((select jsonb_agg(to_jsonb(p) order by p.display_name) from private.space_people(target) p), '[]'),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'description', g.description,
        'color', g.color, 'archived_at', g.archived_at,
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
