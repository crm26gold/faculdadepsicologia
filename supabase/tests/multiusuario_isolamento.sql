-- Teste de isolamento e permissões da fundação multiusuário, em Postgres local descartável.
-- Uso: psql -d <banco vazio> -v ON_ERROR_STOP=1 -f supabase/tests/multiusuario_isolamento.sql
-- Simula o mínimo do Supabase (auth, storage, papéis) e aplica TODAS as migrações em ordem.
-- NUNCA executar no projeto remoto.
\set ON_ERROR_STOP 1
\set QUIET 1
\ir lib/supabase_stub.sql

-- Contas antigas e novas.
select expect((select count(*) from private.personal_workspaces_backup_20260930) = 1, 'backup copia o workspace existente');
select expect((select array['video/mp4','video/webm','video/quicktime'] <@ allowed_mime_types and file_size_limit = 26214400 from storage.buckets where id = 'note-attachments'), 'anexos aceitam vídeos curtos sem aumentar o limite');
select expect((select is_master from accounts where user_id = '00000000-0000-4000-8000-00000000000a'), 'proprietário vira master');
select expect((select display_name from accounts where user_id = '00000000-0000-4000-8000-00000000000a') = 'Pessoa Master', 'nome vem do Google');
select expect((select display_name from accounts where user_id = '00000000-0000-4000-8000-00000000000b') = 'antiga', 'nome cai para o e-mail');
select expect(not (select is_master from accounts where user_id = '00000000-0000-4000-8000-00000000000b'), 'conta antiga comum não vira master');
insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000000001', 'prof.a@example.invalid'),
  ('00000000-0000-4000-8000-000000000002', 'prof.b@example.invalid'),
  ('00000000-0000-4000-8000-000000000003', 'lider@example.invalid'),
  ('00000000-0000-4000-8000-000000000004', 'aluna@example.invalid'),
  ('00000000-0000-4000-8000-000000000005', 'outro.grupo@example.invalid'),
  ('00000000-0000-4000-8000-000000000006', 'convidada@example.invalid');
select expect((select count(*) from accounts) = 8, 'cadastro cria conta automaticamente');
select expect((select plan from accounts where user_id = '00000000-0000-4000-8000-000000000006') = 'academic', 'conta nova é acadêmica');

grant execute on function public.expect(boolean, text), public.act_as(text) to authenticated;
set role authenticated;

-- Hierarquia: só o master cria instituição.
select act_as('00000000-0000-4000-8000-000000000001');
do $$ begin perform create_space('institution', 'Intrusa', null, '', 'sage'); raise exception 'FALHA: professor criou instituição';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-00000000000a');
select set_config('test.unip', create_space('institution', 'UNIP', null, '', 'blue')::text, false);
select set_config('test.c1', create_space('class', 'Psicologia 1º semestre', current_setting('test.unip')::uuid, '', 'sage')::text, false);
select set_config('test.c2', create_space('class', 'Sala do Professor B', current_setting('test.unip')::uuid, '', 'rose')::text, false);
do $$ begin perform create_space('group', 'Grupo na instituição', current_setting('test.unip')::uuid, '', 'sage'); raise exception 'FALHA: grupo fora de sala';
exception when invalid_parameter_value then null; end $$;
select expect((select count(*) from space_members) = 0, 'master não vira membro automaticamente');
select add_member_by_email(current_setting('test.c1')::uuid, 'PROF.A@example.invalid', 'teacher');
select add_member_by_email(current_setting('test.c2')::uuid, 'prof.b@example.invalid', 'teacher');
select expect((select count(*) from admin_audit_log where action = 'grant_space_role') = 2, 'atribuição de professor fica no histórico');

