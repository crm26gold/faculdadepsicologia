-- PREPARADA LOCALMENTE. Não aplicada ao projeto remoto.
-- Destino exclusivo: uccoaebzmvocqwqljmul. Inspecionar antes de aplicar.
-- Não executar em banco com tabelas homônimas sem revisão.
begin;

create table public.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict
);
alter table public.app_owner enable row level security;
revoke all on public.app_owner from anon, authenticated;
grant select on public.app_owner to authenticated;
create policy "Only owner can verify ownership" on public.app_owner
  for select to authenticated using (user_id = (select auth.uid()));

create table public.personal_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint workspace_payload_limit check (octet_length(data::text) <= 2000000),
  constraint workspace_payload_object check (jsonb_typeof(data) = 'object' and data->>'version' = '1')
);
alter table public.personal_workspaces enable row level security;
revoke all on public.personal_workspaces from anon, authenticated;
grant select on public.personal_workspaces to authenticated;
create policy "Owner reads own workspace" on public.personal_workspaces
  for select to authenticated using (
    owner_id = (select auth.uid()) and exists (select 1 from public.app_owner where user_id = (select auth.uid()))
  );

-- Writes only through this narrowly scoped RPC. No client can provision a master.
-- Definer privileges are bounded by explicit auth.uid + allowlist checks.
create function public.save_personal_workspace(next_data jsonb, expected_revision integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  next_revision integer;
begin
  if caller is null or not exists (select 1 from public.app_owner where user_id = caller) then
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
revoke all on function public.save_personal_workspace(jsonb, integer) from public, anon;
grant execute on function public.save_personal_workspace(jsonb, integer) to authenticated;
commit;

-- Provisionamento MANUAL posterior, após verificar a identidade do proprietário:
-- insert into public.app_owner(singleton, user_id) values (true, 'UUID-DO-PROPRIETARIO');
-- O UUID deve coincidir com APP_OWNER_USER_ID no servidor.
-- Manter criação pública de usuários desabilitada no Supabase Auth e provisionar
-- a conta autorizada antes de habilitar o login Google do aplicativo.
