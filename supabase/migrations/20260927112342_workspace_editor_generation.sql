-- No user records are rewritten. Once the new editor saves, old clients
-- cannot strip notebooks, life areas or rich document metadata on a later save.
begin;
create function private.guard_workspace_editor_generation()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if old.data->>'editorGeneration' = '2'
     and (new.data->>'editorGeneration') is distinct from '2' then
    raise exception 'Editor outdated. Export changes and reload.' using errcode = '40001';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_workspace_editor_generation() from public, anon, authenticated;
create trigger workspace_editor_generation_guard
before update of data on public.personal_workspaces
for each row execute function private.guard_workspace_editor_generation();
commit;
