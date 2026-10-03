-- Conflito de revisão deixa de usar 40001 (serialization_failure). O PostgREST trata 40001 como falha
-- transitória e repete a transação sozinho; como o conflito é permanente, isso virava um laço infinito
-- (milhões de tentativas, CPU do banco no máximo). PT409 é devolvido pelo PostgREST como HTTP 409, sem repetir.

create or replace function private.guard_workspace_editor_generation()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if coalesce((old.data->>'editorGeneration')::integer, 0) >= 2
     and coalesce((new.data->>'editorGeneration')::integer, 0) < coalesce((old.data->>'editorGeneration')::integer, 0) then
    raise exception 'Editor outdated. Export changes and reload.' using errcode = 'PT409';
  end if;
  return new;
end;
$$;

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
      raise exception 'Workspace conflict' using errcode = 'PT409';
    end;
  end if;
  update public.personal_workspaces
     set data = next_data, revision = revision + 1, updated_at = now()
   where owner_id = caller and revision = expected_revision
   returning revision into next_revision;
  if next_revision is null then
    raise exception 'Workspace conflict' using errcode = 'PT409';
  end if;
  return next_revision;
end;
$$;

create or replace function private.bot_save(server_secret text, channel_id text, chat text, next_data jsonb, expected_revision integer) returns integer
language plpgsql security definer set search_path = ''
as $$
declare person uuid; next_revision integer;
begin
  perform private.bot_check(server_secret);
  select l.user_id into person from public.messenger_links l where l.channel = channel_id and l.chat_id = chat;
  if person is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 or next_data is null or jsonb_typeof(next_data) <> 'object'
     or (next_data->>'version') is distinct from '1'
     or jsonb_typeof(next_data->'subjects') is distinct from 'array' or jsonb_typeof(next_data->'notes') is distinct from 'array'
     or jsonb_typeof(next_data->'tasks') is distinct from 'array' or jsonb_typeof(next_data->'sessions') is distinct from 'array'
     or octet_length(next_data::text) > 2000000 then
    raise exception 'Invalid payload' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    begin
      insert into public.personal_workspaces(owner_id, data, revision) values (person, next_data, 1);
      return 1;
    exception when unique_violation then
      raise exception 'Workspace conflict' using errcode = 'PT409';
    end;
  end if;
  update public.personal_workspaces set data = next_data, revision = revision + 1, updated_at = now()
   where owner_id = person and revision = expected_revision
  returning revision into next_revision;
  if next_revision is null then raise exception 'Workspace conflict' using errcode = 'PT409'; end if;
  return next_revision;
end;
$$;
