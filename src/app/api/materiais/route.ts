import { z } from 'zod';
import { dbError, readSession, reply, writeRequest } from '@/lib/api-route';
import { requestBudget } from '@/lib/ai/budget';
import { chunkMaterial, extractMaterial, hasText, MaterialError, type MaterialChunk } from '@/lib/materials/extract';
import { MATERIAL_ACCOUNT_LIMIT, MATERIAL_FILE_LIMIT, materialMime, materialTypes, type MaterialMime } from '@/lib/materials/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Material dos cursos: arquivos e textos guardados no curso (geral) ou numa matéria ou módulo dele. Tudo com o
// login da pessoa (RLS): o servidor só lê o texto dos arquivos e guarda os trechos pesquisáveis.
const BUCKET = 'course-materials';
const TRASH_DAYS = 30;
type Session = Exclude<Awaited<ReturnType<typeof readSession>>, Response>;
type Row = { id: string; course_id: string; subject_id: string | null; kind: 'arquivo' | 'texto' | 'contexto'; title: string; body: string | null;
  file_path: string | null; mime: string | null; size: number; pages: number | null; source: string; status: string; problem: string;
  created_at: string; updated_at: string; deleted_at: string | null };
const columns = 'id,course_id,subject_id,kind,title,body,file_path,mime,size,pages,source,status,problem,created_at,updated_at,deleted_at';
const id = z.uuid();
const placeId = z.string().trim().min(1).max(100);
const place = { course_id: placeId, subject_id: placeId.nullable() };
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), ...place, name: z.string().trim().min(1).max(200), type: z.string().max(120), size: z.number().int().min(1).max(MATERIAL_FILE_LIMIT) }),
  z.object({ action: z.literal('process'), id }),
  z.object({ action: z.literal('text'), ...place, title: z.string().trim().min(1).max(200), text: z.string().trim().min(1).max(20_000) }),
  z.object({ action: z.literal('context'), ...place, text: z.string().trim().max(4_000) }),
  z.object({ action: z.literal('edit'), id, title: z.string().trim().min(1).max(200).optional(), course_id: placeId.optional(), subject_id: placeId.nullable().optional() }),
  z.object({ action: z.literal('delete'), id }),
  z.object({ action: z.literal('restore'), id }),
  z.object({ action: z.literal('erase'), id }),
]);

const limitMessage = 'Você chegou ao limite de material da conta (200 MB ou 1.000 itens). Exclua arquivos e esvazie a lixeira para enviar mais.';
const failed = (error: { code?: string } | null) => error?.code === 'PT413' ? reply({ error: limitMessage }, 413) : dbError(error);

/** The course exists, and the subject (when given) belongs to it. */
async function checkPlace(session: Session, course: string, subject: string | null) {
  const { data, error } = await session.client.from('personal_courses').select('id').eq('id', course).maybeSingle();
  if (error) return dbError(error);
  if (!data) return reply({ error: 'Curso não encontrado. Recarregue a página e tente de novo.' }, 404);
  if (subject === null) return null;
  const found = await session.client.from('personal_subjects').select('data').eq('id', subject).maybeSingle();
  if (found.error) return dbError(found.error);
  if ((found.data?.data as { courseId?: string } | undefined)?.courseId !== course) return reply({ error: 'Matéria não encontrada neste curso.' }, 404);
  return null;
}

async function replaceChunks(session: Session, material: string, chunks: MaterialChunk[]) {
  const removed = await session.client.from('course_material_chunks').delete().eq('material_id', material);
  if (removed.error) return removed.error;
  for (let start = 0; start < chunks.length; start += 400) {
    const { error } = await session.client.from('course_material_chunks').insert(chunks.slice(start, start + 400).map(chunk => ({ material_id: material, ...chunk })));
    if (error) return error;
  }
  return null;
}

/** Trash older than 30 days and uploads that never finished leave for good, file included. */
async function purge(session: Session) {
  const trash = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString(), stale = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const { data } = await session.client.from('course_materials').select('id,file_path').or(`deleted_at.lt.${trash},and(status.eq.enviando,created_at.lt.${stale})`).limit(50);
  if (!data?.length) return;
  const files = data.map(row => row.file_path).filter((path): path is string => Boolean(path));
  if (files.length) await session.client.storage.from(BUCKET).remove(files);
  await session.client.from('course_materials').delete().in('id', data.map(row => row.id));
}

const view = (row: Row, full = false) => {
  const { body, file_path: _path, ...rest } = row;
  return { ...rest, ...(row.kind === 'contexto' || full ? { body } : { preview: body ? body.slice(0, 280) : null }) };
};

