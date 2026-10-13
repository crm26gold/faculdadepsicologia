-- Teste do Networking, etapa 2 (seguir, publicações, reações, atualizações), em Postgres local descartável.
-- Uso: psql -d <banco vazio> -v ON_ERROR_STOP=1 -f supabase/tests/networking_feed.sql
-- NUNCA executar no projeto remoto.
\set ON_ERROR_STOP 1
\set QUIET 1
\ir lib/supabase_stub.sql

insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000004', 'bia@example.invalid', '{"full_name": "Bia Souza"}'),
  ('00000000-0000-4000-8000-000000000005', 'caio@example.invalid', '{"full_name": "Caio"}'),
  ('00000000-0000-4000-8000-000000000006', 'duda@example.invalid', '{"full_name": "Duda"}'),
  ('00000000-0000-4000-8000-000000000007', 'eli@example.invalid', '{"full_name": "Eli"}');
create function public.post_id(post_body text) returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.network_posts where body = post_body $$;
create function public.group_id(group_name text) returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.spaces where name = group_name $$;
grant execute on function public.expect(boolean, text), public.act_as(text), public.post_id(text), public.group_id(text) to authenticated;
set role authenticated;

-- Perfis novos: fechados e fora da busca.
select act_as('00000000-0000-4000-8000-000000000004'); select save_my_profile('animal', '🦊', null, 'Psicologia');
select act_as('00000000-0000-4000-8000-000000000005'); select save_my_profile('initials', '', null, '');
select act_as('00000000-0000-4000-8000-000000000006'); select save_my_profile('symbol', '🌿', null, '');
select expect(jsonb_array_length(search_people('bia')) = 0, 'perfil novo não aparece na busca');
do $$ begin perform follow_person('00000000-0000-4000-8000-000000000004'); raise exception 'FALHA: seguiu perfil que não alcança';
exception when insufficient_privilege then null; end $$;
do $$ begin perform person_profile('00000000-0000-4000-8000-000000000004'); raise exception 'FALHA: abriu perfil escondido';
exception when insufficient_privilege then null; end $$;

-- Bia aparece na busca, mas continua fechada: seguir vira pedido.
select act_as('00000000-0000-4000-8000-000000000004');
select save_my_privacy(true, true, false);
select act_as('00000000-0000-4000-8000-000000000006');
select expect(jsonb_array_length(search_people('bia')) = 1, 'busca encontra quem aceitou aparecer');
select expect(follow_person('00000000-0000-4000-8000-000000000004') = 'requested', 'perfil fechado recebe pedido');
select expect((person_profile('00000000-0000-4000-8000-000000000004')->>'status') = 'requested', 'perfil mostra pedido enviado');
select act_as('00000000-0000-4000-8000-000000000007');
do $$ begin perform search_people('bia'); raise exception 'FALHA: busca sem perfil'; exception when insufficient_privilege then null; end $$;

select act_as('00000000-0000-4000-8000-000000000004');
select expect((app_home()->>'updates')::int = 1, 'contador mostra o pedido');
select expect(jsonb_array_length(network_updates()->'requests') = 1, 'pedido aparece nas atualizações');
select answer_follow('00000000-0000-4000-8000-000000000006', true);
select create_network_post('Resumo de Ética, cap. 2 #ética', 'card_blue', 'followers', null, array['ética'], '[]', false);
select create_network_post('Aberto para todos #ética', 'text', 'public', null, array['ética'], '[]', false);
select create_network_post('Só para mim', 'text', 'private', null, '{}', '[]', false);
do $$ begin perform create_network_post('   ', 'text', 'public', null, '{}', '[]', false); raise exception 'FALHA: publicação vazia';
exception when invalid_parameter_value then null; end $$;

-- Duda segue: vê seguidores e todos, nunca o "só para mim".
select act_as('00000000-0000-4000-8000-000000000006');
select expect((app_home()->>'updates')::int = 1, 'quem pediu é avisado do aceite');
select expect(jsonb_array_length(network_feed('following', null, null)) = 2, 'seguidora vê seguidores e todos');
select expect(not (network_feed('following', null, null)::text like '%Só para mim%'), 'só para mim fica escondido');
select expect(toggle_reaction(post_id('Resumo de Ética, cap. 2 #ética'), 'util'), 'marcou Útil');
select expect(not toggle_reaction(post_id('Resumo de Ética, cap. 2 #ética'), 'util'), 'tocar de novo tira');
select expect(toggle_reaction(post_id('Resumo de Ética, cap. 2 #ética'), 'util'), 'marcou de novo');
select expect((network_feed('following', null, null)->1->'counts'->>'util')::int = 1
  or (network_feed('following', null, null)->0->'counts'->>'util')::int = 1, 'contagem de Útil');
select expect((select count(*) from network_posts) = 0, 'tabela direta não mostra publicação dos outros');

