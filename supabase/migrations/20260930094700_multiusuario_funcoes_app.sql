-- Funções usadas pela aplicação sobre a fundação multiusuário (20260930094408).
begin;

-- 15. Funções da aplicação. Todas executam como quem chamou (security invoker): as regras
-- de RLS acima continuam valendo; alterações sem efeito viram erro de autorização.
create function public.app_home() returns jsonb
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
    'spaces', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'name', s.name,
        'description', s.description, 'color', s.color, 'parent_id', s.parent_id, 'archived_at', s.archived_at,
        'my_role', m.role) order by s.kind, s.name)
      from public.spaces s left join public.space_members m on m.space_id = s.id and m.user_id = me
     where private.member_view(s.id)), '[]'),
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

create function public.space_overview(target uuid) returns jsonb
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
      'color', s.color, 'parent_id', s.parent_id, 'archived_at', s.archived_at, 'created_at', s.created_at)
      from public.spaces s where s.id = target),
    'path', (select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'name', p.name) order by p.depth desc)
      from private.space_path(target) p),
    'access', jsonb_build_object('can_lead', leads, 'can_manage', private.can_manage_space(target), 'is_master', private.is_master()),
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

create function public.assignment_detail(target uuid) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  item public.assignments;
begin
  select * into item from public.assignments where id = target;
  if not found then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'assignment', to_jsonb(item),
    'space', (select jsonb_build_object('id', s.id, 'kind', s.kind, 'name', s.name, 'color', s.color, 'parent_id', s.parent_id)
      from public.spaces s where s.id = item.space_id),
    'path', (select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'name', p.name) order by p.depth desc)
      from private.space_path(item.space_id) p),
    'access', jsonb_build_object('can_lead', private.can_lead_space(item.space_id), 'can_manage', private.can_manage_space(item.space_id)),
    'people', coalesce((select jsonb_agg(to_jsonb(p) order by p.display_name) from private.space_people(item.space_id) p), '[]'),
    'parts', coalesce((select jsonb_agg(to_jsonb(p) order by p.position, p.title)
      from public.assignment_parts p where p.assignment_id = target), '[]'),
    'comments', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at)
      from public.part_comments c join public.assignment_parts p on p.id = c.part_id where p.assignment_id = target), '[]')
  );
end;
$$;

create function public.admin_overview() returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if not private.is_master() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'settings', (select jsonb_build_object('open_access', s.open_access, 'updated_at', s.updated_at) from public.platform_settings s),
    'accounts', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object(
        'spaces', (select count(*) from public.space_members m where m.user_id = a.user_id)) order by a.created_at desc)
      from public.accounts a), '[]'),
    'spaces', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'name', s.name, 'parent_id', s.parent_id,
        'color', s.color, 'archived_at', s.archived_at,
        'members', (select count(*) from public.space_members m where m.space_id = s.id)) order by s.kind, s.name)
      from public.spaces s), '[]'),
    'audit', coalesce((select jsonb_agg(to_jsonb(l) order by l.created_at desc)
      from (select * from public.admin_audit_log order by created_at desc limit 100) l), '[]')
  );
end;
$$;

create function public.update_my_name(new_name text) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.accounts set display_name = btrim(new_name) where user_id = auth.uid();
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.accept_terms(terms_version text) returns void
language sql security invoker set search_path = ''
as $$
  insert into public.consents(user_id, document, version)
  values (auth.uid(), 'terms', terms_version), (auth.uid(), 'privacy', terms_version)
  on conflict do nothing
$$;

create function public.update_space(target uuid, space_name text, space_description text, space_color text) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.spaces set name = btrim(space_name), description = coalesce(space_description, ''), color = space_color
   where id = target;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.archive_space(target uuid, archived boolean) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.spaces set archived_at = case when archived then now() else null end where id = target;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