-- Professor A organiza a própria sala; professor B não entra nela.
select act_as('00000000-0000-4000-8000-000000000001');
select set_config('test.g1', create_space('group', 'Ética · Grupo 1', current_setting('test.c1')::uuid, '', 'lavender')::text, false);
select set_config('test.g3', create_space('group', 'Ética · Grupo 3', current_setting('test.c1')::uuid, '', 'sand')::text, false);
do $$ begin perform add_member_by_email(current_setting('test.c1')::uuid, 'prof.b@example.invalid', 'teacher'); raise exception 'FALHA: professor concedeu professor';
exception when insufficient_privilege then null; end $$;
select add_member_by_email(current_setting('test.g1')::uuid, 'lider@example.invalid', 'leader');
select add_member_by_email(current_setting('test.g1')::uuid, 'aluna@example.invalid', 'student');
select add_member_by_email(current_setting('test.g3')::uuid, 'outro.grupo@example.invalid', 'student');
select expect((select count(*) from space_members where space_id = current_setting('test.c1')::uuid and role = 'student') = 3, 'entrar no grupo inclui a sala');
do $$ begin perform add_member_by_email(current_setting('test.g1')::uuid, 'ninguem@example.invalid', 'student'); raise exception 'FALHA';
exception when no_data_found then null; end $$;
select expect((select count(*) from spaces) = 3, 'professor A vê a sala e os dois grupos, não a instituição');

select act_as('00000000-0000-4000-8000-000000000002');
select expect((select count(*) from spaces) = 1, 'professor B vê só a própria sala');
select expect((select name from spaces) = 'Sala do Professor B', 'professor B vê a sala dele');
do $$ begin perform create_space('group', 'Intruso', current_setting('test.c1')::uuid, '', 'sage'); raise exception 'FALHA: B criou grupo na sala de A';
exception when insufficient_privilege then null; end $$;
do $$ begin perform space_people(current_setting('test.c1')::uuid); raise exception 'FALHA: B listou pessoas da sala de A';
exception when insufficient_privilege then null; end $$;

-- Convite por link: token só existe no link, o banco guarda o hash.
select act_as('00000000-0000-4000-8000-000000000001');
insert into space_invitations(space_id, token_hash, expires_at, created_by)
values (current_setting('test.c1')::uuid, encode(extensions.digest('convite-secreto-da-sala-1', 'sha256'), 'hex'), now() + interval '7 days', auth.uid());
insert into space_invitations(space_id, token_hash, expires_at, created_by)
values (current_setting('test.c1')::uuid, encode(extensions.digest('convite-vencido-da-sala-1', 'sha256'), 'hex'), now() - interval '1 day', auth.uid());
select act_as('00000000-0000-4000-8000-000000000006');
do $$ begin perform accept_invitation('convite-vencido-da-sala-1'); raise exception 'FALHA: convite vencido aceito';
exception when invalid_parameter_value then null; end $$;
select expect(accept_invitation('convite-secreto-da-sala-1') = current_setting('test.c1')::uuid, 'convite leva para a sala');
select expect((select count(*) from spaces) = 1, 'convidada vê só a sala, sem grupos');
select expect((select role from space_members where user_id = auth.uid()) = 'student', 'convite dá papel de aluna');
do $$ begin insert into space_invitations(space_id, token_hash, expires_at, created_by)
  values (current_setting('test.c1')::uuid, repeat('a', 64), now() + interval '1 day', auth.uid()); raise exception 'FALHA: aluna criou convite';
exception when insufficient_privilege then null; end $$;

-- Pessoas: nomes para quem participa, e-mail só para quem gerencia.
select act_as('00000000-0000-4000-8000-000000000004');
select expect((select count(*) from space_people(current_setting('test.g1')::uuid) where email is not null) = 0, 'aluna não vê e-mails');
select expect((select count(*) from space_people(current_setting('test.g1')::uuid) where is_direct) = 2, 'grupo 1 tem duas pessoas diretas');
select act_as('00000000-0000-4000-8000-000000000001');
select expect((select count(*) from space_people(current_setting('test.g1')::uuid) where email is not null) >= 2, 'professor vê e-mails');

-- Trabalho em grupo conduzido pela líder do grupo 1.
select act_as('00000000-0000-4000-8000-000000000004');
do $$ begin insert into assignments(space_id, title, created_by) values (current_setting('test.g1')::uuid, 'Sem permissão', auth.uid()); raise exception 'FALHA: aluna criou trabalho';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000003');
insert into assignments(space_id, title, subject_name, instructions, doc_style, created_by)
values (current_setting('test.g1')::uuid, 'Direitos Humanos', 'Ética', 'Seguir o modelo da professora.', '{"font": "Times New Roman", "size": 12, "spacing": 1.5}', auth.uid());
do $$ begin insert into assignments(space_id, title, doc_style, created_by) values (current_setting('test.g1')::uuid, 'Estilo inválido', '{"font": "Comic Sans"}', auth.uid()); raise exception 'FALHA: estilo inválido aceito';
exception when check_violation then null; end $$;
select set_config('test.a1', (select id::text from assignments where title = 'Direitos Humanos'), false);
insert into assignment_parts(assignment_id, position, title, assignee_id) values
  (current_setting('test.a1')::uuid, 0, 'Introdução', '00000000-0000-4000-8000-000000000003'),
  (current_setting('test.a1')::uuid, 1, 'Declaração Universal', '00000000-0000-4000-8000-000000000004');
