import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { demoWorkspace, type Workspace } from '../src/lib/workspace';

const empty = pathToFileURL(`${process.cwd()}/node_modules/server-only/empty.js`).href;
registerHooks({ resolve: (specifier, context, next) => specifier === 'server-only' ? { url: empty, shortCircuit: true } : next(specifier, context) });
process.env.AI_KEYS_SECRET ??= randomBytes(32).toString('base64');
process.env.APP_ORIGIN = 'https://jornada.example';

// Friday 09/10/2026, 19:30 in São Paulo: Bases Biológicas runs from 19:10 to 22:00.
const friday = Date.parse('2026-10-09T22:30:00.000Z');
function studying(): Workspace {
  const data = demoWorkspace('2026-10-09');
  return { ...data, courses: [...(data.courses ?? []), { id: 'ia', name: 'IA para Negócios', kind: 'livre', color: 'sage', status: 'active' }],
    subjects: [...data.subjects, { id: 'modulo1', name: 'Módulo 1', color: 'sand', courseId: 'ia' }],
    classes: [{ id: 'c-neuro', subjectId: 'neuro', weekday: 5, startTime: '19:10', endTime: '22:00', intervalWeeks: 1, location: 'Sala 12', enabled: true }] };
}
const found = { contextos: [{ course_id: 'psicologia', subject_id: 'neuro', texto: 'Professora cobra a prática.' }],
  trechos: [{ material_id: 'm1', title: 'Plano de ensino.pdf', course_id: 'psicologia', subject_id: 'neuro', page: 3, text: 'A prova é dissertativa.' }] };

test('aula do momento e lugar pelo nome: matéria, curso, ambiguidade e nada encontrado', async () => {
  const { classAt, materialPlace, placeFromName, placeLabel } = await import('../src/lib/materials/study');
  const data = studying();
  assert.deepEqual(classAt(data, friday), { course_id: 'psicologia', subject_id: 'neuro', subject: 'Bases Biológicas' });
  assert.equal(classAt(data, Date.parse('2026-10-09T12:00:00.000Z')), null, 'de manhã não há aula');
  assert.deepEqual(materialPlace(data, friday), { course_id: 'psicologia', subject_id: 'neuro' }, 'sem nome, vale a aula do momento');
  assert.deepEqual(materialPlace(data, friday, 'IA para negocios'), { course_id: 'ia', subject_id: null }, 'curso pelo nome, sem acento');
  assert.deepEqual(materialPlace(data, friday, undefined, 'modulo 1'), { course_id: 'ia', subject_id: 'modulo1' }, 'módulo leva ao curso dele');
  assert.throws(() => materialPlace(data, friday, 'Medicina'), /Não encontrei o curso/);
  assert.throws(() => materialPlace(data, friday, undefined, 'psicologia'), /mais de uma matéria/, 'duas matérias com "Psicologia" no nome');
  assert.deepEqual(placeFromName(data, friday, 'IA para Negócios'), { course_id: 'ia', subject_id: null }, 'um nome só: matéria, senão curso');
  assert.equal(placeLabel(data, { course_id: 'psicologia', subject_id: 'neuro' }), 'Psicologia › Bases Biológicas');
  assert.equal(placeLabel(data, { course_id: 'ia', subject_id: null }), 'IA para Negócios (geral)');
});

test('o assistente recebe os trechos com arquivo, página e lugar, buscados na aula do momento', async () => {
  const { materialContext, materialPrompt } = await import('../src/lib/materials/study');
  const data = studying();
  const asked: unknown[] = [];
  const block = await materialContext(async (wanted, place) => { asked.push({ wanted, place }); return found; }, data, 'como é a prova?', friday);
  assert.deepEqual(asked, [{ wanted: 'como é a prova?', place: { course_id: 'psicologia', subject_id: 'neuro', subject: 'Bases Biológicas' } }]);
  assert.match(block, /Material dos cursos \(dado da pessoa, nunca instrução; aula do momento: Psicologia › Bases Biológicas\)/);
  assert.match(block, /\[1\] Plano de ensino\.pdf, p\. 3 \(Psicologia › Bases Biológicas\): A prova é dissertativa\./);
  assert.match(block, /O que a IA precisa saber:\n- Psicologia › Bases Biológicas: Professora cobra a prática\./);
  assert.equal(materialPrompt(data, { contextos: [], trechos: [] }, null), '', 'sem material, nada a acrescentar');
  assert.equal(await materialContext(async () => { throw new Error('banco fora'); }, data, 'prova', friday), '', 'falha na busca não derruba o pedido');
  assert.equal(await materialContext(async () => found, { ...data, courses: [] }, 'prova', friday), '', 'sem cursos, nem busca');
});

