import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommands, executionSummary, undoApplied, type CommandAction } from '../src/lib/commands';
import { confirmationIntent, queryWorkspace } from '../src/lib/assistant-query';
import { chooseLiveModel, liveSetup } from '../src/lib/voice/protocol';
import { pcmBase64, pcmSamples } from '../src/lib/voice/client';
import { demoWorkspace, workspaceSchema } from '../src/lib/workspace';

const today = '2026-10-03', now = Date.parse('2026-10-03T13:00:00Z');
const base = () => demoWorkspace(today);
const options = () => { let id = 0; return { today, now, newId: () => `voice-${++id}` }; };

test('reagendamento e conclusão identificam o item exato e desfazem sem apagar outras alterações', () => {
  const data = base();
  const result = applyCommands(data, [{ type: 'editar', entity: 'compromisso', target: 't1', fields: { date: '2026-10-05', time: '16:00', done: true } }], options());
  assert.deepEqual(result.failed, []);
  assert.equal(result.data.tasks[0].time, '16:00');
  const back = undoApplied(result.data, result.applied);
  assert.deepEqual(back.tasks[0], data.tasks[0]);
  const later = { ...result.data, tasks: result.data.tasks.map(task => task.id === 't1' ? { ...task, title: 'Título alterado manualmente' } : task) };
  assert.equal(undoApplied(later, result.applied).tasks[0].title, 'Título alterado manualmente');
});

test('exclusão exige confirmação exata e recusa item que mudou depois da proposta', () => {
  const data = base();
  const action: CommandAction = { type: 'excluir', entity: 'compromisso', target: 't1' };
  const proposed = applyCommands(data, [action], options());
  assert.equal(proposed.pending.length, 1);
  assert.equal(proposed.applied.length, 0);
  assert.equal(proposed.data.tasks.length, data.tasks.length);
  const confirmed = applyCommands(data, [action], { ...options(), confirmed: proposed.pending });
  assert.equal(confirmed.pending.length, 0);
  assert.equal(confirmed.data.tasks.some(item => item.id === 't1'), false);
  assert.equal(undoApplied(confirmed.data, confirmed.applied).tasks.find(item => item.id === 't1')!.title, data.tasks[0].title);
  const changed = { ...data, tasks: data.tasks.map(task => task.id === 't1' ? { ...task, time: '20:00' } : task) };
  const rejected = applyCommands(changed, [action], { ...options(), confirmed: proposed.pending });
  assert.match(rejected.failed[0], /mudou desde/);
  assert.equal(rejected.data.tasks.length, data.tasks.length);
  const wrong = applyCommands(data, [{ type: 'excluir', entity: 'compromisso', target: 't2' }], { ...options(), confirmed: proposed.pending });
  assert.equal(wrong.pending.length, 1);
});

test('nomes ambíguos nunca escolhem uma exclusão ou conclusão silenciosamente', () => {
  const data = base(); data.tasks[1].title = data.tasks[0].title;
  for (const action of [{ type: 'excluir', entity: 'compromisso', target: data.tasks[0].title }, { type: 'concluir', title: data.tasks[0].title }] as CommandAction[]) {
    const result = applyCommands(data, [action], options());
    assert.match(result.failed[0], /2 itens/);
    assert.equal(result.applied.length + result.pending.length, 0);
  }
});

test('acrescentar texto preserva HTML e substituir tudo exige confirmação; replace inválido é recusado', () => {
  const data = base(); const original = data.notes[0].content;
  const appended = applyCommands(data, [{ type: 'editar', entity: 'anotacao', target: 'n1', fields: { text: '<script>não executar</script>' } }], options());
  assert.ok(appended.data.notes[0].content.startsWith(original));
  assert.match(appended.data.notes[0].content, /&lt;script&gt;/);
  const bad = applyCommands(data, [{ type: 'editar', entity: 'anotacao', target: 'n1', fields: { text: 'apagar', replace: 'false' } }], options());
  assert.equal(bad.data.notes[0].content, original);
  assert.equal(bad.failed.length, 1);
  const proposed = applyCommands(data, [{ type: 'editar', entity: 'anotacao', target: 'n1', fields: { text: 'Novo conteúdo', replace: true } }], options());
  assert.equal(proposed.data.notes[0].content, original);
  assert.equal(proposed.pending.length, 1);
});

test('hábitos, metas, projetos e tarefas têm vínculos válidos; exclusão de projeto preserva a tarefa', () => {
  const plan: CommandAction[] = [
    { type: 'criar', entity: 'habito', fields: { title: 'Leitura', time: '07:30', period: 'morning', area: 'studies' } },
    { type: 'habito_feito', target: 'Leitura', date: today, done: true },
    { type: 'criar', entity: 'meta', fields: { title: 'Ler 10 livros', metric: { unit: 'livros', baseline: 0, current: 0, target: 10 } } },
    { type: 'criar', entity: 'projeto', fields: { title: 'Clube de leitura', goal: 'Ler 10 livros' } },
    { type: 'criar', entity: 'compromisso', fields: { title: 'Escolher o livro', date: today, project: 'Clube de leitura' } },
  ];
  const result = applyCommands(base(), plan, options());
  assert.deepEqual(result.failed, []);
  assert.equal(result.data.habits!.find(item => item.title === 'Leitura')!.completedDates[0], today);
  assert.ok(result.data.tasks.at(-1)!.projectId);
  const deletion = applyCommands(result.data, [{ type: 'excluir', entity: 'projeto', target: 'Clube de leitura' }], options());
  const deleted = applyCommands(result.data, deletion.pending.map(item => item.action), { ...options(), confirmed: deletion.pending });
  assert.equal(deleted.data.tasks.at(-1)!.projectId, undefined);
  const restored = undoApplied(deleted.data, deleted.applied);
  assert.equal(restored.tasks.at(-1)!.projectId, result.data.tasks.at(-1)!.projectId);
  assert.equal(workspaceSchema.safeParse(restored).success, true);
});

