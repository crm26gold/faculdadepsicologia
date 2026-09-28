-- Allow workspace editor generation 3. Prevent downgrade below the current saved generation.
begin;
create or replace function private.guard_workspace_editor_generation()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if coalesce((old.data->>'editorGeneration')::integer, 0) >= 2
     and coalesce((new.data->>'editorGeneration')::integer, 0) < coalesce((old.data->>'editorGeneration')::integer, 0) then
    raise exception 'Editor outdated. Export changes and reload.' using errcode = '40001';
  end if;
  return new;
end;
$$;
commit;
