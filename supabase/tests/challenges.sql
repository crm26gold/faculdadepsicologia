-- Teste dos desafios (criar, participar, marcar o dia, sequência, marcos, Dar força, medalha e Conquistas), em Postgres
-- local descartável.
-- Uso: psql -d <banco vazio> -v ON_ERROR_STOP=1 -f supabase/tests/challenges.sql
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
create function public.group_id(group_name text) returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.spaces where name = group_name $$;
create function public.challenge_id(challenge_title text) returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.challenges where title = challenge_title $$;
create function public.today() returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
-- Um desafio que já começou, para testar sequência e fim (o app só cria a partir de hoje).
create function public.past_challenge(challenge_title text, from_day date, to_day date, rest smallint[], people uuid[]) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare created uuid;
begin
  insert into public.challenges(space_id, created_by, title, kind, starts_on, ends_on, rest_days)
  values (public.group_id('Treino'), people[1], challenge_title, 'feito', from_day, to_day, rest) returning id into created;
  insert into public.challenge_members(challenge_id, user_id) select created, unnest(people);
  return created;
end;
$$;
create function public.mark(challenge uuid, person uuid, days date[]) returns void language sql security definer set search_path = ''
as $$ insert into public.challenge_checkins(challenge_id, user_id, day) select challenge, person, unnest(days) $$;
grant execute on function public.expect(boolean, text), public.act_as(text), public.group_id(text), public.challenge_id(text), public.today()
  to authenticated;
set role authenticated;

-- Bia cria um grupo de desafio; Caio entra; Duda fica de fora.
select act_as('00000000-0000-4000-8000-000000000004'); select save_my_profile('animal', '🦊', null, '');
select create_group('Treino', null, '', 'sand', 'desafio', '{conversa,checkin}', '{}', '', 'public', false, false, null);
select act_as('00000000-0000-4000-8000-000000000005'); select save_my_profile('initials', '', null, ''); select join_group(group_id('Treino'), null, false);
select act_as('00000000-0000-4000-8000-000000000006'); select save_my_profile('initials', '', null, '');

-- Criar: quem cria já participa; regras do que é aceito.
select act_as('00000000-0000-4000-8000-000000000004');
select expect((challenge_create(group_id('Treino'), ' Beber água ', '', 'feito', '', null, today(), 30, '{0}')->>'people')::int = 1, 'quem cria participa');
select challenge_create(group_id('Treino'), 'Ler', '', 'quantidade', 'páginas', 10, today(), 7, '{}');
do $$ begin perform challenge_create(group_id('Treino'), 'x', '', 'quantidade', '', null, today(), 7, '{}'); raise exception 'FALHA: quantidade sem meta';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform challenge_create(group_id('Treino'), 'x', '', 'feito', '', null, today() - 1, 7, '{}'); raise exception 'FALHA: começou ontem';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform challenge_create(group_id('Treino'), 'x', '', 'feito', '', null, today(), 2, '{}'); raise exception 'FALHA: curto demais';
exception when invalid_parameter_value then null; end $$;

-- Só quem está no grupo vê e participa; nem a administração lê.
select act_as('00000000-0000-4000-8000-000000000005');
select expect(jsonb_array_length(space_challenges(group_id('Treino'))) = 2 and space_challenges(group_id('Treino'))->0->'me' = 'null'::jsonb, 'Caio vê, ainda sem participar');
select expect((challenge_join(challenge_id('Beber água'), true)->>'people')::int = 2, 'Caio entra');
select challenge_join(challenge_id('Ler'), true);
select act_as('00000000-0000-4000-8000-000000000006');
do $$ begin perform space_challenges(group_id('Treino')); raise exception 'FALHA: leu sem ser do grupo';
exception when insufficient_privilege then null; end $$;
do $$ begin perform challenge_join(challenge_id('Beber água'), true); raise exception 'FALHA: entrou sem ser do grupo';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000007');
do $$ begin perform space_challenges(group_id('Treino')); raise exception 'FALHA: a administração leu';
exception when insufficient_privilege then null; end $$;
do $$ begin perform count(*) from challenge_checkins; raise exception 'FALHA: leu a tabela';
exception when insufficient_privilege then null; end $$;

