-- Teste do "Achar horário em comum" (Caixa de ferramentas, entrega 2), em Postgres local descartável.
-- Uso: psql -d <banco vazio> -v ON_ERROR_STOP=1 -f supabase/tests/time_finder.sql
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
create function public.finder_id(finder_title text) returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.time_finders where title = finder_title $$;
create function public.today() returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;
grant execute on function public.expect(boolean, text), public.act_as(text), public.group_id(text), public.finder_id(text), public.today() to authenticated;
set role authenticated;

-- Bia cria o grupo com Encontros ligado; Caio entra; Duda fica de fora.
select act_as('00000000-0000-4000-8000-000000000004'); select save_my_profile('animal', '🦊', null, '');
select create_group('Estudo', null, '', 'sand', 'estudo', '{conversa,encontros}', '{}', '', 'public', false, false, null);
select act_as('00000000-0000-4000-8000-000000000005'); select save_my_profile('initials', '', null, ''); select join_group(group_id('Estudo'), null, false);
select act_as('00000000-0000-4000-8000-000000000006'); select save_my_profile('initials', '', null, '');

-- Propor: dias de hoje a 60 dias, até 7, faixa de horas válida.
select act_as('00000000-0000-4000-8000-000000000005');
select expect(finder_create(group_id('Estudo'), ' Reunião do trabalho ', array[today() + 2, today() + 1, today() + 1], 18::smallint, 22::smallint)
  @> jsonb_build_object('title', 'Reunião do trabalho', 'days', jsonb_build_array(today() + 1, today() + 2), 'can_manage', true), 'Caio propõe; dias sem repetir, em ordem');
do $$ begin perform finder_create(group_id('Estudo'), 'x', array[today() - 1], 18::smallint, 22::smallint); raise exception 'FALHA: dia passado';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform finder_create(group_id('Estudo'), 'x', array(select today() + n from generate_series(0, 7) n), 18::smallint, 22::smallint); raise exception 'FALHA: 8 dias';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform finder_create(group_id('Estudo'), 'x', array[today() + 61], 18::smallint, 22::smallint); raise exception 'FALHA: longe demais';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform finder_create(group_id('Estudo'), 'x', array[today()], 20::smallint, 20::smallint); raise exception 'FALHA: faixa vazia';
exception when invalid_parameter_value then null; end $$;

-- Quem não é do grupo não lê nem marca; nem a administração.
select act_as('00000000-0000-4000-8000-000000000006');
do $$ begin perform space_finders(group_id('Estudo')); raise exception 'FALHA: leu sem ser do grupo';
exception when insufficient_privilege then null; end $$;
do $$ begin perform finder_mark(finder_id('Reunião do trabalho'), '{18}'); raise exception 'FALHA: marcou sem ser do grupo';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000007');
do $$ begin perform space_finders(group_id('Estudo')); raise exception 'FALHA: a administração leu';
exception when insufficient_privilege then null; end $$;
do $$ begin perform count(*) from time_finder_marks; raise exception 'FALHA: leu a tabela';
exception when insufficient_privilege then null; end $$;

-- Marcar: índice = posição do dia × 24 + hora, dentro da faixa.
select act_as('00000000-0000-4000-8000-000000000005');
select expect(finder_mark(finder_id('Reunião do trabalho'), '{19,20,43,19}')->'mine' = '[19, 20, 43]'::jsonb, 'Caio marca (sem repetir)');
do $$ begin perform finder_mark(finder_id('Reunião do trabalho'), '{17}'); raise exception 'FALHA: antes da faixa';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform finder_mark(finder_id('Reunião do trabalho'), '{22}'); raise exception 'FALHA: depois da faixa';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform finder_mark(finder_id('Reunião do trabalho'), '{67}'); raise exception 'FALHA: dia que não existe';
exception when invalid_parameter_value then null; end $$;
select act_as('00000000-0000-4000-8000-000000000004');
select expect(jsonb_array_length(finder_mark(finder_id('Reunião do trabalho'), '{19,43}')->'marks') = 2, 'Bia marca; o grupo vê as duas pessoas');
select expect((space_finders(group_id('Estudo'))->0->'can_manage')::boolean, 'quem cuida do grupo modera');

