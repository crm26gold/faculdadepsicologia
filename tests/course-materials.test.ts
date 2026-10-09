import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { strToU8, zipSync } from 'fflate';

const empty = pathToFileURL(`${process.cwd()}/node_modules/server-only/empty.js`).href;
// The route runs with a fake login and database: the tables answer like PostgREST, and the bucket keeps bytes.
const fakes = mkdtempSync(`${tmpdir()}/materiais-`);
writeFileSync(`${fakes}/server.cjs`, 'exports.userSession = async () => globalThis.__materialSession ?? null;');
writeFileSync(`${fakes}/budget.cjs`, 'exports.requestBudget = async () => null;');
const fakeServer = pathToFileURL(`${fakes}/server.cjs`).href, fakeBudget = pathToFileURL(`${fakes}/budget.cjs`).href;
registerHooks({ resolve: (specifier, context, next) => specifier === 'server-only' ? { url: empty, shortCircuit: true }
  : specifier === '@/lib/supabase/server' ? { url: fakeServer, shortCircuit: true }
  : specifier === '@/lib/ai/budget' ? { url: fakeBudget, shortCircuit: true } : next(specifier, context) });
process.env.APP_ORIGIN = 'https://jornada.example';
// The route answers only on the private app; the CI runs with APP_MODE=demo.
process.env.APP_MODE = 'private';

/** A PDF with one page per text, written by hand (enough for pdf.js). */
function pdf(pages: string[]) {
  const objects = ['<</Type/Catalog/Pages 2 0 R>>', `<</Type/Pages/Kids[${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}]/Count ${pages.length}>>`];
  const font = 3 + pages.length * 2;
  pages.forEach((text, index) => {
    const stream = `BT /F1 14 Tf 20 100 Td (${text}) Tj ET`;
    objects.push(`<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 144]/Contents ${4 + index * 2} 0 R/Resources<</Font<</F1 ${font} 0 R>>>>>>`);
    objects.push(`<</Length ${stream.length}>>stream\n${stream}\nendstream`);
  });
  objects.push('<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>');
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => { const at = body.length; body += `${index + 1} 0 obj${object}endobj\n`; return at; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(body, 'latin1'));
}
const docx = (paragraphs: string[]) => zipSync({ 'word/document.xml': strToU8(`<w:document><w:body>${paragraphs.map(text => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`) });
const pptx = (slides: string[]) => zipSync(Object.fromEntries(slides.map((text, index) => [`ppt/slides/slide${index + 1}.xml`, strToU8(`<p:sld><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:sld>`)])));
const mimes = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' } as const;

test('lê o texto de PDF (por página), Word, PowerPoint (por slide) e texto, sem mandar o arquivo a nenhuma IA', async () => {
  const { extractMaterial } = await import('../src/lib/materials/extract');
  assert.deepEqual(await extractMaterial(pdf(['Bases Biologicas aula 1', 'Neuronio e sinapse']), mimes.pdf), [{ page: 1, text: 'Bases Biologicas aula 1' }, { page: 2, text: 'Neuronio e sinapse' }]);
  assert.deepEqual(await extractMaterial(docx(['Plano de ensino', 'Avaliação: prova &amp; trabalho']), mimes.docx), [{ page: null, text: 'Plano de ensino\nAvaliação: prova & trabalho' }]);
  assert.deepEqual(await extractMaterial(pptx(['Slide um', 'Slide dois']), mimes.pptx), [{ page: 1, text: 'Slide um' }, { page: 2, text: 'Slide dois' }]);
  assert.deepEqual(await extractMaterial(new TextEncoder().encode('# Resumo\nÁgua é vida'), 'text/markdown'), [{ page: null, text: '# Resumo\nÁgua é vida' }]);
  await assert.rejects(extractMaterial(new TextEncoder().encode('não sou pdf'), mimes.pdf), /não é um PDF/);
  await assert.rejects(extractMaterial(new TextEncoder().encode('PK? quebrado'), mimes.docx), /não é um documento do Word|Não consegui abrir/);
  await assert.rejects(extractMaterial(new Uint8Array([0xff, 0xfe, 0x00]), 'text/plain'), /UTF-8/);
});

