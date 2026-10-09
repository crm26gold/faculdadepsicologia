-- Teste das funções usadas pela aplicação (formato das telas e ações), em Postgres local descartável.
-- Uso: psql -d <banco vazio> -v ON_ERROR_STOP=1 -f supabase/tests/multiusuario_api.sql
-- NUNCA executar no projeto remoto.
\set ON_ERROR_STOP 1
\set QUIET 1
\ir lib/supabase_stub.sql

insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', 'prof@example.invalid', '{"name": "Professora Ana"}'),
  ('00000000-0000-4000-8000-000000000003', 'lider@example.invalid', '{"full_name": "Líder Bia"}'),
  ('00000000-0000-4000-8000-000000000004', 'aluno@example.invalid', '{"full_name": "Aluno Caio"}'),
  ('00000000-0000-4000-8000-000000000005', 'grupo3@example.invalid', '{"full_name": "Duda"}');
create function public.part(part_title text) returns uuid language sql stable
as $$ select id from public.assignment_parts where assignment_id = current_setting('test.a1')::uuid and title = part_title $$;
grant execute on function public.expect(boolean, text), public.act_as(text), public.part(text) to authenticated;
set role authenticated;

-- Tela inicial de quem acabou de entrar: conta acadêmica, sem salas, termos pendentes.
select act_as('00000000-0000-4000-8000-000000000004');
select expect((app_home()->'account'->>'plan') = 'academic', 'home traz o plano');
select expect(jsonb_array_length(app_home()->'spaces') = 0, 'conta nova sem salas');
select expect(jsonb_array_length(app_home()->'consents') = 0, 'termos ainda não aceitos');
select expect((app_home()->'settings'->>'open_access')::boolean, 'piloto começa liberado');
select accept_terms('2026-09-30');
select accept_terms('2026-09-30');
select expect(jsonb_array_length(app_home()->'consents') = 2, 'aceite registra termos e privacidade uma vez');
select update_my_name('  Caio Souza  ');
select expect((app_home()->'account'->>'display_name') = 'Caio Souza', 'nome exibido editável');
do $$ begin perform admin_overview(); raise exception 'FALHA: aluno abriu painel master';
exception when insufficient_privilege then null; end $$;

-- Master monta a estrutura e nomeia a professora.
select act_as('00000000-0000-4000-8000-00000000000a');
select set_config('test.unip', create_space('institution', 'UNIP', null, 'Campus', 'blue')::text, false);
select set_config('test.c1', create_space('class', 'Psicologia 1º semestre', current_setting('test.unip')::uuid, '', 'sage')::text, false);
select add_member_by_email(current_setting('test.c1')::uuid, 'prof@example.invalid', 'teacher');
select expect(jsonb_array_length(admin_overview()->'accounts') = 6, 'master vê todas as contas');
select expect(jsonb_array_length(admin_overview()->'audit') = 2, 'histórico com instituição e professora');
select expect(jsonb_array_length(app_home()->'spaces') = 0, 'master não é membro: home sem salas');

-- Professora cria grupos, convite e publica no mural.
select act_as('00000000-0000-4000-8000-000000000001');
select expect(jsonb_array_length(app_home()->'spaces') = 1, 'professora vê a sala na home');
select set_config('test.g1', create_space('group', 'Grupo 1', current_setting('test.c1')::uuid, '', 'lavender')::text, false);
select set_config('test.g3', create_space('group', 'Grupo 3', current_setting('test.c1')::uuid, '', 'sand')::text, false);
select add_member_by_email(current_setting('test.g1')::uuid, 'lider@example.invalid', 'leader');
select add_member_by_email(current_setting('test.g1')::uuid, 'aluno@example.invalid', 'student');
select add_member_by_email(current_setting('test.g3')::uuid, 'grupo3@example.invalid', 'student');
select create_invitation(current_setting('test.c1')::uuid, 'student', encode(extensions.digest('token-de-convite-da-sala-01', 'sha256'), 'hex'), 7, 60);
do $$ begin perform create_invitation(current_setting('test.c1')::uuid, 'student', repeat('b', 64), 90, 60); raise exception 'FALHA: validade longa';
exception when invalid_parameter_value then null; end $$;
select create_post(current_setting('test.c1')::uuid, 'announcement', 'Prova dia 10', 'Capítulos 1 a 3', null, '2026-10-10', true);
select create_poll(current_setting('test.c1')::uuid, 'Revisão extra?', array['Sim', 'Não'], null);
select set_config('test.works', array_to_string(create_assignments(
  array[current_setting('test.g1')::uuid, current_setting('test.g3')::uuid], 'Direitos Humanos', 'Ética',
  'Use o modelo enviado.', 'ABNT', '{"font": "Arial", "size": 12, "spacing": 1.5, "align": "justify"}', '2026-10-20',
  array['Introdução', 'Desenvolvimento', 'Conclusão']), ','), false);
