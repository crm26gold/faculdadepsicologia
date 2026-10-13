-- Parte 2 de 3 (depois da parte 1).
-- 5. Descobrir: só grupos abertos a todos ou à sala de quem procura. Mostra o cartão, nunca os membros.
create function private.discoverable_group(g public.spaces, who uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select g.kind = 'group' and g.archived_at is null and (g.visibility = 'public'
    or (g.visibility = 'class' and exists (select 1 from public.space_members m where m.space_id = g.parent_id and m.user_id = who)))
$$;

create function private.discover_groups(search text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  term text := lower(btrim(coalesce(search, '')));
  tag text := ltrim(lower(btrim(coalesce(search, ''))), '#');
begin
  if me is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if char_length(term) > 60 then
    raise exception 'Search too long' using errcode = '22023';
  end if;
  return coalesce((select jsonb_agg(card order by official desc, members desc, name) from (
    select s.official_at is not null as official, c.members, s.name,
      jsonb_build_object('id', s.id, 'name', s.name, 'description', left(s.description, 280), 'color', s.color,
        'template', s.template, 'topics', s.topics, 'origin', s.origin, 'official', s.official_at is not null,
        'class_name', case when s.visibility = 'class' then p.name end, 'members', c.members,
        'join_approval', s.join_approval, 'join_asks_email', s.join_asks_email,
        'has_password', exists (select 1 from private.space_join_secrets j where j.space_id = s.id),
        'is_member', exists (select 1 from public.space_members m where m.space_id = s.id and m.user_id = me),
        'requested', exists (select 1 from public.space_join_requests r where r.space_id = s.id and r.user_id = me)) as card
      from public.spaces s
      left join public.spaces p on p.id = s.parent_id
      cross join lateral (select count(*) as members from public.space_members m where m.space_id = s.id) c
     where private.discoverable_group(s, me)
       and (term = '' or s.topics @> array[tag] or strpos(lower(s.name), term) > 0
         or strpos(lower(s.origin), term) > 0 or strpos(lower(s.description), term) > 0)
     order by s.official_at is not null desc, c.members desc, s.name
     limit 40) cards), '[]');
end;
$$;

-- 6. Entrar pela busca. Responde com uma situação em vez de erro para a tentativa errada de senha
-- ficar registrada: 5 erros por hora bloqueiam novas tentativas naquele grupo.
create function private.join_group(target uuid, password text, share_email boolean) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  g public.spaces;
  secret text;
  shared boolean;
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
    return 'requested';
  end if;
  insert into public.space_members(space_id, user_id, role, email_shared) values (target, me, 'student', shared);
  return 'joined';
end;
$$;

create function private.decide_join_request(target uuid, member uuid, approve boolean) returns void
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
  end if;
end;
$$;

-- 7. Selo de oficial: quem é da equipe acima do grupo (ou o master) assume. Fica no histórico.
create function private.set_space_official(target uuid, official boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.staff_of(target, auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.spaces set official_at = case when official then now() end, official_by = case when official then auth.uid() end
   where id = target;
  if not found then
    raise exception 'Space not found' using errcode = 'P0002';
  end if;
  perform private.audit(case when official then 'set_official' else 'unset_official' end, null, target, '{}');
end;
$$;

-- 8. Telas: avatares e pedidos aparecem só para quem pode ver o grupo ou gerenciá-lo.
create function private.space_avatars(target uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_object_agg(f.user_id, jsonb_build_object('kind', f.avatar_kind, 'value', f.avatar_value, 'photo', f.avatar_photo)), '{}')
    from public.profiles f where f.user_id in (select p.user_id from private.space_people(target) p)
$$;

-- Só quem gerencia sabe se há senha.
create function private.group_has_password(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.can_manage_space(target) and exists (select 1 from private.space_join_secrets j where j.space_id = target) $$;

create function private.space_join_queue(target uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when private.can_manage_space(target) then coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', r.user_id, 'display_name', a.display_name, 'email', case when r.share_email then a.email end,
      'created_at', r.created_at) order by r.created_at)
    from public.space_join_requests r join public.accounts a on a.user_id = r.user_id where r.space_id = target), '[]')
  else '[]'::jsonb end
$$;