test('trechos de até 1 500 caracteres, cortados no fim de frase e com a página de cada um', async () => {
  const { chunkMaterial, hasText } = await import('../src/lib/materials/extract');
  const sentence = 'O neurônio transmite impulsos elétricos pela sinapse. ';
  const chunks = chunkMaterial([{ page: 3, text: sentence.repeat(80) }, { page: 4, text: 'Fim.' }]);
  assert.ok(chunks.length >= 3);
  assert.ok(chunks.every(chunk => chunk.text.length <= 1500), 'cabe no limite do banco');
  assert.ok(chunks.slice(0, -1).every(chunk => chunk.text.endsWith('.')), 'corta no fim da frase');
  assert.deepEqual(chunks.map(chunk => chunk.position), chunks.map((_, index) => index));
  assert.deepEqual(chunks.at(-1), { position: chunks.length - 1, page: 4, text: 'Fim.' });
  assert.equal(hasText(chunkMaterial([{ page: 1, text: '  ' }])), false, 'escaneado: sem texto');
  const { materialMime } = await import('../src/lib/materials/types');
  assert.equal(materialMime('Aula 3.PPTX', ''), mimes.pptx);
  assert.equal(materialMime('foto.jpg', 'image/jpeg'), null, 'foto ainda não é lida');
  assert.equal(materialMime('resumo.md', 'application/octet-stream'), 'text/markdown');
});