insert into assignment_parts(assignment_id, position, title, assignee_label) values (current_setting('test.a1')::uuid, 2, 'Conclusão', 'Colega sem conta');
do $$ begin insert into assignment_parts(assignment_id, title, assignee_id) values (current_setting('test.a1')::uuid, 'Fora do grupo', '00000000-0000-4000-8000-000000000005'); raise exception 'FALHA: parte para quem não é do grupo';
exception when invalid_parameter_value then null; end $$;

select act_as('00000000-0000-4000-8000-000000000004');
update assignment_parts set content = '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Minha parte."}]}]}', status = 'submitted'
 where title = 'Declaração Universal';
select expect((select submitted_by from assignment_parts where title = 'Declaração Universal') = '00000000-0000-4000-8000-000000000004', 'entrega registra quem enviou');
with changed as (update assignment_parts set content = '{"type": "doc", "content": []}' where title = 'Introdução' returning 1)
select expect((select count(*) from changed) = 0, 'aluna não edita a parte de outra pessoa');
do $$ begin update assignment_parts set status = 'approved' where title = 'Declaração Universal'; raise exception 'FALHA: aluna aprovou a própria parte';
exception when insufficient_privilege then null; end $$;
do $$ begin update assignment_parts set title = 'Outro título' where title = 'Declaração Universal'; raise exception 'FALHA: aluna renomeou a parte';
exception when insufficient_privilege then null; end $$;
do $$ begin insert into part_comments(part_id, author_id, kind, body) select id, auth.uid(), 'revision_request', 'Revise' from assignment_parts where title = 'Introdução'; raise exception 'FALHA: aluna pediu revisão';
exception when insufficient_privilege then null; end $$;
insert into part_comments(part_id, author_id, body) select id, auth.uid(), 'Posso ajudar na introdução?' from assignment_parts where title = 'Introdução';

select act_as('00000000-0000-4000-8000-000000000003');
update assignment_parts set status = 'submitted' where title = 'Conclusão';
select expect((select submitted_by from assignment_parts where title = 'Conclusão') = '00000000-0000-4000-8000-000000000003', 'líder entrega em nome de quem não usa o sistema');

-- Outro grupo não vê nada do grupo 1; o professor vê e pede revisão.
select act_as('00000000-0000-4000-8000-000000000005');
select expect((select count(*) from assignments) = 0, 'grupo 3 não vê trabalhos do grupo 1');
select expect((select count(*) from assignment_parts) = 0, 'grupo 3 não vê partes do grupo 1');
select expect((select count(*) from part_comments) = 0, 'grupo 3 não vê comentários do grupo 1');
select expect((select count(*) from spaces where kind = 'group') = 1, 'grupo 3 vê apenas o próprio grupo');
select act_as('00000000-0000-4000-8000-000000000002');
select expect((select count(*) from assignments) = 0, 'professor de outra sala não vê o trabalho');
select act_as('00000000-0000-4000-8000-000000000001');
select expect((select count(*) from assignment_parts) = 3, 'professor vê as partes do grupo');
insert into part_comments(part_id, author_id, kind, body) select id, auth.uid(), 'revision_request', 'Cite a fonte do artigo 1.' from assignment_parts where title = 'Declaração Universal';
select expect((select status from assignment_parts where title = 'Declaração Universal') = 'needs_revision', 'pedido de revisão devolve a parte');
select act_as('00000000-0000-4000-8000-000000000004');
update assignment_parts set status = 'submitted' where title = 'Declaração Universal';
select act_as('00000000-0000-4000-8000-000000000001');
update assignment_parts set status = 'approved' where title = 'Declaração Universal';
select expect((select submitted_by from assignment_parts where title = 'Declaração Universal') = '00000000-0000-4000-8000-000000000004', 'aprovação preserva autoria da entrega');

