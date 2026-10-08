-- Vida pessoal em tabelas: o documento remontado é igual ao gravado, cada módulo guarda as próprias linhas na ordem
-- da lista, só o que muda é regravado, a revisão e a lixeira continuam como antes e cada pessoa só lê o que é seu.
-- Tudo é desfeito no fim.
begin;
insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'modulos@example.invalid'), ('00000000-0000-4000-8000-0000000000e2', 'outra-modulos@example.invalid');

do $$
declare
  person constant uuid := '00000000-0000-4000-8000-0000000000e1';
  doc jsonb := '{"version":"1","editorGeneration":9,"term":{"start":"2026-08-01"},"profile":{"name":"Pessoa"},"finance":{"openingCents":10000,"openingDate":"2026-10-01"},
    "subjects":[{"id":"s1","name":"Ética"}],"tasks":[{"id":"t2","title":"Pagar a luz"},{"id":"t1","title":"Academia"}],
    "notes":[{"id":"n1","title":"Ideias","content":"<p>viagem de férias</p>"}],"sessions":[{"id":"f1","date":"2026-10-08","minutes":25}],"classes":[],
    "areas":[],"transactions":[{"id":"x1","description":"Luz","amountCents":18000}],"activeFocus":null}';
  back jsonb; edited jsonb; revision integer;
begin
  revision := private.workspace_store(person, doc, 0);
  back := private.workspace_document(person);
  perform expect(revision = 1, 'primeira gravação começa na revisão 1');
  perform expect(back = doc, 'o documento remontado é igual ao gravado: ' || back::text);
  perform expect(not back ? 'goals', 'lista opcional ausente continua ausente');
  perform expect(back->'areas' = '[]'::jsonb, 'lista opcional vazia continua vazia (sem cair nas áreas padrão)');
  perform expect((select array_agg(t.id order by t.position) from public.personal_tasks t where t.owner_id = person) = array['t2', 't1'], 'a ordem da lista é preservada');
  perform expect((select count(*) from public.personal_notes t where t.owner_id = person) = 1 and (select count(*) from public.personal_transactions t where t.owner_id = person) = 1,
    'cada módulo guarda as próprias linhas');
  perform expect((select settings->'finance'->>'openingCents' from public.personal_state where owner_id = person) = '10000', 'os campos únicos ficam no estado da conta');

  revision := private.workspace_store(person, doc, revision);
  perform expect(revision = 2 and (select max(t.version) from public.personal_tasks t where t.owner_id = person) = 1, 'gravar igual sobe a revisão e não mexe nas versões');
  edited := jsonb_set(doc, '{tasks,1,title}', '"Academia às 7h"');
  revision := private.workspace_store(person, edited, revision);
  perform expect((select t.version from public.personal_tasks t where t.owner_id = person and t.id = 't1') = 2
    and (select t.version from public.personal_tasks t where t.owner_id = person and t.id = 't2') = 1, 'só o registro alterado muda de versão');

  begin
    perform private.workspace_store(person, doc, 1);
    raise exception 'FALHA: gravação com revisão velha foi aceita';
  exception when sqlstate 'PT409' then null;
  end;

  revision := private.workspace_store(person, jsonb_set(edited, '{tasks}', '[{"id":"t2","title":"Pagar a luz"}]'), revision);
  perform expect(exists (select 1 from public.personal_trash t where t.owner_id = person and t.collection = 'tasks' and t.item_id = 't1' and t.item->>'title' = 'Academia às 7h'),
    'o que sai vai para a lixeira, inteiro');
  revision := private.workspace_store(person, edited, revision);
  perform expect(not exists (select 1 from public.personal_trash t where t.owner_id = person and t.item_id = 't1'), 'o que volta sai da lixeira');
  revision := private.workspace_store(person, jsonb_set(edited, '{sessions}', '[]'), revision);
  perform expect(not exists (select 1 from public.personal_trash t where t.owner_id = person and t.collection = 'sessions'), 'focos encerrados não vão para a lixeira, como antes');

  begin
    perform private.workspace_store(person, jsonb_set(edited, '{notes}', '[{"id":"n9"},{"id":"n9"}]'), revision);
    raise exception 'FALHA: aceitou ID repetido na mesma lista';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform private.workspace_store(person, jsonb_set(edited, '{editorGeneration}', '2'), revision);
    raise exception 'FALHA: editor antigo sobrescreveu o novo';
  exception when sqlstate 'PT409' then null;
  end;
  perform set_config('test.modules.revision', revision::text, true);
end $$;

-- A vista com o nome antigo: a dona lê o documento e as próprias linhas; ninguém mais lê ou grava direto.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e1', true);
select expect((select count(*) = 1 and bool_and(data->'tasks'->1->>'title' = 'Academia às 7h') from public.personal_workspaces), 'a dona lê o próprio documento pela vista');
select expect((select count(*) = 2 from public.personal_tasks), 'a dona lê as próprias linhas');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e2', true);
select expect(not exists (select 1 from public.personal_workspaces where owner_id = '00000000-0000-4000-8000-0000000000e1'), 'outra pessoa não lê o documento');
select expect(not exists (select 1 from public.personal_tasks where owner_id = '00000000-0000-4000-8000-0000000000e1'), 'outra pessoa não lê as linhas');
do $$ begin
  insert into public.personal_tasks(owner_id, id, data, position) values ('00000000-0000-4000-8000-0000000000e2', 'x', '{"id":"x"}', 1);
  raise exception 'FALHA: gravou direto na tabela do módulo';
exception when insufficient_privilege then null; end $$;
reset role;
set local role anon;
do $$ begin perform count(*) from public.personal_state; raise exception 'FALHA: anônimo leu o estado';
exception when insufficient_privilege then null; end $$;
reset role;

-- Quem ainda grava pela vista passa pelo mesmo caminho: revisão sobe e o que sai vai para a lixeira.
update public.personal_workspaces set data = jsonb_set(data, '{notes}', '[]'::jsonb) where owner_id = '00000000-0000-4000-8000-0000000000e1';
select expect((select revision from public.personal_workspaces where owner_id = '00000000-0000-4000-8000-0000000000e1') = current_setting('test.modules.revision')::integer + 1,
  'gravar pela vista sobe a revisão');
select expect(exists (select 1 from public.personal_trash where owner_id = '00000000-0000-4000-8000-0000000000e1' and item_id = 'n1'), 'apagar pela vista também guarda na lixeira');
do $$ begin
  insert into public.personal_workspaces(owner_id, data) values ('00000000-0000-4000-8000-0000000000e1', '{"version":"1","subjects":[],"notes":[],"tasks":[],"sessions":[]}');
  raise exception 'FALHA: criou um segundo espaço para a mesma conta';
exception when unique_violation then null; end $$;

-- A migração copiou o espaço que já existia e guardou o documento antigo.
select expect(exists (select 1 from public.personal_state where owner_id = '00000000-0000-4000-8000-00000000000a'), 'o espaço que já existia foi copiado para as tabelas');
select expect(exists (select 1 from private.personal_workspaces_legacy where owner_id = '00000000-0000-4000-8000-00000000000a'), 'o documento antigo fica preservado');
rollback;
