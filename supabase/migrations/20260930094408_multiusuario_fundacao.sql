-- Fundação multiusuário da Jornada Plena. Decisões: docs/VISAO_E_FUNDACAO_2026-09-30.md
-- Destino exclusivo: uccoaebzmvocqwqljmul. Nenhum workspace existente é reescrito; uma cópia
-- de segurança é criada antes de qualquer mudança de acesso. Privado por padrão: toda tabela
-- nova tem RLS e nenhuma leitura anônima.
begin;

-- 0. Cópia de segurança dos workspaces existentes, fora da API.
create table private.personal_workspaces_backup_20260930 as
  select owner_id, data, revision, updated_at, now() as copied_at from public.personal_workspaces;
revoke all on private.personal_workspaces_backup_20260930 from public, anon, authenticated;

-- 1. Contas: plano, créditos e funções liberadas. Só o master altera poderes.
create table public.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '' check (char_length(email) <= 254),
  display_name text not null default '' check (char_length(display_name) <= 120),
  is_master boolean not null default false,
  plan text not null default 'academic' check (plan in ('academic', 'pro')),
  plan_source text not null default 'free' check (plan_source in ('free', 'paid', 'courtesy')),
  pro_until timestamptz,
  ai_credits integer not null default 0 check (ai_credits between 0 and 1000000),
  features text[] not null default '{}' check (cardinality(features) <= 20),
  created_at timestamptz not null default now()
);
create index accounts_email_idx on public.accounts (lower(email));

create function private.account_name(meta jsonb, email text) returns text
language sql immutable set search_path = ''
as $$ select left(coalesce(nullif(btrim(meta->>'full_name'), ''), nullif(btrim(meta->>'name'), ''), split_part(coalesce(email, ''), '@', 1)), 120) $$;

-- Toda conta nova nasce no plano acadêmico, sem poderes nem acesso a salas.
create function private.sync_account() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.accounts(user_id, email, display_name)
  values (new.id, left(coalesce(new.email, ''), 254), private.account_name(new.raw_user_meta_data, new.email))
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;
create trigger jornada_sync_account after insert or update of email on auth.users
  for each row execute function private.sync_account();

insert into public.accounts(user_id, email, display_name)
select id, left(coalesce(email, ''), 254), private.account_name(raw_user_meta_data, email) from auth.users
on conflict (user_id) do nothing;
-- O proprietário vinculado vira o primeiro master.
update public.accounts set is_master = true, plan = 'pro', plan_source = 'courtesy'
 where user_id in (select user_id from public.app_owner);

create function private.is_master() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select a.is_master from public.accounts a where a.user_id = (select auth.uid())), false) $$;

-- 2. Configuração da plataforma. Durante o piloto, tudo liberado para todos.
create table public.platform_settings (
  singleton boolean primary key default true check (singleton),
  open_access boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings default values;

-- 3. Histórico administrativo: quem, o quê, quando.
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_space_id uuid,
  action text not null check (char_length(action) <= 60),
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);

create function private.audit(action text, target_user uuid, target_space uuid, details jsonb) returns void
language sql security definer set search_path = ''
as $$ insert into public.admin_audit_log(actor_id, target_user_id, target_space_id, action, details)
      values ((select auth.uid()), target_user, target_space, action, coalesce(details, '{}')) $$;