select expect((select count(*) from assignments) = 2, 'um trabalho por grupo');
select expect((select count(distinct batch_id) from assignments) = 1, 'trabalhos do mesmo lote ligados');
select expect((select count(*) from assignment_parts) = 6, 'partes criadas com o trabalho');
select expect(jsonb_array_length(space_overview(current_setting('test.c1')::uuid)->'groups') = 2, 'professora vê os dois grupos');
select expect(jsonb_array_length(space_overview(current_setting('test.c1')::uuid)->'assignments') = 2, 'professora vê os dois trabalhos');
select expect(jsonb_array_length(space_overview(current_setting('test.c1')::uuid)->'invitations') = 1, 'professora vê o convite');
select expect(jsonb_array_length(space_overview(current_setting('test.c1')::uuid)->'people') >= 5, 'pessoas da sala');

-- Aluno do grupo 1: vê a sala, o próprio grupo e só o próprio trabalho.
select act_as('00000000-0000-4000-8000-000000000004');
select expect(jsonb_array_length(app_home()->'spaces') = 2, 'aluno vê sala e grupo');
select expect(jsonb_array_length(space_overview(current_setting('test.c1')::uuid)->'groups') = 1, 'aluno vê só o próprio grupo');
select expect(jsonb_array_length(space_overview(current_setting('test.c1')::uuid)->'assignments') = 1, 'aluno vê só o trabalho do grupo');
select expect(jsonb_array_length(space_overview(current_setting('test.c1')::uuid)->'invitations') = 0, 'aluno não vê convites');
select expect((space_overview(current_setting('test.c1')::uuid)->'access'->>'can_lead')::boolean = false, 'aluno não conduz a sala');
select expect((space_overview(current_setting('test.c1')::uuid)->'path'->0->>'name') = 'UNIP', 'caminho começa na instituição');
select vote((select id from polls), 0);
select expect((space_overview(current_setting('test.c1')::uuid)->'polls'->0->>'my_vote')::int = 0, 'enquete mostra o voto da pessoa');
select expect((space_overview(current_setting('test.c1')::uuid)->'polls'->0->'results'->0->>'votes')::int = 1, 'enquete mostra totais');
select set_config('test.a1', (select id::text from assignments), false);
do $$ begin perform assignment_detail((string_to_array(current_setting('test.works'), ','))[2]::uuid); raise exception 'FALHA: trabalho de outro grupo';
exception when no_data_found then null; end $$;

-- Líder distribui as partes; aluno escreve e entrega; professora pede revisão.
select act_as('00000000-0000-4000-8000-000000000003');
select expect((assignment_detail(current_setting('test.a1')::uuid)->'access'->>'can_lead')::boolean, 'líder conduz o trabalho do grupo');
select update_part_meta(part('Introdução'), 'Introdução', '00000000-0000-4000-8000-000000000003', '', 0);
select update_part_meta(part('Desenvolvimento'), 'Desenvolvimento', '00000000-0000-4000-8000-000000000004', '', 1);
select update_part_meta(part('Conclusão'), 'Conclusão', null, 'Colega sem conta', 2);
select add_part(current_setting('test.a1')::uuid, 'Referências', null, '');
select expect((select position from assignment_parts where id = part('Referências')) = 3, 'nova parte vai para o fim');
select delete_part(part('Referências'));
select save_part(part('Conclusão'),
  '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Texto enviado pela colega."}]}]}', 'submitted');

select act_as('00000000-0000-4000-8000-000000000004');
select expect(jsonb_array_length(app_home()->'my_parts') = 1, 'aluno vê a parte pendente dele');
select save_part(part('Desenvolvimento'),
  '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Rascunho."}]}]}', null);