-- Marcar o dia: hoje vale; ontem fora do desafio e amanhã, não. Quantidade cumpre ao chegar à meta.
select act_as('00000000-0000-4000-8000-000000000005');
select expect((challenge_checkin(challenge_id('Beber água'), today(), true, null)->'me'->'today'->>'done')::boolean, 'marcou hoje');
do $$ begin perform challenge_checkin(challenge_id('Beber água'), today() - 1, true, null); raise exception 'FALHA: antes do começo';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform challenge_checkin(challenge_id('Beber água'), today() + 1, true, null); raise exception 'FALHA: amanhã';
exception when invalid_parameter_value then null; end $$;
select expect(not (challenge_checkin(challenge_id('Ler'), today(), true, 5)->'me'->'today'->>'done')::boolean, '5 de 10 páginas ainda não cumpre');
select expect((challenge_checkin(challenge_id('Ler'), today(), true, 12)->'me'->'today'->>'done')::boolean, '12 páginas cumprem');
do $$ begin perform challenge_checkin(challenge_id('Ler'), today(), true, null); raise exception 'FALHA: quantidade vazia';
exception when invalid_parameter_value then null; end $$;
select act_as('00000000-0000-4000-8000-000000000004');
select expect((space_challenges(group_id('Treino'))->0->'done_today'->>'count')::int = 1, 'o grupo vê quantos fizeram hoje');
select expect((space_challenges(group_id('Treino'))->0->'done_today'->'people'->0->>'name') = 'Caio', 'e quem');
select act_as('00000000-0000-4000-8000-000000000005');
select expect(jsonb_array_length(my_challenges_today()) = 2, 'Meu dia mostra os dois desafios de hoje');
select expect(s->'tools' ? 'checkin' and not (s->>'can_lead')::boolean, 'o início da conta diz as ferramentas do grupo e se a pessoa conduz')
  from jsonb_array_elements(app_home()->'spaces') s where s->>'name' = 'Treino';
select act_as('00000000-0000-4000-8000-000000000004');
select expect((s->>'can_lead')::boolean, 'quem criou o grupo conduz') from jsonb_array_elements(app_home()->'spaces') s where s->>'name' = 'Treino';
select act_as('00000000-0000-4000-8000-000000000005');

-- Sequência: 7 dias seguidos viram um marco no grupo, uma vez só; o dia de descanso não quebra.
reset role;
select public.past_challenge('Correr', today() - 9, today() + 20, '{}', array['00000000-0000-4000-8000-000000000005'::uuid, '00000000-0000-4000-8000-000000000004'::uuid]);
select public.mark(challenge_id('Correr'), '00000000-0000-4000-8000-000000000005', array(select (today() - n)::date from generate_series(1, 6) n));
select public.past_challenge('Alongar', today() - 5, today() + 5, array[extract(dow from today() - 1)::smallint], array['00000000-0000-4000-8000-000000000005'::uuid]);
select public.mark(challenge_id('Alongar'), '00000000-0000-4000-8000-000000000005', array[today() - 2]);
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000005');
select expect((challenge_checkin(challenge_id('Correr'), today(), true, null)->'me'->>'streak')::int = 7, '7 dias seguidos');
select challenge_checkin(challenge_id('Correr'), today(), false, null);
select challenge_checkin(challenge_id('Correr'), today(), true, null);
reset role;
select expect((select count(*) from public.network_posts where style = 'milestone' and milestone->>'days' = '7') = 1, 'um marco só, mesmo marcando de novo');
set role authenticated;
select expect((challenge_checkin(challenge_id('Alongar'), today(), true, null)->'me'->>'streak')::int = 2, 'o descanso de ontem não quebra');

-- Dar força só nos marcos; quem não é do grupo não vê o marco.
select act_as('00000000-0000-4000-8000-000000000004');
reset role;
create temporary table marco as select id from public.network_posts where style = 'milestone';
grant select on marco to authenticated;
set role authenticated;
select expect(toggle_reaction((select id from marco), 'forca'), 'Bia deu força');
reset role;
select expect(not private.can_see_post(p, '00000000-0000-4000-8000-000000000007') and private.can_see_post(p, '00000000-0000-4000-8000-000000000004'),
  'o marco é só do grupo: a administração não vê') from public.network_posts p where p.id = (select id from marco);
-- Marcar ontem por último pula de 6 para 8 dias: o marco de 7 sai do mesmo jeito.
select public.past_challenge('Pular corda', today() - 9, today() + 20, '{}', array['00000000-0000-4000-8000-000000000005'::uuid]);
select public.mark(challenge_id('Pular corda'), '00000000-0000-4000-8000-000000000005', array(select (today() - n)::date from generate_series(2, 7) n) || today());
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000005');
select expect((challenge_checkin(challenge_id('Pular corda'), today() - 1, true, null)->'me'->>'streak')::int = 8, '8 dias seguidos');
reset role;
select expect(exists (select 1 from public.network_posts p join public.challenge_milestones m on m.post_id = p.id
  where m.challenge_id = public.challenge_id('Pular corda') and m.days = 7 and p.milestone->>'days' = '7'), 'o marco de 7 saiu mesmo pulando');
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000004');
reset role;
select expect(exists (select 1 from public.network_events where kind = 'forca' and user_id = '00000000-0000-4000-8000-000000000005'), 'Caio recebe a novidade');
set role authenticated;
do $$ begin perform toggle_reaction((select id from marco), 'util'); raise exception 'FALHA: Útil num marco';
exception when invalid_parameter_value then null; end $$;
select act_as('00000000-0000-4000-8000-000000000006');
do $$ begin perform toggle_reaction((select id from marco), 'forca'); raise exception 'FALHA: força de fora do grupo';
exception when insufficient_privilege then null; end $$;
do $$ begin perform create_network_post('x', 'milestone', 'followers', null, '{}', '[]', false); raise exception 'FALHA: marco falso';
exception when check_violation then null; end $$;

