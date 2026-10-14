-- Teste da conversa do grupo (mensagens, foto, apagar, não lidas, notificação e denúncia), em Postgres local descartável.
-- Uso: psql -d <banco vazio> -v ON_ERROR_STOP=1 -f supabase/tests/group_chat.sql
-- NUNCA executar no projeto remoto.
\set ON_ERROR_STOP 1
\set QUIET 1
\ir lib/supabase_stub.sql

insert into private.bot_server(id, secret_hash) values (true, encode(extensions.digest('segredo-do-servidor-de-teste-0123456789', 'sha256'), 'hex'));
insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000004', 'bia@example.invalid', '{"full_name": "Bia Souza"}'),
  ('00000000-0000-4000-8000-000000000005', 'caio@example.invalid', '{"full_name": "Caio"}'),
  ('00000000-0000-4000-8000-000000000006', 'duda@example.invalid', '{"full_name": "Duda"}'),
  ('00000000-0000-4000-8000-000000000007', 'eva@example.invalid', '{"full_name": "Eva Admin"}');
update public.accounts set is_master = true where user_id = '00000000-0000-4000-8000-000000000007';
create function public.msg_id(text_body text) returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.space_messages where body = text_body $$;
create function public.group_id(group_name text) returns uuid language sql stable security definer set search_path = ''
as $$ select id from public.spaces where name = group_name $$;
create function public.claim() returns jsonb language sql
as $$ select chat_push_claim('segredo-do-servidor-de-teste-0123456789', 50) $$;
-- Foto JPEG mínima (a assinatura confere) e o tamanho que a tela manda.
create function public.tiny_photo() returns jsonb language sql immutable
as $$ select jsonb_build_object('data', encode(decode('ffd8ffe0' || repeat('00', 80), 'hex'), 'base64'), 'mime', 'image/jpeg', 'width', 640, 'height', 480, 'alt', 'Quadro da aula') $$;
grant execute on function public.expect(boolean, text), public.act_as(text), public.msg_id(text), public.group_id(text), public.claim(), public.tiny_photo() to anon, authenticated;
set role authenticated;

-- Bia cria um grupo de estudo (com conversa); Caio entra; Duda fica de fora.
select act_as('00000000-0000-4000-8000-000000000004'); select save_my_profile('animal', '🦊', null, '');
select create_group('Ética', null, '', 'sand', 'estudo', '{conversa,mural}', '{}', '', 'public', false, false, null);
select act_as('00000000-0000-4000-8000-000000000005'); select save_my_profile('initials', '', null, '');
select join_group(group_id('Ética'), null, false);
select push_subscribe('https://push.example.invalid/caio', repeat('a', 87), repeat('b', 22), 'Android');
select act_as('00000000-0000-4000-8000-000000000006'); select save_my_profile('initials', '', null, '');

-- Enviar e ler; quem não é do grupo não lê nem escreve, nem a administração.
select act_as('00000000-0000-4000-8000-000000000004');
select expect((send_message(group_id('Ética'), '  Oi, turma  ', null, null)->>'body') = 'Oi, turma', 'texto limpo');
select act_as('00000000-0000-4000-8000-000000000005');
select expect((app_home()->'chat'->>(group_id('Ética')::text))::int = 1, 'uma mensagem nova no início da conta');
select expect(jsonb_array_length(chat_messages(group_id('Ética'), null, null, true)->'messages') = 2, 'Caio lê a própria entrada e a mensagem');
select expect(chat_messages(group_id('Ética'), null, null, false)->'messages'->0->>'kind' = 'joined', 'a entrada do Caio aparece na conversa');
select expect(chat_messages(group_id('Ética'), null, null, false)->'people'->'00000000-0000-4000-8000-000000000004'->>'name' = 'Bia Souza', 'nome de quem escreveu');
select expect(app_home()->'chat' = '{}'::jsonb, 'leu, não há mais novas');
select expect(not (chat_messages(group_id('Ética'), null, null, false)->>'moderator')::boolean, 'membro não modera');
select act_as('00000000-0000-4000-8000-000000000006');
do $$ begin perform chat_messages(group_id('Ética'), null, null, false); raise exception 'FALHA: leu sem ser do grupo';
exception when insufficient_privilege then null; end $$;
do $$ begin perform send_message(group_id('Ética'), 'intrusa', null, null); raise exception 'FALHA: escreveu sem ser do grupo';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000007');
do $$ begin perform chat_messages(group_id('Ética'), null, null, false); raise exception 'FALHA: a administração leu a conversa';
exception when insufficient_privilege then null; end $$;
do $$ begin perform count(*) from space_messages; raise exception 'FALHA: leu a tabela';
exception when insufficient_privilege then null; end $$;

