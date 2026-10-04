-- Local disposable database only. No real credentials or WhatsApp messages.
\set ON_ERROR_STOP 1
\set QUIET 1
\ir lib/supabase_stub.sql
grant execute on function public.expect(boolean,text),public.act_as(text) to anon,authenticated;
set role authenticated;
select act_as('00000000-0000-4000-8000-00000000000b');
do $$ begin perform whatsapp_admin(); raise exception 'FALHA: non-owner admin'; exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-00000000000a');
select whatsapp_admin('rotate',jsonb_build_object('token_hash',encode(extensions.digest(repeat('t',64),'sha256'),'hex'),'server_hash',encode(extensions.digest(repeat('s',64),'sha256'),'hex')));
set role anon;
do $$ begin perform whatsapp_server(repeat('x',64),repeat('t',64),'verify'); raise exception 'FALHA: transport reached database without server proof'; exception when insufficient_privilege then null; end $$;
select whatsapp_server(repeat('s',64),repeat('t',64),'heartbeat','{"state":"ready","relay":"5511888888888"}');
set role authenticated;
select whatsapp_admin('code',jsonb_build_object('code_hash',encode(extensions.digest('ABCDEFGH','sha256'),'hex')));
set role anon;
select expect((whatsapp_server(repeat('s',64),repeat('t',64),'link',jsonb_build_object('peer','5511999999999','code_hash',encode(extensions.digest('ABCDEFGH','sha256'),'hex')))->>'linked')::boolean,'one-time phone link');
select expect(not (whatsapp_server(repeat('s',64),repeat('t',64),'link',jsonb_build_object('peer','5511777777777','code_hash',encode(extensions.digest('ABCDEFGH','sha256'),'hex')))->>'linked')::boolean,'code cannot be reused');
do $$ begin perform whatsapp_server(repeat('s',64),repeat('t',64),'check','{"peer":"5511777777777"}'); raise exception 'FALHA: unlinked phone'; exception when insufficient_privilege then null; end $$;
select set_config('test.wa_input',jsonb_build_object('peer','5511999999999','message_id','fake-1','input_ciphertext','encrypted fixture','input_hash',repeat('a',64))::text,false);
select set_config('test.wa_id',whatsapp_server(repeat('s',64),repeat('t',64),'enqueue',current_setting('test.wa_input')::jsonb)->>'id',false);
select expect(whatsapp_server(repeat('s',64),repeat('t',64),'enqueue',current_setting('test.wa_input')::jsonb)->>'id'=current_setting('test.wa_id'),'duplicate ingress has the same receipt');
do $$ begin perform whatsapp_server(repeat('s',64),repeat('t',64),'enqueue',current_setting('test.wa_input')::jsonb||jsonb_build_object('input_hash',repeat('b',64))); raise exception 'FALHA: same ID with changed input'; exception when sqlstate 'PT409' then null; end $$;
select set_config('test.wa_job',jsonb_build_object('peer','5511999999999','id',current_setting('test.wa_id'),'lease','00000000-0000-4000-8000-000000000001')::text,false);
select expect(whatsapp_server(repeat('s',64),repeat('t',64),'claim',current_setting('test.wa_job')::jsonb) is not null,'first worker claims');
select expect(whatsapp_server(repeat('s',64),repeat('t',64),'claim',current_setting('test.wa_job')::jsonb) is null,'second worker cannot claim active lease');
select set_config('test.wa_finish',(current_setting('test.wa_job')::jsonb||'{"revision":1,"next_data":{"version":"1","editorGeneration":9,"subjects":[],"notes":[],"tasks":[],"sessions":[]},"transcript":"pedido fictício","result":{"reply":"Feito.","applied":[]},"pending_mode":"keep"}'::jsonb)::text,false);
do $$ begin perform whatsapp_server(repeat('s',64),repeat('t',64),'finish',current_setting('test.wa_finish')::jsonb||'{"revision":99999}'::jsonb); raise exception 'FALHA: stale revision'; exception when sqlstate 'PT409' then null; end $$;
select expect(whatsapp_server(repeat('s',64),repeat('t',64),'result',current_setting('test.wa_job')::jsonb)->>'status'='working','conflict writes no completion receipt');
select whatsapp_server(repeat('s',64),repeat('t',64),'finish',current_setting('test.wa_finish')::jsonb);
select whatsapp_server(repeat('s',64),repeat('t',64),'finish',current_setting('test.wa_finish')::jsonb);
reset role;
select expect((select revision=2 from personal_workspaces where owner_id='00000000-0000-4000-8000-00000000000a'),'completed replay does not write workspace twice');
select expect((select input_ciphertext is null from private.whatsapp_jobs where id=current_setting('test.wa_id')::uuid),'settled media removed');
select expect((select count(*)=2 from messenger_messages where channel='whatsapp'),'history saved exactly once');
set role authenticated;
select whatsapp_admin('unlink');
set role anon;
do $$ begin perform whatsapp_server(repeat('s',64),repeat('t',64),'result',current_setting('test.wa_job')::jsonb); raise exception 'FALHA: revoked peer read'; exception when insufficient_privilege then null; end $$;
reset role;
select expect((select count(*)=2 from messenger_messages where channel='whatsapp'),'revocation preserves account history');
set role authenticated;
select whatsapp_admin('rotate',jsonb_build_object('token_hash',encode(extensions.digest(repeat('n',64),'sha256'),'hex'),'server_hash',encode(extensions.digest(repeat('s',64),'sha256'),'hex')));
set role anon;
do $$ begin perform whatsapp_server(repeat('s',64),repeat('t',64),'verify'); raise exception 'FALHA: revoked transport'; exception when insufficient_privilege then null; end $$;
reset role;
\echo 'OK: WhatsApp private bridge authorization, replay, atomic completion and revocation'
