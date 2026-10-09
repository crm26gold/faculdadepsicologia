-- Lembretes: o compromisso com "Avisar" vira lembrete por gatilho, qualquer que seja o caminho da gravação; a escada
-- avança pelo resultado do servidor; Feito para tudo; cada pessoa só vê e mexe nos próprios. Tudo é desfeito.
begin;
create function public.try_as(person text, call text) returns text language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', person, true); execute 'select ' || call; return 'ok';
exception when others then return sqlstate; end $$;
grant execute on function public.try_as(text, text) to authenticated, anon;
delete from public.messenger_links where user_id = '00000000-0000-4000-8000-000000000004';
insert into public.messenger_links(channel, chat_id, user_id) values ('telegram', 'rem-aluno', '00000000-0000-4000-8000-000000000004'),
  ('whatsapp', '5511999990000', '00000000-0000-4000-8000-000000000004');

-- 1. O gatilho: amanhã às 10:00, avisar 15 minutos antes, insistente.
insert into public.personal_tasks(owner_id, id, data, position) values ('00000000-0000-4000-8000-000000000004', 'rem-1',
  jsonb_build_object('id', 'rem-1', 'title', 'Dentista', 'date', to_char((now() at time zone 'America/Sao_Paulo') + interval '1 day', 'YYYY-MM-DD'),
    'time', '10:00', 'kind', 'Consulta', 'subjectId', '', 'done', false, 'minutes', 30, 'remind', jsonb_build_object('minutes', 15, 'level', 'insistente')), 0);
select expect((select status = 'agendado' and level = 'insistente' and title = 'Dentista' and event_at - due_at = interval '15 minutes'
  and to_char(event_at at time zone 'America/Sao_Paulo', 'HH24:MI') = '10:00' from private.reminders where task_id = 'rem-1'), 'compromisso com aviso vira lembrete no fuso de São Paulo');
-- Mudar o título não reinicia; mudar a hora reinicia.
update private.reminders set step = 1, status = 'avisando' where task_id = 'rem-1';
update public.personal_tasks set data = jsonb_set(data, '{title}', '"Dentista Dr. Ana"') where id = 'rem-1';
select expect((select step = 1 and title = 'Dentista Dr. Ana' from private.reminders where task_id = 'rem-1'), 'título novo mantém a escada');
update public.personal_tasks set data = jsonb_set(data, '{time}', '"11:00"') where id = 'rem-1';
select expect((select step = 0 and status = 'agendado' and to_char(event_at at time zone 'America/Sao_Paulo', 'HH24:MI') = '11:00' from private.reminders where task_id = 'rem-1'), 'hora nova recomeça a escada');
update public.personal_tasks set data = jsonb_set(data, '{done}', 'true') where id = 'rem-1';
select expect((select status = 'cancelado' and next_at is null from private.reminders where task_id = 'rem-1'), 'concluído cancela');
update public.personal_tasks set data = jsonb_set(data, '{done}', 'false') where id = 'rem-1';
select expect((select status = 'agendado' and next_at is not null from private.reminders where task_id = 'rem-1'), 'reaberto volta a avisar');
update public.personal_tasks set data = data || '{"remind": {"minutes": "x", "level": "gritando"}}' where id = 'rem-1';
select expect((select status = 'cancelado' from private.reminders where task_id = 'rem-1'), 'aviso inválido não quebra a gravação e cancela');
insert into public.personal_tasks(owner_id, id, data, position) values ('00000000-0000-4000-8000-000000000004', 'rem-velho',
  '{"id": "rem-velho", "title": "Antigo", "date": "2020-01-01", "time": "09:00", "remind": {"minutes": 0, "level": "suave"}}', 1);
select expect((select status = 'encerrado' and next_at is null from private.reminders where task_id = 'rem-velho'), 'compromisso antigo não dispara');
delete from public.personal_tasks where id = 'rem-velho';
select expect((select status = 'encerrado' from private.reminders where task_id = 'rem-velho'), 'apagar não ressuscita o que já acabou');

-- 2. A própria pessoa: teste, estado, aparelhos, canais extras.
select act_as('00000000-0000-4000-8000-000000000004');
set local role authenticated;
select expect(public.reminder_test('normal') is not null, 'teste cria um lembrete agora');
select expect(public.try_as('00000000-0000-4000-8000-000000000004', 'public.reminder_test(''normal'')') = 'PT429', 'um teste por minuto');
select expect(public.try_as('00000000-0000-4000-8000-000000000004', 'public.reminder_test(''alto'')') = '22023', 'escada desconhecida recusada');
select public.push_subscribe('https://push.example.invalid/aluno-1', repeat('p', 87), repeat('a', 22), 'Android');
select expect(jsonb_array_length(public.reminders_state()->'devices') = 1 and (public.reminders_state()->>'telegram')::boolean
  and (public.reminders_state()->>'whatsapp')::boolean, 'estado mostra aparelho e canais ligados');