// GET ?curso=<id>: everything of a course (general and each subject), the trash and how much space is in use.
// GET ?id=<id>: one material with its whole text. GET ?arquivo=<id>: opens the original file (one-minute link).
export async function GET(request: Request) {
  const session = await readSession();
  if (session instanceof Response) return session;
  const params = new URL(request.url).searchParams;
  const file = params.get('arquivo');
  if (file !== null) {
    if (!id.safeParse(file).success) return reply({ error: 'Pedido inválido.' }, 400);
    const { data, error } = await session.client.from('course_materials').select('title,file_path').eq('id', file).maybeSingle();
    if (error) return dbError(error);
    if (!data?.file_path) return reply({ error: 'Arquivo não encontrado.' }, 404);
    const link = await session.client.storage.from(BUCKET).createSignedUrl(data.file_path, 60, { download: data.title });
    if (link.error || !link.data) return reply({ error: 'Não consegui abrir o arquivo agora.' }, 503);
    return Response.redirect(link.data.signedUrl, 303);
  }
  const one = params.get('id');
  if (one !== null) {
    if (!id.safeParse(one).success) return reply({ error: 'Pedido inválido.' }, 400);
    const { data, error } = await session.client.from('course_materials').select(columns).eq('id', one).maybeSingle();
    if (error) return dbError(error);
    return data ? reply({ ok: true, data: view(data as Row, true) }) : reply({ error: 'Material não encontrado.' }, 404);
  }
  const course = placeId.safeParse(params.get('curso'));
  if (!course.success) return reply({ error: 'Informe o curso.' }, 400);
  await purge(session);
  const [list, usage] = await Promise.all([
    session.client.from('course_materials').select(columns).eq('course_id', course.data).neq('status', 'enviando').order('created_at', { ascending: false }).limit(1000),
    session.client.from('course_materials').select('size'),
  ]);
  if (list.error) return dbError(list.error);
  if (usage.error) return dbError(usage.error);
  return reply({ ok: true, data: { items: (list.data as Row[]).map(row => view(row)),
    used: (usage.data as { size: number }[]).reduce((total, row) => total + Number(row.size), 0), limit: MATERIAL_ACCOUNT_LIMIT } });
}

