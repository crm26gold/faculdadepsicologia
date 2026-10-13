-- Networking, etapa 1: perfil da rede e grupos que qualquer pessoa cria, encontra e entra.
-- Decisões: docs/VISAO_E_FUNDACAO_2026-09-30.md (Networking, 13/10/2026). Privado por padrão:
-- o perfil só existe quando a pessoa cria; grupo novo não aparece na busca até o dono escolher.

-- 1. Perfil da rede. O nome continua em accounts.display_name; aqui ficam o avatar e a bio.
-- A foto é uma miniatura (128 px) para não pesar nas listas de membros.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  avatar_kind text not null default 'initials' check (avatar_kind in ('initials', 'animal', 'symbol', 'photo')),
  avatar_value text not null default '' check (char_length(avatar_value) <= 16),
  avatar_photo text check (avatar_photo is null
    or (char_length(avatar_photo) <= 16000 and avatar_photo ~ '^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$')),
  bio text not null default '' check (char_length(bio) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profile_photo_kind check ((avatar_kind = 'photo') = (avatar_photo is not null))
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, insert, update (avatar_kind, avatar_value, avatar_photo, bio, updated_at) on public.profiles to authenticated;
-- Cada um lê e grava o próprio; os outros veem o avatar só pelas telas do grupo em comum.
create policy "Own profile" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function public.save_my_profile(next_kind text, next_value text, next_photo text, next_bio text) returns void
language sql security invoker set search_path = ''
as $$
  insert into public.profiles(user_id, avatar_kind, avatar_value, avatar_photo, bio)
  values ((select auth.uid()), next_kind, coalesce(next_value, ''), nullif(next_photo, ''), btrim(coalesce(next_bio, '')))
  on conflict (user_id) do update set avatar_kind = excluded.avatar_kind, avatar_value = excluded.avatar_value,
    avatar_photo = excluded.avatar_photo, bio = excluded.bio, updated_at = now()
$$;

-- 2. Grupo sem sala: qualquer pessoa cria. Instituição e sala continuam como antes.
alter table public.spaces drop constraint space_hierarchy;
alter table public.spaces add constraint space_hierarchy check (
  (kind = 'institution' and parent_id is null) or (kind = 'class' and parent_id is not null) or kind = 'group');

-- #temas: minúsculas, sem espaço, sem repetir.
create function private.valid_topics(items text[]) returns boolean
language sql immutable set search_path = ''
as $$
  select cardinality(items) <= 5
     and (select count(distinct t) from unnest(items) t) = cardinality(items)
     and coalesce((select bool_and(t ~ '^[a-z0-9_áàâãéêíóôõúüç]{2,30}$') from unnest(items) t), true)
$$;
revoke all on function private.valid_topics(text[]) from public, anon;
grant execute on function private.valid_topics(text[]) to authenticated;

-- Modelo e ferramentas: o modelo só sugere; o dono liga e desliga. Espaços antigos mantêm o que já tinham.
-- Quem vê: todos do Networking, só a sala do grupo, ou só quem recebe convite.
alter table public.spaces
  add column template text not null default 'livre' check (template in ('estudo', 'trabalho', 'desafio', 'saude', 'livre')),
  add column tools text[] not null default '{mural,enquetes,partes,encontros}'
    check (tools <@ array['conversa', 'mural', 'enquetes', 'material', 'partes', 'encontros', 'checkin', 'placar']::text[]),
  add column topics text[] not null default '{}' check (private.valid_topics(topics)),
  add column origin text not null default '' check (char_length(origin) <= 240),
  add column visibility text not null default 'invite' check (visibility in ('public', 'class', 'invite')),
  add column join_approval boolean not null default false,
  add column join_asks_email boolean not null default false,
  add column official_at timestamptz,
  add column official_by uuid references auth.users(id) on delete set null,
  add constraint networking_groups_only check (kind = 'group' or (visibility = 'invite' and not join_approval and not join_asks_email)),
  add constraint class_visibility check (visibility <> 'class' or parent_id is not null);
create index spaces_official_by_idx on public.spaces(official_by);
create index spaces_discover_idx on public.spaces(visibility) where kind = 'group' and archived_at is null and visibility <> 'invite';
create index spaces_topics_idx on public.spaces using gin (topics);

-- Senha do grupo fora da tabela que os membros leem; só o hash.
create table private.space_join_secrets (
  space_id uuid primary key references public.spaces(id) on delete cascade,
  password_hash text not null
);
create table private.join_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  at timestamptz not null default now()
);
create index join_attempts_lookup_idx on private.join_attempts(user_id, space_id, at);
create index join_attempts_space_idx on private.join_attempts(space_id);
revoke all on private.space_join_secrets, private.join_attempts from public, anon, authenticated;

