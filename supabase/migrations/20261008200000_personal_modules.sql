-- A vida pessoal sai do documento único: cada módulo tem a própria tabela, com uma linha por registro, a posição
-- dele na lista e uma versão que só sobe quando o conteúdo muda. Os campos únicos (versão do formato, semestre,
-- perfil, saldo inicial, foco ativo) ficam em personal_state, com a revisão da conta.
-- public.personal_workspaces vira uma vista que remonta o mesmo documento: o app, o MCP, os bots, a voz e o
-- WhatsApp continuam iguais. Toda gravação na vista passa por private.workspace_store, que valida como antes,
-- grava só as linhas que mudaram e manda para a lixeira o que saiu, na mesma transação.
-- O documento antigo fica preservado em private.personal_workspaces_legacy até a limpeza antes do lançamento.

-- 1. Estado da conta e uma tabela por módulo, todas só de leitura para a própria pessoa.
create table public.personal_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 1 check (revision > 0),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  -- Listas opcionais que existem no documento mesmo vazias: sem a lista de áreas, por exemplo, valem as padrão.
  present text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.personal_state enable row level security;
revoke all on public.personal_state from anon, authenticated;
grant select on public.personal_state to authenticated;
create policy "Users read own state" on public.personal_state for select to authenticated using (owner_id = (select auth.uid()));

-- The modules, in one place: personal_subjects, personal_courses, personal_goals, personal_projects,
-- personal_transactions, personal_habits, personal_tasks, personal_notes, personal_sessions, personal_classes,
-- personal_areas, personal_notebooks and personal_flashcards.
create function private.workspace_collections() returns text[] language sql immutable set search_path = '' as $$
  select array['subjects','courses','goals','projects','transactions','habits','tasks','notes','sessions','classes','areas','notebooks','flashcards'] $$;
-- Always in the document, even when empty; the other lists appear only when present.
create function private.workspace_required() returns text[] language sql immutable set search_path = '' as $$
  select array['subjects','tasks','notes','sessions','classes'] $$;

do $$
declare kind text;
begin
  foreach kind in array private.workspace_collections() loop
    execute format($table$
      create table public.%1$I (
        owner_id uuid not null references auth.users(id) on delete cascade,
        id text not null check (char_length(id) between 1 and 100),
        data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id),
        position integer not null,
        version integer not null default 1 check (version > 0),
        updated_at timestamptz not null default now(),
        primary key (owner_id, id)
      )$table$, 'personal_' || kind);
    execute format('alter table public.%I enable row level security', 'personal_' || kind);
    execute format('revoke all on public.%I from anon, authenticated', 'personal_' || kind);
    execute format('grant select on public.%I to authenticated', 'personal_' || kind);
    execute format('create policy "Users read own records" on public.%I for select to authenticated using (owner_id = (select auth.uid()))', 'personal_' || kind);
  end loop;
end $$;