test('cursos, matérias, aulas, cadernos e flashcards podem ser criados e campos privados são recusados', () => {
  const result = applyCommands(base(), [
    { type: 'criar', entity: 'curso', fields: { name: 'Inglês', kind: 'idioma' } },
    { type: 'criar', entity: 'materia', fields: { name: 'Conversação', course: 'Inglês' } },
    { type: 'criar', entity: 'aula', fields: { subject: 'Conversação', weekday: 1, startTime: '19:00' } },
    { type: 'criar', entity: 'caderno', fields: { name: 'Vocabulário', area: 'studies' } },
    { type: 'criar', entity: 'flashcard', fields: { front: 'Hello', back: 'Olá', subject: 'Conversação' } },
    { type: 'editar', entity: 'compromisso', target: 't1', fields: { id: 'roubar-id' } },
  ], options());
  assert.equal(result.applied.length, 5);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0], /não pode ser alterado/);
  assert.equal(workspaceSchema.safeParse(result.data).success, true);
  const linked = applyCommands(result.data, [{ type: 'excluir', entity: 'curso', target: 'Inglês' }], options());
  const removal = applyCommands(result.data, linked.pending.map(item => item.action), { ...options(), confirmed: linked.pending });
  assert.match(removal.failed[0], /vinculados/);
});

test('foco pode pausar, retomar e encerrar, registrando tempo real', () => {
  const config = options();
  const start = applyCommands(base(), [{ type: 'foco', activity: 'Ler' }], config).data;
  const paused = applyCommands(start, [{ type: 'controlar_foco', operation: 'pausar' }], { ...config, now: now + 60_000 }).data;
  assert.equal(paused.activeFocus!.segments.at(-1)!.end, now + 60_000);
  const resumed = applyCommands(paused, [{ type: 'controlar_foco', operation: 'retomar' }], { ...config, now: now + 120_000 }).data;
  const ended = applyCommands(resumed, [{ type: 'controlar_foco', operation: 'encerrar' }], { ...config, now: now + 180_000 });
  assert.equal(ended.data.activeFocus, null);
  assert.equal(ended.data.sessions.at(-1)!.seconds, 120);
});

test('consulta usa dados atuais, calcula finanças e limita notas ao conteúdo solicitado', () => {
  const data = base();
  data.transactions = [{ id: 'expense', type: 'expense', amountCents: 3250, date: today, description: 'Mercado', category: 'Alimentação', status: 'paid' }];
  const result = queryWorkspace(data, { section: 'financeiro', from: today, to: today }, today);
  assert.equal('totalsInReais' in result && result.totalsInReais?.paidExpenses, 32.5);
  assert.equal(JSON.stringify(queryWorkspace(data, { section: 'anotacao' }, today)).includes('<h2>'), false);
  assert.throws(() => queryWorkspace(data, { section: 'anotacao', includeContent: true }, today), /Escolha uma/);
  const note = queryWorkspace(data, { section: 'anotacao', search: 'n1', includeContent: true }, today) as { items: Record<string, unknown>[] };
  assert.ok(note.items && 'text' in note.items[0] && String(note.items[0].text).includes('Uma ideia de cada vez'));
  assert.throws(() => queryWorkspace(data, { section: 'agenda', from: '2026-02-30' }, today));
});

test('confirmação por voz exige frase explícita, sem aceitar negativas ou fala sobre uma confirmação', () => {
  for (const text of ['confirmo a exclusão', 'Sim, confirmo a exclusão.', 'confirmo a substituição']) assert.equal(confirmationIntent(text), 'confirm');
  for (const text of ['sim', 'não confirmo a exclusão', 'se eu disser confirmo a exclusão', 'confirmo a exclusão mas não apague', 'talvez']) assert.notEqual(confirmationIntent(text), 'confirm');
  assert.equal(confirmationIntent('não confirmo a exclusão'), 'cancel');
});

test('modelo Live é descoberto pela capacidade, sem misturar modelos de texto e voz', () => {
  const models = [
    { name: 'models/gemini-9-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.8-live', supportedGenerationMethods: ['bidiGenerateContent'] },
    { name: 'models/gemini-4-live-preview', supportedGenerationMethods: ['bidiGenerateContent'] },
  ];
  assert.equal(chooseLiveModel(models), 'gemini-3.8-live');
  assert.equal(chooseLiveModel(models, 'gemini-9-flash'), null);
  assert.equal(chooseLiveModel([]), null);
  const setup = liveSetup('gemini-3.8-live', 'Hoje: 2026-10-03');
  assert.deepEqual(setup.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(setup.tools[0].functionDeclarations.length, 6);
});

test('PCM mantém amplitude, sinal e ordem little endian', () => {
  const input = new ArrayBuffer(8), bytes = new DataView(input);
  [0, 32767, -32768, 8192].forEach((value, index) => bytes.setInt16(index * 2, value, true));
  assert.deepEqual([...pcmSamples(pcmBase64(input))], [0, 32767 / 32768, -1, .25]);
});

test('resposta de execução não anuncia sucesso quando só houve falha ou pedido de confirmação', () => {
  const result = applyCommands(base(), [{ type: 'excluir', entity: 'compromisso', target: 't1' }], options());
  const text = executionSummary(result);
  assert.match(text, /Preciso da sua confirmação/);
  assert.equal(text.includes('Feito.'), false);
});