-- Sair apaga os dias marcados. Só quem criou (ou modera) muda e encerra; encerrado não aceita mais o dia.
select act_as('00000000-0000-4000-8000-000000000005');
select challenge_join(challenge_id('Ler'), false);
reset role;
select expect((select count(*) from public.challenge_checkins where challenge_id = public.challenge_id('Ler')) = 0, 'saiu, os dias foram junto');
set role authenticated;
do $$ begin perform challenge_manage(challenge_id('Beber água'), 'outro', '', true); raise exception 'FALHA: membro encerrou';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000004');
select expect(challenge_manage(challenge_id('Beber água'), 'Beber 2 litros', 'Todo dia', false) @> '{"title": "Beber água", "description": "Todo dia"}',
  'já começou: muda a descrição, o nome fica');
select challenge_create(group_id('Treino'), 'Nadar', '', 'feito', '', null, today() + 3, 7, '{}');
select expect(challenge_manage(challenge_id('Nadar'), 'Nadar 1 km', '', false)->>'title' = 'Nadar 1 km', 'antes de começar, o nome muda');
select expect(challenge_manage(challenge_id('Beber água'), '', '', true)->>'state' = 'cancelled', 'encerrou');
select act_as('00000000-0000-4000-8000-000000000005');
do $$ begin perform challenge_checkin(challenge_id('Beber água'), today(), false, null); raise exception 'FALHA: marcou no encerrado';
exception when invalid_parameter_value then null; end $$;

-- Último dia ontem: ainda dá para marcar ontem; o desafio só fecha depois desse dia de tolerância.
reset role;
select public.past_challenge('Respirar', today() - 3, today() - 1, '{}', array['00000000-0000-4000-8000-000000000005'::uuid]);
set role authenticated;
select expect(challenge_checkin(challenge_id('Respirar'), today() - 1, true, null)->>'state' = 'ended', 'marcou o último dia no dia seguinte');
do $$ begin perform challenge_manage(challenge_id('Respirar'), '', '', true); raise exception 'FALHA: cancelou depois do último dia';
exception when insufficient_privilege then null; end $$;
do $$ begin perform challenge_manage(challenge_id('Respirar'), 'Outro nome', '', false); raise exception 'FALHA: renomeou depois do último dia';
exception when insufficient_privilege then null; end $$;
reset role;

-- Fim: 9 de 10 dias ganha a medalha (começa "Só eu"); 5 de 10 não. Roda uma vez só.
select public.past_challenge('Meditar', today() - 11, today() - 2, '{}', array['00000000-0000-4000-8000-000000000005'::uuid, '00000000-0000-4000-8000-000000000004'::uuid]);
select public.mark(challenge_id('Meditar'), '00000000-0000-4000-8000-000000000005', array(select (today() - n)::date from generate_series(2, 10) n));
select public.mark(challenge_id('Meditar'), '00000000-0000-4000-8000-000000000004', array(select (today() - n)::date from generate_series(2, 6) n));
select expect(private.close_challenges() = 1, 'uma medalha');
select expect(private.close_challenges() = 0, 'não repete');
select expect((select closed_at is null from public.challenges where title = 'Respirar'), 'Respirar ainda aberto no dia de tolerância');
select expect((select audience from public.achievements where user_id = '00000000-0000-4000-8000-000000000005') = 'private', 'começa Só eu');
select expect(exists (select 1 from public.network_events where kind = 'medal' and user_id = '00000000-0000-4000-8000-000000000005'), 'aviso da medalha');
select expect(exists (select 1 from public.network_posts where style = 'milestone' and milestone->>'days' = '0'), 'marco Concluí no grupo');
set role authenticated;

