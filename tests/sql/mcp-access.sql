-- Chaves MCP: só o hash fica guardado, cada chave vê apenas a vida pessoal de quem a criou,
-- só leitura não grava, revogar corta o acesso e o servidor precisa do segredo próprio. Tudo é desfeito.
begin;
do $$ begin
  perform set_config('jornada.mcp.owner',gen_random_uuid()::text,true);
  perform set_config('jornada.mcp.other',gen_random_uuid()::text,true);
end $$;
insert into auth.users(id,email) values
  (current_setting('jornada.mcp.owner')::uuid,'mcp-'||current_setting('jornada.mcp.owner')||'@example.invalid'),
  (current_setting('jornada.mcp.other')::uuid,'mcp-'||current_setting('jornada.mcp.other')||'@example.invalid');
insert into public.personal_workspaces(owner_id,data) values
  (current_setting('jornada.mcp.owner')::uuid,'{"version":"1","editorGeneration":9,"subjects":[],"notes":[],"tasks":[{"id":"t-dono","title":"Só do dono"}],"sessions":[]}'),
  (current_setting('jornada.mcp.other')::uuid,'{"version":"1","editorGeneration":9,"subjects":[],"notes":[],"tasks":[{"id":"t-outro","title":"Só do outro"}],"sessions":[]}');

select set_config('request.jwt.claim.sub',current_setting('jornada.mcp.owner'),true);
set local role authenticated;
select set_config('jornada.mcp.read',public.mcp_token_create('Claude Code',repeat('a',64),'aaaa',false,90)::text,true);
select set_config('jornada.mcp.write',public.mcp_token_create('Codex',repeat('b',64),'bbbb',true,null)::text,true);
select expect(jsonb_array_length(public.mcp_token_list())=2,'dono vê as próprias chaves');
select expect(public.mcp_token_list()::text not like '%aaaaaaaa%','lista nunca devolve o hash');
do $$ begin perform public.mcp_token_create('ruim','nao-e-hash','x',false,null); raise exception 'FALHA: aceitou chave sem hash';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform count(*) from private.mcp_tokens; raise exception 'FALHA: leitura direta das chaves';
exception when insufficient_privilege then null; end $$;
select set_config('request.jwt.claim.sub',current_setting('jornada.mcp.other'),true);
select expect(jsonb_array_length(public.mcp_token_list())=0,'outra pessoa não vê chaves alheias');
do $$ begin perform public.mcp_token_revoke(current_setting('jornada.mcp.read')::uuid); raise exception 'FALHA: revogou chave alheia';
exception when no_data_found then null; end $$;
reset role;

set local role anon;
do $$ begin perform public.mcp_auth('segredo-errado-com-mais-de-trinta-e-dois-caracteres',repeat('a',64)); raise exception 'FALHA: aceitou segredo errado';
exception when insufficient_privilege then null; end $$;
select expect(public.mcp_auth('segredo-do-servidor-com-mais-de-32-caracteres',repeat('a',64))->>'can_write'='false','chave de leitura reconhecida');
select expect(public.mcp_auth('segredo-do-servidor-com-mais-de-32-caracteres',repeat('a',64))->'contract'='null'::jsonb,'conexão nova ainda não recebeu a lista de ferramentas');
select public.mcp_contract_seen('segredo-do-servidor-com-mais-de-32-caracteres',repeat('a',64),'abcdef012345');
select expect(public.mcp_auth('segredo-do-servidor-com-mais-de-32-caracteres',repeat('a',64))->>'contract'='abcdef012345','guarda a versão que a conexão recebeu');
do $$ begin perform public.mcp_contract_seen('segredo-errado-com-mais-de-trinta-e-dois-caracteres',repeat('a',64),'000000000000'); raise exception 'FALHA: gravou versão sem o segredo';
exception when insufficient_privilege then null; end $$;
do $$ begin perform public.mcp_contract_seen('segredo-do-servidor-com-mais-de-32-caracteres',repeat('a',64),'nao-e-versao'); raise exception 'FALHA: aceitou versão inválida';
exception when invalid_parameter_value then null; end $$;
select expect(public.mcp_context('segredo-do-servidor-com-mais-de-32-caracteres',repeat('a',64))::text like '%Só do dono%','chave abre só a vida de quem a criou');
select expect(public.mcp_context('segredo-do-servidor-com-mais-de-32-caracteres',repeat('a',64))::text not like '%Só do outro%','nunca a de outra pessoa');
do $$ begin perform public.mcp_save('segredo-do-servidor-com-mais-de-32-caracteres',repeat('a',64),'{"version":"1","editorGeneration":9,"subjects":[],"notes":[],"tasks":[],"sessions":[]}',1);
  raise exception 'FALHA: chave de leitura gravou'; exception when insufficient_privilege then null; end $$;
select expect(public.mcp_save('segredo-do-servidor-com-mais-de-32-caracteres',repeat('b',64),
  '{"version":"1","editorGeneration":9,"subjects":[],"notes":[],"tasks":[{"id":"t-dono","title":"Atualizado via MCP"}],"sessions":[]}',1)=2,'chave de registro grava com revisão');
do $$ begin perform public.mcp_save('segredo-do-servidor-com-mais-de-32-caracteres',repeat('b',64),'{"version":"1","editorGeneration":9,"subjects":[],"notes":[],"tasks":[],"sessions":[]}',1);
  raise exception 'FALHA: aceitou revisão antiga'; exception when sqlstate 'PT409' then null; end $$;
do $$ begin perform public.mcp_auth('segredo-do-servidor-com-mais-de-32-caracteres',repeat('c',64)); raise exception 'FALHA: chave desconhecida entrou';
exception when insufficient_privilege then null; end $$;
do $$ begin perform public.mcp_token_list(); exception when others then null; end $$;
reset role;

select set_config('request.jwt.claim.sub',current_setting('jornada.mcp.owner'),true);
set local role authenticated;
select public.mcp_token_revoke(current_setting('jornada.mcp.write')::uuid);
select expect(public.mcp_token_list()->0->>'contract'='abcdef012345','a pessoa vê a versão que cada conexão recebeu');
do $$ begin perform public.mcp_contract_seen('segredo-do-servidor-com-mais-de-32-caracteres',repeat('a',64),'000000000000'); raise exception 'FALHA: pessoa gravou versão';
exception when insufficient_privilege then null; end $$;
reset role;
set local role anon;
do $$ begin perform public.mcp_context('segredo-do-servidor-com-mais-de-32-caracteres',repeat('b',64)); raise exception 'FALHA: chave revogada continuou valendo';
exception when insufficient_privilege then null; end $$;
reset role;
update private.mcp_tokens set window_calls=300 where token_hash=repeat('a',64);
set local role anon;
do $$ begin perform public.mcp_auth('segredo-do-servidor-com-mais-de-32-caracteres',repeat('a',64)); raise exception 'FALHA: sem limite de chamadas';
exception when sqlstate 'PT429' then null; end $$;
reset role;
rollback;
\echo 'OK: chaves MCP isoladas por pessoa.'
