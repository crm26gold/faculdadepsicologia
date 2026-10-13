-- Teste do Networking (perfil, grupos livres, descobrir, entrar, pedidos e selo), em Postgres local descartável.
-- Uso: psql -d <banco vazio> -v ON_ERROR_STOP=1 -f supabase/tests/networking.sql
-- NUNCA executar no projeto remoto.
\set ON_ERROR_STOP 1
\set QUIET 1
\ir lib/supabase_stub.sql

insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'prof@example.invalid', '{"name": "Professora Ana"}'),
  ('00000000-0000-4000-8000-000000000004', 'bia@example.invalid', '{"full_name": "Bia"}'),
  ('00000000-0000-4000-8000-000000000005', 'caio@example.invalid', '{"full_name": "Caio"}'),
  ('00000000-0000-4000-8000-000000000006', 'duda@example.invalid', '{"full_name": "Duda"}'),
  ('00000000-0000-4000-8000-000000000007', 'fora@example.invalid', '{"full_name": "Eli"}');
create function public.group_id(group_name text) returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.spaces where name = group_name $$;
grant execute on function public.expect(boolean, text), public.act_as(text), public.group_id(text) to authenticated;
set role authenticated;

-- Perfil: cada um grava e lê só o próprio.
select act_as('00000000-0000-4000-8000-000000000004');
select expect(app_home()->'profile' = 'null'::jsonb, 'perfil só existe depois de criado');
select save_my_profile('animal', '🦊', null, '  Psicologia e corrida  ');
select expect((app_home()->'profile'->>'value') = '🦊' and (app_home()->'profile'->>'bio') = 'Psicologia e corrida', 'perfil salvo com avatar e bio');
select save_my_profile('photo', '', 'data:image/webp;base64,UklGRg==', '');
select expect((app_home()->'profile'->>'kind') = 'photo', 'foto em miniatura aceita');
do $$ begin perform save_my_profile('photo', '', 'https://exemplo.invalid/foto.png', ''); raise exception 'FALHA: foto externa';
exception when check_violation then null; end $$;
do $$ begin perform save_my_profile('photo', '', null, ''); raise exception 'FALHA: foto vazia';
exception when check_violation then null; end $$;
select act_as('00000000-0000-4000-8000-000000000005');
select expect((select count(*) from profiles) = 0, 'perfil dos outros não aparece direto na tabela');

-- Master monta a sala; a professora entra.
select act_as('00000000-0000-4000-8000-00000000000a');
select set_config('test.unip', create_space('institution', 'UNIP', null, '', 'blue')::text, false);
select set_config('test.c1', create_space('class', 'Psicologia 3B', current_setting('test.unip')::uuid, '', 'sage')::text, false);
select add_member_by_email(current_setting('test.c1')::uuid, 'prof@example.invalid', 'teacher');
select add_member_by_email(current_setting('test.c1')::uuid, 'bia@example.invalid', 'student');
select add_member_by_email(current_setting('test.c1')::uuid, 'caio@example.invalid', 'student');

-- Qualquer pessoa cria grupo livre e vira dona.
select act_as('00000000-0000-4000-8000-000000000004');
select create_group('Treino 30 dias', null, 'Bora correr', 'sand', 'desafio', array['conversa', 'checkin', 'placar'],
  array['corrida', 'saúde'], 'Saúde', 'public', false, false, null);
select expect((select my_role from jsonb_to_recordset(app_home()->'spaces') as s(name text, my_role text) where name = 'Treino 30 dias') = 'owner', 'quem cria vira dona');
select expect((select template from spaces where id = group_id('Treino 30 dias')) = 'desafio', 'modelo salvo');
do $$ begin perform create_group('X', null, '', 'sage', 'livre', array['foguete'], '{}', '', 'public', false, false, null); raise exception 'FALHA: ferramenta inventada';
exception when check_violation then null; end $$;
do $$ begin perform create_group('X', null, '', 'sage', 'livre', '{}', array['Com Espaço'], '', 'public', false, false, null); raise exception 'FALHA: tema fora do formato';
exception when check_violation then null; end $$;
do $$ begin perform create_group('X', null, '', 'sage', 'livre', '{}', '{}', '', 'class', false, false, null); raise exception 'FALHA: só a sala sem sala';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform create_group('X', null, '', 'sage', 'livre', '{}', '{}', '', 'public', false, false, 'abc'); raise exception 'FALHA: senha curta';
exception when invalid_parameter_value then null; end $$;
-- Grupo da sala, visível só para a sala, com aprovação e pedindo e-mail; e um com senha.
select create_group('Estudo Ética', current_setting('test.c1')::uuid, '', 'lavender', 'estudo', array['mural', 'enquetes'],
  array['ética'], 'UNIP › Psicologia › Ética', 'class', true, true, null);
