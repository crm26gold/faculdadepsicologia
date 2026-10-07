-- Robôs na parte coletiva: a conversa vinculada age como a própria pessoa, com o mesmo resultado da tela,
-- e os pedidos que exigem confirmação ficam só para ela. Roda depois de multiusuario_api.sql; tudo é desfeito.
begin;
delete from public.messenger_links where user_id in ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005');
insert into public.messenger_links(channel, chat_id, user_id) values
  ('telegram', 'b3b-aluno', '00000000-0000-4000-8000-000000000004'), ('whatsapp', 'b3b-fora', '00000000-0000-4000-8000-000000000005');
create function public.try_screen_bot(person text, call text) returns text language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', person, true); execute 'select ' || call; return 'ok';
exception when others then return sqlstate; end $$;
create function public.try_bot(channel text, chat text, op text, args jsonb) returns text language plpgsql as $$
begin perform public.bot_act('segredo-do-servidor-com-mais-de-32-caracteres', channel, chat, op, args); return 'ok';
exception when others then return sqlstate; end $$;
create function public.read_bot(channel text, chat text, op text, args jsonb) returns jsonb language sql as $$
select public.bot_act('segredo-do-servidor-com-mais-de-32-caracteres', channel, chat, op, args) $$;
grant execute on function public.try_screen_bot(text,text) to authenticated;
grant execute on function public.try_bot(text,text,text,jsonb), public.read_bot(text,text,text,jsonb) to anon;

-- Mesmo resultado pela tela e pelo robô, para o aluno (Telegram) e para quem é de fora (WhatsApp).
create temporary table bot_equivalence(who text, op text, screen text, bot text);
grant all on bot_equivalence to anon, authenticated;
do $$
declare g text := current_setting('test.g1'); item jsonb; person record; screen text; bot text;
  calls jsonb := jsonb_build_array(
    jsonb_build_object('op','create_post','sql',format('create_post(%L,''announcement'',''Aviso'','''',null,null,false)', g),
      'args',jsonb_build_object('target',g,'post_kind','announcement','post_title','Aviso')),
    jsonb_build_object('op','update_space','sql',format('update_space(%L,''Ética · Grupo 1'',''Novo'',''lavender'')', g),
      'args',jsonb_build_object('target',g,'space_name','Ética · Grupo 1','space_description','Novo','space_color','lavender')),
    jsonb_build_object('op','space_overview','sql',format('space_overview(%L)', g),'args',jsonb_build_object('target',g)));
begin
  for person in select * from (values ('4', 'telegram', 'b3b-aluno'), ('5', 'whatsapp', 'b3b-fora')) as p(id, channel, chat) loop
    for item in select value from jsonb_array_elements(calls) loop
      execute 'set local role authenticated';
      screen := public.try_screen_bot('00000000-0000-4000-8000-00000000000' || person.id, item->>'sql');
      execute 'reset role'; execute 'set local role anon';
      bot := public.try_bot(person.channel, person.chat, item->>'op', item->'args');
      execute 'reset role';
      insert into bot_equivalence values (person.id, item->>'op', screen, bot);
    end loop;
  end loop;
end $$;
select expect(not exists(select 1 from bot_equivalence where screen <> bot),
  'tela e robô divergem: ' || coalesce((select string_agg(who||':'||op||' tela='||screen||' robô='||bot, '; ') from bot_equivalence where screen <> bot), ''));
select expect(exists(select 1 from bot_equivalence where who = '4' and op = 'space_overview' and bot = 'ok'), 'aluno vê o próprio grupo pelo Telegram');
select expect(exists(select 1 from bot_equivalence where who = '5' and op = 'space_overview' and bot <> 'ok'), 'quem é de fora não vê o grupo pelo WhatsApp');

set local role anon;
select expect(try_bot('telegram', 'conversa-sem-vinculo', 'app_home', '{}') = '42501', 'conversa sem vínculo não age');
select expect(try_bot('sms', 'b3b-aluno', 'app_home', '{}') = '22023', 'canal desconhecido é recusado');
select expect(try_bot('telegram', 'b3b-aluno', op, '{}') = 'PT403', 'só na tela pelo robô: ' || op)
  from unnest(array['remove_member', 'set_member_role', 'admin_update_account', 'delete_post', 'delete_my_account']) op;
select expect(read_bot('telegram', 'b3b-aluno', 'app_home', '{}') ? 'spaces', 'início da pessoa pelo robô');
do $$ begin perform public.bot_act('segredo-errado-com-mais-de-trinta-e-dois-caracteres', 'telegram', 'b3b-aluno', 'app_home', '{}'); raise exception 'FALHA: segredo errado';
exception when insufficient_privilege then null; end $$;

-- Pedido de confirmação vindo do robô: guardado uma vez, só para a dona da conversa.
select set_config('test.botjob', public.bot_store_confirmation('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', 'b3b-aluno', '00000000-0000-4000-8000-0000000000e1',
  '{"saved":true,"reply":"Guardei para confirmar.","applied":[],"failed":[],"pending":[{"action":{"type":"excluir_coletivo","fn":"delete_post","target":"00000000-0000-4000-8000-0000000000c1"},"fingerprint":"{}","label":"Excluir publicação: Aviso (Grupo 1)"}]}')::text, true);
select expect(public.bot_store_confirmation('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', 'b3b-aluno', '00000000-0000-4000-8000-0000000000e1',
  '{"saved":true,"reply":"repetido","applied":[],"failed":[],"pending":[{"action":{"type":"x"},"fingerprint":"{}","label":"x"}]}')::text = current_setting('test.botjob'), 'mesmo pedido não duplica');
do $$ begin perform public.bot_store_confirmation('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', 'b3b-aluno', gen_random_uuid(), '{"saved":true,"reply":"","applied":[],"failed":[],"pending":[]}');
  raise exception 'FALHA: aceitou pedido sem pendência'; exception when invalid_parameter_value then null; end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select expect((select status = 'needs_confirmation' and result->'pending'->0->>'label' = 'Excluir publicação: Aviso (Grupo 1)' from public.assistant_jobs where id = current_setting('test.botjob')::uuid), 'pedido aparece para a dona da conversa');
select expect(exists(select 1 from public.assistant_conversations where title = 'Confirmação pelo Telegram'), 'conversa de confirmação do Telegram');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
select expect(not exists(select 1 from public.assistant_jobs where id = current_setting('test.botjob')::uuid), 'outra pessoa não vê o pedido');
reset role;

-- A lista interna de ações é do ator e ninguém a chama diretamente.
select expect(not has_function_privilege(r, 'private.assistant_act(uuid,boolean,text,jsonb)', 'execute'), 'lista interna fechada para ' || r) from unnest(array['anon', 'authenticated']) r;
select expect(not has_function_privilege(r, 'private.bot_person(text,text,text)', 'execute'), 'vínculo fechado para ' || r) from unnest(array['anon', 'authenticated']) r;
select expect((select string_agg(proname || '=' || proowner::regrole::text, ',' order by proname) from pg_proc where proname in ('assistant_act', 'bot_act', 'mcp_act'))
  = 'assistant_act=jornada_actor,bot_act=jornada_actor,mcp_act=jornada_actor', 'portas e lista interna rodam como o ator');
select expect(not has_schema_privilege('jornada_actor', 'public', 'CREATE') and not has_schema_privilege('jornada_actor', 'private', 'CREATE'), 'ator sem criação nos esquemas');
rollback;
