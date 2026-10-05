-- OAuth do MCP: código de uso único preso ao cliente, ao retorno e ao PKCE; renovação rotativa;
-- revogar em Meu espaço encerra o acesso. Tudo é desfeito.
begin;
do $$ begin perform set_config('jornada.oauth.owner',gen_random_uuid()::text,true); end $$;
insert into auth.users(id,email) values (current_setting('jornada.oauth.owner')::uuid,'oauth-'||current_setting('jornada.oauth.owner')||'@example.invalid');
insert into public.personal_workspaces(owner_id,data) values
  (current_setting('jornada.oauth.owner')::uuid,'{"version":"1","editorGeneration":9,"subjects":[],"notes":[],"tasks":[{"id":"t1","title":"Via OAuth"}],"sessions":[]}');

set local role anon;
select public.mcp_oauth_register('segredo-do-servidor-com-mais-de-32-caracteres','jpc_cliente_de_teste_0123456789','ChatGPT',array['https://chatgpt.example/callback']);
do $$ begin perform public.mcp_oauth_register('segredo-errado-com-mais-de-trinta-e-dois-caracteres','jpc_outro_cliente_0123456789ab','X',array['https://x.example/cb']);
  raise exception 'FALHA: registro sem segredo do servidor'; exception when insufficient_privilege then null; end $$;
select expect(public.mcp_oauth_client('segredo-do-servidor-com-mais-de-32-caracteres','jpc_cliente_de_teste_0123456789')->>'client_name'='ChatGPT','cliente registrado');
do $$ begin perform public.mcp_oauth_approve('jpc_cliente_de_teste_0123456789',repeat('c',64),'https://chatgpt.example/callback',repeat('A',43),true);
  raise exception 'FALHA: anônimo autorizou'; exception when insufficient_privilege then null; end $$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('jornada.oauth.owner'),true);
set local role authenticated;
do $$ begin perform public.mcp_oauth_approve('jpc_cliente_de_teste_0123456789',repeat('d',64),'https://atacante.example/cb',repeat('A',43),true);
  raise exception 'FALHA: aceitou retorno não registrado'; exception when invalid_parameter_value then null; end $$;
select public.mcp_oauth_approve('jpc_cliente_de_teste_0123456789',repeat('c',64),'https://chatgpt.example/callback',repeat('A',43),true);
reset role;

set local role anon;
do $$ begin perform public.mcp_oauth_exchange('segredo-do-servidor-com-mais-de-32-caracteres',repeat('c',64),'jpc_cliente_de_teste_0123456789','https://chatgpt.example/callback',repeat('B',43),repeat('1',64),repeat('2',64));
  raise exception 'FALHA: PKCE errado trocou o código'; exception when invalid_parameter_value then null; end $$;
select expect(public.mcp_oauth_exchange('segredo-do-servidor-com-mais-de-32-caracteres',repeat('c',64),'jpc_cliente_de_teste_0123456789','https://chatgpt.example/callback',repeat('A',43),repeat('1',64),repeat('2',64))->>'can_write'='true','código válido vira acesso');
do $$ begin perform public.mcp_oauth_exchange('segredo-do-servidor-com-mais-de-32-caracteres',repeat('c',64),'jpc_cliente_de_teste_0123456789','https://chatgpt.example/callback',repeat('A',43),repeat('3',64),repeat('4',64));
  raise exception 'FALHA: código reutilizado'; exception when invalid_parameter_value then null; end $$;