select expect(public.reminders_state()::text not like '%push.example%', 'o estado não devolve o endereço do aparelho');
select expect(public.try_as('00000000-0000-4000-8000-000000000004', 'public.reminder_prefs_save(null, true, false)') = '22023', 'ligação pede celular');
select expect(public.try_as('00000000-0000-4000-8000-000000000004', 'public.reminder_prefs_save(''11999'', true, false)') = '23514', 'celular fora do formato');
select public.reminder_prefs_save('+5511999990000', true, true);

-- 3. O servidor: sem o segredo, nada; com ele, reserva o teste com os destinos.
reset role;
select expect(public.try_as('', 'public.reminders_claim(''errado'', null, 10)') = '42501', 'sem o segredo do servidor, nada');
select expect(not public.reminders_clock_ok('segredo-do-servidor-com-mais-de-32-caracteres', 'qualquer'), 'relógio desconhecido recusado');
create temporary table claimed as select value as item from jsonb_array_elements(public.reminders_claim('segredo-do-servidor-com-mais-de-32-caracteres', '00000000-0000-4000-8000-000000000004', 10));
select expect((select count(*) = 1 from claimed), 'só o teste venceu');
select expect((select item->>'telegram' = 'rem-aluno' and item->>'whatsapp' = '5511999990000' and jsonb_array_length(item->'push') = 1
  and not (item->>'owner')::boolean and item->>'email' = 'aluno@example.invalid' and item->>'phone' = '+5511999990000' from claimed), 'destinos da própria pessoa');
select expect(jsonb_array_length(public.reminders_claim('segredo-do-servidor-com-mais-de-32-caracteres', '00000000-0000-4000-8000-000000000004', 10)) = 0, 'reservado não sai duas vezes');
select public.reminders_finish('segredo-do-servidor-com-mais-de-32-caracteres', (select (item->>'id')::uuid from claimed), 0, '[{"channel": "telegram", "ok": true}]');
select expect((select status = 'avisando' and step = 1 and next_at > now() and claimed_at is null and jsonb_array_length(log) = 1
  from private.reminders where id = (select (item->>'id')::uuid from claimed)), 'normal: segundo aviso agendado');
select public.reminders_finish('segredo-do-servidor-com-mais-de-32-caracteres', (select (item->>'id')::uuid from claimed), 0, '[{"channel": "telegram", "ok": true}]');
select expect((select step = 1 and jsonb_array_length(log) = 1 from private.reminders where id = (select (item->>'id')::uuid from claimed)), 'resultado repetido não avança de novo');

-- 4. Feito para; Adiar recomeça em 10 minutos; outra pessoa não alcança.
select expect(public.try_as('00000000-0000-4000-8000-000000000003', format('public.reminder_ack(%L, ''feito'')', (select item->>'id' from claimed))) = 'P0002', 'outra pessoa não marca');
select expect(public.try_as('00000000-0000-4000-8000-000000000003', format('public.reminder_get(%L)', (select item->>'id' from claimed))) = 'ok'
  and (select public.reminder_get((select (item->>'id')::uuid from claimed)) is null from (select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true)) s), 'outra pessoa não lê');
select act_as('00000000-0000-4000-8000-000000000004');
select expect(public.reminder_ack((select (item->>'id')::uuid from claimed), 'adiar')->>'status' = 'agendado', 'adiar reagenda');
select expect((select step = 0 and next_at between now() + interval '9 minutes' and now() + interval '11 minutes' from private.reminders where id = (select (item->>'id')::uuid from claimed)), 'adiar: 10 minutos, do começo');
select expect(public.reminder_ack((select (item->>'id')::uuid from claimed), 'feito')->>'status' = 'visto', 'feito encerra');
select expect((select next_at is null from private.reminders where id = (select (item->>'id')::uuid from claimed)), 'feito: nada mais a enviar');

-- 5. Fila do WhatsApp: entra, a ponte retira, confirma; Feito antes do envio tira da fila.
select public.reminder_outbox_add('segredo-do-servidor-com-mais-de-32-caracteres', (select (item->>'id')::uuid from claimed), '5511999990000', 'Lembrete: Teste');
select expect(jsonb_array_length(public.reminder_outbox_take('segredo-do-servidor-com-mais-de-32-caracteres')) = 1, 'a ponte retira');
select expect(jsonb_array_length(public.reminder_outbox_take('segredo-do-servidor-com-mais-de-32-caracteres')) = 0, 'retirada não sai de novo antes de 2 minutos');
select public.reminder_outbox_sent('segredo-do-servidor-com-mais-de-32-caracteres', (select id from private.reminder_outbox limit 1));
select expect((select sent_at is not null from private.reminder_outbox limit 1), 'envio confirmado');
select public.push_drop('segredo-do-servidor-com-mais-de-32-caracteres', 'https://push.example.invalid/aluno-1');
select expect(not exists (select 1 from private.push_subscriptions where owner_id = '00000000-0000-4000-8000-000000000004'), 'aparelho recusado sai da lista');
rollback;
