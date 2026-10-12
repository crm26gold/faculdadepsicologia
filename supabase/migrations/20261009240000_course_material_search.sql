-- Material dos cursos (etapa 2: estudar com o material). Uma busca só, em português sem acento, usada pelo
-- assistente do app, pela voz, pelo Telegram, pelo WhatsApp e pelos assistentes conectados (MCP). Prioridade:
-- a matéria pedida (ou a da aula do momento), depois o geral do curso, depois o resto. Devolve poucos trechos,
-- cada um com o arquivo, a página e o lugar, e o "o que a IA precisa saber" dos lugares envolvidos.
-- Cada porta chega à pessoa do seu jeito (login, chave do MCP, conversa vinculada) e nunca a outra conta.

create function private.material_search_for(person uuid, wanted text, course text, subject text, max integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q text := left(btrim(coalesce(wanted, '')), 300);
  exact tsquery; loose tsquery; contexts jsonb; found jsonb;
begin
  if person is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  max := least(greatest(coalesce(max, 6), 1), 10);
  -- "O que a IA precisa saber": do curso e da matéria pedidos; sem curso, de todos (os mais recentes).
  select coalesce(jsonb_agg(jsonb_build_object('course_id', m.course_id, 'subject_id', m.subject_id, 'texto', left(m.body, 1500))
    order by m.subject_id nulls first, m.updated_at desc), '[]'::jsonb) into contexts
  from (select * from public.course_materials m where m.owner_id = person and m.kind = 'contexto' and m.deleted_at is null
    and (course is null or (m.course_id = course and (m.subject_id is null or m.subject_id = subject))) order by m.updated_at desc limit 12) m;
  if q = '' then
    -- Sem busca: o que existe no lugar, para a pessoa saber o que está guardado.
    select coalesce(jsonb_agg(jsonb_build_object('material_id', m.id, 'title', m.title, 'course_id', m.course_id, 'subject_id', m.subject_id,
      'kind', m.kind, 'status', m.status, 'pages', m.pages, 'created_at', m.created_at) order by m.created_at desc), '[]'::jsonb) into found
    from (select * from public.course_materials m where m.owner_id = person and m.deleted_at is null and m.kind <> 'contexto' and m.status <> 'enviando'
      and (course is null or m.course_id = course) and (subject is null or m.subject_id = subject) order by m.created_at desc limit 50) m;
    return jsonb_build_object('contextos', contexts, 'materiais', found);
  end if;
  exact := websearch_to_tsquery('public.jornada_pt', q);
  -- Também acha trechos com só parte das palavras, mas abaixo dos que têm todas.
  loose := nullif(replace(plainto_tsquery('public.jornada_pt', q)::text, ' & ', ' | '), '')::tsquery;
  select coalesce(jsonb_agg(jsonb_build_object('material_id', h.material_id, 'title', h.title, 'course_id', h.course_id, 'subject_id', h.subject_id,
    'page', h.page, 'text', h.text) order by h.score desc), '[]'::jsonb) into found
  from (
    select c.material_id, m.title, m.course_id, m.subject_id, c.page, c.text,
      (ts_rank(c.search, exact) * 2 + coalesce(ts_rank(c.search, loose), 0))
      * case when subject is not null and m.subject_id = subject then 3
             when course is not null and m.course_id = course and m.subject_id is null then 2
             when course is not null and m.course_id = course then 1.5 else 1 end as score
    from public.course_material_chunks c join public.course_materials m on m.id = c.material_id
    where c.owner_id = person and m.owner_id = person and m.deleted_at is null and m.kind <> 'contexto'
      and (c.search @@ exact or (loose is not null and c.search @@ loose))
    order by score desc limit max
  ) h;
  return jsonb_build_object('contextos', contexts, 'trechos', found);
end $$;
revoke all on function private.material_search_for(uuid, text, text, text, integer) from public, anon, authenticated;

-- App (assistente e voz): a pessoa do login.
create function public.material_search(wanted text, course text default null, subject text default null, max integer default 6) returns jsonb
language sql stable security definer set search_path = '' as $$ select private.material_search_for((select auth.uid()), wanted, course, subject, max) $$;
revoke all on function public.material_search(text, text, text, integer) from public, anon;
grant execute on function public.material_search(text, text, text, integer) to authenticated;

-- Assistentes conectados (MCP): a pessoa dona da chave.
create function public.mcp_material_search(server_secret text, token text, wanted text, course text default null, subject text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare person private.mcp_tokens;
begin
  person := private.mcp_person(server_secret, token);
  return private.material_search_for(person.user_id, wanted, course, subject, 8);
end $$;
revoke all on function public.mcp_material_search(text, text, text, text, text) from public, authenticated;
grant execute on function public.mcp_material_search(text, text, text, text, text) to anon;

-- Telegram e WhatsApp: a pessoa da conversa vinculada.
create function public.bot_material_search(server_secret text, channel_id text, chat text, wanted text, course text default null, subject text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return private.material_search_for(private.bot_person(server_secret, channel_id, chat), wanted, course, subject, 5);
end $$;
revoke all on function public.bot_material_search(text, text, text, text, text, text) from public, authenticated;
grant execute on function public.bot_material_search(text, text, text, text, text, text) to anon;

-- O assistente conectado guarda texto no material de um curso ou matéria (chave com permissão de registrar).
-- O texto chega já em trechos (o servidor da Jornada corta); "contexto" substitui o "o que a IA precisa saber".
create function public.mcp_material_save(server_secret text, token text, course text, subject text, material_kind text, material_title text,
  material_body text, chunks jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare person private.mcp_tokens; saved public.course_materials;
begin
  person := private.mcp_person(server_secret, token);
  if not person.can_write then raise exception 'Read-only token' using errcode = '42501'; end if;
  if material_kind not in ('texto', 'contexto') or jsonb_typeof(chunks) is distinct from 'array' or jsonb_array_length(chunks) > 100 then
    raise exception 'Invalid material' using errcode = '22023'; end if;
  if not exists (select 1 from public.personal_courses c where c.owner_id = person.user_id and c.id = course) then
    raise exception 'Course not found' using errcode = 'P0002'; end if;
  if subject is not null and not exists (select 1 from public.personal_subjects s where s.owner_id = person.user_id and s.id = subject and s.data->>'courseId' = course) then
    raise exception 'Subject not found' using errcode = 'P0002'; end if;
  if material_kind = 'contexto' then
    update public.course_materials m set body = material_body, updated_at = now()
    where m.owner_id = person.user_id and m.kind = 'contexto' and m.deleted_at is null and m.course_id = course and m.subject_id is not distinct from subject
    returning * into saved;
  end if;
  if saved.id is null then
    insert into public.course_materials(owner_id, course_id, subject_id, kind, title, body, source)
    values (person.user_id, course, subject, material_kind, case when material_kind = 'contexto' then 'O que a IA precisa saber' else material_title end, material_body, 'mcp')
    returning * into saved;
  end if;
  delete from public.course_material_chunks where material_id = saved.id;
  insert into public.course_material_chunks(material_id, owner_id, position, page, text)
  select saved.id, person.user_id, item.position, item.page, item.text from jsonb_to_recordset(chunks) as item(position integer, page integer, text text);
  return jsonb_build_object('id', saved.id, 'title', saved.title, 'course_id', saved.course_id, 'subject_id', saved.subject_id, 'kind', saved.kind);
end $$;
revoke all on function public.mcp_material_save(text, text, text, text, text, text, text, jsonb) from public, authenticated;
grant execute on function public.mcp_material_save(text, text, text, text, text, text, text, jsonb) to anon;