select expect((select status from assignment_parts where id = part('Desenvolvimento')) = 'pending', 'salvar sem entregar mantém rascunho');
select save_part(part('Desenvolvimento'), null, 'submitted');
do $$ begin perform save_part(part('Introdução'), '{"type": "doc", "content": []}', null); raise exception 'FALHA: editou parte alheia';
exception when insufficient_privilege then null; end $$;
do $$ begin perform update_part_meta(part('Desenvolvimento'), 'Outro', '00000000-0000-4000-8000-000000000004', '', 1); raise exception 'FALHA';
exception when insufficient_privilege then null; end $$;
select add_comment(part('Desenvolvimento'), 'comment', 'Terminei!');
do $$ begin perform add_comment(part('Desenvolvimento'), 'revision_request', 'x'); raise exception 'FALHA';
exception when insufficient_privilege then null; end $$;

select act_as('00000000-0000-4000-8000-000000000001');
select expect(jsonb_array_length(app_home()->'to_review') = 2, 'professora vê entregas para revisar');
select add_comment(part('Desenvolvimento'), 'revision_request', 'Cite a fonte.');
select expect(jsonb_array_length(assignment_detail(current_setting('test.a1')::uuid)->'comments') = 2, 'comentários no detalhe');
select resolve_comment((select id from part_comments where kind = 'comment'));
select save_part(part('Conclusão'), null, 'approved');
select expect((assignment_detail(current_setting('test.a1')::uuid)->'parts'->2->>'status') = 'approved', 'partes em ordem com estado');
select update_assignment(current_setting('test.a1')::uuid, 'Direitos Humanos', 'Ética', 'Use o modelo enviado.', 'ABNT',
  '{"font": "Times New Roman", "size": 12, "spacing": 2}', '2026-10-21', 'open');

select act_as('00000000-0000-4000-8000-000000000004');
select expect((select status from assignment_parts where id = part('Desenvolvimento')) = 'needs_revision', 'revisão pedida');
select expect(jsonb_array_length(app_home()->'my_parts') = 1, 'parte em revisão continua na lista');
do $$ begin perform update_assignment(current_setting('test.a1')::uuid, 'X', '', '', '', '{}', null, 'delivered'); raise exception 'FALHA: aluno alterou o trabalho';
exception when insufficient_privilege then null; end $$;

-- Contatos e portabilidade.
select save_contact(null, 'Colega sem conta', 'colega@example.invalid', '', '2000-05-01', 'Grupo de estudos');
select expect(jsonb_array_length(list_contacts()) = 1, 'contato salvo');
select save_contact((list_contacts()->0->>'id')::uuid, 'Colega renomeada', '', '', null, '');
select expect((list_contacts()->0->>'name') = 'Colega renomeada', 'contato editado');
select expect((export_my_data()->'account'->>'email') = 'aluno@example.invalid', 'exportação traz a conta');
select expect(jsonb_array_length(export_my_data()->'parts') = 1, 'exportação traz a parte do trabalho');
select expect(jsonb_array_length(export_my_data()->'votes') = 1, 'exportação traz o voto');
select expect(jsonb_array_length(export_my_data()->'memberships') = 2, 'exportação traz as salas');

select act_as('00000000-0000-4000-8000-000000000005');
select expect(jsonb_array_length(list_contacts()) = 0, 'contatos alheios invisíveis');
do $$ begin perform delete_contact((select id from contacts limit 1)); raise exception 'FALHA';
exception when insufficient_privilege then null; end $$;
do $$ begin perform update_space(current_setting('test.c1')::uuid, 'Sala hackeada', '', 'rose'); raise exception 'FALHA: aluna renomeou a sala';
exception when insufficient_privilege then null; end $$;

-- Sair da sala tira a pessoa também dos grupos.
select remove_member(current_setting('test.c1')::uuid, auth.uid());
select expect(jsonb_array_length(app_home()->'spaces') = 0, 'saiu da sala e do grupo');

-- Master arquiva e reabre; professora exclui o trabalho do grupo 3.
select act_as('00000000-0000-4000-8000-000000000001');
select archive_space(current_setting('test.g3')::uuid, true);
select archive_space(current_setting('test.g3')::uuid, false);
select delete_assignment((string_to_array(current_setting('test.works'), ','))[2]::uuid);
select expect((select count(*) from assignments) = 1, 'trabalho excluído');