create function private.admin_update_account(
  target uuid, next_plan text, next_source text, next_pro_until timestamptz,
  next_credits integer, next_features text[], next_master boolean
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  previous public.accounts;
begin
  if not private.is_master() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into previous from public.accounts where user_id = target for update;
  if not found then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if target = auth.uid() and next_master is distinct from true then
    raise exception 'Master cannot demote itself' using errcode = '42501';
  end if;
  update public.accounts
     set plan = next_plan, plan_source = next_source, pro_until = next_pro_until,
         ai_credits = next_credits, features = coalesce(next_features, '{}'), is_master = coalesce(next_master, false)
   where user_id = target;
  perform private.audit('update_account', target, null, jsonb_build_object(
    'before', jsonb_build_object('plan', previous.plan, 'plan_source', previous.plan_source, 'pro_until', previous.pro_until,
      'ai_credits', previous.ai_credits, 'features', previous.features, 'is_master', previous.is_master),
    'after', jsonb_build_object('plan', next_plan, 'plan_source', next_source, 'pro_until', next_pro_until,
      'ai_credits', next_credits, 'features', next_features, 'is_master', next_master)));
end;
$$;

create function private.admin_set_open_access(value boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_master() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.platform_settings set open_access = value, updated_at = now();
  perform private.audit('set_open_access', null, null, jsonb_build_object('open_access', value));
end;
$$;

-- 4. Espaços: instituição > sala > grupo. O papel pertence ao espaço, não à pessoa.
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('institution', 'class', 'group')),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  color text not null default 'sage' check (color in ('sage', 'lavender', 'sand', 'blue', 'rose')),
  parent_id uuid references public.spaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint space_hierarchy check ((kind = 'institution') = (parent_id is null))
);
create index spaces_parent_idx on public.spaces(parent_id);

create function private.check_space_parent() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  parent_kind text;
begin
  if tg_op = 'UPDATE' and (new.kind <> old.kind or new.parent_id is distinct from old.parent_id) then
    raise exception 'Space hierarchy is immutable' using errcode = '22023';
  end if;
  if new.parent_id is not null then
    select kind into parent_kind from public.spaces where id = new.parent_id;
    if (new.kind = 'class' and parent_kind is distinct from 'institution')
       or (new.kind = 'group' and parent_kind is distinct from 'class') then
      raise exception 'Invalid parent space' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger spaces_parent_guard before insert or update on public.spaces
  for each row execute function private.check_space_parent();

create table public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'teacher', 'assistant', 'leader', 'student')),
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index space_members_user_idx on public.space_members(user_id);

-- Linhagem do espaço: ele mesmo (profundidade 0) e seus ancestrais.
create function private.space_lineage(target uuid) returns table(id uuid, depth integer)
language sql stable security definer set search_path = ''
as $$
  with recursive lineage(id, parent_id, depth) as (
    select s.id, s.parent_id, 0 from public.spaces s where s.id = target
    union all
    select s.id, s.parent_id, l.depth + 1 from public.spaces s join lineage l on s.id = l.parent_id where l.depth < 4
  )
  select lineage.id, lineage.depth from lineage
$$;

-- Vê: membro direto, ou quem ensina/auxilia num ancestral. Outros professores não enxergam.
create function private.member_view(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.space_lineage(target) l
      join public.space_members m on m.space_id = l.id and m.user_id = (select auth.uid())
     where l.depth = 0 or m.role in ('owner', 'teacher', 'assistant'))