-- Conquistas: a pessoa vê todas; os outros, só o que ela abriu.
select act_as('00000000-0000-4000-8000-000000000005');
select expect(person_achievements('00000000-0000-4000-8000-000000000005')->'items'->0->'detail'->>'space' = 'Treino', 'Caio vê a própria, com o grupo');
select act_as('00000000-0000-4000-8000-000000000004');
select expect(jsonb_array_length(person_achievements('00000000-0000-4000-8000-000000000005')->'items') = 0, 'Só eu: Bia não vê');
select act_as('00000000-0000-4000-8000-000000000005');
reset role;
create temporary table medal as select id from public.achievements where user_id = '00000000-0000-4000-8000-000000000005';
grant select on medal to authenticated;
set role authenticated;
select achievement_audience((select id from medal), 'followers');
select act_as('00000000-0000-4000-8000-000000000004');
select expect(jsonb_array_length(person_achievements('00000000-0000-4000-8000-000000000005')->'items') = 0, 'Seguidores: Bia ainda não segue');
select follow_person('00000000-0000-4000-8000-000000000005');
select act_as('00000000-0000-4000-8000-000000000005'); select answer_follow('00000000-0000-4000-8000-000000000004', true);
select act_as('00000000-0000-4000-8000-000000000004');
select expect(jsonb_array_length(person_achievements('00000000-0000-4000-8000-000000000005')->'items') = 1, 'seguindo, vê');
select expect(person_achievements('00000000-0000-4000-8000-000000000005')->'items'->0->>'audience' is null, 'não vê a escolha de público');
select expect(not (person_achievements('00000000-0000-4000-8000-000000000005')->'items'->0->'detail' ? 'space'), 'não vê o nome do grupo');
do $$ begin perform achievement_audience((select id from medal), 'public'); raise exception 'FALHA: mudou a medalha de outra pessoa';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000005');
select achievement_audience((select id from medal), 'public'); select save_my_privacy(false, true, true);
select act_as('00000000-0000-4000-8000-000000000006');
select expect(jsonb_array_length(person_achievements('00000000-0000-4000-8000-000000000005')->'items') = 1, 'Público num perfil aberto: Duda vê');
select act_as('00000000-0000-4000-8000-000000000005'); select show_achievements(false);
select act_as('00000000-0000-4000-8000-000000000006');
select expect(jsonb_array_length(person_achievements('00000000-0000-4000-8000-000000000005')->'items') = 0
  and not (person_achievements('00000000-0000-4000-8000-000000000005')->>'shown')::boolean, 'aba escondida');
select act_as('00000000-0000-4000-8000-000000000005');
select expect(jsonb_array_length(export_my_data()->'challenges'->'achievements') = 1 and jsonb_array_length(export_my_data()->'challenges'->'joined') >= 3,
  'exportação traz desafios e medalha');

-- Bloqueio: quem bloqueou não vê o rosto de quem fez hoje nem de quem criou; o número continua.
select act_as('00000000-0000-4000-8000-000000000004'); select block_person('00000000-0000-4000-8000-000000000005', true);
select expect((c->'done_today'->>'count')::int = 1 and jsonb_array_length(c->'done_today'->'people') = 0 and c->'creator' = 'null'::jsonb, 'bloqueado não aparece')
  from jsonb_array_elements(space_challenges(group_id('Treino'))) c where c->>'title' = 'Correr';
select block_person('00000000-0000-4000-8000-000000000005', false);

-- Grupo arquivado: só leitura.
reset role;
update public.spaces set archived_at = now() where name = 'Treino';
set role authenticated;
select expect(jsonb_array_length(space_challenges(group_id('Treino'))) > 0, 'arquivado ainda se lê');
do $$ begin perform challenge_checkin(challenge_id('Correr'), today(), true, null); raise exception 'FALHA: marcou no arquivado';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform challenge_manage(challenge_id('Correr'), 'Correr', 'x', false); raise exception 'FALHA: mudou no arquivado';
exception when insufficient_privilege then null; end $$;
reset role;
update public.spaces set archived_at = null where name = 'Treino';

-- Quem sai do grupo sai dos desafios dele, com os dias; a medalha fica.
delete from public.space_members where space_id = public.group_id('Treino') and user_id = '00000000-0000-4000-8000-000000000005';
select expect(not exists (select 1 from public.challenge_members m join public.challenges c on c.id = m.challenge_id
  where c.space_id = public.group_id('Treino') and m.user_id = '00000000-0000-4000-8000-000000000005'), 'saiu do grupo, saiu dos desafios');
select expect(not exists (select 1 from public.challenge_checkins where user_id = '00000000-0000-4000-8000-000000000005'), 'e os dias foram junto');
select expect(exists (select 1 from public.achievements where user_id = '00000000-0000-4000-8000-000000000005'), 'a medalha continua');
set role authenticated;

-- Ferramenta desligada: os desafios somem do grupo.
reset role;
update public.spaces set tools = '{conversa}' where name = 'Treino';
set role authenticated;
do $$ begin perform space_challenges(group_id('Treino')); raise exception 'FALHA: leu com a ferramenta desligada';
exception when insufficient_privilege then null; end $$;
select expect(jsonb_array_length(my_challenges_today()) = 0, 'Meu dia sem os desafios do grupo desligado');

reset role;
select 'challenges ok';