-- IA: só o proprietário configura e usa; a chave cifrada nunca volta pelo painel.
select expect(ai_runtime('assistente') is null, 'master que não é proprietário não usa a IA do piloto');
do $$ begin perform ai_admin_state(); raise exception 'FALHA: master comum viu a configuração de IA';
exception when insufficient_privilege then null; end $$;
do $$ begin perform ai_save_task('assistente', 'gemini', 'x', true); raise exception 'FALHA: master comum mudou a IA';
exception when insufficient_privilege then null; end $$;
do $$ begin perform ai_provider_runtime('gemini'); raise exception 'FALHA: master comum obteve a chave cifrada';
exception when insufficient_privilege then null; end $$;
do $$ begin perform count(*) from ai_providers; raise exception 'FALHA: tabela de provedores legível';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-00000000000a');
select ai_save_provider('gemini', true, '', '', '', '', 'v1.chave-cifrada', '1234');
select ai_save_task('assistente', 'gemini', 'modelo-de-teste', true);
select expect(ai_runtime('assistente') is null,'Gemini fixo sem declaração paga não recebe dados pessoais');
select ai_set_member_base_source('gemini',null,'paid');
select ai_save_task('assistente', 'gemini', 'modelo-de-teste', true);
select expect((select p->>'has_key' from jsonb_array_elements(ai_admin_state()->'providers') p where p->>'id' = 'gemini') = 'true', 'painel sabe que há chave');
select expect(ai_admin_state()::text not like '%chave-cifrada%', 'painel nunca recebe a chave');
select expect(ai_runtime('assistente')->>'key_ciphertext' = 'v1.chave-cifrada' and ai_runtime('assistente')->>'model' = 'modelo-de-teste', 'servidor obtém a configuração da tarefa');
select ai_save_provider('gemini', true, 'Gemini', '', '', '', null, null);
select expect(ai_runtime('assistente')->>'key_ciphertext' = 'v1.chave-cifrada', 'salvar sem chave mantém a chave');
select expect(ai_runtime('organizar') is null, 'tarefa desligada não roda');
select expect(ai_provider_runtime('gemini')->>'key_ciphertext' = 'v1.chave-cifrada', 'proprietário testa o provedor');
select set_config('test.ai.reserve', ai_save_connection(null,'gemini','Reserva sintética',false,1,'v1.reserva-cifrada','5678')::text,false);
select expect((ai_connection_runtime(current_setting('test.ai.reserve')::uuid)->>'key_ciphertext')='v1.reserva-cifrada','proprietário verifica reserva desligada somente no servidor');
select expect(jsonb_array_length(ai_runtime('assistente')->'alternatives')=0,'reserva desligada não participa');
select ai_save_connection(current_setting('test.ai.reserve')::uuid,'gemini','Reserva sintética',true,1,null,null);
select expect(jsonb_array_length(ai_runtime('assistente')->'alternatives')=0,'reserva Gemini sem declaração paga não recebe dados');
select ai_set_member_base_source('gemini',current_setting('test.ai.reserve')::uuid,'paid');
select expect(ai_runtime('assistente')->'alternatives'->0->>'key_ciphertext'='v1.reserva-cifrada','reserva ligada disponível só para servidor');
select expect(ai_admin_state()::text not like '%reserva-cifrada%','painel da reserva não expõe conteúdo cifrado');
do $$ begin perform private.ai_task_config('assistente'); raise exception 'FALHA: função interna aberta ao cliente'; exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000001');
do $$ begin perform ai_save_connection(null,'gemini','Inválida',true,2,'v1.não-autorizada',''); raise exception 'FALHA: não-proprietário criou reserva'; exception when insufficient_privilege then null; end $$;
do $$ begin perform ai_remove_connection(current_setting('test.ai.reserve')::uuid); raise exception 'FALHA: não-proprietário removeu reserva'; exception when insufficient_privilege then null; end $$;
do $$ begin perform ai_connection_runtime(current_setting('test.ai.reserve')::uuid); raise exception 'FALHA: não-proprietário leu credencial de reserva'; exception when insufficient_privilege then null; end $$;
select expect(ai_runtime('assistente') is null,'reservas não abrem IA para outra conta');
select act_as('00000000-0000-4000-8000-00000000000a');
select ai_remove_connection(current_setting('test.ai.reserve')::uuid);
select expect(jsonb_array_length(ai_runtime('assistente')->'alternatives')=0,'remoção revoga reserva');
select ai_save_provider('gemini', false, '', '', '', '', null, null);
select expect(ai_runtime('assistente') is null, 'provedor desligado não roda');
do $$ begin perform ai_save_provider('gemini', true, '', 'http://inseguro.example', '', '', null, null); raise exception 'FALHA: aceitou endereço sem https';
exception when check_violation then null; end $$;
select expect((select count(*) from admin_audit_log where action = 'ai_provider' and details::text not like '%chave-cifrada%') >= 3, 'histórico registra sem a chave');

