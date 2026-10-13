-- Parte 1 de 3.
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

revoke all on function private.staff_of(uuid, uuid), private.check_group_settings(uuid, text, text),
  private.create_group(text, uuid, text, text, text, text[], text[], text, text, boolean, boolean, text),
  private.update_group_settings(uuid, text, text[], text[], text, text, boolean, boolean, text),
  public.save_my_profile(text, text, text, text) from public, anon;
grant execute on function private.staff_of(uuid, uuid), private.check_group_settings(uuid, text, text),
  private.create_group(text, uuid, text, text, text, text[], text[], text, text, boolean, boolean, text),
  private.update_group_settings(uuid, text, text[], text[], text, text, boolean, boolean, text),
  public.save_my_profile(text, text, text, text) to authenticated;