-- Sair ou remover alguém de uma sala também tira a pessoa dos grupos dela.
create function public.remove_member(target uuid, member uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  delete from public.space_members where space_id = target and user_id = member;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  delete from public.space_members
   where user_id = member and space_id in (select id from public.spaces where parent_id = target);
end;
$$;

create function public.create_invitation(target uuid, invite_role text, hashed_token text, valid_days integer, uses_limit integer)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  created uuid;
begin
  if valid_days not between 1 and 60 then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;
  insert into public.space_invitations(space_id, token_hash, role, max_uses, expires_at, created_by)
  values (target, hashed_token, invite_role, uses_limit, now() + make_interval(days => valid_days), auth.uid())
  returning id into created;
  return created;
end;
$$;

create function public.revoke_invitation(target uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.space_invitations set revoked_at = now() where id = target and revoked_at is null;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.create_post(target uuid, post_kind text, post_title text, post_body text, post_link text, post_date date, post_pinned boolean)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  created uuid;
begin
  insert into public.space_posts(space_id, author_id, kind, title, body, link_url, event_date, pinned)
  values (target, auth.uid(), post_kind, btrim(post_title), coalesce(post_body, ''), nullif(btrim(post_link), ''), post_date, coalesce(post_pinned, false))
  returning id into created;
  return created;
end;
$$;

create function public.delete_post(target uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  delete from public.space_posts where id = target;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.create_poll(target uuid, poll_question text, poll_options text[], poll_closes timestamptz) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  created uuid;
begin
  insert into public.polls(space_id, author_id, question, options, closes_at)
  values (target, auth.uid(), btrim(poll_question), poll_options, poll_closes)
  returning id into created;
  return created;
end;
$$;

create function public.delete_poll(target uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  delete from public.polls where id = target;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

-- Um trabalho por espaço escolhido (ex.: o mesmo trabalho para os grupos 1, 2 e 3).
create function public.create_assignments(targets uuid[], work_title text, work_subject text, work_instructions text,
  work_rules text, work_style jsonb, work_due date, part_titles text[]) returns uuid[]
language plpgsql security invoker set search_path = ''
as $$
declare
  batch uuid := case when cardinality(targets) > 1 then gen_random_uuid() else null end;
  created uuid[] := '{}';
  target uuid;
  item uuid;
  part_index integer;
begin
  if coalesce(cardinality(targets), 0) not between 1 and 30 or coalesce(cardinality(part_titles), 0) > 40 then
    raise exception 'Invalid assignment' using errcode = '22023';
  end if;
  foreach target in array targets loop
    insert into public.assignments(space_id, batch_id, title, subject_name, instructions, format_rules, doc_style, due_date, created_by)
    values (target, batch, btrim(work_title), coalesce(work_subject, ''), coalesce(work_instructions, ''),
      coalesce(work_rules, ''), coalesce(work_style, '{}'), work_due, auth.uid())
    returning id into item;
    for part_index in 1 .. coalesce(cardinality(part_titles), 0) loop
      insert into public.assignment_parts(assignment_id, position, title) values (item, part_index - 1, btrim(part_titles[part_index]));
    end loop;
    created := created || item;
  end loop;
  return created;
end;
$$;

create function public.update_assignment(target uuid, work_title text, work_subject text, work_instructions text,
  work_rules text, work_style jsonb, work_due date, work_status text) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.assignments
     set title = btrim(work_title), subject_name = coalesce(work_subject, ''), instructions = coalesce(work_instructions, ''),
         format_rules = coalesce(work_rules, ''), doc_style = coalesce(work_style, '{}'), due_date = work_due, status = work_status
   where id = target;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.delete_assignment(target uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  delete from public.assignments where id = target;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.add_part(target uuid, part_title text, part_assignee uuid, part_label text) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  created uuid;
begin
  insert into public.assignment_parts(assignment_id, position, title, assignee_id, assignee_label)
  values (target, coalesce((select max(position) + 1 from public.assignment_parts where assignment_id = target), 0),
    btrim(part_title), part_assignee, coalesce(btrim(part_label), ''))
  returning id into created;
  return created;
end;
$$;

create function public.update_part_meta(target uuid, part_title text, part_assignee uuid, part_label text, part_position integer)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.assignment_parts
     set title = btrim(part_title), assignee_id = part_assignee, assignee_label = coalesce(btrim(part_label), ''), position = part_position
   where id = target;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.delete_part(target uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  delete from public.assignment_parts where id = target;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

-- Salva o texto da parte; opcionalmente muda o estado (quem não conduz só entrega ou volta a rascunho).
create function public.save_part(target uuid, part_content jsonb, next_status text) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.assignment_parts
     set content = coalesce(part_content, content), status = coalesce(next_status, status)
   where id = target;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.add_comment(target uuid, comment_kind text, comment_body text) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  created uuid;
begin
  insert into public.part_comments(part_id, author_id, kind, body) values (target, auth.uid(), comment_kind, btrim(comment_body))
  returning id into created;
  return created;
end;
$$;

create function public.resolve_comment(target uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.part_comments set resolved_at = now() where id = target and resolved_at is null;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.save_contact(target uuid, contact_name text, contact_email text, contact_phone text,
  contact_birthdate date, contact_notes text) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  saved uuid;
begin
  if target is null then
    insert into public.contacts(owner_id, name, email, phone, birthdate, notes)
    values (auth.uid(), btrim(contact_name), coalesce(btrim(contact_email), ''), coalesce(btrim(contact_phone), ''),
      contact_birthdate, coalesce(contact_notes, ''))
    returning id into saved;
  else
    update public.contacts set name = btrim(contact_name), email = coalesce(btrim(contact_email), ''),
      phone = coalesce(btrim(contact_phone), ''), birthdate = contact_birthdate, notes = coalesce(contact_notes, '')
     where id = target
    returning id into saved;
    if saved is null then
      raise exception 'Not authorized' using errcode = '42501';
    end if;
  end if;
  return saved;
end;
$$;

create function public.delete_contact(target uuid) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  delete from public.contacts where id = target;
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
end;
$$;

create function public.list_contacts() returns jsonb
language sql stable security invoker set search_path = ''
as $$ select coalesce(jsonb_agg(to_jsonb(c) - 'owner_id' order by c.name), '[]') from public.contacts c $$;

-- Portabilidade (LGPD): tudo que está ligado à pessoa, num único arquivo.
create function public.export_my_data() returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select to_jsonb(a) from public.accounts a where a.user_id = me),
    'consents', coalesce((select jsonb_agg(to_jsonb(c)) from public.consents c where c.user_id = me), '[]'),
    'personal_workspace', (select w.data from public.personal_workspaces w where w.owner_id = me),
    'contacts', coalesce((select jsonb_agg(to_jsonb(c)) from public.contacts c where c.owner_id = me), '[]'),
    'memberships', coalesce((select jsonb_agg(jsonb_build_object('space', s.name, 'kind', s.kind, 'role', m.role, 'joined_at', m.joined_at))
      from public.space_members m join public.spaces s on s.id = m.space_id where m.user_id = me), '[]'),
    'parts', coalesce((select jsonb_agg(jsonb_build_object('assignment', a.title, 'title', p.title, 'status', p.status, 'content', p.content))
      from public.assignment_parts p join public.assignments a on a.id = p.assignment_id
     where p.assignee_id = me or p.submitted_by = me), '[]'),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('body', c.body, 'kind', c.kind, 'created_at', c.created_at))
      from public.part_comments c where c.author_id = me), '[]'),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('title', p.title, 'body', p.body, 'created_at', p.created_at))
      from public.space_posts p where p.author_id = me), '[]'),
    'votes', coalesce((select jsonb_agg(jsonb_build_object('question', q.question, 'choice', q.options[v.option_index + 1]))
      from public.poll_votes v join public.polls q on q.id = v.poll_id where v.user_id = me), '[]')
  );