-- Conexões independentes, rota explícita e MCP: apenas o proprietário, sem segredos no painel.
select set_config('test.ai.independent',ai_save_connection_details(null,'compatible','Endpoint próprio',true,1,'v1.independente','9876','https://api.example.invalid/v1','projeto-dois','global')::text,false);
select set_config('test.ai.alternative',ai_save_connection_details(null,'anthropic','Claude alternativa',true,1,'v1.claude','7654','','','')::text,false);
select ai_save_route('assistente','compatible',current_setting('test.ai.independent')::uuid,'modelo-principal',true,'fallback',jsonb_build_array(jsonb_build_object('connection_id',current_setting('test.ai.alternative'),'model','claude-teste')));
select expect(ai_runtime('assistente')->>'key_ciphertext'='v1.independente','conexão funciona mesmo sem chave principal da empresa');
select expect(ai_runtime('assistente')->>'base_url'='https://api.example.invalid/v1','endpoint pertence à conexão selecionada');
select expect(ai_runtime('assistente')->'alternatives'->0->>'provider'='anthropic' and ai_runtime('assistente')->'alternatives'->0->>'model'='claude-teste','alternativa autorizada usa empresa e modelo próprios');
select expect(ai_admin_state()::text not like '%v1.independente%' and ai_admin_state()::text not like '%v1.claude%','nenhuma chave cifrada no painel ampliado');
do $$ begin perform ai_save_route('voz','gemini',null,'auto:rapido',true,'fallback',jsonb_build_array(jsonb_build_object('connection_id',current_setting('test.ai.alternative'),'model','claude-teste'))); raise exception 'FALHA: voz aceitou transporte de texto'; exception when invalid_parameter_value then null; end $$;
-- ElevenLabs: só voz, com o LLM do agente; nunca como texto ou alternativa de texto.
-- A tarefa voz vem de 20261003173200_assistant_continuity, fora deste stub: mesmo passo de produção.
reset role;
alter table public.ai_tasks drop constraint ai_tasks_id_check;
alter table public.ai_tasks add constraint ai_tasks_id_check check (id in ('assistente','organizar','voz'));
insert into public.ai_tasks(id) values ('voz') on conflict (id) do nothing;
set role authenticated;
select set_config('test.ai.eleven',ai_save_connection_details(null,'elevenlabs','ElevenLabs teste',true,1,'v1.eleven','abcd','','','')::text,false);
select ai_save_route('voz','elevenlabs',current_setting('test.ai.eleven')::uuid,'auto:rapido',true,'fixed','[]');
select expect(ai_runtime('voz')->>'provider'='elevenlabs' and ai_runtime('voz')->>'key_ciphertext'='v1.eleven','voz usa a conexão ElevenLabs');
select ai_save_route('voz','elevenlabs',current_setting('test.ai.eleven')::uuid,'gemini-2.5-flash',true,'fixed','[]');
-- Automático: voz preserva transporte escolhido; texto ordena todas as chaves elegíveis.
select ai_save_provider('gemini', true, '', '', '', '', 'v1.gemini-auto', '1111');
select ai_save_route('voz','elevenlabs',current_setting('test.ai.eleven')::uuid,'auto:rapido',true,'auto','[]');
select expect(ai_runtime('voz')->>'routing'='auto' and ai_runtime('voz')->>'provider'='elevenlabs','voz automática começa pela escolhida');
select expect(not(ai_runtime('voz')::text like '%gemini%'),'Gemini sem declaração de API paga não participa automaticamente');
select ai_set_member_base_source('gemini',null,'paid');
select expect(ai_runtime('voz')->'alternatives'->0->>'provider'='gemini' and ai_runtime('voz')->'alternatives'->0->>'model'='auto:rapido','voz automática tenta Gemini em seguida');
select expect(not (ai_runtime('voz')->'alternatives')::text ~ '(anthropic|compatible|v1\.eleven)','voz automática não usa texto nem repete a escolhida');
select ai_save_route('assistente','compatible',current_setting('test.ai.independent')::uuid,'modelo-principal',true,'auto','[]');
select expect(ai_runtime('assistente')->>'provider'='gemini','texto automático ordena também a escolhida pela recomendação');
select expect(ai_runtime('assistente')->'alternatives'->0->>'provider'='anthropic' and ai_runtime('assistente')->'alternatives'->1->>'key_ciphertext'='v1.independente','endpoint escolhido permanece disponível após empresas automáticas');
select expect(ai_runtime('assistente')->'alternatives'->0->>'model'='auto:rapido','empresa automática escolhe o próprio modelo');
select expect(not (ai_runtime('assistente')->'alternatives')::text like '%elevenlabs%','texto automático nunca usa ElevenLabs');
select set_config('test.ai.groq',ai_save_connection_details(null,'groq','Groq gratuita',true,1,'v1.groq','2222','','','')::text,false);
select expect(ai_runtime('assistente')->'alternatives'->0->>'provider'='groq' and ai_runtime('assistente')->'alternatives'->1->>'provider'='anthropic','economia: Groq antes de Anthropic e endpoint próprio');
select ai_save_route('assistente','anthropic',current_setting('test.ai.alternative')::uuid,'claude-teste',true,'auto','[]');
select expect(ai_runtime('assistente')->>'provider'='gemini' and ai_runtime('assistente')->'alternatives'->0->>'provider'='groq' and ai_runtime('assistente')->'alternatives'->1->>'provider'='anthropic','chave paga selecionada não contorna a ordem automática');
select expect(ai_runtime('assistente')->'alternatives'->1->>'model'='claude-teste','modelo explícito da conexão selecionada é preservado');
select ai_save_route('assistente','compatible',current_setting('test.ai.independent')::uuid,'modelo-principal',true,'auto','[]');
select ai_remove_connection(current_setting('test.ai.groq')::uuid);
-- A changed credential cannot inherit a paid-API declaration from its previous ciphertext.
select ai_save_provider('gemini',true,'','','','','v1.gemini-replaced','3333');
select expect(not(ai_runtime('voz')::text like '%gemini%'),'trocar chave invalida elegibilidade Gemini automática');
select ai_set_member_base_source('gemini',null,'paid');
select expect(ai_runtime('voz')->'alternatives'->0->>'provider'='gemini','nova declaração presa à chave atual reabilita Gemini');
select ai_set_member_base_source('gemini',null,null);
-- xAI is a native live transport; Groq's text models are not advertised as realtime voice.
select set_config('test.ai.xai',ai_save_connection_details(null,'xai','Voz Grok',true,1,'v1.xai-live','4444','','','')::text,false);
select ai_save_route('voz','xai',current_setting('test.ai.xai')::uuid,'grok-voice-latest',true,'fixed','[]');
select expect(ai_runtime('voz')->>'provider'='xai' and ai_runtime('voz')->>'model'='grok-voice-latest','rota fixa suporta voz nativa xAI');
select ai_save_route('voz','xai',current_setting('test.ai.xai')::uuid,'grok-voice-think-fast-2.0',true,'fixed','[]');
select expect(ai_runtime('voz')->>'model'='grok-voice-think-fast-2.0','rota fixa aceita o modelo xAI Voice documentado');
select ai_save_route('voz','xai',current_setting('test.ai.xai')::uuid,'auto:rapido',true,'fixed','[]');
do $$ begin perform ai_save_route('voz','xai',current_setting('test.ai.xai')::uuid,'grok-3',true,'fixed','[]'); raise exception 'FALHA: modelo texto Grok aceito para voz'; exception when invalid_parameter_value then null; end $$;
do $$ begin perform ai_save_route('voz','groq',null,'auto:rapido',true,'fixed','[]'); raise exception 'FALHA: Groq anunciada como voz realtime'; exception when invalid_parameter_value then null; end $$;
select ai_save_route('voz','elevenlabs',current_setting('test.ai.eleven')::uuid,'auto:rapido',true,'auto','[]');
select expect(ai_runtime('voz')->'alternatives'->0->>'provider'='xai' and ai_runtime('voz')->'alternatives'->0->>'model'='grok-voice-latest','voz automática inclui xAI compatível depois da principal');
select ai_remove_connection(current_setting('test.ai.xai')::uuid);
select ai_save_route('assistente','compatible',current_setting('test.ai.independent')::uuid,'modelo-principal',true,'fixed','[]');
select expect(ai_runtime('assistente')->'routing'='"fixed"'::jsonb and jsonb_array_length(ai_runtime('assistente')->'alternatives')=0,'rota fixa continua sem alternativas');
select ai_save_provider('gemini', false, '', '', '', '', null, null);
do $$ begin perform ai_save_route('voz','elevenlabs',current_setting('test.ai.eleven')::uuid,'custom-llm',true,'fixed','[]'); raise exception 'FALHA: voz aceitou LLM próprio sem endpoint'; exception when invalid_parameter_value then null; end $$;
do $$ begin perform ai_save_route('voz','elevenlabs',current_setting('test.ai.eleven')::uuid,'auto:rapido',true,'fallback',jsonb_build_array(jsonb_build_object('connection_id',current_setting('test.ai.alternative'),'model','claude-teste'))); raise exception 'FALHA: voz ElevenLabs aceitou alternativa de texto'; exception when invalid_parameter_value then null; end $$;
do $$ begin perform ai_save_route('assistente','elevenlabs',current_setting('test.ai.eleven')::uuid,'gemini-2.5-flash',true,'fixed','[]'); raise exception 'FALHA: texto aceitou ElevenLabs'; exception when invalid_parameter_value then null; end $$;
do $$ begin perform ai_save_route('assistente','compatible',current_setting('test.ai.independent')::uuid,'modelo-principal',true,'fallback',jsonb_build_array(jsonb_build_object('connection_id',current_setting('test.ai.eleven'),'model','gemini-2.5-flash'))); raise exception 'FALHA: texto aceitou alternativa ElevenLabs'; exception when invalid_parameter_value then null; end $$;
do $$ begin perform ai_save_route('voz','gemini',null,'gemini-2.5-flash',true,'fixed','[]'); raise exception 'FALHA: Gemini aceitou modelo sem Live'; exception when invalid_parameter_value then null; end $$;
select ai_save_route('voz','gemini',null,'auto:rapido',true,'fixed','[]');
select ai_remove_connection(current_setting('test.ai.eleven')::uuid);
select ai_save_route('assistente','compatible',current_setting('test.ai.independent')::uuid,'modelo-principal',true,'fixed','[]');
select expect(jsonb_array_length(ai_runtime('assistente')->'alternatives')=0,'rota fixa não inclui reservas implicitamente');
select ai_remove_connection(current_setting('test.ai.independent')::uuid);
select expect(ai_runtime('assistente') is null,'remoção pausa tarefa em vez de ativar outra chave silenciosamente');
select set_config('test.ai.mcp',ai_save_connector(null,'MCP teste','https://tools.example.invalid/mcp','2026-07-28',true,'v1.token-mcp','1234')::text,false);
select expect(ai_admin_state()::text not like '%token-mcp%','MCP não retorna token cifrado no painel');
select expect(ai_connector_runtime(current_setting('test.ai.mcp')::uuid)->>'key_ciphertext'='v1.token-mcp','proprietário testa token apenas pelo servidor');
do $$ begin perform count(*) from private.ai_connectors; raise exception 'FALHA: leitura direta do cofre MCP'; exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-000000000001');
do $$ begin perform ai_save_route('assistente','gemini',null,'x',true,'fixed','[]'); raise exception 'FALHA: outro usuário mudou rota'; exception when insufficient_privilege then null; end $$;
do $$ begin perform ai_connector_runtime(current_setting('test.ai.mcp')::uuid); raise exception 'FALHA: outro usuário leu token MCP'; exception when insufficient_privilege then null; end $$;
do $$ begin perform ai_save_connector(null,'Inválido','https://tools.example.invalid','2026-07-28',true,'x','x'); raise exception 'FALHA: outro usuário cadastrou MCP'; exception when insufficient_privilege then null; end $$;
do $$ begin perform ai_remove_connector(current_setting('test.ai.mcp')::uuid); raise exception 'FALHA: outro usuário excluiu MCP'; exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-00000000000a');
select ai_remove_connector(current_setting('test.ai.mcp')::uuid);
select ai_remove_connection(current_setting('test.ai.alternative')::uuid);
select ai_save_task('assistente','gemini','modelo-de-teste',true);

