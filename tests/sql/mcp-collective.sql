-- Ator da pessoa: pela chave do assistente, cada papel consegue exatamente o que conseguiria na tela,
-- e o que é só da tela é recusado pelo próprio banco. Roda depois de multiusuario_api.sql; tudo é desfeito.
begin;
create function public.try_screen(person text, call text) returns text language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', person, true); execute 'select ' || call; return 'ok';
exception when others then return sqlstate; end $$;
create function public.try_mcp(hash text, op text, args jsonb) returns text language plpgsql as $$
begin perform public.mcp_act('segredo-do-servidor-com-mais-de-32-caracteres', hash, op, args); return 'ok';
exception when others then return sqlstate; end $$;
create function public.read_mcp(hash text, op text, args jsonb) returns jsonb language sql as $$
select public.mcp_act('segredo-do-servidor-com-mais-de-32-caracteres', hash, op, args) $$;
grant execute on function public.try_screen(text,text) to authenticated;
grant execute on function public.try_mcp(text,text,jsonb), public.read_mcp(text,text,jsonb) to anon;

-- Grupo novo da professora: Bia conduz, Caio participa, Duda (05) é de fora.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
set local role authenticated;
select set_config('test.mg', create_space('group', 'Grupo da IA', current_setting('test.c1')::uuid, '', 'blue')::text, true);
select add_member_by_email(current_setting('test.mg')::uuid, 'lider@example.invalid', 'leader');
select add_member_by_email(current_setting('test.mg')::uuid, 'aluno@example.invalid', 'student');
select public.mcp_token_create('Claude da professora', repeat('1', 64), '1111', true, null);
select public.mcp_token_create('Leitura da professora', repeat('2', 64), '2222', false, null);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select public.mcp_token_create('Claude da líder', repeat('3', 64), '3333', true, null);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select public.mcp_token_create('Claude do aluno', repeat('4', 64), '4444', true, null);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
select public.mcp_token_create('Claude de fora', repeat('5', 64), '5555', true, null);
reset role;

