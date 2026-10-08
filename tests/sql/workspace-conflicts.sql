-- Live-safe verification: only synthetic accounts/workspaces, all rolled back.
-- Run as the database administrator after conflict_without_retry is applied.
-- Since the per-module tables, the old-editor guard lives in private.workspace_store.
begin;

do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='private'
        and p.proname in ('save_personal_workspace','bot_save','workspace_store')
        and p.prosrc like '%PT409%' and p.prosrc not like '%40001%') <> 3 then
    raise exception 'Conflict migration missing or regressed: business conflicts must use PT409';
  end if;
  perform set_config('jornada.conflict.owner',gen_random_uuid()::text,true);
  perform set_config('jornada.conflict.other',gen_random_uuid()::text,true);
end $$;

insert into auth.users(id,email) values
  (current_setting('jornada.conflict.owner')::uuid,'conflict-'||current_setting('jornada.conflict.owner')||'@example.invalid'),
  (current_setting('jornada.conflict.other')::uuid,'conflict-'||current_setting('jornada.conflict.other')||'@example.invalid');
select set_config('request.jwt.claim.sub',current_setting('jornada.conflict.owner'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('jornada.conflict.owner'),'role','authenticated')::text,true);
set local role authenticated;

do $$
declare
  payload jsonb := '{"version":1,"editorGeneration":4,"subjects":[],"notes":[],"tasks":[],"sessions":[]}';
  original jsonb;
  revision integer;
begin
  if public.save_personal_workspace(payload,0) <> 1 then raise exception 'Initial save failed'; end if;
  begin
    perform public.save_personal_workspace(payload,0);
    raise exception 'Duplicate initial save accepted';
  exception when sqlstate 'PT409' then null; end;
  if public.save_personal_workspace(payload,1) <> 2 then raise exception 'Current revision save failed'; end if;
  select data into original from public.personal_workspaces where owner_id=auth.uid();
  begin
    perform public.save_personal_workspace(payload||'{"notes":[{"title":"stale overwrite"}]}',1);
    raise exception 'Stale revision overwrote data';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.save_personal_workspace(payload||'{"editorGeneration":3}',2);
    raise exception 'Old editor overwrote data';
  exception when sqlstate 'PT409' then null; end;
  begin
    perform public.save_personal_workspace('{}',2);
    raise exception 'Invalid payload accepted';
  exception when invalid_parameter_value then null; end;
  select data,personal_workspaces.revision into payload,revision from public.personal_workspaces where owner_id=auth.uid();
  if revision <> 2 or payload is distinct from original then raise exception 'Rejected save changed the workspace'; end if;

  perform set_config('request.jwt.claim.sub',current_setting('jornada.conflict.other'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('jornada.conflict.other'),'role','authenticated')::text,true);
  if exists(select 1 from public.personal_workspaces where owner_id=current_setting('jornada.conflict.owner')::uuid) then
    raise exception 'Another account read the workspace';
  end if;
  begin
    perform public.save_personal_workspace(original,2);
    raise exception 'Another account changed the original workspace';
  exception when sqlstate 'PT409' then null; end;

  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.save_personal_workspace(original,0);
    raise exception 'Missing account accepted';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
  begin
    perform public.save_personal_workspace('{"version":1,"subjects":[],"notes":[],"tasks":[],"sessions":[]}',0);
    raise exception 'Anonymous workspace write accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.bot_save('invalid-test-secret-with-more-than-32-characters','telegram','synthetic-conflict-check',
      '{"version":1,"subjects":[],"notes":[],"tasks":[],"sessions":[]}',0);
    raise exception 'Invalid bot secret accepted';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
select 'PASS: non-retryable conflict, current save, stale/duplicate revision, old editor, unchanged data, account isolation and authorization; synthetic records rolled back' as result;