-- Mensageiros: só o proprietário configura; cada conta vincula seu próprio chat com código descartável.
select act_as('00000000-0000-4000-8000-000000000001');
do $$ begin perform messenger_admin_state(); raise exception 'FALHA: master comum viu os mensageiros';
exception when insufficient_privilege then null; end $$;
select messenger_create_code('telegram', repeat('a',64));
select expect(not (messenger_status()->>'owner')::boolean,'membro vincula seu chat sem virar administrador');
do $$ begin perform count(*) from messenger_settings; raise exception 'FALHA: configuração de mensageiros legível';
exception when insufficient_privilege then null; end $$;
select act_as('00000000-0000-4000-8000-00000000000a');
select messenger_save('telegram', true, 'jornada_bot', 'v1.token-cifrado', 'abcd', encode(extensions.digest('segredo-do-servidor-com-mais-de-32-caracteres', 'sha256'), 'hex'));
select expect(messenger_admin_state()::text not like '%token-cifrado%', 'painel nunca recebe o token');
select expect((messenger_admin_state()->>'server_ready')::boolean, 'segredo do servidor registrado');
select messenger_create_code('telegram', encode(extensions.digest('codigo-123', 'sha256'), 'hex'));
reset role;
set role anon;
do $$ begin perform bot_context('segredo-errado-com-mais-de-trinta-e-dois-caracteres', 'telegram', '555'); raise exception 'FALHA: robô aceitou segredo errado';
exception when insufficient_privilege then null; end $$;
do $$ begin perform private.bot_context('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555'); raise exception 'FALHA: anônimo chamou função privada';
exception when insufficient_privilege then null; end $$;
select expect(bot_settings('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram')->>'token_ciphertext' = 'v1.token-cifrado', 'robô obtém o token cifrado');
select expect(bot_context('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555') is null, 'conversa sem vínculo não vê nada');
select expect(not bot_link('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555', encode(extensions.digest('codigo-errado', 'sha256'), 'hex')), 'código errado não vincula');
select expect(bot_link('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555', encode(extensions.digest('codigo-123', 'sha256'), 'hex')), 'código certo vincula');
select expect(not bot_link('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '777', encode(extensions.digest('codigo-123', 'sha256'), 'hex')), 'código é de uso único');
select expect(bot_context('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555')->>'user_id' = '00000000-0000-4000-8000-00000000000a', 'conversa vinculada chega só à conta dona do código');
select expect(bot_log('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555', 'u1', 'user', 'gastei 50 no lanche', null), 'mensagem registrada');
select expect(not bot_log('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555', 'u1', 'user', 'gastei 50 no lanche', null), 'mensagem repetida do Telegram é ignorada');
select expect(jsonb_array_length(bot_context('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555')->'history') = 1, 'histórico curto disponível');
select expect(bot_save('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555',
  (bot_context('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555')->'workspace'->'data') || '{"tasks": []}',
  (bot_context('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555')->'workspace'->>'revision')::integer) > 0, 'robô salva o espaço da conta vinculada');
-- Conflito de revisão usa PT409: 40001 faria o PostgREST repetir a transação sem parar.
do $$ begin perform bot_save('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555', '{"version": "1", "subjects": [], "notes": [], "tasks": [], "sessions": []}', 1);
  raise exception 'FALHA: aceitou revisão antiga';
exception when sqlstate 'PT409' then null; end $$;
do $$ begin perform bot_save('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '999', '{"version": "1", "subjects": [], "notes": [], "tasks": [], "sessions": []}', 1);
  raise exception 'FALHA: robô salvou numa conversa sem vínculo';
exception when insufficient_privilege then null; end $$;
do $$ begin perform count(*) from messenger_messages; raise exception 'FALHA: anônimo leu mensagens';
exception when insufficient_privilege then null; end $$;
select expect(bot_unlink('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555'), 'desvincular pelo robô');
select expect(bot_context('segredo-do-servidor-com-mais-de-32-caracteres', 'telegram', '555') is null, 'depois de desvincular não vê nada');
reset role;
\ir ../../tests/sql/mcp-access.sql
\ir ../../tests/sql/mcp-confirmations.sql
\ir ../../tests/sql/mcp-oauth.sql
\ir ../../tests/sql/mcp-collective.sql
\ir ../../tests/sql/bot-collective.sql
\ir ../../tests/sql/personal-trash.sql
\ir ../../tests/sql/personal-modules.sql
\ir ../../tests/sql/mcp-activity.sql
\ir ../../tests/sql/ai-route-events.sql
\ir ../../tests/sql/workspace-conflicts.sql
\ir ../../tests/sql/jornada-request-limits.sql
\ir ../../tests/sql/jornada-global-budgets.sql
\ir ../../tests/sql/mcp-external-tools.sql
\ir ../../tests/sql/google-agenda.sql
\ir ../../tests/sql/reminders.sql
\ir ../../tests/sql/course-materials.sql
\echo 'OK: funções da aplicação passaram.'
