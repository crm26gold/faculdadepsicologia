-- Teste do Networking: bloquear, denunciar e a administração resolver, em Postgres local descartável.
-- Uso: psql -d <banco vazio> -v ON_ERROR_STOP=1 -f supabase/tests/networking_safety.sql
-- NUNCA executar no projeto remoto.
\set ON_ERROR_STOP 1
\set QUIET 1
\ir lib/supabase_stub.sql

insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000004', 'bia@example.invalid', '{"full_name": "Bia Souza"}'),
  ('00000000-0000-4000-8000-000000000005', 'caio@example.invalid', '{"full_name": "Caio"}'),
  ('00000000-0000-4000-8000-000000000006', 'duda@example.invalid', '{"full_name": "Duda"}'),
  ('00000000-0000-4000-8000-000000000007', 'eva@example.invalid', '{"full_name": "Eva Admin"}');
update public.accounts set is_master = true where user_id = '00000000-0000-4000-8000-000000000007';
create function public.post_id(post_body text) returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.network_posts where body = post_body $$;
grant execute on function public.expect(boolean, text), public.act_as(text), public.post_id(text) to authenticated;
set role authenticated;

-- Perfis abertos e na busca; o silêncio começa desligado.
select act_as('00000000-0000-4000-8000-000000000004'); select save_my_profile('animal', '🦊', null, ''); select save_my_privacy(false, true, true);
select expect(reminders_state()->'network'->>'quiet_from' is null, 'silêncio começa desligado');
select create_network_post('Olá, turma', 'text', 'public', null, '{}', '[]', false);
select act_as('00000000-0000-4000-8000-000000000005'); select save_my_profile('initials', '', null, ''); select save_my_privacy(false, true, true);
select create_network_post('Post do Caio', 'text', 'public', null, '{}', '[]', false);
select follow_person('00000000-0000-4000-8000-000000000004');
select act_as('00000000-0000-4000-8000-000000000004'); select follow_person('00000000-0000-4000-8000-000000000005');
select act_as('00000000-0000-4000-8000-000000000006'); select save_my_profile('initials', '', null, '');

-- Bloquear: some o seguir dos dois lados, e um deixa de ver o outro.
select act_as('00000000-0000-4000-8000-000000000005');
select block_person('00000000-0000-4000-8000-000000000004', true);
reset role;
select expect((select count(*) from public.follows where '00000000-0000-4000-8000-000000000005' in (follower_id, followee_id)) = 0, 'seguir desfeito nos dois sentidos');
set role authenticated;
select expect((person_profile('00000000-0000-4000-8000-000000000004')->>'blocked')::boolean, 'quem bloqueou vê o cartão para desbloquear');
select expect(jsonb_array_length(my_blocks()) = 1 and my_blocks()->0->>'name' = 'Bia Souza', 'lista de bloqueados');
select expect(jsonb_array_length(export_my_data()->'blocks') = 1, 'exportação traz os bloqueios');
select act_as('00000000-0000-4000-8000-000000000004');
do $$ begin perform person_profile('00000000-0000-4000-8000-000000000005'); raise exception 'FALHA: abriu o perfil de quem bloqueou';
exception when insufficient_privilege then null; end $$;
select expect(jsonb_array_length(search_people('caio')) = 0, 'quem bloqueou some da busca');
do $$ begin perform follow_person('00000000-0000-4000-8000-000000000005'); raise exception 'FALHA: seguiu quem bloqueou';
exception when insufficient_privilege then null; end $$;
do $$ begin perform toggle_reaction(post_id('Post do Caio'), 'gostei'); raise exception 'FALHA: reagiu ao post de quem bloqueou';
exception when insufficient_privilege then null; end $$;
select expect((select count(*) from network_events where actor_id = '00000000-0000-4000-8000-000000000004') = 0, 'nenhuma novidade sai de quem foi bloqueado');
do $$ begin insert into blocks(blocker_id, blocked_id) values ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000006');
  raise exception 'FALHA: gravou direto na tabela'; exception when insufficient_privilege then null; end $$;
select expect((select count(*) from blocks) = 0, 'ninguém lê os bloqueios dos outros');
-- Desbloquear devolve o perfil aberto, mas não refaz o seguir.
select act_as('00000000-0000-4000-8000-000000000005'); select block_person('00000000-0000-4000-8000-000000000004', false);
select expect(person_profile('00000000-0000-4000-8000-000000000004')->>'status' = 'none', 'desbloqueou; o seguir não volta');
select expect(jsonb_array_length(network_feed('person', '00000000-0000-4000-8000-000000000004', null)) = 1, 'volta a ver o que é público');

-- Denunciar: só o que a pessoa vê, uma vez por publicação, e ninguém lê as denúncias pela tabela.
select act_as('00000000-0000-4000-8000-000000000006');
select report_content('00000000-0000-4000-8000-000000000004', post_id('Olá, turma'), 'spam', ' Propaganda ');
select report_content('00000000-0000-4000-8000-000000000004', post_id('Olá, turma'), 'spam', 'de novo');
do $$ begin perform report_content('00000000-0000-4000-8000-000000000005', post_id('Olá, turma'), 'spam', ''); raise exception 'FALHA: publicação de outra pessoa';
exception when insufficient_privilege then null; end $$;
do $$ begin perform report_content('00000000-0000-4000-8000-000000000006', null, 'spam', ''); raise exception 'FALHA: denunciou a si mesma';
exception when insufficient_privilege then null; end $$;
do $$ begin perform report_content('00000000-0000-4000-8000-000000000005', null, 'qualquer', ''); raise exception 'FALHA: motivo inventado';
exception when check_violation then null; end $$;
do $$ begin perform count(*) from network_reports; raise exception 'FALHA: leu as denúncias';
exception when insufficient_privilege then null; end $$;
select expect(jsonb_array_length(export_my_data()->'reports') = 1, 'exportação traz a denúncia feita, uma só');
reset role;
insert into public.network_reports(reporter_id, target_user, reason) select '00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000005', 'outro' from generate_series(1, 19);
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000006');
do $$ begin perform report_content('00000000-0000-4000-8000-000000000005', null, 'ofensa', ''); raise exception 'FALHA: passou do limite do dia';
exception when sqlstate 'PT429' then null; end $$;
reset role;
delete from public.network_reports where reason = 'outro';
set role authenticated;

-- A administração vê, apaga a publicação e fica no histórico; quem não é da administração não resolve.
select act_as('00000000-0000-4000-8000-000000000004');
do $$ begin perform admin_resolve_report((select id from public.network_reports limit 1), 'descartada'); raise exception 'FALHA: resolveu sem ser da administração';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000007');
select expect(jsonb_array_length(admin_overview()->'reports') = 1, 'denúncia aberta no painel');
select expect(admin_overview()->'reports'->0->>'excerpt' = 'Olá, turma' and admin_overview()->'reports'->0->>'note' = 'Propaganda', 'trecho e observação');
select set_config('test.report', admin_overview()->'reports'->0->>'id', false);
select admin_resolve_report(current_setting('test.report')::uuid, 'apagar');
select expect(post_id('Olá, turma') is null, 'publicação apagada');
select expect(jsonb_array_length(admin_overview()->'reports') = 0, 'saiu das abertas');
select expect(admin_overview()->'audit'->0->>'action' = 'resolve_report', 'ficou no histórico');
do $$ begin perform admin_resolve_report(current_setting('test.report')::uuid, 'descartada'); raise exception 'FALHA: resolveu duas vezes';
exception when invalid_parameter_value then null; end $$;

reset role;
select 'networking safety ok';