-- E-mail que a pessoa aceitou mostrar ao dono do grupo ao entrar.
alter table public.space_members add column email_shared boolean not null default false;

-- Pedidos para entrar: quem pediu e quem gerencia veem; quem pediu pode desistir.
create table public.space_join_requests (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  share_email boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index space_join_requests_user_idx on public.space_join_requests(user_id);
alter table public.space_join_requests enable row level security;
revoke all on public.space_join_requests from anon, authenticated;
grant select, delete on public.space_join_requests to authenticated;
create policy "Requester or managers see requests" on public.space_join_requests for select to authenticated
  using (user_id = (select auth.uid()) or private.can_manage_space(space_id));
create policy "Requester withdraws" on public.space_join_requests for delete to authenticated
  using (user_id = (select auth.uid()));

-- 3. Equipe: master, professor(a) no espaço ou acima, ou responsável por instituição ou sala.
-- Dono de grupo criado por aluno gerencia o grupo, mas não é equipe.
create function private.staff_of(target uuid, who uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.accounts a where a.user_id = who and a.is_master)
      or exists (select 1 from private.space_lineage(target) l
        join public.spaces s on s.id = l.id
        join public.space_members m on m.space_id = l.id and m.user_id = who
       where m.role = 'teacher' or (m.role = 'owner' and s.kind in ('institution', 'class')))
$$;

-- E-mail das pessoas: a equipe vê como antes; o dono de um grupo livre vê só o de quem aceitou mostrar.
create or replace function private.space_people(target uuid)
returns table(user_id uuid, display_name text, email text, role text, is_direct boolean, is_master boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  manager boolean := private.can_manage_space(target);
  staff boolean := private.staff_of(target, auth.uid());
begin
  if not private.can_view_space(target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  with people as (
    select m.user_id, m.role, (l.depth = 0) as is_direct, l.depth, m.email_shared
      from private.space_lineage(target) l join public.space_members m on m.space_id = l.id
     where l.depth = 0 or m.role in ('owner', 'teacher', 'assistant')
    union all
    select a.user_id, 'master'::text, false, 99, false from public.accounts a where a.is_master
  ), ranked as (
    select distinct on (p.user_id) p.user_id, p.role, p.is_direct, p.email_shared from people p order by p.user_id, p.depth
  )
  select r.user_id, a.display_name, case when manager and (staff or r.email_shared) then a.email else null end,
         r.role, r.is_direct, a.is_master
    from ranked r join public.accounts a on a.user_id = r.user_id;
end;
$$;

-- Adicionar por e-mail fica com a equipe: num grupo livre, entra-se por convite ou pela busca,
-- e ninguém descobre se um e-mail tem conta.
create or replace function private.add_member_by_email(target uuid, member_email text, member_role text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  member uuid;
begin
  if not private.grant_role_allowed(target, member_role) or not private.staff_of(target, auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select user_id into member from public.accounts where lower(email) = lower(btrim(member_email)) limit 1;
  if member is null then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  insert into public.space_members(space_id, user_id, role, added_by)
  values (target, member, member_role, auth.uid())
  on conflict (space_id, user_id) do update set role = excluded.role;
  perform private.ensure_class_membership(target, member, auth.uid());
  if member_role in ('owner', 'teacher') then
    perform private.audit('grant_space_role', member, target, jsonb_build_object('role', member_role));
  end if;
  return member;
end;
$$;

-- Entrar num grupo da sala só põe a pessoa na sala quando o convite veio da equipe.
create or replace function private.ensure_class_membership(target uuid, member uuid, by_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  space_row public.spaces;
begin
  select * into space_row from public.spaces where id = target;
  if space_row.kind = 'group' and space_row.parent_id is not null and private.staff_of(space_row.parent_id, by_user) then
    insert into public.space_members(space_id, user_id, role, added_by)
    values (space_row.parent_id, member, 'student', by_user)
    on conflict (space_id, user_id) do nothing;
  end if;
end;
$$;

-- 4. Criar e configurar grupo.
create function private.check_group_settings(parent uuid, group_visibility text, password text) returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if group_visibility = 'class' and parent is null then
    raise exception 'Class visibility needs a class' using errcode = '22023';
  end if;
  if password is not null and password <> '' and char_length(password) not between 4 and 72 then
    raise exception 'Invalid password' using errcode = '22023';
  end if;
end;
$$;

create function private.create_group(group_name text, parent uuid, group_description text, group_color text,
  group_template text, group_tools text[], group_topics text[], group_origin text, group_visibility text,
  approval boolean, asks_email boolean, password text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  created uuid;
begin
  if caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- Dentro de uma sala, só quem já é dela.
  if parent is not null and not (
    exists (select 1 from public.spaces s where s.id = parent and s.kind = 'class' and s.archived_at is null)
    and private.can_view_space(parent)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  perform private.check_group_settings(parent, group_visibility, password);
  -- Freio contra spam: até 10 grupos novos por dia.
  if (select count(*) from public.spaces where created_by = caller and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Too many groups today' using errcode = '22023';
  end if;
  insert into public.spaces(kind, name, parent_id, description, color, created_by, template, tools, topics,
    origin, visibility, join_approval, join_asks_email)
  values ('group', btrim(group_name), parent, coalesce(group_description, ''), coalesce(group_color, 'sage'), caller,
    group_template, coalesce(group_tools, '{}'), coalesce(group_topics, '{}'), btrim(coalesce(group_origin, '')),
    group_visibility, coalesce(approval, false), coalesce(asks_email, false))
  returning id into created;
  insert into public.space_members(space_id, user_id, role, added_by) values (created, caller, 'owner', caller);
  if coalesce(password, '') <> '' then
    insert into private.space_join_secrets values (created, extensions.crypt(password, extensions.gen_salt('bf', 8)));
  end if;
  return created;
end;
$$;

-- Senha: null mantém, vazio tira, outro valor troca.
create function private.update_group_settings(target uuid, group_template text, group_tools text[], group_topics text[],
  group_origin text, group_visibility text, approval boolean, asks_email boolean, password text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  parent uuid;
begin
  if not private.can_manage_space(target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select s.parent_id into parent from public.spaces s where s.id = target and s.kind = 'group';
  if not found then
    raise exception 'Not a group' using errcode = '22023';
  end if;
  perform private.check_group_settings(parent, group_visibility, password);
  update public.spaces set template = group_template, tools = coalesce(group_tools, '{}'), topics = coalesce(group_topics, '{}'),
    origin = btrim(coalesce(group_origin, '')), visibility = group_visibility,
    join_approval = coalesce(approval, false), join_asks_email = coalesce(asks_email, false)
   where id = target;
  if password = '' then
    delete from private.space_join_secrets where space_id = target;
  elsif password is not null then
    insert into private.space_join_secrets values (target, extensions.crypt(password, extensions.gen_salt('bf', 8)))
    on conflict (space_id) do update set password_hash = excluded.password_hash;
    delete from private.join_attempts where space_id = target;
  end if;
end;
$$;

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
