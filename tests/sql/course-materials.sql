-- Material dos cursos: cada pessoa vê e grava só o próprio material; um "o que a IA precisa saber" por lugar;
-- limites de tamanho e quantidade; o bucket só aceita o arquivo que o servidor preparou; busca em português sem
-- acento. Tudo é desfeito.
begin;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);
set local role authenticated;
insert into public.course_materials(id, course_id, kind, title, body) values
  ('c0000000-0000-4000-8000-000000000001', 'psicologia', 'texto', 'Regras de prova', 'A prova é dissertativa e vale 7 pontos.');
insert into public.course_material_chunks(material_id, position, text) values
  ('c0000000-0000-4000-8000-000000000001', 0, 'A prova é dissertativa. Beba água antes da prova.');
insert into public.course_materials(course_id, subject_id, kind, title, body) values ('psicologia', 'neuro', 'contexto', 'Contexto', 'Professora cobra a prática.');
do $$ begin insert into public.course_materials(course_id, subject_id, kind, title, body) values ('psicologia', 'neuro', 'contexto', 'Outro', 'x');
  raise exception 'FALHA: dois contextos no mesmo lugar'; exception when unique_violation then null; end $$;
insert into public.course_materials(course_id, kind, title, body) values ('psicologia', 'contexto', 'Contexto do curso', 'Graduação na UNIP.');
select expect((select count(*) from public.course_material_chunks where search @@ websearch_to_tsquery('public.jornada_pt', 'agua')) = 1, 'busca sem acento acha "água"');
select expect((select count(*) from public.course_material_chunks where search @@ websearch_to_tsquery('public.jornada_pt', 'provas dissertativas')) = 1, 'busca pela raiz das palavras');
do $$ begin insert into public.course_materials(course_id, kind, title, file_path, size) values ('psicologia', 'arquivo', 'Sem dono certo', 'x/y.pdf', 10);
  raise exception 'FALHA: aceitou caminho fora do formato'; exception when check_violation then null; end $$;
do $$ begin update public.course_materials set size = 1 where id = 'c0000000-0000-4000-8000-000000000001';
  raise exception 'FALHA: mudou o tamanho depois de criado'; exception when insufficient_privilege then null; end $$;

-- O bucket recebe só o arquivo que o servidor preparou, na pasta da própria conta.
insert into public.course_materials(id, course_id, kind, title, file_path, mime, size, status) values
  ('c0000000-0000-4000-8000-000000000002', 'psicologia', 'arquivo', 'Plano de ensino.pdf',
   '00000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-000000000002.pdf', 'application/pdf', 1000, 'enviando');
insert into storage.objects(bucket_id, name) values ('course-materials', '00000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-000000000002.pdf');
do $$ begin insert into storage.objects(bucket_id, name) values ('course-materials', '00000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-000000000009.pdf');
  raise exception 'FALHA: aceitou arquivo não preparado'; exception when insufficient_privilege then null; end $$;

-- Limite de 200 MB por conta (a lixeira conta).
do $$ declare i integer; begin
  for i in 1..7 loop
    insert into public.course_materials(course_id, kind, title, file_path, size) values ('psicologia', 'arquivo', 'Grande ' || i,
      '00000000-0000-4000-8000-00000000000a/' || gen_random_uuid() || '.pdf', 26214400);
  end loop;
  insert into public.course_materials(course_id, kind, title, file_path, size) values ('psicologia', 'arquivo', 'Passou do limite',
    '00000000-0000-4000-8000-00000000000a/' || gen_random_uuid() || '.pdf', 26214400);
  raise exception 'FALHA: passou de 200 MB'; exception when sqlstate 'PT413' then null; end $$;

-- Outra pessoa não vê nem grava no material do dono.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select expect((select count(*) from public.course_materials) = 0, 'não vê o material de outra pessoa');
select expect((select count(*) from public.course_material_chunks) = 0, 'nem os trechos');
do $$ begin insert into public.course_material_chunks(material_id, position, text) values ('c0000000-0000-4000-8000-000000000001', 1, 'invadido');
  raise exception 'FALHA: gravou trecho no material alheio'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into public.course_materials(owner_id, course_id, kind, title, body) values ('00000000-0000-4000-8000-00000000000a', 'psicologia', 'texto', 'Falso', 'x');
  raise exception 'FALHA: criou material em nome de outra pessoa'; exception when insufficient_privilege then null; end $$;
update public.course_materials set title = 'mexido' where id = 'c0000000-0000-4000-8000-000000000001';
delete from public.course_materials where id = 'c0000000-0000-4000-8000-000000000001';
do $$ begin insert into storage.objects(bucket_id, name) values ('course-materials', '00000000-0000-4000-8000-00000000000a/c0000000-0000-4000-8000-000000000002.pdf');
  raise exception 'FALHA: enviou arquivo para a pasta de outra pessoa'; exception when insufficient_privilege then null; end $$;
reset role;
select expect((select title from public.course_materials where id = 'c0000000-0000-4000-8000-000000000001') = 'Regras de prova', 'outra pessoa não altera nem apaga');
set local role anon;
do $$ begin perform count(*) from public.course_materials; raise exception 'FALHA: anônimo leu material';
exception when insufficient_privilege then null; end $$;
reset role;
rollback;