select create_group('Leitura secreta', null, '', 'rose', 'livre', '{}', array['livros'], '', 'public', false, false, 'chave123');
select create_group('Só convidados', null, '', 'blue', 'livre', '{}', array['livros'], '', 'invite', false, false, null);
select expect((space_overview(group_id('Leitura secreta'))->'space'->>'has_password')::boolean, 'dona sabe que há senha');
select expect((select count(*) from spaces where name like 'Leitura%' and to_jsonb(spaces) ? 'password_hash') = 0, 'hash da senha fora da tabela lida pelos membros');
do $$ begin perform create_group('Intrusa', current_setting('test.unip')::uuid, '', 'sage', 'livre', '{}', '{}', '', 'invite', false, false, null); raise exception 'FALHA: grupo dentro de instituição';
exception when insufficient_privilege then null; end $$;

-- Quem não é da sala não cria grupo dentro dela.
select act_as('00000000-0000-4000-8000-000000000007');
do $$ begin perform create_group('Intruso', current_setting('test.c1')::uuid, '', 'sage', 'livre', '{}', '{}', '', 'invite', false, false, null); raise exception 'FALHA: criou grupo em sala alheia';
exception when insufficient_privilege then null; end $$;

-- Descobrir: públicos para todos; "só a sala" para a sala; convite nunca aparece.
select expect(jsonb_array_length(discover_groups('')) = 2, 'de fora vê só os dois públicos');
select expect(jsonb_array_length(discover_groups('#livros')) = 1, 'busca por tema');
select expect(jsonb_array_length(discover_groups('treino')) = 1, 'busca por nome');
select expect(discover_groups('treino')->0->>'description' = 'Bora correr' and not (discover_groups('treino')->0 ? 'people'), 'cartão sem a lista de membros');
select expect(jsonb_array_length(discover_groups('ética')) = 0, 'grupo da sala escondido de quem é de fora');
do $$ begin perform space_overview(group_id('Treino 30 dias')); raise exception 'FALHA: viu o grupo sem entrar';
exception when insufficient_privilege then null; end $$;
do $$ begin perform join_group(group_id('Estudo Ética'), null, true); raise exception 'FALHA: entrou no grupo da sala de fora';
exception when insufficient_privilege then null; end $$;
do $$ begin perform join_group(group_id('Só convidados'), null, false); raise exception 'FALHA: entrou sem convite';
exception when insufficient_privilege then null; end $$;
select expect(join_group(group_id('Treino 30 dias'), null, false) = 'joined', 'entrada livre');
select expect((space_overview(group_id('Treino 30 dias'))->'avatars'->'00000000-0000-4000-8000-000000000004'->>'kind') = 'photo', 'avatar da dona aparece para quem está no grupo');
-- Senha: errada conta tentativa e bloqueia depois de 5.
select expect(join_group(group_id('Leitura secreta'), 'errada', false) = 'wrong_password', 'senha errada');
select join_group(group_id('Leitura secreta'), 'errada', false) from generate_series(1, 4);
select expect(join_group(group_id('Leitura secreta'), 'chave123', false) = 'too_many_attempts', 'bloqueio após 5 erros');
select act_as('00000000-0000-4000-8000-000000000006');
select expect(join_group(group_id('Leitura secreta'), 'chave123', false) = 'joined', 'senha certa entra');