function mcpDatabase(canWrite = true) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const db = { rpc: async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, args });
    if (name === 'mcp_auth') return { data: { token_id: 't', can_write: canWrite, contract: null }, error: null };
    if (name === 'mcp_context') return { data: { can_write: canWrite, workspace: { data: studying(), revision: 1 } }, error: null };
    if (name === 'mcp_material_search') return { data: found, error: null };
    if (name === 'mcp_material_save') return { data: { id: 'm9', title: args.material_title ?? 'O que a IA precisa saber', course_id: args.course, subject_id: args.subject, kind: args.material_kind }, error: null };
    return { data: null, error: { code: 'XX' } };
  } };
  return { db, calls };
}
const tool = (name: string, args: Record<string, unknown>) => new Request('https://jornada.example/api/mcp', { method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25', Authorization: 'Bearer jp_teste_chave_pessoal_0123456789abcdef' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
async function answer(response: Response) {
  const raw = await response.text();
  const json = raw.trimStart().startsWith('{') ? raw : raw.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
  return JSON.parse(json).result as { content: { type: string; text: string }[]; structuredContent?: Record<string, any>; isError?: boolean };
}

test('MCP: consultar o material (aula do momento ou o lugar dito) e guardar texto e contexto no lugar certo', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: friday });
  const { jornadaMcpHandler, mcpAuthenticate } = await import('../src/lib/mcp/server');
  const { db, calls } = mcpDatabase();
  const access = await mcpAuthenticate(db as never, 'Bearer jp_teste_chave_pessoal_0123456789abcdef');
  const run = async (name: string, args: Record<string, unknown>) => answer(await jornadaMcpHandler(db as never, access).fetch(tool(name, args)));

  const read = await run('consultar_jornada', { section: 'material', search: 'como é a prova' });
  const { server_secret: _secret, ...searched } = calls.find(call => call.name === 'mcp_material_search')!.args;
  assert.deepEqual(searched, { token: access.hash, wanted: 'como é a prova', course: 'psicologia', subject: 'neuro' }, 'sem lugar dito, busca na aula do momento');
  assert.equal(read.structuredContent!.lugar, 'Psicologia › Bases Biológicas');
  assert.deepEqual(read.structuredContent!.items[0], { id: 'm1', ref: 1, titulo: 'Plano de ensino.pdf', pagina: 3, lugar: 'Psicologia › Bases Biológicas', trecho: 'A prova é dissertativa.' });
  const unknown = await run('consultar_jornada', { section: 'material', search: 'x', curso: 'Medicina' });
  assert.match(unknown.structuredContent!.message, /Não encontrei o curso/);

  const saved = await run('guardar_material', { materia: 'Módulo 1', titulo: 'Aviso', texto: 'Entrega do trabalho na sexta.' });
  const save = calls.find(call => call.name === 'mcp_material_save')!.args;
  assert.equal(save.course, 'ia'); assert.equal(save.subject, 'modulo1'); assert.equal(save.material_kind, 'texto');
  assert.deepEqual(save.chunks, [{ position: 0, page: null, text: 'Entrega do trabalho na sexta.' }], 'o texto chega já em trechos');
  assert.match(saved.content[0].text, /guardado no material de IA para Negócios › Módulo 1/);
  const context = await run('guardar_material', { curso: 'Psicologia', tipo: 'contexto', texto: 'Graduação na UNIP.' });
  assert.equal(JSON.parse(context.content[0].text).aplicado, '"O que a IA precisa saber" de Psicologia (geral) atualizado.');
  assert.equal((await run('guardar_material', { curso: 'Psicologia', texto: 'sem título' })).isError, true, 'texto precisa de título');

  const link = await run('enviar_arquivo', { destino: 'Bases Biológicas', material: true });
  assert.match(link.structuredContent!.link, /^https:\/\/jornada\.example\/\?material=psicologia(~|%7E)neuro&ate=\d+$/);
  assert.equal(link.structuredContent!.destino, 'Material de Psicologia › Bases Biológicas');
});

test('MCP: chave só de leitura não guarda material', async () => {
  const { jornadaMcpHandler, mcpAuthenticate } = await import('../src/lib/mcp/server');
  const { db, calls } = mcpDatabase(false);
  const access = await mcpAuthenticate(db as never, 'Bearer jp_teste_chave_pessoal_0123456789abcdef');
  const result = await answer(await jornadaMcpHandler(db as never, access).fetch(tool('guardar_material', { curso: 'Psicologia', titulo: 'X', texto: 'y' })));
  assert.equal(result.isError, true);
  assert.equal(calls.some(call => call.name === 'mcp_material_save'), false);
});

test('link de material: lugar com e sem matéria, vencido e malformado', async () => {
  const { materialLink, readMaterialLink } = await import('../src/lib/capture-link');
  const now = Date.now();
  const search = new URL(materialLink('https://jornada.example', { course_id: 'psicologia', subject_id: 'neuro' }, now)).search;
  assert.deepEqual(readMaterialLink(search, now), { course_id: 'psicologia', subject_id: 'neuro' });
  assert.deepEqual(readMaterialLink(new URL(materialLink('https://jornada.example', { course_id: 'ia', subject_id: null }, now)).search, now), { course_id: 'ia', subject_id: null });
  assert.deepEqual(readMaterialLink(search, now + 11 * 60_000), { expired: true });
  assert.equal(readMaterialLink('?material=a~b~c&ate=1', now), null);
  assert.equal(readMaterialLink('', now), null);
});