-- Caio não segue: perfil fechado esconde até o "todos".
select act_as('00000000-0000-4000-8000-000000000005');
select expect(jsonb_array_length(person_profile('00000000-0000-4000-8000-000000000004')->'posts') = 0, 'perfil fechado esconde publicações');
select expect(jsonb_array_length(topic_posts('#ética', null)) = 0, 'tema não fura perfil fechado');
do $$ begin perform toggle_reaction(post_id('Resumo de Ética, cap. 2 #ética'), 'gostei'); raise exception 'FALHA: reagiu sem ver';
exception when insufficient_privilege then null; end $$;
do $$ begin perform delete_network_post(post_id('Aberto para todos #ética')); raise exception 'FALHA: apagou publicação alheia';
exception when insufficient_privilege then null; end $$;
do $$ begin perform follow_list('00000000-0000-4000-8000-000000000004', 'followers'); raise exception 'FALHA: viu lista escondida';
exception when insufficient_privilege then null; end $$;

-- Bia abre o perfil: o "todos" aparece para quem alcança o perfil e no #tema.
select act_as('00000000-0000-4000-8000-000000000004');
select expect((app_home()->>'updates')::int = 1, 'Útil vira uma atualização só, mesmo tocando de novo');
select mark_updates_read();
select expect((app_home()->>'updates')::int = 0, 'marcar como lido zera o contador');
select save_my_privacy(false, true, true);
select expect(jsonb_array_length(follow_list('00000000-0000-4000-8000-000000000004', 'followers')) = 1, 'dona vê os seguidores');
select act_as('00000000-0000-4000-8000-000000000005');
select expect(jsonb_array_length(person_profile('00000000-0000-4000-8000-000000000004')->'posts') = 1, 'perfil aberto mostra só o todos');
select expect(jsonb_array_length(topic_posts('ética', null)) = 1, 'busca por tema');
select expect(follow_person('00000000-0000-4000-8000-000000000004') = 'following', 'perfil aberto: segue direto');
select expect(jsonb_array_length(follow_list('00000000-0000-4000-8000-000000000004', 'followers')) = 2, 'lista aparece quando a dona mostra');
select unfollow_person('00000000-0000-4000-8000-000000000004');
select expect((person_profile('00000000-0000-4000-8000-000000000004')->>'status') = 'none', 'deixou de seguir');

-- Publicação no grupo: só quem é do grupo vê; quem cuida do grupo pode apagar.
select act_as('00000000-0000-4000-8000-000000000004');
select create_group('Leitura juntos', null, '', 'sand', 'estudo', '{}', '{}', '', 'public', false, false, null);
select act_as('00000000-0000-4000-8000-000000000006');
select join_group(group_id('Leitura juntos'), null, false);
select create_network_post('Capítulo 3 para sexta', 'text', 'group', group_id('Leitura juntos'), '{}', '[]', false);
select expect(jsonb_array_length(network_feed('groups', null, null)) = 1, 'aba Meus grupos mostra a publicação do grupo');
select expect(not (network_feed('following', null, null)::text like '%Capítulo 3%'), 'publicação de grupo fica fora de Seguindo');
select act_as('00000000-0000-4000-8000-000000000005');
do $$ begin perform network_feed('space', group_id('Leitura juntos'), null); raise exception 'FALHA: leu grupo de fora';
exception when insufficient_privilege then null; end $$;
do $$ begin perform create_network_post('Invasão', 'text', 'group', group_id('Leitura juntos'), '{}', '[]', false); raise exception 'FALHA: publicou em grupo alheio';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000004');
select expect(jsonb_array_length(network_feed('space', group_id('Leitura juntos'), null)) = 1, 'dona vê o mural do grupo');
select delete_network_post(post_id('Capítulo 3 para sexta'));
select expect(jsonb_array_length(network_feed('space', group_id('Leitura juntos'), null)) = 0, 'dona do grupo apagou');

-- Pedido para grupo e aceite também viram atualização.
select update_group_settings(group_id('Leitura juntos'), 'estudo', '{}', '{}', '', 'public', true, false, null);
select act_as('00000000-0000-4000-8000-000000000005');
select join_group(group_id('Leitura juntos'), null, false);
select act_as('00000000-0000-4000-8000-000000000004');
select expect((network_updates()->'events'->0->>'kind') = 'join_request', 'dona é avisada do pedido');
select decide_join_request(group_id('Leitura juntos'), '00000000-0000-4000-8000-000000000005', true);
select remove_follower('00000000-0000-4000-8000-000000000006');
select expect(jsonb_array_length(follow_list('00000000-0000-4000-8000-000000000004', 'followers')) = 0, 'removeu a seguidora');
select act_as('00000000-0000-4000-8000-000000000005');
select expect((network_updates()->'events'->0->>'kind') = 'join_approved', 'aceito no grupo é avisado');

-- Exportação traz o que a pessoa fez na rede.
select act_as('00000000-0000-4000-8000-000000000004');
select expect(jsonb_array_length(export_my_data()->'network_posts') = 3, 'exportação traz as publicações');
select expect(jsonb_typeof(export_my_data()->'follows') = 'array', 'exportação traz quem segue');

reset role;
select 'networking feed ok';
