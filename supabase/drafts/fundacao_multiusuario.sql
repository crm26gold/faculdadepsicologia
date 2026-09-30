-- RASCUNHO — NÃO APLICADO. Fundação multiusuário da Jornada Plena.
-- Decisões: docs/VISAO_E_FUNDACAO_2026-09-30.md
-- Destino previsto: uccoaebzmvocqwqljmul, somente após revisão do proprietário.
-- Não altera personal_workspaces nem app_owner; o workspace atual continua intacto.
begin;

-- Conta: plano, créditos e funções liberadas. Só o master altera.
create table public.accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  is_master boolean not null default false,
  plan text not null default 'academic' check (plan in ('academic', 'pro')),
  plan_source text not null default 'free' check (plan_source in ('free', 'paid', 'courtesy')),
  pro_until timestamptz,
  ai_credits integer not null default 0 check (ai_credits >= 0),
  features text[] not null default '{}',
  created_at timestamptz not null default now()
);

create function private.is_master() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select is_master from public.accounts where user_id = auth.uid()), false) $$;

-- Toda conta nova nasce no plano acadêmico, sem poderes.
create function private.create_account() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.accounts(user_id, display_name)
  values (new.id, coalesce(left(new.raw_user_meta_data->>'full_name', 120), ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.create_account();

-- Contas já existentes; o proprietário atual vira o primeiro master.
insert into public.accounts(user_id) select id from auth.users on conflict do nothing;
update public.accounts set is_master = true, plan = 'pro', plan_source = 'courtesy'
 where user_id = (select user_id from public.app_owner);

-- Histórico de ações administrativas (somente leitura para masters).
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Único caminho para alterar poderes de uma conta. Registra no histórico.
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
  if target = auth.uid() and next_master is false then
    raise exception 'Master cannot demote itself' using errcode = '42501';
  end if;
  update public.accounts
     set plan = next_plan, plan_source = next_source, pro_until = next_pro_until,
         ai_credits = next_credits, features = next_features, is_master = next_master
   where user_id = target;
  insert into public.admin_audit_log(actor_id, target_user_id, action, details)
  values (auth.uid(), target, 'update_account', jsonb_build_object(
    'before', to_jsonb(previous) - 'user_id',
    'after', jsonb_build_object('plan', next_plan, 'plan_source', next_source, 'pro_until', next_pro_until,
      'ai_credits', next_credits, 'features', next_features, 'is_master', next_master)));
end;
$$;

-- Espaços: instituição > sala > grupo. Papel é por espaço, não por pessoa.
create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('institution', 'class', 'group')),
  name text not null check (char_length(name) between 1 and 160),
  parent_id uuid references public.spaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((kind = 'institution') = (parent_id is null))
);
create index spaces_parent_idx on public.spaces(parent_id);

create table public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'teacher', 'assistant', 'leader', 'student')),
  permissions text[] not null default '{}',
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index space_members_user_idx on public.space_members(user_id);

