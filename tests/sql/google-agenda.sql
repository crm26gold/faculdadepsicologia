-- Google Agenda: cada pessoa alcança só a própria conexão; a renovação só existe cifrada e nunca aparece no
-- estado; uma atualização por vez, só quando a revisão mudou; revogada não reserva. Tudo é desfeito.
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
set local role authenticated;
select expect(public.google_agenda_state() is null, 'sem conexão, estado vazio');
select expect(public.google_agenda_claim(1, false) is null, 'sem conexão, nada a reservar');
select public.google_agenda_save('v1.cifra-aluno', 'aluno@group.calendar.google.com');
select expect(public.google_agenda_state()::text not like '%cifra%', 'o estado não carrega a renovação');
select expect((public.google_agenda_state()->>'events')::int = 0 and public.google_agenda_state()->>'synced_at' is null, 'conectado, ainda sem atualização');
select expect(public.google_agenda_claim(7, false)->>'calendar_id' = 'aluno@group.calendar.google.com', 'primeira atualização reserva');
select expect(public.google_agenda_claim(7, true) is null, 'outra atualização não começa enquanto uma está em andamento');
select expect((public.google_agenda_state()->>'syncing')::boolean, 'a tela vê a atualização em andamento');
select public.google_agenda_finish(7, 12, '', '');
select expect(public.google_agenda_claim(7, false) is null, 'revisão já copiada não reserva de novo');
select expect(public.google_agenda_claim(8, false) is not null, 'revisão nova reserva');
select public.google_agenda_finish(null, 12, 'partial', 'nova@group.calendar.google.com');
select expect(public.google_agenda_link()->>'calendar_id' = 'nova@group.calendar.google.com', 'agenda recriada fica guardada');
select expect(public.google_agenda_claim(8, false) is not null, 'atualização incompleta tenta de novo na mesma revisão');
select public.google_agenda_finish(null, 12, 'revoked', '');
select expect(public.google_agenda_claim(9, true) is null, 'conexão revogada não reserva nem pedindo');
select public.google_agenda_save('v1.cifra-nova', 'nova@group.calendar.google.com');
select expect(public.google_agenda_state()->>'problem' = '' and public.google_agenda_claim(9, false) is not null, 'reconectar limpa o problema');
do $$ begin perform public.google_agenda_save('', 'x'); raise exception 'FALHA: aceitou renovação vazia'; exception when check_violation then null; end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select expect(public.google_agenda_state() is null and public.google_agenda_link() is null, 'outra pessoa não vê a conexão');
select public.google_agenda_remove();
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select expect(public.google_agenda_link() is not null, 'remover de outra conta não apaga a minha');
do $$ begin perform 1 from private.google_agenda_links; raise exception 'FALHA: leu a tabela direto'; exception when insufficient_privilege then null; end $$;
select public.google_agenda_remove();
select expect(public.google_agenda_state() is null, 'desconectar apaga a conexão');
reset role;
set local role anon;
do $$ begin perform public.google_agenda_state(); raise exception 'FALHA: anônimo leu o estado'; exception when insufficient_privilege then null; end $$;
reset role;
rollback;
