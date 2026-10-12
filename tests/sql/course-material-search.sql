-- Material dos cursos, etapa 2: a busca acha o trecho com arquivo e página, põe a matéria pedida na frente, traz
-- o "o que a IA precisa saber" e nunca mostra o material de outra conta, por nenhuma porta (login, MCP, robô).
-- O MCP guarda texto e contexto só com chave que registra e só em curso e matéria da própria pessoa. Tudo desfeito.
begin;
insert into public.personal_courses(owner_id, id, data, position) values ('00000000-0000-4000-8000-00000000000a', 'psicologia', '{"id":"psicologia"}', 0);
insert into public.personal_subjects(owner_id, id, data, position) values
  ('00000000-0000-4000-8000-00000000000a', 'neuro', '{"id":"neuro","courseId":"psicologia"}', 0),
  ('00000000-0000-4000-8000-00000000000a', 'social', '{"id":"social","courseId":"psicologia"}', 1);
insert into public.course_materials(id, owner_id, course_id, subject_id, kind, title, body) values
  ('d0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 'psicologia', 'neuro', 'texto', 'Plano de Bases Biológicas', 'x'),
  ('d0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', 'psicologia', 'social', 'texto', 'Plano de Social', 'x'),
  ('d0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-00000000000a', 'psicologia', 'neuro', 'contexto', 'O que a IA precisa saber', 'Professora cobra a prática.'),
  ('d0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 'psicologia', null, 'texto', 'Do outro aluno', 'x');
insert into public.course_material_chunks(material_id, owner_id, position, page, text) values
  ('d0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000000a', 0, 3, 'A prova de Bases Biológicas é dissertativa e cobra sinapse química.'),
  ('d0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-00000000000a', 0, 1, 'A prova de Psicologia Social é de múltipla escolha.'),
  ('d0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 0, 1, 'Segredo do outro aluno sobre a prova.');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
set local role authenticated;
select expect(public.material_search('como é a prova', 'psicologia', 'neuro')->'trechos'->0->>'title' = 'Plano de Bases Biológicas', 'a matéria pedida vem primeiro');
select expect(public.material_search('como é a prova', 'psicologia', 'social')->'trechos'->0->>'title' = 'Plano de Social', 'trocando a matéria, troca a ordem');
select expect((public.material_search('sinapse quimica', null, null)->'trechos'->0->>'page')::int = 3, 'traz a página, sem acento');
select expect(public.material_search('prova', 'psicologia', 'neuro')->'contextos'->0->>'texto' = 'Professora cobra a prática.', 'traz o que a IA precisa saber');
select expect(public.material_search('prova')::text not like '%Segredo do outro aluno%', 'nunca o material de outra conta');
select expect(jsonb_array_length(public.material_search('', 'psicologia', null)->'materiais') = 2, 'sem busca, lista o que está guardado (sem o contexto)');
select expect(jsonb_array_length(public.material_search('palavrainexistente')->'trechos') = 0, 'nada encontrado: lista vazia');
reset role;
set local role anon;
do $$ begin perform public.material_search('prova'); raise exception 'FALHA: anônimo buscou material';
exception when insufficient_privilege then null; end $$;
reset role;

-- MCP: pela chave, só a vida de quem a criou; guardar exige chave que registra e lugar da própria pessoa.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
set local role authenticated;
select public.mcp_token_create('Material leitura', repeat('e', 64), 'eeee', false, 30);
select public.mcp_token_create('Material escrita', repeat('f', 64), 'ffff', true, 30);
reset role;
set local role anon;
select expect(public.mcp_material_search('segredo-do-servidor-com-mais-de-32-caracteres', repeat('e', 64), 'prova', 'psicologia', 'neuro')->'trechos'->0->>'title' = 'Plano de Bases Biológicas', 'MCP busca na conta da chave');
select expect(public.mcp_material_search('segredo-do-servidor-com-mais-de-32-caracteres', repeat('e', 64), 'prova')::text not like '%Segredo do outro aluno%', 'MCP nunca vê outra conta');
do $$ begin perform public.mcp_material_search('segredo-errado-com-mais-de-trinta-e-dois-caracteres', repeat('e', 64), 'prova'); raise exception 'FALHA: busca sem o segredo';
exception when insufficient_privilege then null; end $$;
do $$ begin perform public.mcp_material_save('segredo-do-servidor-com-mais-de-32-caracteres', repeat('e', 64), 'psicologia', null, 'texto', 'X', 'y', '[]');
  raise exception 'FALHA: chave de leitura guardou material'; exception when insufficient_privilege then null; end $$;
do $$ begin perform public.mcp_material_save('segredo-do-servidor-com-mais-de-32-caracteres', repeat('f', 64), 'ia', null, 'texto', 'X', 'y', '[]');
  raise exception 'FALHA: guardou em curso que não existe'; exception when no_data_found then null; end $$;
do $$ begin perform public.mcp_material_save('segredo-do-servidor-com-mais-de-32-caracteres', repeat('f', 64), 'psicologia', 'outra', 'texto', 'X', 'y', '[]');
  raise exception 'FALHA: guardou em matéria de outro curso'; exception when no_data_found then null; end $$;
select expect(public.mcp_material_save('segredo-do-servidor-com-mais-de-32-caracteres', repeat('f', 64), 'psicologia', 'social', 'texto', 'Aviso da professora',
  'Trabalho em grupo sobre conformidade.', '[{"position":0,"page":null,"text":"Trabalho em grupo sobre conformidade."}]')->>'kind' = 'texto', 'MCP guarda texto na matéria');
select public.mcp_material_save('segredo-do-servidor-com-mais-de-32-caracteres', repeat('f', 64), 'psicologia', 'neuro', 'contexto', null, 'Prova com consulta.', '[{"position":0,"page":null,"text":"Prova com consulta."}]');
reset role;
select expect((select count(*) from public.course_materials where kind = 'contexto' and subject_id = 'neuro') = 1, 'contexto substitui o anterior, um por lugar');
select expect((select body from public.course_materials where kind = 'contexto' and subject_id = 'neuro') = 'Prova com consulta.', 'contexto atualizado');
select expect((select source from public.course_materials where title = 'Aviso da professora') = 'mcp', 'sabe que veio do assistente');
select expect((select count(*) from public.course_material_chunks c join public.course_materials m on m.id = c.material_id where m.title = 'Aviso da professora') = 1, 'texto entra na busca');

-- Telegram e WhatsApp: a pessoa da conversa vinculada.
insert into public.messenger_links(channel, chat_id, user_id) values ('telegram', '987654', '00000000-0000-4000-8000-00000000000a');
set local role anon;
select expect(public.bot_material_search('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '987654', 'conformidade')->'trechos'->0->>'title' = 'Aviso da professora', 'robô busca na conta da conversa');
do $$ begin perform public.bot_material_search('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '000000', 'prova'); raise exception 'FALHA: conversa não vinculada buscou';
exception when insufficient_privilege then null; end $$;
reset role;
rollback;