-- Vê um espaço quem é membro dele, ou quem ensina/gerencia um espaço ancestral.
-- Professores de outras salas não enxergam esta, salvo se adicionados como auxiliares.
create function private.can_view_space(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  with recursive lineage(id, parent_id, depth) as (
    select id, parent_id, 0 from public.spaces where id = target
    union all
    select s.id, s.parent_id, l.depth + 1 from public.spaces s join lineage l on s.id = l.parent_id where l.depth < 8
  )
  select private.is_master() or exists (
    select 1 from lineage l join public.space_members m on m.space_id = l.id
     where m.user_id = auth.uid()
       and (l.id = target or m.role in ('owner', 'teacher', 'assistant'))
  )
$$;

create function private.can_manage_space(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  with recursive lineage(id, parent_id, depth) as (
    select id, parent_id, 0 from public.spaces where id = target
    union all
    select s.id, s.parent_id, l.depth + 1 from public.spaces s join lineage l on s.id = l.parent_id where l.depth < 8
  )
  select private.is_master() or exists (
    select 1 from lineage l join public.space_members m on m.space_id = l.id
     where m.user_id = auth.uid() and m.role in ('owner', 'teacher')
  )
$$;

-- Convites por link. Guarda-se apenas o hash do token.
create table public.space_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  token_hash text not null unique,
  role text not null default 'student' check (role in ('student', 'leader')),
  max_uses integer not null default 60 check (max_uses between 1 and 500),
  uses integer not null default 0,
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  revoked_at timestamptz
);

create function private.accept_invitation(token text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  invite public.space_invitations;
begin
  if auth.uid() is null then
    raise exception 'Not authorized' using errcode = '42501';
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
  if found then
    update public.space_invitations set uses = uses + 1 where id = invite.id;
  end if;
  return invite.space_id;
end;
$$;

-- Agenda de contatos privada: visível somente ao dono, nunca cruzada.
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  email text check (email is null or char_length(email) <= 254),
  birthdate date,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);
create index contacts_owner_idx on public.contacts(owner_id);

-- Conexão entre contas: só existe com aceite de quem recebeu o pedido.
create table public.connections (
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- Aceite de termos com versão.
create table public.consents (
  user_id uuid not null references auth.users(id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, document, version)
);

-- RLS: privado por padrão.
alter table public.accounts enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.spaces enable row level security;
alter table public.space_members enable row level security;
alter table public.space_invitations enable row level security;
alter table public.contacts enable row level security;
alter table public.connections enable row level security;
alter table public.consents enable row level security;
revoke all on public.accounts, public.admin_audit_log, public.spaces, public.space_members,
  public.space_invitations, public.contacts, public.connections, public.consents from anon, authenticated;

grant select on public.accounts to authenticated;
create policy "Own account or master" on public.accounts for select to authenticated
  using (user_id = (select auth.uid()) or private.is_master());

grant select on public.admin_audit_log to authenticated;
create policy "Masters read audit" on public.admin_audit_log for select to authenticated
  using (private.is_master());

grant select, insert, update on public.spaces to authenticated;
create policy "View permitted spaces" on public.spaces for select to authenticated
  using (private.can_view_space(id));
create policy "Master creates institutions, managers create children" on public.spaces for insert to authenticated
  with check (created_by = (select auth.uid()) and
    (private.is_master() or (parent_id is not null and private.can_manage_space(parent_id))));
create policy "Managers edit spaces" on public.spaces for update to authenticated
  using (private.can_manage_space(id)) with check (private.can_manage_space(id));

grant select, insert, update, delete on public.space_members to authenticated;
create policy "View members of visible spaces" on public.space_members for select to authenticated
  using (private.can_view_space(space_id));
create policy "Managers add members" on public.space_members for insert to authenticated
  with check (private.can_manage_space(space_id) and (role <> 'owner' or private.is_master()));
create policy "Managers change members" on public.space_members for update to authenticated
  using (private.can_manage_space(space_id)) with check (private.can_manage_space(space_id) and (role <> 'owner' or private.is_master()));
create policy "Managers remove members, anyone leaves" on public.space_members for delete to authenticated
  using (user_id = (select auth.uid()) or private.can_manage_space(space_id));

grant select, insert, update on public.space_invitations to authenticated;
create policy "Managers handle invitations" on public.space_invitations for all to authenticated
  using (private.can_manage_space(space_id))
  with check (private.can_manage_space(space_id) and created_by = (select auth.uid()));

grant select, insert, update, delete on public.contacts to authenticated;
create policy "Contacts are private" on public.contacts for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.connections to authenticated;
create policy "Parties see connection" on public.connections for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy "Request as self" on public.connections for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
create policy "Addressee accepts" on public.connections for update to authenticated
  using (addressee_id = (select auth.uid())) with check (addressee_id = (select auth.uid()) and status = 'accepted');
create policy "Either party removes" on public.connections for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

grant select, insert on public.consents to authenticated;
create policy "Own consents" on public.consents for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Funções privilegiadas só pelas rotas autenticadas do servidor.
revoke all on function private.is_master(), private.can_view_space(uuid), private.can_manage_space(uuid),
  private.create_account(), private.accept_invitation(text),
  private.admin_update_account(uuid, text, text, timestamptz, integer, text[], boolean) from public, anon;
grant execute on function private.is_master(), private.can_view_space(uuid), private.can_manage_space(uuid),
  private.accept_invitation(text),
  private.admin_update_account(uuid, text, text, timestamptz, integer, text[], boolean) to authenticated;

commit;