-- Resposta, foto e regras do que é aceito.
select act_as('00000000-0000-4000-8000-000000000005');
select send_message(group_id('Ética'), 'Bom dia', msg_id('Oi, turma'), null);
select expect(jsonb_path_query_first(chat_messages(group_id('Ética'), null, null, false), '$.messages[*] ? (@.body == "Bom dia")')->'reply'->>'excerpt' = 'Oi, turma', 'resposta mostra o trecho');
select expect((send_message(group_id('Ética'), '', null, tiny_photo())->'photo'->>'stored')::boolean, 'foto guardada');
reset role;
create temporary table photo_msg as select id from public.space_messages where photo_width is not null;
grant select on photo_msg to authenticated;
set role authenticated;
select expect(chat_photo((select id from photo_msg))->>'mime' = 'image/jpeg', 'quem é do grupo vê a foto');
select act_as('00000000-0000-4000-8000-000000000006');
select expect(chat_photo((select id from photo_msg)) is null, 'quem é de fora não vê a foto');
select act_as('00000000-0000-4000-8000-000000000005');
do $$ begin perform send_message(group_id('Ética'), '   ', null, null); raise exception 'FALHA: mensagem vazia';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform send_message(group_id('Ética'), 'x', '11111111-1111-4111-8111-111111111111', null); raise exception 'FALHA: resposta a mensagem de fora';
exception when invalid_parameter_value then null; end $$;
do $$ begin perform send_message(group_id('Ética'), '', null, jsonb_build_object('data', 'abc', 'mime', 'image/png', 'width', 1, 'height', 1)); raise exception 'FALHA: PNG';
exception when invalid_parameter_value then null; end $$;

-- Apagar: quem escreveu apaga a própria; o dono do grupo modera; um membro não apaga a dos outros.
do $$ begin perform delete_message(msg_id('Oi, turma')); raise exception 'FALHA: membro apagou a mensagem de outra pessoa';
exception when insufficient_privilege then null; end $$;
select delete_message((select id from photo_msg));
select expect(chat_photo((select id from photo_msg)) is null, 'a foto sai junto');
select act_as('00000000-0000-4000-8000-000000000004');
select delete_message(msg_id('Bom dia'));
create temporary table seen_now as select chat_messages(group_id('Ética'), now() - interval '1 minute', null, false) as data;
select expect((select jsonb_path_query_first(data, '$.messages[*] ? (@.deleted == "moderation")') is not null from seen_now), 'apagada pela moderação');
select expect((select jsonb_path_query_first(data, '$.messages[*] ? (@.deleted == "author")') ->> 'body' = '' from seen_now), 'apagada por quem escreveu, sem texto');
select expect((chat_messages(group_id('Ética'), null, null, false)->>'moderator')::boolean, 'dona modera');
do $$ begin perform delete_message((chat_messages(group_id('Ética'), null, null, false)->'messages'->0->>'id')::uuid); raise exception 'FALHA: apagou a linha de entrada';
exception when insufficient_privilege then null; end $$;
reset role;
insert into public.space_messages(space_id, author_id, body) values (public.group_id('Ética'), null, 'de quem saiu da Jornada');
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000005');
do $$ begin perform delete_message(msg_id('de quem saiu da Jornada')); raise exception 'FALHA: membro apagou a mensagem de conta excluída';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000004');

-- Freios: 30 mensagens por minuto, e o espaço das fotos (publicações e conversa juntas).
reset role;
insert into public.space_messages(space_id, author_id, body) select public.group_id('Ética'), '00000000-0000-4000-8000-000000000005', 'enxurrada' from generate_series(1, 30);
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000005');
do $$ begin perform send_message(group_id('Ética'), 'mais uma', null, null); raise exception 'FALHA: passou do freio';
exception when sqlstate 'PT420' then null; end $$;
reset role;
delete from public.space_messages where body = 'enxurrada';
update public.platform_settings set photo_mb_per_person = 1;
with big as (insert into public.space_messages(space_id, author_id, body, photo_width, photo_height)
  select public.group_id('Ética'), '00000000-0000-4000-8000-000000000004', 'foto grande', 100, 100 from generate_series(1, 4) returning id)
insert into public.space_message_photos(message_id, mime, bytes) select id, 'image/jpeg', decode('ffd8ffe0' || repeat('00', 300000), 'hex') from big;
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000004');
do $$ begin perform send_message(group_id('Ética'), '', null, tiny_photo()); raise exception 'FALHA: passou do espaço da pessoa';
exception when sqlstate 'PT413' then null; end $$;
do $$ begin perform create_network_post('', 'text', 'followers', null, '{}', jsonb_build_array(tiny_photo()), false); raise exception 'FALHA: o feed ignorou as fotos da conversa';
exception when sqlstate 'PT413' then null; end $$;
reset role;
delete from public.space_messages where body = 'foto grande';
update public.platform_settings set photo_mb_per_person = 25;
set role authenticated;