-- Colega da sala pede para entrar; o e-mail só vai se aceitar.
select act_as('00000000-0000-4000-8000-000000000005');
select expect(jsonb_array_length(discover_groups('ética')) = 1, 'colega da sala encontra o grupo da sala');
select expect(join_group(group_id('Estudo Ética'), null, false) = 'email_required', 'grupo pede e-mail');
select expect(join_group(group_id('Estudo Ética'), null, true) = 'requested', 'pedido enviado');
select expect((discover_groups('ética')->0->>'requested')::boolean, 'cartão mostra pedido enviado');
do $$ begin perform space_overview(group_id('Estudo Ética')); raise exception 'FALHA: viu antes da aprovação';
exception when insufficient_privilege then null; end $$;
do $$ begin perform decide_join_request(group_id('Estudo Ética'), '00000000-0000-4000-8000-000000000005', true); raise exception 'FALHA: aprovou o próprio pedido';
exception when insufficient_privilege then null; end $$;

select act_as('00000000-0000-4000-8000-000000000004');
select expect((app_home()->>'join_requests')::int = 1, 'dona vê um pedido esperando');
select expect((space_overview(group_id('Estudo Ética'))->'requests'->0->>'email') = 'caio@example.invalid', 'pedido traz o e-mail aceito');
select decide_join_request(group_id('Estudo Ética'), '00000000-0000-4000-8000-000000000005', true);
select expect((app_home()->>'join_requests')::int = 0, 'pedido respondido sai da fila');
-- Dona de grupo livre: vê só o e-mail de quem aceitou; não adiciona por e-mail.
select expect((select email from space_people(group_id('Estudo Ética')) where user_id = '00000000-0000-4000-8000-000000000005') = 'caio@example.invalid', 'e-mail aceito aparece para a dona');
select expect((select count(*) from space_people(group_id('Treino 30 dias')) where email is not null and user_id <> '00000000-0000-4000-8000-000000000004') = 0, 'sem aceite, dona não vê e-mail');
do $$ begin perform add_member_by_email(group_id('Treino 30 dias'), 'duda@example.invalid', 'student'); raise exception 'FALHA: dona de grupo livre adicionou por e-mail';
exception when insufficient_privilege then null; end $$;
select update_group_settings(group_id('Treino 30 dias'), 'saude', array['conversa'], array['corrida'], 'Saúde', 'invite', false, false, null);
select act_as('00000000-0000-4000-8000-000000000006');
select expect(jsonb_array_length(discover_groups('treino')) = 0, 'grupo some da busca quando vira só convite');
do $$ begin perform update_group_settings(group_id('Treino 30 dias'), 'livre', '{}', '{}', '', 'public', false, false, null); raise exception 'FALHA: membro mudou as regras';
exception when insufficient_privilege then null; end $$;

-- Convite de aluna para grupo da sala não matricula ninguém na sala.
select act_as('00000000-0000-4000-8000-000000000004');
select create_invitation(group_id('Estudo Ética'), 'student', encode(extensions.digest('convite-da-aluna-para-o-grupo-01', 'sha256'), 'hex'), 7, 10);
select act_as('00000000-0000-4000-8000-000000000007');
select accept_invitation('convite-da-aluna-para-o-grupo-01');
select expect((select count(*) from space_members where user_id = '00000000-0000-4000-8000-000000000007' and space_id = current_setting('test.c1')::uuid) = 0, 'convite da aluna não põe ninguém na sala');

-- Selo de oficial: a professora da sala assume; a dona do grupo não se dá o selo.
select act_as('00000000-0000-4000-8000-000000000004');
do $$ begin perform set_space_official(group_id('Estudo Ética'), true); raise exception 'FALHA: dona se deu o selo';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000001');
select set_space_official(group_id('Estudo Ética'), true);
select expect((space_overview(group_id('Estudo Ética'))->'space'->>'official_at') is not null, 'professora deu o selo');
select expect((select email from space_people(group_id('Estudo Ética')) where user_id = '00000000-0000-4000-8000-000000000004') = 'bia@example.invalid', 'professora segue vendo e-mails da sala');
do $$ begin perform set_space_official(group_id('Leitura secreta'), true); raise exception 'FALHA: professora deu selo em grupo de fora';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-00000000000a');
select set_space_official(group_id('Leitura secreta'), true);
select expect((select count(*) from admin_audit_log where action = 'set_official') = 2, 'selo fica no histórico');

-- Exportação traz perfil e pedidos.
select act_as('00000000-0000-4000-8000-000000000004');
select expect((export_my_data()->'profile'->>'avatar_kind') = 'photo', 'exportação traz o perfil');
select expect(jsonb_typeof(export_my_data()->'join_requests') = 'array', 'exportação traz os pedidos');

reset role;
select 'networking ok';
