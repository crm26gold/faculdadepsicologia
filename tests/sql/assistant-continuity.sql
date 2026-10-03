-- Assertions run in a rolled-back transaction; no user data is changed permanently.
begin;
do $$ begin
  perform set_config('request.jwt.claim.sub', (select owner_id::text from public.personal_workspaces limit 1), true);
  perform set_config('jornada.verify_job',gen_random_uuid()::text,true);
  perform set_config('jornada.verify_conversation',gen_random_uuid()::text,true);
  perform set_config('jornada.verify_run',gen_random_uuid()::text,true);
end $$;
set local role authenticated;
do $$ declare
  owner uuid := auth.uid(); j uuid := current_setting('jornada.verify_job')::uuid;
  c uuid := current_setting('jornada.verify_conversation')::uuid; r uuid := current_setting('jornada.verify_run')::uuid;
  w jsonb; rev integer; answer jsonb := '{"saved":true,"reply":"verified","applied":[],"pending":[],"failed":[]}'::jsonb;
begin
  if owner is null then raise exception 'Missing verification owner'; end if;
  select data,revision into w,rev from public.personal_workspaces where owner_id=owner;
  insert into public.assistant_conversations(user_id,id,title) values(owner,c,'Verification transaction');
  insert into public.assistant_jobs(user_id,id,conversation_id,request_key,input) values(owner,j,c,'verify-'||j,'{"message":"verification","today":"2026-10-03","history":[]}');
  if public.claim_assistant_job(j,r) is null then raise exception 'Claim failed'; end if;
  if public.claim_assistant_job(j,gen_random_uuid()) is not null then raise exception 'Duplicate claim'; end if;
  begin perform public.finish_assistant_job(j,gen_random_uuid(),w,rev,answer); raise exception 'Wrong lease accepted'; exception when sqlstate 'PT409' then null; end;
  begin perform public.finish_assistant_job(j,r,w,rev+1000,answer); raise exception 'Conflict accepted'; exception when sqlstate 'PT409' or serialization_failure then null; end;
  if (select revision from public.personal_workspaces where owner_id=owner)<>rev or (select status from public.assistant_jobs where id=j)<>'working' then raise exception 'Conflict wrote data'; end if;
  perform public.finish_assistant_job(j,r,w,rev,answer);
  perform public.finish_assistant_job(j,r,w,rev,answer);
  if (select revision from public.personal_workspaces where owner_id=owner)<>rev+1 then raise exception 'Replay duplicated update'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if exists(select 1 from public.assistant_jobs where id=j) or exists(select 1 from public.assistant_conversations where id=c) then raise exception 'Other account read'; end if;
  if public.claim_assistant_job(j,r) is not null then raise exception 'Other account claimed'; end if;
  begin insert into public.assistant_conversations(user_id,id,title) values(owner,gen_random_uuid(),'Cross account'); raise exception 'Other account write'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',owner::text,true);
  perform public.delete_assistant_conversation(c,1);
  if exists(select 1 from public.assistant_jobs where id=j) or exists(select 1 from public.assistant_conversations where id=c) then raise exception 'History cleanup failed'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform count(*) from public.assistant_jobs; raise exception 'Anon read'; exception when insufficient_privilege then null; end;
  begin perform public.bot_attachment_owner(repeat('a',64),'123','4'); raise exception 'Anon attachment authorization'; exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
do $$ begin
  begin perform public.bot_attachment_owner(repeat('a',64),'123','4'); raise exception 'Invalid secret accepted'; exception when insufficient_privilege then null; end;
end $$;
rollback;
