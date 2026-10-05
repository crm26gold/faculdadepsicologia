-- Synthetic account data only; the fixture and all changes roll back.
begin;
select set_config('test.mcp.person',gen_random_uuid()::text,true);
select set_config('test.mcp.other',gen_random_uuid()::text,true);
select set_config('test.mcp.request',gen_random_uuid()::text,true);
insert into auth.users(id,email) values
 (current_setting('test.mcp.person')::uuid,'pending-mcp@example.invalid'),
 (current_setting('test.mcp.other')::uuid,'other-pending-mcp@example.invalid');
insert into public.personal_workspaces(owner_id,data) values(current_setting('test.mcp.person')::uuid,
 '{"version":"1","subjects":[],"notes":[],"tasks":[{"id":"pending-target","title":"Dentista"}],"sessions":[]}');
select set_config('request.jwt.claim.sub',current_setting('test.mcp.person'),true);
set local role authenticated;
select public.mcp_token_create('Cliente de teste',repeat('d',64),'dddd',true,90);
reset role;
set local role anon;
select set_config('test.mcp.receipt',public.mcp_commit('segredo-do-servidor-com-mais-de-32-caracteres',repeat('d',64),
 current_setting('test.mcp.request')::uuid,repeat('e',64),null,1,
 '{"saved":true,"reply":"Confirme a exclusão do dentista no aplicativo.","applied":[],"pending":[{"action":{"type":"excluir","entity":"compromisso","target":"pending-target"},"fingerprint":"original-record-fingerprint","label":"Excluir Dentista"}],"failed":[]}'
)::text,true);
select expect(public.mcp_request_result('segredo-do-servidor-com-mais-de-32-caracteres',repeat('d',64),
 current_setting('test.mcp.request')::uuid,repeat('e',64))=current_setting('test.mcp.receipt')::jsonb,'MCP returns the same receipt on reconnect');
select expect(public.mcp_commit('segredo-do-servidor-com-mais-de-32-caracteres',repeat('d',64),
 current_setting('test.mcp.request')::uuid,repeat('e',64),null,1,
 '{"saved":true,"reply":"Same request replay","applied":[],"pending":[],"failed":[]}')=current_setting('test.mcp.receipt')::jsonb,'replay does not enqueue another confirmation');
do $$ begin
 perform public.mcp_request_result('segredo-do-servidor-com-mais-de-32-caracteres',repeat('d',64),current_setting('test.mcp.request')::uuid,repeat('f',64));
 raise exception 'FALHA: reused request ID accepted a different payload';
exception when sqlstate 'PT409' then null; end $$;
do $$ begin
 perform public.mcp_commit('segredo-do-servidor-com-mais-de-32-caracteres',repeat('d',64),gen_random_uuid(),repeat('f',64),null,999,
 '{"saved":true,"reply":"Stale","applied":[],"pending":[],"failed":[]}');
 raise exception 'FALHA: stale request queued';
exception when sqlstate 'PT409' then null; end $$;
do $$ begin perform count(*) from private.mcp_receipts; raise exception 'FALHA: anonymous caller read receipts';
exception when insufficient_privilege then null; end $$;
reset role;
select expect((select revision=1 and data::text like '%Dentista%' from public.personal_workspaces where owner_id=current_setting('test.mcp.person')::uuid),'pending deletion does not modify workspace');
set local role authenticated;
select expect((select count(*)=1 from public.assistant_jobs where status='needs_confirmation'),'exactly one durable confirmation belongs to this account');
select expect((select result->'pending'->0->>'fingerprint'='original-record-fingerprint' from public.assistant_jobs where status='needs_confirmation'),'executor fingerprint survives reconnect');
select expect((select count(*)=1 from public.assistant_conversations where title='Confirmação de assistente externo'),'confirmation is discoverable in app conversations');
select set_config('request.jwt.claim.sub',current_setting('test.mcp.other'),true);
select expect(not exists(select 1 from public.assistant_jobs),'other account cannot read the proposal');
select expect(not exists(select 1 from public.assistant_conversations),'other account cannot read its conversation');
reset role;
rollback;
\echo 'OK: MCP confirmations persist, replay safely and remain private.'