export async function POST(request: Request) {
  const input = await writeRequest(request, action, 90_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const now = new Date().toISOString();

  if (body.action === 'prepare') {
    const mime = materialMime(body.name, body.type);
    if (!mime) return reply({ error: 'Por enquanto a Jornada lê PDF, Word (.docx), PowerPoint (.pptx) e texto (.txt, .md).' }, 400);
    const wrong = await checkPlace(session, body.course_id, body.subject_id);
    if (wrong) return wrong;
    const limited = await requestBudget(session, 'upload');
    if (limited) return limited;
    const material = crypto.randomUUID();
    const path = `${session.user.id}/${material}.${materialTypes[mime]}`;
    const { error } = await session.client.from('course_materials').insert({ id: material, course_id: body.course_id, subject_id: body.subject_id,
      kind: 'arquivo', title: body.name, file_path: path, mime, size: body.size, status: 'enviando' });
    if (error) return failed(error);
    const upload = await session.client.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (upload.error || !upload.data) return reply({ error: 'Não foi possível preparar o envio. Tente novamente.' }, 503);
    return reply({ ok: true, data: { id: material, uploadUrl: upload.data.signedUrl, mime } });
  }

  if (body.action === 'process') {
    const { data, error } = await session.client.from('course_materials').select(columns).eq('id', body.id).maybeSingle();
    if (error) return dbError(error);
    const row = data as Row | null;
    if (!row?.file_path || !row.mime) return reply({ error: 'Material não encontrado.' }, 404);
    if (row.status !== 'enviando' && row.status !== 'falhou') return reply({ ok: true, data: view(row) });
    const finish = async (fields: Partial<Row>) => {
      const saved = await session.client.from('course_materials').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', row.id).select(columns).single();
      return saved.error ? dbError(saved.error) : reply({ ok: true, data: view(saved.data as Row) });
    };
    const file = await session.client.storage.from(BUCKET).download(row.file_path);
    if (file.error || !file.data) return finish({ status: 'falhou', problem: 'O envio do arquivo não terminou. Exclua e envie de novo.' });
    if (file.data.size > MATERIAL_FILE_LIMIT) return finish({ status: 'falhou', problem: 'O arquivo passa de 25 MB.' });
    await session.client.from('course_materials').update({ status: 'processando', updated_at: now }).eq('id', row.id);
    try {
      const pages = await extractMaterial(new Uint8Array(await file.data.arrayBuffer()), row.mime as MaterialMime);
      const chunks = chunkMaterial(pages);
      const problem = await replaceChunks(session, row.id, chunks);
      if (problem) return finish({ status: 'falhou', problem: 'Não consegui guardar o texto deste arquivo. Tente de novo.' });
      return finish({ status: hasText(chunks) ? 'pronto' : 'sem_texto', pages: pages.filter(page => page.page !== null).length || null,
        problem: hasText(chunks) ? '' : 'Não há texto para ler (pode ser um arquivo escaneado ou só com imagens). O arquivo fica guardado.' });
    } catch (reason) {
      return finish({ status: 'falhou', problem: reason instanceof MaterialError ? reason.message : 'Não consegui ler este arquivo.' });
    }
  }

  if (body.action === 'text' || body.action === 'context') {
    const wrong = await checkPlace(session, body.course_id, body.subject_id);
    if (wrong) return wrong;
    let material: string;
    if (body.action === 'context') {
      let found = session.client.from('course_materials').select('id').eq('kind', 'contexto').eq('course_id', body.course_id).is('deleted_at', null);
      found = body.subject_id === null ? found.is('subject_id', null) : found.eq('subject_id', body.subject_id);
      const existing = await found.maybeSingle();
      if (existing.error) return dbError(existing.error);
      if (!body.text) {
        if (existing.data) { const removed = await session.client.from('course_materials').delete().eq('id', existing.data.id); if (removed.error) return dbError(removed.error); }
        return reply({ ok: true, data: null });
      }
      if (existing.data) {
        const { error } = await session.client.from('course_materials').update({ body: body.text, updated_at: now }).eq('id', existing.data.id);
        if (error) return dbError(error);
        material = existing.data.id;
      } else {
        material = crypto.randomUUID();
        const { error } = await session.client.from('course_materials').insert({ id: material, course_id: body.course_id, subject_id: body.subject_id,
          kind: 'contexto', title: 'O que a IA precisa saber', body: body.text });
        if (error) return failed(error);
      }
    } else {
      material = crypto.randomUUID();
      const { error } = await session.client.from('course_materials').insert({ id: material, course_id: body.course_id, subject_id: body.subject_id,
        kind: 'texto', title: body.title, body: body.text });
      if (error) return failed(error);
    }
    const problem = await replaceChunks(session, material, chunkMaterial([{ page: null, text: body.text }]));
    if (problem) return dbError(problem);
    const { data, error } = await session.client.from('course_materials').select(columns).eq('id', material).single();
    return error ? dbError(error) : reply({ ok: true, data: view(data as Row) });
  }

  if (body.action === 'edit') {
    const fields: Record<string, unknown> = { updated_at: now };
    if (body.title) fields.title = body.title;
    if (body.course_id !== undefined) {
      const wrong = await checkPlace(session, body.course_id, body.subject_id ?? null);
      if (wrong) return wrong;
      fields.course_id = body.course_id; fields.subject_id = body.subject_id ?? null;
    }
    const { data, error } = await session.client.from('course_materials').update(fields).eq('id', body.id).neq('kind', 'contexto').select(columns).maybeSingle();
    if (error) return failed(error);
    return data ? reply({ ok: true, data: view(data as Row) }) : reply({ error: 'Material não encontrado.' }, 404);
  }

  if (body.action === 'erase') {
    const { data, error } = await session.client.from('course_materials').select('id,file_path,deleted_at').eq('id', body.id).maybeSingle();
    if (error) return dbError(error);
    if (!data?.deleted_at) return reply({ error: 'Só dá para apagar de vez o que está na lixeira.' }, 409);
    if (data.file_path) await session.client.storage.from(BUCKET).remove([data.file_path]);
    const removed = await session.client.from('course_materials').delete().eq('id', data.id);
    return removed.error ? dbError(removed.error) : reply({ ok: true, data: null });
  }

  // delete / restore: the trash keeps the file and its text for 30 days.
  const { data, error } = await session.client.from('course_materials').update({ deleted_at: body.action === 'delete' ? now : null, updated_at: now })
    .eq('id', body.id).select(columns).maybeSingle();
  if (error) return error.code === '23505' ? reply({ error: 'Já existe um "o que a IA precisa saber" neste lugar.' }, 409) : dbError(error);
  return data ? reply({ ok: true, data: view(data as Row) }) : reply({ error: 'Material não encontrado.' }, 404);
}