-- Notificação: uma por conversa, não repete logo em seguida e não toca para quem está lendo agora.
reset role;
update public.space_reads set read_at = now() - interval '5 minutes' where user_id = '00000000-0000-4000-8000-000000000005';
update public.space_messages set created_at = now() - interval '10 minutes';
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000004');
select send_message(group_id('Ética'), 'Prova na sexta', null, null);
select send_message(group_id('Ética'), 'Tragam o resumo', null, null);
reset role;
create temporary table got as select claim() as items;
select expect((select jsonb_array_length(items) from got) = 1, 'uma notificação, para o Caio');
select expect((select items->0->>'group' = 'Ética' and items->0->>'author' = 'Bia Souza' and (items->0->>'count')::int = 2 from got), 'grupo, quem e quantas');
select expect((select items->0->>'excerpt' from got) = 'Tragam o resumo', 'a última mensagem');
select expect((select items->0->'devices'->0->>'endpoint' from got) = 'https://push.example.invalid/caio', 'aparelho do Caio');
select expect(jsonb_array_length(claim()) = 0, 'não repete');
update public.space_reads set pushed_at = now() - interval '1 minute', read_at = now() where user_id = '00000000-0000-4000-8000-000000000005';
insert into public.space_messages(space_id, author_id, body) values (public.group_id('Ética'), '00000000-0000-4000-8000-000000000004', 'Lendo agora');
select expect(jsonb_array_length(claim()) = 0, 'quem está lendo não recebe');
update public.space_reads set read_at = now() - interval '5 minutes' where user_id = '00000000-0000-4000-8000-000000000005';
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000005'); select mute_space(group_id('Ética'), true);
select expect(reminders_state()->'network'->'muted' ? group_id('Ética')::text, 'silenciado pela conversa');
reset role;
select expect(jsonb_array_length(claim()) = 0, 'grupo silenciado não toca');
set role authenticated;
select mute_space(group_id('Ética'), false);
select save_alerts(true, null, null, '{}', false);
select expect(not (reminders_state()->'network'->>'chat')::boolean, 'aviso da conversa desligado');
reset role;
select expect(jsonb_array_length(claim()) = 0, 'aviso da conversa desligado não toca');
set role authenticated;
select save_alerts(true, null, null, '{}');
select expect((reminders_state()->'network'->>'chat')::boolean = false, 'salvar sem a conversa mantém a escolha');
select save_alerts(true, null, null, '{}', true);
reset role;
select expect(jsonb_array_length(claim()) = 1, 'ligado de novo, avisa');

-- Bloqueio: a mensagem de quem foi bloqueado chega recolhida, não conta como nova e não avisa.
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000005'); select block_person('00000000-0000-4000-8000-000000000004', true);
select expect((chat_messages(group_id('Ética'), null, null, false)->'messages'->-1->>'blocked')::boolean, 'recolhida');
select expect(app_home()->'chat' = '{}'::jsonb, 'não conta como nova');
reset role;
update public.space_reads set pushed_at = now() - interval '1 minute' where user_id = '00000000-0000-4000-8000-000000000005';
insert into public.space_messages(space_id, author_id, body) values (public.group_id('Ética'), '00000000-0000-4000-8000-000000000004', 'Bloqueada');
select expect(jsonb_array_length(claim()) = 0, 'não avisa');
set role authenticated;
select block_person('00000000-0000-4000-8000-000000000004', false);

-- Denunciar uma mensagem: vai para a administração, que pode apagar; tudo no histórico.
select report_message(msg_id('Prova na sexta'), 'spam', 'Fora do assunto');
select report_message(msg_id('Prova na sexta'), 'spam', 'de novo');
select act_as('00000000-0000-4000-8000-000000000006');
do $$ begin perform report_message(msg_id('Prova na sexta'), 'spam', ''); raise exception 'FALHA: denunciou sem ser do grupo';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000004');
do $$ begin perform report_message(msg_id('Prova na sexta'), 'spam', ''); raise exception 'FALHA: denunciou a si mesma';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000007');
select expect(jsonb_array_length(admin_overview()->'reports') = 1, 'uma denúncia aberta');
select expect(admin_overview()->'reports'->0->>'space' = 'Ética' and admin_overview()->'reports'->0->>'excerpt' = 'Prova na sexta'
  and (admin_overview()->'reports'->0->>'message_exists')::boolean, 'grupo e trecho da mensagem');
select admin_resolve_report((admin_overview()->'reports'->0->>'id')::uuid, 'apagar');
select expect(admin_overview()->'audit'->0->'details'->>'message' is not null, 'ficou no histórico');
select act_as('00000000-0000-4000-8000-000000000005');
create temporary table after_report as select chat_messages(group_id('Ética'), now() - interval '1 minute', null, false) as data;
select expect((select jsonb_path_query_first(data, '$.messages[*] ? (@.deleted == "moderation")') is not null from after_report), 'apagada pela administração');

