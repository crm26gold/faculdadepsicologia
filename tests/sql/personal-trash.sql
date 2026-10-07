-- Lixeira da vida pessoal: o que sai do espaço (tela ou assistente) é guardado na mesma transação, volta
-- quando o item é restaurado, respeita 30 dias e 2 MB por conta e só a dona vê. Tudo é desfeito.
begin;
update public.personal_workspaces set data = jsonb_set(data, '{tasks}', '[{"id":"lx-1","title":"Dentista","date":"2026-10-08"},{"id":"lx-2","title":"Academia","date":"2026-10-09"}]'::jsonb)
 where owner_id = '00000000-0000-4000-8000-00000000000a';
select expect(not exists(select 1 from public.personal_trash where owner_id = '00000000-0000-4000-8000-00000000000a' and item_id like 'lx-%'), 'criar não manda nada para a lixeira');

-- Excluir: o item vai inteiro para a lixeira, com validade de 30 dias.
update public.personal_workspaces set data = jsonb_set(data, '{tasks}', '[{"id":"lx-2","title":"Academia","date":"2026-10-09"}]'::jsonb)
 where owner_id = '00000000-0000-4000-8000-00000000000a';
select expect((select item->>'title' = 'Dentista' and collection = 'tasks' and expires_at > now() + interval '29 days'
  from public.personal_trash where item_id = 'lx-1'), 'item excluído guardado na lixeira');

-- Só a dona vê e esvazia a própria lixeira.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
select expect((select count(*) = 1 from public.personal_trash where item_id = 'lx-1'), 'dona vê a lixeira');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select expect(not exists(select 1 from public.personal_trash where item_id = 'lx-1'), 'outra pessoa não vê');
delete from public.personal_trash where item_id = 'lx-1';
reset role;
select expect(exists(select 1 from public.personal_trash where item_id = 'lx-1'), 'outra pessoa não apaga');
set local role anon;
do $$ begin perform count(*) from public.personal_trash; raise exception 'FALHA: anônimo leu a lixeira';
exception when insufficient_privilege then null; end $$;
reset role;

-- Restaurar (ou desfazer): o item volta ao espaço e sai da lixeira sozinho.
update public.personal_workspaces set data = jsonb_set(data, '{tasks}', '[{"id":"lx-2","title":"Academia","date":"2026-10-09"},{"id":"lx-1","title":"Dentista","date":"2026-10-08"}]'::jsonb)
 where owner_id = '00000000-0000-4000-8000-00000000000a';
select expect(not exists(select 1 from public.personal_trash where item_id = 'lx-1'), 'item restaurado sai da lixeira');

-- Validade: o que passou de 30 dias sai na próxima alteração.
update public.personal_workspaces set data = jsonb_set(data, '{tasks}', '[]'::jsonb) where owner_id = '00000000-0000-4000-8000-00000000000a';
select expect((select count(*) = 2 from public.personal_trash where item_id in ('lx-1', 'lx-2')), 'excluir dois guarda os dois');
update public.personal_trash set expires_at = now() - interval '1 second' where item_id = 'lx-1';
update public.personal_workspaces set data = jsonb_set(data, '{notes}', '[]'::jsonb) where owner_id = '00000000-0000-4000-8000-00000000000a';
select expect(not exists(select 1 from public.personal_trash where item_id = 'lx-1'), 'vencido sai da lixeira');

-- Espaço: acima de 2 MB por conta, os mais antigos saem primeiro.
update public.personal_workspaces set data = jsonb_set(data, '{notes}', (select jsonb_agg(jsonb_build_object('id', 'big-' || g, 'title', 'Grande ' || g, 'content', repeat('x', 400000))) from generate_series(1, 6) g))
 where owner_id = '00000000-0000-4000-8000-00000000000a';
update public.personal_workspaces set data = jsonb_set(data, '{notes}', '[]'::jsonb) where owner_id = '00000000-0000-4000-8000-00000000000a';
select expect((select sum(size) <= 2000000 from public.personal_trash where owner_id = '00000000-0000-4000-8000-00000000000a'), 'lixeira não passa de 2 MB');
select expect(exists(select 1 from public.personal_trash where item_id = 'lx-2'), 'os mais novos ficam');

-- Pelo assistente, a pessoa lê só a própria lixeira.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
set local role authenticated;
select public.mcp_token_create('Lixeira', repeat('8', 64), '8888', false, null);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select public.mcp_token_create('Lixeira do aluno', repeat('9', 64), '9999', false, null);
reset role;
set local role anon;
select expect(public.mcp_act('segredo-do-servidor-com-mais-de-32-caracteres', repeat('8', 64), 'trash_list', '{}')::text like '%Academia%', 'dona lista a lixeira pelo assistente, mesmo só consultando');
select expect(public.mcp_act('segredo-do-servidor-com-mais-de-32-caracteres', repeat('9', 64), 'trash_list', '{}')::text not like '%Academia%', 'outra pessoa não vê pelo assistente');
reset role;
rollback;