-- Mesmo resultado pela tela e pelo assistente, papel por papel (cada tentativa é desfeita se falhar).
create temporary table equivalence(who text, op text, screen text, assistant text);
grant all on equivalence to anon, authenticated;
do $$
declare g text := current_setting('test.mg'); people text[] := array['1','3','4','5'];
  calls jsonb := jsonb_build_array(
    jsonb_build_object('op','create_post','sql',format('create_post(%L,''announcement'',''Aviso'','''',null,null,false)', g),
      'args',jsonb_build_object('target',g,'post_kind','announcement','post_title','Aviso')),
    jsonb_build_object('op','create_poll','sql',format('create_poll(%L,''Quando?'',array[''Seg'',''Ter''],null)', g),
      'args',jsonb_build_object('target',g,'poll_question','Quando?','poll_options',jsonb_build_array('Seg','Ter'))),
    jsonb_build_object('op','update_space','sql',format('update_space(%L,''Grupo da IA'',''Novo'',''blue'')', g),
      'args',jsonb_build_object('target',g,'space_name','Grupo da IA','space_description','Novo','space_color','blue')),
    jsonb_build_object('op','space_overview','sql',format('space_overview(%L)', g),'args',jsonb_build_object('target',g)));
  person text; item jsonb; screen text; assistant text;
begin
  foreach person in array people loop
    for item in select value from jsonb_array_elements(calls) loop
      execute 'set local role authenticated';
      screen := public.try_screen('00000000-0000-4000-8000-00000000000' || person, item->>'sql');
      execute 'reset role'; execute 'set local role anon';
      assistant := public.try_mcp(repeat(person, 64), item->>'op', item->'args');
      execute 'reset role';
      insert into equivalence values (person, item->>'op', screen, assistant);
    end loop;
  end loop;
end $$;
select expect(not exists(select 1 from equivalence where screen <> assistant),
  'tela e assistente divergem: ' || coalesce((select string_agg(who||':'||op||' tela='||screen||' ia='||assistant, '; ') from equivalence where screen <> assistant), ''));
select expect((select count(*) from equivalence where who = '1' and assistant = 'ok') = 4, 'professora faz tudo no próprio grupo pelo assistente');
select expect(exists(select 1 from equivalence where who = '5' and op = 'create_post' and assistant <> 'ok'), 'quem é de fora não publica pelo assistente');
select expect(exists(select 1 from equivalence where who = '4' and op = 'update_space' and assistant <> 'ok'), 'aluno não edita a sala pelo assistente');

-- O que o assistente lê é o mesmo que a pessoa vê na tela.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select set_config('test.screen_view', space_overview(current_setting('test.c1')::uuid)::text, true);
reset role;
set local role anon;
select expect(read_mcp(repeat('4', 64), 'space_overview', jsonb_build_object('target', current_setting('test.c1')))::text = current_setting('test.screen_view'),
  'aluno vê pelo assistente exatamente a visão da tela');
select expect(read_mcp(repeat('4', 64), 'app_home', '{}') ->> 'spaces' is not null, 'início da pessoa pelo assistente');
select expect(read_mcp(repeat('2', 64), 'list_contacts', '{}') is not null, 'chave só de leitura consulta');

-- Autor é a própria pessoa da chave.
select set_config('test.mpost', read_mcp(repeat('1', 64), 'create_post', jsonb_build_object('target', current_setting('test.mg'), 'post_kind', 'material', 'post_title', 'Slides'))#>>'{}', true);
reset role;
select expect((select author_id from public.space_posts where id = current_setting('test.mpost')::uuid) = '00000000-0000-4000-8000-000000000001', 'publicação fica no nome da professora');
set local role anon;

-- A confirmação de uma exclusão mostra as palavras do banco, lidas como a pessoa (sob RLS).
select expect(read_mcp(repeat('4', 64), 'describe', jsonb_build_object('kind', 'post', 'target', current_setting('test.mpost'))) = '{"title": "Slides", "where": "Grupo da IA"}'::jsonb, 'membro vê o que seria excluído');
select expect(read_mcp(repeat('5', 64), 'describe', jsonb_build_object('kind', 'post', 'target', current_setting('test.mpost'))) is null, 'quem é de fora não descobre o item');
select expect(read_mcp(repeat('2', 64), 'describe', jsonb_build_object('kind', 'post', 'target', current_setting('test.mpost'))) is not null, 'descrever é consulta: chave de leitura pode');

-- Chave só de leitura não grava; o que é só da tela é recusado, mesmo para quem pode na tela.
select expect(try_mcp(repeat('2', 64), 'create_post', jsonb_build_object('target', current_setting('test.mg'), 'post_kind', 'announcement', 'post_title', 'x')) = '42501', 'chave de leitura não publica');
select expect(try_mcp(repeat('1', 64), 'add_member_by_email', jsonb_build_object('target', current_setting('test.mg'), 'member_email', 'grupo3@example.invalid', 'member_role', 'teacher')) = 'PT403', 'dar papel de condução é só na tela');
select expect(try_mcp(repeat('1', 64), 'create_invitation', jsonb_build_object('target', current_setting('test.mg'), 'invite_role', 'teacher', 'hashed_token', repeat('c', 64), 'valid_days', 7, 'uses_limit', 5)) = 'PT403', 'convite de condução é só na tela');
select expect(try_mcp(repeat('1', 64), op, '{}') = 'PT403', 'só na tela: ' || op)
  from unnest(array['remove_member', 'set_member_role', 'delete_my_account', 'accept_terms', 'admin_update_account', 'admin_set_open_access', 'delete_post', 'qualquer_coisa']) op;
select expect(try_mcp(repeat('1', 64), 'add_member_by_email', jsonb_build_object('target', current_setting('test.mg'), 'member_email', 'grupo3@example.invalid', 'member_role', 'student')) = 'ok', 'professora adiciona aluno pelo assistente');
select expect(try_mcp(repeat('9', 64), 'app_home', '{}') = '42501', 'chave desconhecida não entra');
do $$ begin perform public.mcp_act('segredo-errado-com-mais-de-trinta-e-dois-caracteres', repeat('1', 64), 'app_home', '{}'); raise exception 'FALHA: segredo errado';
exception when insufficient_privilege then null; end $$;

-- Contatos continuam privados por pessoa.
select expect(try_mcp(repeat('5', 64), 'save_contact', jsonb_build_object('contact_name', 'Colega da Duda')) = 'ok', 'contato salvo pelo assistente');
select expect(read_mcp(repeat('5', 64), 'list_contacts', '{}')::text like '%Colega da Duda%', 'dona vê o contato');
select expect(read_mcp(repeat('4', 64), 'list_contacts', '{}')::text not like '%Colega da Duda%', 'outra pessoa não vê');
reset role;

-- O ator não ignora RLS e ninguém entra com ele.
select expect(not rolbypassrls and not rolcanlogin, 'ator sem atalhos') from pg_roles where rolname = 'jornada_actor';
select expect((select proowner::regrole::text from pg_proc where proname = 'mcp_act') = 'jornada_actor', 'porta roda como o ator');
rollback;
