-- O que os assistentes fizeram: cada pessoa lê só os próprios recibos com alterações; "desfaz isso" marca o
-- pedido como desfeito; anônimo não lê. Tudo é desfeito.
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
set local role authenticated;
select public.mcp_token_create('Claude do dono', repeat('a', 64), 'aaaa', true, null);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select public.mcp_token_create('Claude do aluno', repeat('b', 64), 'bbbb', true, null);
reset role;
insert into private.mcp_receipts(token_id, request_id, payload_hash, outcome) values
 ((select id from private.mcp_tokens where token_hash = repeat('a', 64)), 'a0000000-0000-4000-8000-000000000001', repeat('1', 64),
  '{"applied":[{"label":"Compromisso: Dentista","view":"agenda","undo":{"kind":"task","id":"t1"}}],"pending":[],"failed":[]}'),
 ((select id from private.mcp_tokens where token_hash = repeat('a', 64)), 'a0000000-0000-4000-8000-000000000002', repeat('2', 64),
  '{"applied":[],"pending":[],"failed":[],"undid":"a0000000-0000-4000-8000-000000000001"}'),
 ((select id from private.mcp_tokens where token_hash = repeat('a', 64)), 'a0000000-0000-4000-8000-000000000003', repeat('3', 64),
  '{"applied":[],"pending":[],"failed":["nada"]}'),
 ((select id from private.mcp_tokens where token_hash = repeat('b', 64)), 'b0000000-0000-4000-8000-000000000001', repeat('4', 64),
  '{"applied":[{"label":"Gasto do aluno","view":"finances","undo":{"kind":"transactions","id":"f1"}}],"pending":[],"failed":[]}');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
set local role authenticated;
select expect(jsonb_array_length(public.mcp_activity()) = 1, 'só pedidos com alterações aparecem');
select expect((public.mcp_activity()->0->>'connection') = 'Claude do dono' and (public.mcp_activity()->0->'labels'->>0) = 'Compromisso: Dentista', 'mostra a conexão e o que foi feito');
select expect((public.mcp_activity()->0->>'undone')::boolean, '"desfaz isso" marca o pedido');
select expect(not (public.mcp_activity()->0 ? 'applied'), 'a lista não carrega os dados de desfazer');
select expect(public.mcp_activity('a0000000-0000-4000-8000-000000000001')->0->'applied'->0->'undo'->>'id' = 't1', 'com alvo, traz o que é preciso para desfazer');
select expect(public.mcp_activity()::text not like '%Gasto do aluno%', 'não vê o que o assistente de outra pessoa fez');
select expect(public.mcp_activity('b0000000-0000-4000-8000-000000000001') = '[]'::jsonb, 'nem pedindo o ID de outra pessoa');
reset role;
set local role anon;
do $$ begin perform public.mcp_activity(); raise exception 'FALHA: anônimo leu o histórico';
exception when insufficient_privilege then null; end $$;
reset role;
rollback;