end;
$$;

revoke all on function public.app_home(), public.space_overview(uuid), public.assignment_detail(uuid), public.admin_overview(),
  public.update_my_name(text), public.accept_terms(text), public.update_space(uuid, text, text, text),
  public.archive_space(uuid, boolean), public.remove_member(uuid, uuid), public.create_invitation(uuid, text, text, integer, integer),
  public.revoke_invitation(uuid), public.create_post(uuid, text, text, text, text, date, boolean), public.delete_post(uuid),
  public.create_poll(uuid, text, text[], timestamptz), public.delete_poll(uuid),
  public.create_assignments(uuid[], text, text, text, text, jsonb, date, text[]),
  public.update_assignment(uuid, text, text, text, text, jsonb, date, text), public.delete_assignment(uuid),
  public.add_part(uuid, text, uuid, text), public.update_part_meta(uuid, text, uuid, text, integer), public.delete_part(uuid),
  public.save_part(uuid, jsonb, text), public.add_comment(uuid, text, text), public.resolve_comment(uuid),
  public.save_contact(uuid, text, text, text, date, text), public.delete_contact(uuid), public.list_contacts(),
  public.export_my_data() from public, anon;
grant execute on function public.app_home(), public.space_overview(uuid), public.assignment_detail(uuid), public.admin_overview(),
  public.update_my_name(text), public.accept_terms(text), public.update_space(uuid, text, text, text),
  public.archive_space(uuid, boolean), public.remove_member(uuid, uuid), public.create_invitation(uuid, text, text, integer, integer),
  public.revoke_invitation(uuid), public.create_post(uuid, text, text, text, text, date, boolean), public.delete_post(uuid),
  public.create_poll(uuid, text, text[], timestamptz), public.delete_poll(uuid),
  public.create_assignments(uuid[], text, text, text, text, jsonb, date, text[]),
  public.update_assignment(uuid, text, text, text, text, jsonb, date, text), public.delete_assignment(uuid),
  public.add_part(uuid, text, uuid, text), public.update_part_meta(uuid, text, uuid, text, integer), public.delete_part(uuid),
  public.save_part(uuid, jsonb, text), public.add_comment(uuid, text, text), public.resolve_comment(uuid),
  public.save_contact(uuid, text, text, text, date, text), public.delete_contact(uuid), public.list_contacts(),
  public.export_my_data() to authenticated;

commit;