-- Grupo arquivado só lê; conversa desligada some.
select act_as('00000000-0000-4000-8000-000000000004'); select archive_space(group_id('Ética'), true);
select expect(not (chat_messages(group_id('Ética'), null, null, false)->>'open')::boolean, 'arquivado');
do $$ begin perform delete_message(msg_id('Oi, turma')); raise exception 'FALHA: apagou no arquivado';
exception when insufficient_privilege then null; end $$;
do $$ begin perform send_message(group_id('Ética'), 'depois', null, null); raise exception 'FALHA: escreveu no arquivado';
exception when insufficient_privilege then null; end $$;
select archive_space(group_id('Ética'), false);
reset role;
update public.spaces set tools = '{mural}' where name = 'Ética';
set role authenticated;
do $$ begin perform chat_messages(group_id('Ética'), null, null, false); raise exception 'FALHA: leu com a conversa desligada';
exception when insufficient_privilege then null; end $$;
reset role;
update public.spaces set tools = '{conversa,mural}' where name = 'Ética';

-- Prazo das fotos: a faxina apaga só a foto; a mensagem continua com o tamanho e a descrição.
set role authenticated;
select act_as('00000000-0000-4000-8000-000000000005');
select send_message(group_id('Ética'), 'foto antiga', null, tiny_photo());
reset role;
update public.space_message_photos set created_at = now() - interval '91 days';
delete from public.space_message_photos f using public.platform_settings s
 where s.chat_photo_days is not null and f.created_at < now() - make_interval(days => s.chat_photo_days);
set role authenticated;
create temporary table old_photo as select jsonb_path_query_first(chat_messages(group_id('Ética'), null, null, false), '$.messages[*] ? (@.body == "foto antiga")') as card;
select expect((select card->'photo'->>'alt' = 'Quadro da aula' and not (card->'photo'->>'stored')::boolean from old_photo), 'foto saiu do servidor, a mensagem fica');
select expect(jsonb_array_length(export_my_data()->'group_messages') = 3, 'exportação traz as mensagens escritas');

-- Quem se põe no grupo (a administração, a equipe da sala) lê só dali em diante, e a entrada aparece para todos.
select act_as('00000000-0000-4000-8000-000000000007');
select add_member_by_email(group_id('Ética'), 'eva@example.invalid', 'student');
select expect(jsonb_path_query_first(chat_messages(group_id('Ética'), null, null, false), '$.messages[*] ? (@.body == "Oi, turma")') is null, 'não lê o que veio antes');
do $$ begin perform report_message(msg_id('Oi, turma'), 'spam', ''); raise exception 'FALHA: denunciou o que não vê';
exception when insufficient_privilege then null; end $$;
do $$ begin perform send_message(group_id('Ética'), 'x', msg_id('Oi, turma'), null); raise exception 'FALHA: respondeu ao que não vê';
exception when invalid_parameter_value then null; end $$;
select act_as('00000000-0000-4000-8000-000000000004');
select expect(jsonb_path_query_first(chat_messages(group_id('Ética'), null, null, false), '$.messages[*] ? (@.kind == "joined")') is not null
  and (chat_messages(group_id('Ética'), null, null, false)->'messages'->-1->>'author') = '00000000-0000-4000-8000-000000000007', 'todos veem que a Eva entrou');

-- O trecho citado de quem a pessoa bloqueou também some.
select send_message(group_id('Ética'), 'segredo da Bia', null, null);
select act_as('00000000-0000-4000-8000-000000000007'); select send_message(group_id('Ética'), 'resposta da Eva', msg_id('segredo da Bia'), null);
select act_as('00000000-0000-4000-8000-000000000005'); select block_person('00000000-0000-4000-8000-000000000004', true);
create temporary table quoted as select jsonb_path_query_first(chat_messages(group_id('Ética'), null, null, false), '$.messages[*] ? (@.body == "resposta da Eva")') as card;
select expect((select card->'reply'->>'excerpt' = '' and (card->'reply'->>'blocked')::boolean from quoted), 'citação recolhida');
select block_person('00000000-0000-4000-8000-000000000004', false);

-- Resolver denúncia sem dizer o quê não passa.
select report_message(msg_id('resposta da Eva'), 'spam', '');
select act_as('00000000-0000-4000-8000-000000000007');
do $$ begin perform admin_resolve_report((admin_overview()->'reports'->0->>'id')::uuid, null); raise exception 'FALHA: resolveu sem decisão';
exception when invalid_parameter_value then null; end $$;

reset role;
select 'group chat ok';