$$;
create function private.can_view_space(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_master() or private.member_view(target) $$;

-- Conduz (cria trabalhos, pede revisão, publica no mural): professor, auxiliar ou líder.
create function private.member_lead(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from private.space_lineage(target) l
      join public.space_members m on m.space_id = l.id and m.user_id = (select auth.uid())
     where m.role in ('owner', 'teacher', 'assistant') or (l.depth = 0 and m.role = 'leader'))
$$;
create function private.can_lead_space(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_master() or private.member_lead(target) $$;

-- Gerencia (pessoas, grupos, configurações): dono ou professor do espaço ou de um ancestral.
create function private.can_manage_space(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_master() or exists (
    select 1 from private.space_lineage(target) l
      join public.space_members m on m.space_id = l.id and m.user_id = (select auth.uid())
     where m.role in ('owner', 'teacher'))
$$;

create function private.create_space(space_kind text, space_name text, parent uuid, space_description text, space_color text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  created uuid;
begin
  if caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if space_kind = 'institution' then
    if not private.is_master() then
      raise exception 'Not authorized' using errcode = '42501';
    end if;
  elsif space_kind = 'class' then
    if not (private.can_manage_space(parent) or (
      exists (select 1 from public.accounts where user_id = caller and 'create_classes' = any(features))
      and exists (select 1 from public.space_members where space_id = parent and user_id = caller))) then
      raise exception 'Not authorized' using errcode = '42501';
    end if;
  elsif space_kind = 'group' then
    if not private.can_manage_space(parent) then
      raise exception 'Not authorized' using errcode = '42501';
    end if;
  else
    raise exception 'Invalid kind' using errcode = '22023';
  end if;
  insert into public.spaces(kind, name, parent_id, description, color, created_by)
  values (space_kind, btrim(space_name), parent, coalesce(space_description, ''), coalesce(space_color, 'sage'), caller)
  returning id into created;
  -- Quem cria (sem ser master) passa a conduzir o espaço.
  if not private.is_master() and space_kind <> 'group' then
    insert into public.space_members(space_id, user_id, role, added_by) values (created, caller, 'owner', caller);
  end if;
  if space_kind = 'institution' then
    perform private.audit('create_institution', null, created, jsonb_build_object('name', space_name));
  end if;
  return created;
end;
$$;

-- Papéis de professor e dono só o master concede; quem gerencia concede auxiliar, líder e aluno.
create function private.grant_role_allowed(target uuid, member_role text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when member_role in ('owner', 'teacher') then private.is_master()
    when member_role in ('assistant', 'leader', 'student') then private.can_manage_space(target)
    else false end
$$;

create function private.ensure_class_membership(target uuid, member uuid, by_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  space_row public.spaces;
begin
  select * into space_row from public.spaces where id = target;
  if space_row.kind = 'group' then
    insert into public.space_members(space_id, user_id, role, added_by)
    values (space_row.parent_id, member, 'student', by_user)
    on conflict (space_id, user_id) do nothing;
  end if;
end;
$$;

create function private.add_member_by_email(target uuid, member_email text, member_role text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  member uuid;
begin
  if not private.grant_role_allowed(target, member_role) then
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

create function private.set_member_role(target uuid, member uuid, member_role text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  current_role_name text;
begin
  select role into current_role_name from public.space_members where space_id = target and user_id = member;
  if current_role_name is null then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  -- Retirar alguém de professor/dono também exige master.
  if not private.grant_role_allowed(target, member_role)
     or (current_role_name in ('owner', 'teacher') and not private.is_master())
     or (member = auth.uid() and not private.is_master()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  update public.space_members set role = member_role where space_id = target and user_id = member;
  if member_role in ('owner', 'teacher') or current_role_name in ('owner', 'teacher') then
    perform private.audit('change_space_role', member, target, jsonb_build_object('from', current_role_name, 'to', member_role));
  end if;
end;
$$;

-- Pessoas visíveis num espaço: membros diretos, quem conduz nos ancestrais e masters.
-- E-mail só para quem gerencia.
create function private.space_people(target uuid)
returns table(user_id uuid, display_name text, email text, role text, is_direct boolean, is_master boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  manager boolean := private.can_manage_space(target);
begin
  if not private.can_view_space(target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  with people as (
    select m.user_id, m.role, (l.depth = 0) as is_direct, l.depth
      from private.space_lineage(target) l join public.space_members m on m.space_id = l.id
     where l.depth = 0 or m.role in ('owner', 'teacher', 'assistant')
    union all
    select a.user_id, 'master'::text, false, 99 from public.accounts a where a.is_master
  ), ranked as (
    select distinct on (p.user_id) p.user_id, p.role, p.is_direct from people p order by p.user_id, p.depth
  )
  select r.user_id, a.display_name, case when manager then a.email else null end, r.role, r.is_direct, a.is_master
    from ranked r join public.accounts a on a.user_id = r.user_id;
end;
$$;

-- Caminho para contexto (instituição > sala > grupo), apenas para quem vê o espaço.
create function private.space_path(target uuid) returns table(id uuid, kind text, name text, depth integer)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.can_view_space(target) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query select s.id, s.kind, s.name, l.depth from private.space_lineage(target) l join public.spaces s on s.id = l.id;
end;
$$;

-- 5. Convites por link. Guarda-se apenas o hash do token.
create table public.space_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  role text not null default 'student' check (role in ('student', 'leader')),
  max_uses integer not null default 60 check (max_uses between 1 and 500),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index space_invitations_space_idx on public.space_invitations(space_id);

create function private.accept_invitation(token text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  invite public.space_invitations;
  joined boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if token is null or char_length(token) not between 20 and 200 then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;
  select * into invite from public.space_invitations
   where token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
     and revoked_at is null and expires_at > now() and uses < max_uses
   for update;
  if not found then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;
  insert into public.space_members(space_id, user_id, role, added_by)
  values (invite.space_id, auth.uid(), invite.role, invite.created_by)
  on conflict (space_id, user_id) do nothing;
  joined := found;
  perform private.ensure_class_membership(invite.space_id, auth.uid(), invite.created_by);
  if joined then
    update public.space_invitations set uses = uses + 1 where id = invite.id;
  end if;
  return invite.space_id;
end;
$$;

-- Alterações internas já autorizadas (exclusão de conta). Só funções privilegiadas escrevem
-- aqui, e o registro vale apenas para a transação corrente.
create table private.trusted_transactions (txid xid8 primary key);
revoke all on private.trusted_transactions from public, anon, authenticated;
create function private.trusted_change() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.trusted_transactions where txid = pg_current_xact_id()) $$;

-- 6. Trabalhos em grupo: instruções, partes, revisão e documento final padronizado.
create function private.valid_doc_style(style jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(style) = 'object'
     and (select count(*) from jsonb_object_keys(style) k where k not in ('font', 'size', 'spacing', 'align')) = 0
     and coalesce(style->>'font', 'Arial') in ('Arial', 'Times New Roman', 'Calibri', 'Georgia')
     and coalesce(style->>'size', '12') in ('11', '12', '14')
     and coalesce(style->>'spacing', '1.5') in ('1', '1.15', '1.5', '2')
     and coalesce(style->>'align', 'justify') in ('left', 'justify')
$$;

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  batch_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  subject_name text not null default '' check (char_length(subject_name) <= 160),
  instructions text not null default '' check (char_length(instructions) <= 20000),
  format_rules text not null default '' check (char_length(format_rules) <= 5000),
  doc_style jsonb not null default '{}' check (private.valid_doc_style(doc_style)),
  due_date date,
  status text not null default 'open' check (status in ('open', 'delivered', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_space_idx on public.assignments(space_id);

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;
create trigger assignments_touch before update on public.assignments
  for each row execute function private.touch_updated_at();

create function private.assignment_space(target uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select space_id from public.assignments where id = target $$;

create table public.assignment_parts (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  position integer not null default 0 check (position between 0 and 1000),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  assignee_id uuid references auth.users(id) on delete set null,
  assignee_label text not null default '' check (char_length(assignee_label) <= 120),
  content jsonb not null default '{"type": "doc", "content": []}'
    check (jsonb_typeof(content) = 'object' and content->>'type' = 'doc' and octet_length(content::text) <= 300000),
  status text not null default 'pending' check (status in ('pending', 'submitted', 'needs_revision', 'approved')),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index assignment_parts_assignment_idx on public.assignment_parts(assignment_id, position);

-- Quem não conduz só edita o conteúdo da própria parte e só entrega ou volta para rascunho.
-- Entrega em nome de outra pessoa fica registrada: submitted_by difere de assignee_id.
create function private.guard_assignment_part() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  space uuid := private.assignment_space(new.assignment_id);
  leads boolean := private.can_lead_space(space);
begin
  if private.trusted_change() then
    new.updated_at := now();
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.assignment_id <> old.assignment_id then
      raise exception 'Part cannot move' using errcode = '22023';
    end if;
    if not leads and (new.position <> old.position or new.title <> old.title
       or new.assignee_id is distinct from old.assignee_id or new.assignee_label <> old.assignee_label
       or new.status not in ('pending', 'submitted')) then
      raise exception 'Not authorized' using errcode = '42501';
    end if;
    if new.status = 'submitted' and old.status is distinct from 'submitted' then
      new.submitted_by := auth.uid();
      new.submitted_at := now();
    elsif new.status = 'pending' then
      new.submitted_by := null;
      new.submitted_at := null;
    else
      new.submitted_by := old.submitted_by;
      new.submitted_at := old.submitted_at;
    end if;
  else
    new.submitted_by := null;
    new.submitted_at := null;
    new.status := 'pending';
  end if;
  if new.assignee_id is not null and not exists (
    select 1 from public.space_members where space_id = space and user_id = new.assignee_id) then
    raise exception 'Assignee must be a member of the group' using errcode = '22023';
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
create trigger assignment_parts_guard before insert or update on public.assignment_parts
  for each row execute function private.guard_assignment_part();

create table public.part_comments (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.assignment_parts(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  kind text not null default 'comment' check (kind in ('comment', 'revision_request')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index part_comments_part_idx on public.part_comments(part_id, created_at);

create function private.part_space(target uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select a.space_id from public.assignment_parts p join public.assignments a on a.id = p.assignment_id where p.id = target $$;

-- Pedido de revisão devolve a parte para ajustes.
create function private.apply_revision_request() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.kind = 'revision_request' then
    update public.assignment_parts set status = 'needs_revision', updated_at = now()
     where id = new.part_id and status <> 'needs_revision';
  end if;
  return new;
end;
$$;

-- 7. Mural da sala ou do grupo: avisos, materiais (links, vídeos) e datas.
create table public.space_posts (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('announcement', 'material', 'event')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null default '' check (char_length(body) <= 10000),
  link_url text check (link_url is null or (char_length(link_url) <= 2000 and link_url ~ '^https?://[^\s]+$')),
  event_date date,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index space_posts_space_idx on public.space_posts(space_id, created_at desc);

-- 8. Enquetes com voto secreto: cada pessoa vê o próprio voto e os totais.
create function private.valid_poll_options(options text[]) returns boolean
language sql immutable set search_path = ''
as $$ select cardinality(options) between 2 and 10
          and not exists (select 1 from unnest(options) o where char_length(btrim(o)) not between 1 and 120) $$;

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  question text not null check (char_length(btrim(question)) between 1 and 300),
  options text[] not null check (private.valid_poll_options(options)),
  closes_at timestamptz,
  created_at timestamptz not null default now()
);
create index polls_space_idx on public.polls(space_id, created_at desc);

create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index integer not null check (option_index between 0 and 9),
  voted_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create function private.vote(target uuid, choice integer) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  poll public.polls;
begin
  select * into poll from public.polls where id = target;
  if not found or not private.can_view_space(poll.space_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if (poll.closes_at is not null and poll.closes_at <= now()) or choice < 0 or choice >= cardinality(poll.options) then
    raise exception 'Invalid vote' using errcode = '22023';
  end if;
  insert into public.poll_votes(poll_id, user_id, option_index) values (target, auth.uid(), choice)
  on conflict (poll_id, user_id) do update set option_index = excluded.option_index, voted_at = now();
end;
$$;

create function private.poll_results(target_space uuid)
returns table(poll_id uuid, option_index integer, votes bigint)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.can_view_space(target_space) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select v.poll_id, v.option_index, count(*) from public.poll_votes v join public.polls p on p.id = v.poll_id
     where p.space_id = target_space group by v.poll_id, v.option_index;
end;
$$;

-- 9. Agenda de contatos privada: visível só ao dono, nunca cruzada com contas.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  email text not null default '' check (char_length(email) <= 254),
  phone text not null default '' check (char_length(phone) <= 40),
  birthdate date,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index contacts_owner_idx on public.contacts(owner_id);

-- 10. Aceite de termos com versão.
create table public.consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  version text not null check (char_length(version) <= 40),
  accepted_at timestamptz not null default now(),
  primary key (user_id, document, version)
);

-- 11. Exclusão da própria conta (LGPD). O que foi entregue a um grupo permanece como
-- "Ex-membro"; o espaço pessoal, contatos e anexos saem junto com a conta.
create function private.delete_my_account() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if exists (select 1 from public.app_owner where user_id = caller) then
    raise exception 'Owner account cannot be deleted here' using errcode = '42501';
  end if;
  insert into private.trusted_transactions values (pg_current_xact_id()) on conflict do nothing;
  update public.assignment_parts set assignee_label = 'Ex-membro' where assignee_id = caller;
  delete from auth.users where id = caller;
  delete from private.trusted_transactions where txid = pg_current_xact_id();
end;
$$;

-- 12. Espaço pessoal e anexos: cada conta com o próprio workspace, isolado.
drop policy "Owner reads own workspace" on public.personal_workspaces;
create policy "Users read own workspace" on public.personal_workspaces for select to authenticated
  using (owner_id = (select auth.uid()));

create or replace function private.save_personal_workspace(next_data jsonb, expected_revision integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  next_revision integer;
begin
  if caller is null or not exists (select 1 from public.accounts where user_id = caller) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if expected_revision is null or expected_revision < 0 or next_data is null
     or jsonb_typeof(next_data) <> 'object'
     or (next_data->>'version') is distinct from '1'
     or jsonb_typeof(next_data->'subjects') is distinct from 'array'
     or jsonb_typeof(next_data->'notes') is distinct from 'array'
     or jsonb_typeof(next_data->'tasks') is distinct from 'array'
     or jsonb_typeof(next_data->'sessions') is distinct from 'array'
     or octet_length(next_data::text) > 2000000 then
    raise exception 'Invalid payload' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    begin
      insert into public.personal_workspaces(owner_id, data, revision) values (caller, next_data, 1);
      return 1;
    exception when unique_violation then
      raise exception 'Workspace conflict' using errcode = '40001';
    end;
  end if;
  update public.personal_workspaces
     set data = next_data, revision = revision + 1, updated_at = now()
   where owner_id = caller and revision = expected_revision
   returning revision into next_revision;
  if next_revision is null then
    raise exception 'Workspace conflict' using errcode = '40001';
  end if;
  return next_revision;
end;
$$;

drop policy "Master reads own note attachments" on storage.objects;
drop policy "Master uploads own note attachments" on storage.objects;
create policy "Users read own note attachments" on storage.objects
for select to authenticated using (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.accounts where user_id = (select auth.uid()))
);
create policy "Users upload own note attachments" on storage.objects
for insert to authenticated with check (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.accounts where user_id = (select auth.uid()))
);
-- Exclusão somente ao apagar a própria conta; a interface não remove anexos soltos.
create policy "Users delete own note attachments" on storage.objects
for delete to authenticated using (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- 13. RLS: privado por padrão.
alter table public.accounts enable row level security;
alter table public.platform_settings enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_invitations enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_parts enable row level security;
alter table public.part_comments enable row level security;
alter table public.space_posts enable row level security;
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
alter table public.contacts enable row level security;
alter table public.consents enable row level security;
revoke all on public.accounts, public.platform_settings, public.admin_audit_log, public.spaces,
  public.space_members, public.space_invitations, public.assignments, public.assignment_parts,
  public.part_comments, public.space_posts, public.polls, public.poll_votes, public.contacts,
  public.consents from anon, authenticated;

grant select on public.accounts to authenticated;
grant update (display_name) on public.accounts to authenticated;
create policy "Own account or master" on public.accounts for select to authenticated
  using (user_id = (select auth.uid()) or private.is_master());
create policy "Rename own account" on public.accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select on public.platform_settings to authenticated;
create policy "Everyone reads platform settings" on public.platform_settings for select to authenticated using (true);

grant select on public.admin_audit_log to authenticated;
create policy "Masters read audit" on public.admin_audit_log for select to authenticated
  using (private.is_master());

grant select, update (name, description, color, archived_at) on public.spaces to authenticated;
create policy "View permitted spaces" on public.spaces for select to authenticated
  using (private.can_view_space(id));
create policy "Managers edit spaces" on public.spaces for update to authenticated
  using (private.can_manage_space(id)) with check (private.can_manage_space(id));

grant select, delete on public.space_members to authenticated;
create policy "View members of visible spaces" on public.space_members for select to authenticated
  using (private.can_view_space(space_id));
create policy "Managers remove members, anyone leaves" on public.space_members for delete to authenticated
  using ((user_id = (select auth.uid()) and role not in ('owner'))
    or (private.can_manage_space(space_id) and (role not in ('owner', 'teacher') or private.is_master())));

grant select, insert, update (revoked_at) on public.space_invitations to authenticated;
create policy "Leaders see invitations" on public.space_invitations for select to authenticated
  using (private.can_lead_space(space_id));
create policy "Leaders create invitations" on public.space_invitations for insert to authenticated
  with check (private.can_lead_space(space_id) and created_by = (select auth.uid()) and uses = 0 and revoked_at is null
    and (role = 'student' or private.can_manage_space(space_id)));
create policy "Leaders revoke invitations" on public.space_invitations for update to authenticated
  using (private.can_lead_space(space_id)) with check (private.can_lead_space(space_id));

grant select, insert, update (title, subject_name, instructions, format_rules, doc_style, due_date, status), delete
  on public.assignments to authenticated;
create policy "View assignments of visible spaces" on public.assignments for select to authenticated
  using (private.can_view_space(space_id));
create policy "Leaders create assignments" on public.assignments for insert to authenticated
  with check (private.can_lead_space(space_id) and created_by = (select auth.uid()));
create policy "Leaders edit assignments" on public.assignments for update to authenticated
  using (private.can_lead_space(space_id)) with check (private.can_lead_space(space_id));
create policy "Leaders delete assignments" on public.assignments for delete to authenticated
  using (private.can_lead_space(space_id));

grant select, insert, update (position, title, assignee_id, assignee_label, content, status), delete
  on public.assignment_parts to authenticated;
create policy "View parts of visible assignments" on public.assignment_parts for select to authenticated
  using (private.can_view_space(private.assignment_space(assignment_id)));
create policy "Leaders create parts" on public.assignment_parts for insert to authenticated
  with check (private.can_lead_space(private.assignment_space(assignment_id)));
create policy "Assignee or leaders edit parts" on public.assignment_parts for update to authenticated
  using (assignee_id = (select auth.uid()) or private.can_lead_space(private.assignment_space(assignment_id)))
  with check (assignee_id = (select auth.uid()) or private.can_lead_space(private.assignment_space(assignment_id)));
create policy "Leaders delete parts" on public.assignment_parts for delete to authenticated
  using (private.can_lead_space(private.assignment_space(assignment_id)));

grant select, insert, update (resolved_at), delete on public.part_comments to authenticated;
create policy "View comments of visible parts" on public.part_comments for select to authenticated
  using (private.can_view_space(private.part_space(part_id)));
create policy "Comment as self" on public.part_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_view_space(private.part_space(part_id))
    and (kind = 'comment' or private.can_lead_space(private.part_space(part_id))));
create policy "Author or leaders resolve" on public.part_comments for update to authenticated
  using (author_id = (select auth.uid()) or private.can_lead_space(private.part_space(part_id)))
  with check (author_id = (select auth.uid()) or private.can_lead_space(private.part_space(part_id)));
create policy "Author deletes own comment" on public.part_comments for delete to authenticated
  using (author_id = (select auth.uid()));
create trigger part_comments_revision after insert on public.part_comments
  for each row execute function private.apply_revision_request();

grant select, insert, delete on public.space_posts to authenticated;
create policy "View posts of visible spaces" on public.space_posts for select to authenticated
  using (private.can_view_space(space_id));
create policy "Leaders publish posts" on public.space_posts for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_lead_space(space_id));
create policy "Author or managers remove posts" on public.space_posts for delete to authenticated
  using (author_id = (select auth.uid()) or private.can_manage_space(space_id));

grant select, insert, delete on public.polls to authenticated;
create policy "View polls of visible spaces" on public.polls for select to authenticated
  using (private.can_view_space(space_id));
create policy "Leaders create polls" on public.polls for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_lead_space(space_id));
create policy "Author or managers remove polls" on public.polls for delete to authenticated
  using (author_id = (select auth.uid()) or private.can_manage_space(space_id));

grant select on public.poll_votes to authenticated;
create policy "See own votes" on public.poll_votes for select to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update (name, email, phone, birthdate, notes), delete on public.contacts to authenticated;
create policy "Contacts are private" on public.contacts for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

grant select, insert on public.consents to authenticated;
create policy "Read own consents" on public.consents for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Accept as self" on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()));

-- 14. Funções: implementações privadas; a API chama apenas os invólucros públicos.
revoke all on all functions in schema private from public, anon;
grant execute on function private.is_master(), private.space_lineage(uuid), private.member_view(uuid), private.member_lead(uuid), private.can_view_space(uuid),
  private.can_lead_space(uuid), private.can_manage_space(uuid), private.assignment_space(uuid),
  private.part_space(uuid), private.valid_doc_style(jsonb), private.valid_poll_options(text[]),
  private.save_personal_workspace(jsonb, integer) to authenticated;

create function public.create_space(space_kind text, space_name text, parent uuid, space_description text, space_color text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.create_space(space_kind, space_name, parent, space_description, space_color) $$;
create function public.add_member_by_email(target uuid, member_email text, member_role text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.add_member_by_email(target, member_email, member_role) $$;
create function public.set_member_role(target uuid, member uuid, member_role text)
returns void language sql security invoker set search_path = ''
as $$ select private.set_member_role(target, member, member_role) $$;
create function public.space_people(target uuid)
returns table(user_id uuid, display_name text, email text, role text, is_direct boolean, is_master boolean)
language sql security invoker set search_path = ''
as $$ select * from private.space_people(target) $$;
create function public.space_path(target uuid)
returns table(id uuid, kind text, name text, depth integer)
language sql security invoker set search_path = ''
as $$ select * from private.space_path(target) $$;
create function public.space_access(target uuid)
returns table(can_view boolean, can_lead boolean, can_manage boolean)
language sql security invoker set search_path = ''
as $$ select private.can_view_space(target), private.can_lead_space(target), private.can_manage_space(target) $$;
create function public.accept_invitation(token text)
returns uuid language sql security invoker set search_path = ''
as $$ select private.accept_invitation(token) $$;
create function public.vote(target uuid, choice integer)
returns void language sql security invoker set search_path = ''
as $$ select private.vote(target, choice) $$;
create function public.poll_results(target_space uuid)
returns table(poll_id uuid, option_index integer, votes bigint)
language sql security invoker set search_path = ''
as $$ select * from private.poll_results(target_space) $$;
create function public.admin_update_account(target uuid, next_plan text, next_source text, next_pro_until timestamptz,
  next_credits integer, next_features text[], next_master boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_update_account(target, next_plan, next_source, next_pro_until, next_credits, next_features, next_master) $$;
create function public.admin_set_open_access(value boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.admin_set_open_access(value) $$;
create function public.delete_my_account()
returns void language sql security invoker set search_path = ''
as $$ select private.delete_my_account() $$;

grant execute on function private.create_space(text, text, uuid, text, text), private.add_member_by_email(uuid, text, text),
  private.set_member_role(uuid, uuid, text), private.space_people(uuid), private.space_path(uuid), private.accept_invitation(text),
  private.vote(uuid, integer), private.poll_results(uuid),
  private.admin_update_account(uuid, text, text, timestamptz, integer, text[], boolean),
  private.admin_set_open_access(boolean), private.delete_my_account() to authenticated;

revoke all on function public.create_space(text, text, uuid, text, text), public.add_member_by_email(uuid, text, text),
  public.set_member_role(uuid, uuid, text), public.space_people(uuid), public.space_path(uuid), public.space_access(uuid),
  public.accept_invitation(text), public.vote(uuid, integer), public.poll_results(uuid),
  public.admin_update_account(uuid, text, text, timestamptz, integer, text[], boolean),
  public.admin_set_open_access(boolean), public.delete_my_account() from public, anon;
grant execute on function public.create_space(text, text, uuid, text, text), public.add_member_by_email(uuid, text, text),
  public.set_member_role(uuid, uuid, text), public.space_people(uuid), public.space_path(uuid), public.space_access(uuid),
  public.accept_invitation(text), public.vote(uuid, integer), public.poll_results(uuid),
  public.admin_update_account(uuid, text, text, timestamptz, integer, text[], boolean),
  public.admin_set_open_access(boolean), public.delete_my_account() to authenticated;

commit;