-- Mural e enquete com voto secreto.
insert into space_posts(space_id, author_id, kind, title, link_url) values (current_setting('test.c1')::uuid, auth.uid(), 'material', 'Vídeo da aula', 'https://example.invalid/video');
insert into polls(space_id, author_id, question, options) values (current_setting('test.c1')::uuid, auth.uid(), 'Melhor dia para revisão?', array['Segunda', 'Quarta']);
do $$ begin insert into polls(space_id, author_id, question, options) values (current_setting('test.c1')::uuid, auth.uid(), 'Uma opção só', array['Única']); raise exception 'FALHA: enquete com uma opção';
exception when check_violation then null; end $$;
select act_as('00000000-0000-4000-8000-000000000004');
do $$ begin insert into space_posts(space_id, author_id, kind, title) values (current_setting('test.c1')::uuid, auth.uid(), 'announcement', 'Aviso falso'); raise exception 'FALHA: aluna publicou no mural da sala';
exception when insufficient_privilege then null; end $$;
do $$ begin insert into space_posts(space_id, author_id, kind, title) values (current_setting('test.g1')::uuid, auth.uid(), 'announcement', 'Aviso'); raise exception 'FALHA: aluna publicou no mural do grupo';
exception when insufficient_privilege then null; end $$;
select vote((select id from polls), 0);
select vote((select id from polls), 1);
select expect((select option_index from poll_votes) = 1, 'voto pode ser trocado');
do $$ begin perform vote((select id from polls), 5); raise exception 'FALHA: opção inexistente';
exception when invalid_parameter_value then null; end $$;
select act_as('00000000-0000-4000-8000-000000000006');
select vote((select id from polls), 1);
select expect((select count(*) from poll_votes) = 1, 'cada pessoa vê só o próprio voto');
select expect((select votes from poll_results(current_setting('test.c1')::uuid) where option_index = 1) = 2, 'totais somam os votos');
select act_as('00000000-0000-4000-8000-000000000002');
do $$ begin perform vote((select id from polls limit 1), 0); raise exception 'FALHA: professor de outra sala votou';
exception when insufficient_privilege then null; end $$;

-- Caminho da sala para contexto (instituição > sala > grupo), só para quem vê o espaço.
select act_as('00000000-0000-4000-8000-000000000004');
select expect((select string_agg(name, ' > ' order by depth desc) from space_path(current_setting('test.g1')::uuid)) = 'UNIP > Psicologia 1º semestre > Ética · Grupo 1', 'caminho completo do grupo');
do $$ begin perform space_path(current_setting('test.g3')::uuid); raise exception 'FALHA: caminho de grupo alheio';
exception when insufficient_privilege then null; end $$;

-- Papéis: professor promove a líder, não a professor; ninguém se promove.
select act_as('00000000-0000-4000-8000-000000000001');
select set_member_role(current_setting('test.g1')::uuid, '00000000-0000-4000-8000-000000000004', 'leader');
do $$ begin perform set_member_role(current_setting('test.g1')::uuid, '00000000-0000-4000-8000-000000000004', 'teacher'); raise exception 'FALHA';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000003');
do $$ begin perform set_member_role(current_setting('test.g1')::uuid, '00000000-0000-4000-8000-000000000003', 'teacher'); raise exception 'FALHA: líder se promoveu';
exception when insufficient_privilege then null; end $$;
with removed as (delete from space_members where user_id = '00000000-0000-4000-8000-000000000001' returning 1)
select expect((select count(*) from removed) = 0, 'líder não remove o professor');

