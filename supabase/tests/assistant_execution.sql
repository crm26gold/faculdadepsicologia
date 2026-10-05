-- Banco LOCAL descartável, dados sintéticos. Nunca executar no projeto remoto.
\set ON_ERROR_STOP 1
\set QUIET 1
\ir lib/supabase_stub.sql
-- Inclui isolamento, lease, replay, exportação e rollback do comprovante legado.
\ir ../../tests/sql/assistant-continuity.sql

begin;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000a',true);
set local role authenticated;
do $$ declare
  j uuid := gen_random_uuid(); c uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  proposal jsonb := '{"message":"Excluir compromisso","today":"2026-10-05","history":[],"actions":[{"type":"excluir","entity":"compromisso","target":"synthetic-target"}]}';
  answer jsonb := '{"saved":true,"reply":"Confirme a exclusão","execution":"structured","applied":[],"pending":[{"action":{"type":"excluir","entity":"compromisso","target":"synthetic-target"},"fingerprint":"synthetic-fingerprint","label":"Compromisso"}],"failed":[]}';
  revision_before integer; claimed jsonb;
begin
  select revision into revision_before from public.personal_workspaces where owner_id=auth.uid();
  insert into public.assistant_conversations(user_id,id,title) values(auth.uid(),c,'Execução sintética');
  insert into public.assistant_jobs(user_id,id,conversation_id,request_key,input) values(auth.uid(),j,c,'structured-'||j,proposal);
  claimed := public.claim_assistant_job(j,r);
  if claimed->'input' <> proposal then raise exception 'Structured proposal changed during claim'; end if;
  perform public.finish_assistant_job(j,r,null,revision_before,answer);
  if not exists(select 1 from public.assistant_jobs where id=j and status='needs_confirmation'
    and result->>'execution'='structured' and result->'pending'->0->>'fingerprint'='synthetic-fingerprint')
    then raise exception 'Durable confirmation missing'; end if;
  if (select revision from public.personal_workspaces where owner_id=auth.uid())<>revision_before then raise exception 'Pending action wrote workspace'; end if;
  if public.claim_assistant_job(j,gen_random_uuid()) is not null then raise exception 'Pending action reclaimed'; end if;
  if public.finish_assistant_job(j,r,null,revision_before,answer)<>answer then raise exception 'Replay changed pending receipt'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000b',true);
  if exists(select 1 from public.assistant_jobs where id=j) then raise exception 'Other account read structured proposal'; end if;
  begin
    perform public.finish_assistant_job(j,r,null,revision_before,answer);
    raise exception 'Other account finished proposal';
  exception when sqlstate 'P0002' then null; end;
end $$;
rollback;