-- 2. O documento remontado das tabelas: igual ao que foi gravado, na mesma ordem.
-- Security invoker: a pessoa só lê as próprias linhas (RLS); funções do servidor leem como o servidor.
create function private.workspace_document(person uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare state public.personal_state; doc jsonb; kind text; items jsonb;
begin
  select * into state from public.personal_state s where s.owner_id = person;
  if not found then return null; end if;
  doc := state.settings;
  foreach kind in array private.workspace_collections() loop
    execute format('select jsonb_agg(t.data order by t.position) from public.%I t where t.owner_id = $1', 'personal_' || kind) into items using person;
    if items is not null or kind = any(state.present) or kind = any(private.workspace_required()) then
      doc := doc || jsonb_build_object(kind, coalesce(items, '[]'::jsonb));
    end if;
  end loop;
  return doc;
end $$;

-- 3. A gravação: as mesmas validações e o mesmo controle de revisão de antes, linha a linha.
-- seed_revision carrega um documento como está (migração), sem conflito nem lixeira.
create function private.workspace_store(person uuid, next_data jsonb, expected_revision integer, seed_revision integer default null) returns integer
language plpgsql security invoker set search_path = '' as $$
declare state public.personal_state; kind text; incoming jsonb; ids text[]; next_revision integer; table_name text;
begin
  if person is null or expected_revision is null or expected_revision < 0 or next_data is null or jsonb_typeof(next_data) <> 'object'
     or (next_data->>'version') is distinct from '1'
     or jsonb_typeof(next_data->'subjects') is distinct from 'array' or jsonb_typeof(next_data->'notes') is distinct from 'array'
     or jsonb_typeof(next_data->'tasks') is distinct from 'array' or jsonb_typeof(next_data->'sessions') is distinct from 'array'
     or octet_length(next_data::text) > 2000000 then
    raise exception 'Invalid payload' using errcode = '22023';
  end if;
  select * into state from public.personal_state s where s.owner_id = person for update;
  if seed_revision is not null then
    if not found then insert into public.personal_state(owner_id, revision) values (person, seed_revision) returning * into state; end if;
    next_revision := seed_revision;
  elsif expected_revision = 0 then
    if found then raise exception 'Workspace conflict' using errcode = 'PT409'; end if;
    begin
      insert into public.personal_state(owner_id) values (person) returning * into state;
    exception when unique_violation then raise exception 'Workspace conflict' using errcode = 'PT409';
    end;
    next_revision := 1;
  else
    if not found or state.revision <> expected_revision then raise exception 'Workspace conflict' using errcode = 'PT409'; end if;
    next_revision := state.revision + 1;
  end if;
  -- An editor from before a format change cannot overwrite what a newer editor saved.
  if coalesce((state.settings->>'editorGeneration')::integer, 0) >= 2
     and coalesce((next_data->>'editorGeneration')::integer, 0) < coalesce((state.settings->>'editorGeneration')::integer, 0) then
    raise exception 'Editor outdated. Export changes and reload.' using errcode = 'PT409';
  end if;
  foreach kind in array private.workspace_collections() loop
    table_name := 'personal_' || kind;
    if next_data ? kind and jsonb_typeof(next_data->kind) <> 'array' then raise exception 'Invalid payload' using errcode = '22023'; end if;
    incoming := coalesce(next_data->kind, '[]'::jsonb);
    -- Each record is an object with its own id, and an id appears once per list.
    if exists (select 1 from jsonb_array_elements(incoming) e where jsonb_typeof(e.value) <> 'object' or char_length(coalesce(e.value->>'id', '')) not between 1 and 100)
       or (select count(*) from jsonb_array_elements(incoming)) <> (select count(distinct e.value->>'id') from jsonb_array_elements(incoming) e) then
      raise exception 'Invalid payload' using errcode = '22023';
    end if;
    ids := array(select e.value->>'id' from jsonb_array_elements(incoming) e);
    if seed_revision is not null then
      execute format('delete from public.%I t where t.owner_id = $1 and t.id not in (select unnest($2::text[]))', table_name) using person, ids;
    else
      -- What left the space goes to the trash (focus sessions excepted); what came back leaves it.
      execute format($sql$with gone as (delete from public.%1$I t where t.owner_id = $1 and t.id not in (select unnest($2::text[])) returning t.id, t.data)
        insert into public.personal_trash(owner_id, collection, item_id, item, size)
        select $1, $3, g.id, g.data, octet_length(g.data::text) from gone g where $3 <> 'sessions'$sql$, table_name) using person, ids, kind;
      execute format($sql$delete from public.personal_trash x where x.owner_id = $1 and x.collection = $3 and x.item_id = any($2)
        and not exists (select 1 from public.%1$I t where t.owner_id = $1 and t.id = x.item_id)$sql$, table_name) using person, ids, kind;
    end if;
    -- Only records whose content or place in the list changed are written; the version follows the content.
    execute format($sql$insert into public.%1$I as t(owner_id, id, data, position)
      select $1, e.value->>'id', e.value, e.ordinality::integer from jsonb_array_elements($2) with ordinality e
      on conflict (owner_id, id) do update set data = excluded.data, position = excluded.position,
        version = case when t.data is distinct from excluded.data then t.version + 1 else t.version end,
        updated_at = case when t.data is distinct from excluded.data then now() else t.updated_at end
      where t.data is distinct from excluded.data or t.position is distinct from excluded.position$sql$, table_name) using person, incoming;
  end loop;
  if seed_revision is null then
    delete from public.personal_trash t where t.owner_id = person and t.expires_at <= now();
    -- Space: the newest 2 MB stay; older items beyond that leave first.
    delete from public.personal_trash t where t.id in (select s.id from (select x.id, sum(x.size) over (order by x.deleted_at desc, x.id) running
      from public.personal_trash x where x.owner_id = person) s where s.running > 2000000);
  end if;
  update public.personal_state set settings = next_data - private.workspace_collections(),
    present = array(select k from unnest(private.workspace_collections()) k where next_data ? k),
    revision = next_revision, updated_at = now()
  where owner_id = person;
  return next_revision;
end $$;

-- 4. O documento antigo vai para o esquema privado, preservado; os gatilhos dele saem com ele.
drop trigger workspace_editor_generation_guard on public.personal_workspaces;
drop trigger personal_workspaces_trash on public.personal_workspaces;
drop function private.guard_workspace_editor_generation();
drop function private.capture_trash();
alter table public.personal_workspaces rename to personal_workspaces_legacy;
alter table public.personal_workspaces_legacy set schema private;
revoke all on private.personal_workspaces_legacy from anon, authenticated;

do $$
declare w record;
begin
  for w in select owner_id, data, revision from private.personal_workspaces_legacy loop
    perform private.workspace_store(w.owner_id, w.data, 0, w.revision);
  end loop;
end $$;

-- 5. A vista com o nome antigo: lê o documento remontado e grava pelo workspace_store.
create view public.personal_workspaces with (security_invoker = true) as
  select s.owner_id, private.workspace_document(s.owner_id) as data, s.revision, s.updated_at from public.personal_state s;
revoke all on public.personal_workspaces from anon, authenticated;
grant select on public.personal_workspaces to authenticated, service_role;

create function private.personal_workspaces_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare kind text;
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.personal_state s where s.owner_id = new.owner_id) then
      raise exception 'Workspace already exists' using errcode = '23505';
    end if;
    perform private.workspace_store(new.owner_id, new.data, 0, coalesce(new.revision, 1));
    new.revision := coalesce(new.revision, 1);
    return new;
  elsif tg_op = 'UPDATE' then
    new.revision := private.workspace_store(new.owner_id, new.data, old.revision);
    return new;
  end if;
  foreach kind in array private.workspace_collections() loop
    execute format('delete from public.%I t where t.owner_id = $1', 'personal_' || kind) using old.owner_id;
  end loop;
  delete from public.personal_state s where s.owner_id = old.owner_id;
  return old;
end $$;
create trigger personal_workspaces_write instead of insert or update or delete on public.personal_workspaces
  for each row execute function private.personal_workspaces_write();

revoke all on function private.workspace_collections(), private.workspace_required(), private.workspace_document(uuid) from public, anon;
grant execute on function private.workspace_collections(), private.workspace_required(), private.workspace_document(uuid) to authenticated, service_role;
revoke all on function private.workspace_store(uuid, jsonb, integer, integer), private.personal_workspaces_write() from public, anon, authenticated;
