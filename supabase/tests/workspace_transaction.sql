-- Run on the intended project only. Every synthetic record is rolled back.
begin;
do $$ begin
  if exists (select 1 from public.app_owner) then
    raise exception 'Test requires unprovisioned owner; refusing to alter real ownership';
  end if;
end $$;
select set_config('request.jwt.claims', jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
insert into auth.users(id) values(auth.uid());
insert into public.app_owner(singleton,user_id) values(true,auth.uid());
set local role authenticated;
do $$
declare
  payload jsonb := '{"version":1,"subjects":[],"tasks":[],"notes":[],"sessions":[]}';
begin
  if public.save_personal_workspace(payload,0) <> 1 then raise exception 'Insert failed'; end if;
  if public.save_personal_workspace(payload,1) <> 2 then raise exception 'Update failed'; end if;
  if (select revision from public.personal_workspaces) <> 2 then raise exception 'Read failed'; end if;
  begin
    perform public.save_personal_workspace(payload,1);
    raise exception 'Stale revision accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_personal_workspace('{}',2);
    raise exception 'Invalid payload accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
do $$ begin
  if exists(select 1 from public.personal_workspaces) then raise exception 'Non-owner read allowed'; end if;
  begin
    perform public.save_personal_workspace('{"version":1,"subjects":[],"tasks":[],"notes":[],"sessions":[]}',0);
    raise exception 'Non-owner write allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'PASS: insert, update, read, revision conflict, payload validation, non-owner isolation; all test data rolled back' as result;