type Row = Record<string, unknown>;
function fakeSession() {
  const tables: Record<string, Row[]> = {
    personal_courses: [{ id: 'psicologia', data: { id: 'psicologia' } }],
    personal_subjects: [{ id: 'neuro', data: { id: 'neuro', courseId: 'psicologia' } }, { id: 'outro', data: { id: 'outro', courseId: 'ia' } }],
    course_materials: [], course_material_chunks: [],
  };
  const bucket = new Map<string, Uint8Array>();
  const defaults = (table: string, row: Row): Row => table === 'course_materials'
    ? { subject_id: null, body: null, file_path: null, mime: null, size: 0, pages: null, source: 'app', status: 'pronto', problem: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null, ...row }
    : row;
  const query = (table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select', payload: Row | Row[] = {}, mode: 'many' | 'maybe' | 'single' = 'many';
    const builder = {
      select: () => builder, insert: (rows: Row | Row[]) => { op = 'insert'; payload = rows; return builder; },
      update: (fields: Row) => { op = 'update'; payload = fields; return builder; }, delete: () => { op = 'delete'; return builder; },
      eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return builder; },
      neq: (column: string, value: unknown) => { filters.push(row => row[column] !== value); return builder; },
      is: (column: string, value: null) => { filters.push(row => (row[column] ?? null) === value); return builder; },
      in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return builder; },
      or: () => { filters.push(() => false); return builder; }, order: () => builder, limit: () => builder,
      maybeSingle: () => { mode = 'maybe'; return builder; }, single: () => { mode = 'single'; return builder; },
      then(resolve: (value: { data: unknown; error: unknown }) => void) {
        const rows = tables[table];
        let result: Row[];
        if (op === 'insert') { result = (Array.isArray(payload) ? payload : [payload]).map(row => defaults(table, row)); rows.push(...result); }
        else {
          result = rows.filter(row => filters.every(filter => filter(row)));
          if (op === 'update') result.forEach(row => Object.assign(row, payload));
          if (op === 'delete') tables[table] = rows.filter(row => !result.includes(row));
        }
        const data = mode === 'many' ? result : result[0] ?? null;
        resolve(mode === 'single' && !data ? { data: null, error: { code: 'PGRST116' } } : { data, error: null });
      },
    };
    return builder;
  };
  const client = {
    from: query,
    storage: { from: () => ({
      createSignedUploadUrl: async (path: string) => ({ data: { signedUrl: `https://storage.example/upload/${path}` }, error: null }),
      download: async (path: string) => bucket.has(path) ? { data: new Blob([bucket.get(path)! as BlobPart]), error: null } : { data: null, error: { message: 'missing' } },
      remove: async (paths: string[]) => { paths.forEach(path => bucket.delete(path)); return { data: null, error: null }; },
      createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://storage.example/read/${path}` }, error: null }),
    }) },
  };
  return { session: { client, user: { id: '00000000-0000-4000-8000-00000000000a' } }, tables, bucket };
}
const post = (body: unknown) => new Request('https://jornada.example/api/materiais', { method: 'POST', headers: { origin: 'https://jornada.example', 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('enviar um arquivo: o servidor prepara, o arquivo vai direto ao bucket e o texto vira trechos pesquisáveis', async () => {
  const fake = fakeSession();
  (globalThis as { __materialSession?: unknown }).__materialSession = fake.session;
  const { GET, POST } = await import('../src/app/api/materiais/route');
  const prepared = await (await POST(post({ action: 'prepare', course_id: 'psicologia', subject_id: 'neuro', name: 'Plano de ensino.pptx', type: '', size: 2000 }))).json();
  assert.equal(prepared.ok, true);
  const row = fake.tables.course_materials[0];
  assert.equal(row.status, 'enviando');
  assert.match(String(row.file_path), /^00000000-0000-4000-8000-00000000000a\/[0-9a-f-]{36}\.pptx$/, 'na pasta da própria conta');
  fake.bucket.set(String(row.file_path), pptx(['Avaliação: duas provas', 'Sinapse química']));
  const processed = await (await POST(post({ action: 'process', id: prepared.data.id }))).json();
  assert.equal(processed.data.status, 'pronto');
  assert.equal(processed.data.pages, 2);
  assert.equal('file_path' in processed.data, false, 'o caminho do arquivo nunca vai para a página');
  assert.deepEqual(fake.tables.course_material_chunks.map(chunk => [chunk.page, chunk.text]), [[1, 'Avaliação: duas provas'], [2, 'Sinapse química']]);

  // Lugar inválido, formato ainda não lido e escaneado sem texto.
  assert.equal((await POST(post({ action: 'prepare', course_id: 'psicologia', subject_id: 'outro', name: 'x.pdf', type: 'application/pdf', size: 10 }))).status, 404, 'matéria de outro curso');
  assert.equal((await POST(post({ action: 'prepare', course_id: 'psicologia', subject_id: null, name: 'foto.jpg', type: 'image/jpeg', size: 10 }))).status, 400);
  const scan = await (await POST(post({ action: 'prepare', course_id: 'psicologia', subject_id: null, name: 'escaneado.pdf', type: 'application/pdf', size: 10 }))).json();
  fake.bucket.set(String(fake.tables.course_materials.find(item => item.id === scan.data.id)!.file_path), pdf(['']));
  const scanned = await (await POST(post({ action: 'process', id: scan.data.id }))).json();
  assert.equal(scanned.data.status, 'sem_texto');
  assert.match(scanned.data.problem, /escaneado/);
  const lost = await (await POST(post({ action: 'prepare', course_id: 'psicologia', subject_id: null, name: 'perdido.docx', type: '', size: 10 }))).json();
  assert.equal((await (await POST(post({ action: 'process', id: lost.data.id }))).json()).data.status, 'falhou', 'envio que não terminou');

  // Texto escrito, "o que a IA precisa saber" (um por lugar), mover, lixeira e restaurar.
  const written = await (await POST(post({ action: 'text', course_id: 'psicologia', subject_id: null, title: 'Regras', text: 'Prova dissertativa.' }))).json();
  assert.equal(written.data.preview, 'Prova dissertativa.');
  await POST(post({ action: 'context', course_id: 'psicologia', subject_id: 'neuro', text: 'Cobra a parte prática.' }));
  await POST(post({ action: 'context', course_id: 'psicologia', subject_id: 'neuro', text: 'Cobra a parte prática e casos.' }));
  assert.deepEqual(fake.tables.course_materials.filter(item => item.kind === 'contexto').map(item => item.body), ['Cobra a parte prática e casos.']);
  assert.equal((await (await POST(post({ action: 'edit', id: written.data.id, course_id: 'psicologia', subject_id: 'neuro' }))).json()).data.subject_id, 'neuro');
  await POST(post({ action: 'delete', id: written.data.id }));
  assert.ok(fake.tables.course_materials.find(item => item.id === written.data.id)!.deleted_at, 'vai para a lixeira');
  assert.equal((await POST(post({ action: 'erase', id: prepared.data.id }))).status, 409, 'só apaga de vez o que está na lixeira');
  await POST(post({ action: 'restore', id: written.data.id }));
  assert.equal(fake.tables.course_materials.find(item => item.id === written.data.id)!.deleted_at, null);

  const listed = await (await GET(new Request('https://jornada.example/api/materiais?curso=psicologia'))).json();
  assert.equal(listed.data.limit, 200 * 1024 * 1024);
  assert.ok(listed.data.items.every((item: Row) => item.status !== 'enviando' && !('file_path' in item)));
  assert.equal(listed.data.items.find((item: Row) => item.kind === 'contexto').body, 'Cobra a parte prática e casos.', 'o contexto vem inteiro para editar');
  const opened = await GET(new Request(`https://jornada.example/api/materiais?arquivo=${prepared.data.id}`));
  assert.equal(opened.status, 303);
  assert.match(opened.headers.get('location')!, /^https:\/\/storage\.example\/read\//);

  // Sem login, nada.
  (globalThis as { __materialSession?: unknown }).__materialSession = null;
  assert.equal((await POST(post({ action: 'delete', id: prepared.data.id }))).status, 401);
});