-- Contatos privados e espaço pessoal isolado.
select act_as('00000000-0000-4000-8000-000000000004');
insert into contacts(owner_id, name, birthdate) values (auth.uid(), 'Colega sem conta', '2000-05-01');
select expect(save_personal_workspace('{"version": "1", "subjects": [], "notes": [], "tasks": [], "sessions": []}', 0) = 1, 'conta nova cria o próprio espaço');
select expect((select count(*) from personal_workspaces) = 1, 'aluna vê só o próprio espaço');
select act_as('00000000-0000-4000-8000-000000000003');
select expect((select count(*) from contacts) = 0, 'contatos de outra pessoa são invisíveis');
select expect((select count(*) from personal_workspaces) = 0, 'espaço pessoal de outra pessoa é invisível');
insert into storage.objects(bucket_id, name) values ('note-attachments', '00000000-0000-4000-8000-000000000003/foto.jpg');
do $$ begin insert into storage.objects(bucket_id, name) values ('note-attachments', '00000000-0000-4000-8000-00000000000a/foto.jpg'); raise exception 'FALHA: anexo na pasta de outra pessoa';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-00000000000a');
select expect((select count(*) from storage.objects) = 0, 'anexo alheio é invisível até para o master');
select expect((select count(*) from personal_workspaces) = 1, 'master mantém o próprio espaço');
select expect((select count(*) from contacts) = 0, 'master não lê contatos de ninguém');

-- Administração: só o master altera planos e a abertura da plataforma, com histórico.
select act_as('00000000-0000-4000-8000-000000000006');
do $$ begin perform admin_update_account(auth.uid(), 'pro', 'courtesy', null, 10, '{}', true); raise exception 'FALHA: autopromoção';
exception when insufficient_privilege then null; end $$;
do $$ begin perform admin_set_open_access(false); raise exception 'FALHA';
exception when insufficient_privilege then null; end $$;
with changed as (update accounts set display_name = 'Nome escolhido' where true returning user_id)
select expect((select count(*) from changed) = 1, 'cada pessoa renomeia só a própria conta');
do $$ begin update accounts set is_master = true where user_id = auth.uid(); raise exception 'FALHA: coluna de poder editável';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-00000000000a');
select admin_update_account('00000000-0000-4000-8000-000000000006', 'pro', 'courtesy', null, 50, '{create_classes}', false);
do $$ begin perform admin_update_account(auth.uid(), 'pro', 'courtesy', null, 0, '{}', false); raise exception 'FALHA: master se rebaixou';
exception when insufficient_privilege then null; end $$;
select admin_set_open_access(false);
select expect((select count(*) from admin_audit_log where action in ('update_account', 'set_open_access')) = 2, 'histórico registra ações do master');
select expect((select count(*) from accounts) = 8, 'master lista todas as contas');

-- Exclusão de conta: sai o pessoal, fica a contribuição como ex-membro.
select act_as('00000000-0000-4000-8000-000000000001');
select set_member_role(current_setting('test.g1')::uuid, '00000000-0000-4000-8000-000000000004', 'student');
select act_as('00000000-0000-4000-8000-000000000004');
do $$ begin insert into private.trusted_transactions values (pg_current_xact_id()); raise exception 'FALHA: usuário ligou alteração interna';
exception when insufficient_privilege then null; end $$;
do $$ begin update assignment_parts set assignee_label = 'Ex-membro' where title = 'Declaração Universal'; raise exception 'FALHA: aluna mudou o responsável';
exception when insufficient_privilege then null; end $$;
select delete_my_account();
select act_as('00000000-0000-4000-8000-000000000001');
select expect((select assignee_label from assignment_parts where title = 'Declaração Universal') = 'Ex-membro', 'parte vira de ex-membro');
select expect((select assignee_id from assignment_parts where title = 'Declaração Universal') is null, 'vínculo com a conta removida');
select expect((select count(*) from part_comments where author_id is null) = 1, 'comentário permanece sem autoria');
reset role;
select expect((select count(*) from contacts) = 0, 'contatos da conta excluída saem juntos');
select expect((select count(*) from personal_workspaces where owner_id = '00000000-0000-4000-8000-000000000004') = 0, 'espaço pessoal excluído');
set role authenticated;
select act_as('00000000-0000-4000-8000-00000000000a');
do $$ begin perform delete_my_account(); raise exception 'FALHA: proprietário se excluiu';
exception when insufficient_privilege then null; end $$;

-- Anônimos não leem nada.
reset role;
set role anon;
do $$ begin perform count(*) from public.spaces; raise exception 'FALHA: anônimo leu espaços';
exception when insufficient_privilege then null; end $$;
reset role;
\echo 'OK: todos os cenários de isolamento e permissão passaram.'