select expect(public.mcp_context('segredo-do-servidor-com-mais-de-32-caracteres',repeat('1',64))::text like '%Via OAuth%','acesso abre a vida de quem autorizou');
select expect(public.mcp_oauth_refresh('segredo-do-servidor-com-mais-de-32-caracteres',repeat('2',64),'jpc_cliente_de_teste_0123456789',repeat('5',64),repeat('6',64))->>'can_write'='true','renovação emite novo acesso');
do $$ begin perform public.mcp_auth('segredo-do-servidor-com-mais-de-32-caracteres',repeat('1',64)); raise exception 'FALHA: acesso antigo continuou';
exception when insufficient_privilege then null; end $$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('jornada.oauth.owner'),true);
set local role authenticated;
select expect((public.mcp_token_list()->0->>'oauth')::boolean and public.mcp_token_list()->0->>'label'='ChatGPT','conexão por login aparece em Meu espaço');
reset role;
set local role anon;
-- A wrong client must not revoke another client's valid family.
select expect(public.mcp_oauth_refresh('segredo-do-servidor-com-mais-de-32-caracteres',repeat('2',64),'jpc_outro_cliente_0123456789ab',repeat('7',64),repeat('8',64))->>'error'='invalid_grant','renovação presa ao cliente');
select expect(public.mcp_auth('segredo-do-servidor-com-mais-de-32-caracteres',repeat('5',64))->>'can_write'='true','cliente errado não revoga a família');
-- Replaying the predecessor returns an error without rolling back family revocation.
select expect(public.mcp_oauth_refresh('segredo-do-servidor-com-mais-de-32-caracteres',repeat('2',64),'jpc_cliente_de_teste_0123456789',repeat('7',64),repeat('8',64))->>'error'='invalid_grant','renovação reutilizada recusada');
do $$ begin perform public.mcp_auth('segredo-do-servidor-com-mais-de-32-caracteres',repeat('5',64)); raise exception 'FALHA: replay não revogou acesso sucessor';
exception when insufficient_privilege then null; end $$;
select expect(public.mcp_oauth_refresh('segredo-do-servidor-com-mais-de-32-caracteres',repeat('6',64),'jpc_cliente_de_teste_0123456789',repeat('9',64),repeat('0',64))->>'error'='invalid_grant','replay revoga também a renovação sucessora');
do $$ begin perform count(*) from private.oauth_refresh_history; raise exception 'FALHA: histórico refresh exposto'; exception when insufficient_privilege then null; end $$;
reset role;

-- A fresh consent is a new independent family; explicit revocation still works.
set local role authenticated;
select public.mcp_oauth_approve('jpc_cliente_de_teste_0123456789',repeat('e',64),'https://chatgpt.example/callback',repeat('A',43),false);
reset role;
set local role anon;
select expect(public.mcp_oauth_exchange('segredo-do-servidor-com-mais-de-32-caracteres',repeat('e',64),'jpc_cliente_de_teste_0123456789','https://chatgpt.example/callback',repeat('A',43),repeat('a',64),repeat('b',64))->>'can_write'='false','novo consentimento cria família independente só de leitura');
reset role;
set local role authenticated;
select public.mcp_token_revoke((public.mcp_token_list()->0->>'id')::uuid);
reset role;
set local role anon;
select expect(public.mcp_oauth_refresh('segredo-do-servidor-com-mais-de-32-caracteres',repeat('b',64),'jpc_cliente_de_teste_0123456789',repeat('c',64),repeat('d',64))->>'error'='invalid_grant','revogada não renova');

-- Per-origin throttling leaves capacity for another origin, while preserving the global cap.
do $$ begin
 for i in 1..10 loop
  perform public.mcp_oauth_register_limited('segredo-do-servidor-com-mais-de-32-caracteres','jpc_dcr_'||lpad(i::text,4,'0')||repeat('x',15),'Teste',array['https://test.example/cb'],repeat('1',64));
 end loop;
end $$;
do $$ begin perform public.mcp_oauth_register_limited('segredo-do-servidor-com-mais-de-32-caracteres','jpc_dcr_bloqueado_0123456789','Teste',array['https://test.example/cb'],repeat('1',64));
 raise exception 'FALHA: origem esgotou orçamento global'; exception when sqlstate 'PT429' then null; end $$;
select public.mcp_oauth_register_limited('segredo-do-servidor-com-mais-de-32-caracteres','jpc_dcr_outra_origem_0123456789','Teste',array['https://test.example/cb'],repeat('2',64));
do $$ begin perform public.mcp_oauth_register_limited('segredo-errado-com-mais-de-trinta-e-dois-caracteres','jpc_dcr_sem_segredo_0123456789','Teste',array['https://test.example/cb'],repeat('3',64));
 raise exception 'FALHA: registro limitado sem segredo'; exception when insufficient_privilege then null; end $$;
do $$ begin perform count(*) from private.oauth_registration_origins; raise exception 'FALHA: origem de registro exposta'; exception when insufficient_privilege then null; end $$;
reset role;
rollback;
\echo 'OK: OAuth do MCP com PKCE, revogação de família por replay e limites de cadastro.'
