-- Material dos cursos (etapa 1: guardar). Cada curso tem um material geral e cada matéria ou módulo o seu:
-- arquivos (PDF, Word, PowerPoint, texto), textos escritos e "o que a IA precisa saber". Fica fora do documento
-- da conta (limite de 2 MB), com leitura e gravação próprias. O texto de cada arquivo é lido pelo servidor da
-- Jornada e guardado em trechos pesquisáveis em português; o arquivo original fica num bucket privado.
-- Privado por padrão: só o dono lê e grava (RLS); nada disso aparece para grupos, professores ou administração.

create extension if not exists unaccent with schema extensions;
-- Português sem acento: "água" e "agua" acham o mesmo trecho.
create text search configuration public.jornada_pt (copy = pg_catalog.portuguese);
alter text search configuration public.jornada_pt alter mapping for hword, hword_part, word with extensions.unaccent, portuguese_stem;

create table public.course_materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- O lugar: o curso e, quando for de uma matéria ou módulo, a matéria (sem matéria = material geral do curso).
  course_id text not null check (char_length(course_id) between 1 and 100),
  subject_id text check (char_length(subject_id) between 1 and 100),
  kind text not null check (kind in ('arquivo', 'texto', 'contexto')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text check (char_length(body) <= 20000),
  file_path text unique check (file_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|docx|pptx|txt|md)$'),
  mime text check (char_length(mime) <= 120),
  size bigint not null default 0 check (size between 0 and 26214400),
  pages integer check (pages between 0 and 10000),
  source text not null default 'app' check (source in ('app', 'mcp', 'telegram')),
  status text not null default 'pronto' check (status in ('enviando', 'processando', 'pronto', 'sem_texto', 'falhou')),
  problem text not null default '' check (char_length(problem) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Excluído vai para a lixeira por 30 dias; depois o servidor apaga o arquivo e o registro.
  deleted_at timestamptz,
  check ((kind = 'arquivo') = (file_path is not null)),
  check (kind = 'arquivo' or body is not null)
);
create index course_materials_place_idx on public.course_materials(owner_id, course_id, subject_id);
-- "O que a IA precisa saber": um por lugar.
create unique index course_materials_context_idx on public.course_materials(owner_id, course_id, coalesce(subject_id, ''))
  where kind = 'contexto' and deleted_at is null;

create table public.course_material_chunks (
  material_id uuid not null references public.course_materials(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position integer not null check (position between 0 and 4999),
  page integer check (page between 1 and 10000),
  text text not null check (char_length(text) between 1 and 4000),
  search tsvector generated always as (to_tsvector('public.jornada_pt'::regconfig, text)) stored,
  primary key (material_id, position)
);
create index course_material_chunks_search_idx on public.course_material_chunks using gin(search);
create index course_material_chunks_owner_idx on public.course_material_chunks(owner_id);

-- Limites por conta: 200 MB de arquivos (a lixeira conta até ser apagada) e 1.000 materiais.
create function private.course_materials_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('course_materials:' || new.owner_id::text));
  if (select count(*) from public.course_materials where owner_id = new.owner_id) >= 1000 then
    raise exception 'Material limit' using errcode = 'PT413', detail = 'count';
  end if;
  if (select coalesce(sum(size), 0) from public.course_materials where owner_id = new.owner_id) + new.size > 209715200 then
    raise exception 'Material limit' using errcode = 'PT413', detail = 'size';
  end if;
  return new;
end $$;
revoke all on function private.course_materials_limit() from public, anon, authenticated;
create trigger course_materials_limit before insert on public.course_materials for each row execute function private.course_materials_limit();

alter table public.course_materials enable row level security;
alter table public.course_material_chunks enable row level security;
revoke all on public.course_materials, public.course_material_chunks from public, anon, authenticated;
grant select, insert, delete on public.course_materials to authenticated;
-- Dono, arquivo e tamanho não mudam depois de criados.
grant update (course_id, subject_id, title, body, pages, status, problem, updated_at, deleted_at) on public.course_materials to authenticated;
grant select, insert, delete on public.course_material_chunks to authenticated;

create policy "Own course materials" on public.course_materials for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and exists (select 1 from public.accounts a where a.user_id = (select auth.uid())));
create policy "Own course material chunks" on public.course_material_chunks for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid())
    and exists (select 1 from public.course_materials m where m.id = material_id and m.owner_id = (select auth.uid())));

-- Arquivos originais: pasta de cada conta. Só entra o arquivo que o servidor preparou (registro "enviando").
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-materials', 'course-materials', false, 26214400, array['application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain', 'text/markdown']);
create policy "Users read own course materials" on storage.objects for select to authenticated using (
  bucket_id = 'course-materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users upload prepared course materials" on storage.objects for insert to authenticated with check (
  bucket_id = 'course-materials' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.course_materials m where m.file_path = objects.name and m.owner_id = (select auth.uid()) and m.status = 'enviando'));
create policy "Users delete own course materials" on storage.objects for delete to authenticated using (
  bucket_id = 'course-materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