-- Escolher: só quem propôs ou modera; o horário precisa estar na busca; depois, ninguém muda as marcas.
select act_as('00000000-0000-4000-8000-000000000004');
select finder_create(group_id('Estudo'), 'Revisão', array[today() + 3], 8::smallint, 10::smallint);
select act_as('00000000-0000-4000-8000-000000000005');
do $$ begin perform finder_manage(finder_id('Revisão'), today() + 3, 8::smallint, false); raise exception 'FALHA: membro escolheu na busca dos outros';
exception when insufficient_privilege then null; end $$;
do $$ begin perform finder_manage(finder_id('Reunião do trabalho'), today() + 5, 19::smallint, false); raise exception 'FALHA: dia fora da busca';
exception when invalid_parameter_value then null; end $$;
select expect(finder_manage(finder_id('Reunião do trabalho'), today() + 1, 19::smallint, false)->'chosen' = jsonb_build_object('day', today() + 1, 'hour', 19),
  'Caio escolhe o horário da própria busca');
do $$ begin perform finder_mark(finder_id('Reunião do trabalho'), '{20}'); raise exception 'FALHA: marcou depois de escolhido';
exception when invalid_parameter_value then null; end $$;
select expect(space_finders(group_id('Estudo'))->0->>'title' = 'Revisão', 'as em aberto vêm primeiro');
select act_as('00000000-0000-4000-8000-000000000004');
select expect(finder_manage(finder_id('Revisão'), null, null, true) is null, 'quem modera apaga');
select expect(jsonb_array_length(space_finders(group_id('Estudo'))) = 1, 'apagada');

-- Bloqueio: conta, sem o nome.
select block_person('00000000-0000-4000-8000-000000000005', true);
select expect(not exists (select 1 from jsonb_array_elements(space_finders(group_id('Estudo'))->0->'marks') m where m->'person'->>'name' = 'Caio')
  and jsonb_array_length(space_finders(group_id('Estudo'))->0->'marks') = 2 and space_finders(group_id('Estudo'))->0->'creator' = 'null'::jsonb,
  'bloqueado conta, sem aparecer');
select block_person('00000000-0000-4000-8000-000000000005', false);

-- Exportação: o que propôs e o que marcou.
select act_as('00000000-0000-4000-8000-000000000005');
select expect(jsonb_array_length(export_my_data()->'time_finders'->'created') = 1 and jsonb_array_length(export_my_data()->'time_finders'->'marks') = 1,
  'baixar meus dados traz as buscas de horário');

-- Grupo arquivado: só leitura.
reset role;
update public.spaces set archived_at = now() where name = 'Estudo';
set role authenticated;
select expect(jsonb_array_length(space_finders(group_id('Estudo'))) = 1, 'arquivado ainda se lê');
do $$ begin perform finder_create(group_id('Estudo'), 'Nova', array[today()], 8::smallint, 9::smallint); raise exception 'FALHA: propôs no arquivado';
exception when insufficient_privilege then null; end $$;
reset role;
update public.spaces set archived_at = null where name = 'Estudo';

-- Quem sai do grupo leva as próprias marcações.
delete from public.space_members where space_id = public.group_id('Estudo') and user_id = '00000000-0000-4000-8000-000000000004';
select expect(not exists (select 1 from public.time_finder_marks where user_id = '00000000-0000-4000-8000-000000000004'), 'saiu, as marcas foram junto');
set role authenticated;

-- Dia que passou: a busca toda no passado sai da lista; hora de dia passado não fica; não se escolhe dia passado.
reset role;
insert into public.time_finders(space_id, created_by, title, days, from_hour, to_hour) values
  (public.group_id('Estudo'), '00000000-0000-4000-8000-000000000005', 'Antiga', array[public.today() - 2, public.today() + 1], 8, 10),
  (public.group_id('Estudo'), '00000000-0000-4000-8000-000000000005', 'Passada', array[public.today() - 3], 8, 10);
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000005');
select expect(finder_mark(finder_id('Antiga'), '{8,32}')->'mine' = '[32]'::jsonb, 'a hora do dia que passou não fica');
do $$ begin perform finder_manage(finder_id('Antiga'), today() - 2, 8::smallint, false); raise exception 'FALHA: escolheu dia passado';
exception when invalid_parameter_value then null; end $$;
select expect(not exists (select 1 from jsonb_array_elements(space_finders(group_id('Estudo'))) f where f->>'title' = 'Passada'), 'busca toda no passado sai da lista');
reset role;

-- Ferramenta desligada: some.
reset role;
update public.spaces set tools = '{conversa}' where name = 'Estudo';
set role authenticated;
do $$ begin perform space_finders(group_id('Estudo')); raise exception 'FALHA: leu com a ferramenta desligada';
exception when insufficient_privilege then null; end $$;

reset role;
select 'time_finder ok';
