-- Teste do Networking, entrega 3 (notificação do app para o que chega no Networking), em Postgres local descartável.
-- Uso: psql -d <banco vazio> -v ON_ERROR_STOP=1 -f supabase/tests/networking_alerts.sql
-- NUNCA executar no projeto remoto.
\set ON_ERROR_STOP 1
\set QUIET 1
\ir lib/supabase_stub.sql

insert into private.bot_server(id, secret_hash) values (true, encode(extensions.digest('segredo-do-servidor-de-teste-0123456789', 'sha256'), 'hex'));
insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000004', 'bia@example.invalid', '{"full_name": "Bia Souza"}'),
  ('00000000-0000-4000-8000-000000000005', 'caio@example.invalid', '{"full_name": "Caio"}'),
  ('00000000-0000-4000-8000-000000000006', 'duda@example.invalid', '{"full_name": "Duda"}');
create function public.claim() returns jsonb language sql
as $$ select network_push_claim('segredo-do-servidor-de-teste-0123456789', 50) $$;
create function public.group_id(group_name text) returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.spaces where name = group_name $$;
-- Um horário de silêncio que inclui agora, em São Paulo.
create function public.quiet_now() returns time[] language sql stable
as $$ select array[((now() at time zone 'America/Sao_Paulo') - interval '1 hour')::time, ((now() at time zone 'America/Sao_Paulo') + interval '1 hour')::time] $$;
grant execute on function public.expect(boolean, text), public.act_as(text), public.claim(), public.group_id(text), public.quiet_now() to anon, authenticated;
set role authenticated;

select act_as('00000000-0000-4000-8000-000000000004'); select save_my_profile('animal', '🦊', null, '');
select save_my_privacy(true, true, false);
select push_subscribe('https://push.example.invalid/bia', repeat('a', 87), repeat('b', 22), 'Android');
select act_as('00000000-0000-4000-8000-000000000005'); select save_my_profile('initials', '', null, '');
select act_as('00000000-0000-4000-8000-000000000006'); select save_my_profile('initials', '', null, '');

-- O padrão: aviso ligado e silêncio desligado (quem estuda à noite liga se quiser).
select act_as('00000000-0000-4000-8000-000000000004');
select expect(reminders_state()->'network'->>'quiet_from' is null and (reminders_state()->'network'->>'enabled')::boolean, 'padrão: ligado, sem silêncio');
select save_alerts(true, '22:00', '07:00', '{}');
select expect(reminders_state()->'network'->>'quiet_from' = '22:00', 'silêncio ligado');
select save_alerts(true, null, null, '{}');
select expect(reminders_state()->'network'->>'quiet_from' is null, 'silêncio desligado');
do $$ begin perform save_alerts(true, '10:00', null, '{}'); raise exception 'FALHA: silêncio pela metade';
exception when check_violation then null; end $$;

-- Uma novidade vira notificação uma vez só, com o nome de quem fez.
select act_as('00000000-0000-4000-8000-000000000005'); select follow_person('00000000-0000-4000-8000-000000000004');
set role anon;
select expect(jsonb_array_length(claim()) = 1, 'uma pessoa para avisar');
reset role;
select expect((select pushed_at is not null from public.network_events where actor_id = '00000000-0000-4000-8000-000000000005'), 'marcada como avisada');
set role anon;
select expect(jsonb_array_length(claim()) = 0, 'não avisa duas vezes');
do $$ begin perform network_push_claim('segredo-errado-segredo-errado-segredo-errado', 50); raise exception 'FALHA: leu sem o segredo';
exception when insufficient_privilege then null; end $$;
set role authenticated;

-- O conteúdo: quem fez, o quê e para quais aparelhos.
select act_as('00000000-0000-4000-8000-000000000004'); select answer_follow('00000000-0000-4000-8000-000000000005', true);
select act_as('00000000-0000-4000-8000-000000000006'); select follow_person('00000000-0000-4000-8000-000000000004');
reset role;
create temporary table got as select claim() as items;
select expect((select items->0->'events'->0->>'kind' from got) = 'follow_request', 'tipo da novidade');
select expect((select items->0->'events'->0->>'actor' from got) = 'Duda', 'nome de quem fez');
select expect((select items->0->'devices'->0->>'endpoint' from got) = 'https://push.example.invalid/bia', 'aparelho da Bia');
select expect((select jsonb_array_length(items) from got) = 1, 'o Caio, sem aparelho, não entra');

-- Horário de silêncio: a novidade fica só nas Novidades do app.
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000004'); select save_alerts(true, (quiet_now())[1], (quiet_now())[2], '{}');
select act_as('00000000-0000-4000-8000-000000000006'); select unfollow_person('00000000-0000-4000-8000-000000000004');
reset role;
insert into public.network_events(user_id, actor_id, kind) values ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000006', 'follow');
select expect(jsonb_array_length(claim()) = 0, 'silêncio segura a notificação');
select expect(not exists (select 1 from public.network_events where pushed_at is null), 'e não fica para depois');
select expect(private.in_quiet('22:00', '07:00', '2026-10-14 02:00+00') and not private.in_quiet('22:00', '07:00', '2026-10-13 15:00+00'), 'silêncio vira a meia-noite');

-- Grupo silenciado: o pedido para entrar nele não toca; o de outro grupo, sim.
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000004');
select create_group('Estudo de Ética', null, '', 'sand', 'livre', '{}', '{}', '', 'public', true, false, null);
select create_group('Corrida', null, '', 'sand', 'livre', '{}', '{}', '', 'public', true, false, null);
select save_alerts(true, null, null, array[group_id('Estudo de Ética'), '11111111-1111-4111-8111-111111111111'::uuid]);
select expect(jsonb_array_length(reminders_state()->'network'->'muted') = 1, 'só grupo de que ela participa pode ser silenciado');
select expect(jsonb_array_length(reminders_state()->'groups') = 2, 'os grupos dela para escolher');
select act_as('00000000-0000-4000-8000-000000000005');
select join_group(group_id('Estudo de Ética'), null, false);
select join_group(group_id('Corrida'), null, false);
reset role;
select expect((select count(*) from public.network_events where pushed_at is null and kind = 'join_request') = 2, 'dois pedidos para entrar');
create temporary table muted as select claim() as items;
select expect((select jsonb_array_length(items->0->'events') from muted) = 1, 'só o pedido do grupo não silenciado');
select expect((select items->0->'events'->0->>'space' from muted) = 'Corrida', 'o do grupo Corrida');

-- Aviso do Networking desligado: nada toca.
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000004'); select save_alerts(false, null, null, '{}');
reset role;
insert into public.network_events(user_id, actor_id, kind) values ('00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000006', 'follow');
select expect(jsonb_array_length(claim()) = 0, 'aviso desligado');

-- Quem não tem perfil não guarda preferências.
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000006');
reset role;
delete from public.profiles where user_id = '00000000-0000-4000-8000-000000000006';
set role authenticated;
do $$ begin perform save_alerts(true, null, null, '{}'); raise exception 'FALHA: preferências sem perfil';
exception when insufficient_privilege then null; end $$;

reset role;
select 'networking alerts ok';
