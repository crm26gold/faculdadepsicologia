import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommands, commandContext, parseCommand, undoApplied } from '../src/lib/commands';
import { CURRENT_EDITOR_GENERATION, emptyWorkspace, workspaceSchema, type Workspace } from '../src/lib/workspace';

const ids = () => { let n = 0; return () => `id-${++n}`; };
const now = Date.parse('2026-10-02T13:00:00Z');
const base = (): Workspace => ({ ...emptyWorkspace(), editorGeneration: CURRENT_EDITOR_GENERATION,
  courses: [{ id: 'psi', name: 'Psicologia', kind: 'graduacao', color: 'rose', status: 'active' }],
  subjects: [{ id: 'ppb', name: 'Processos Psicológicos Básicos', color: 'rose', courseId: 'psi' }],
  tasks: [{ id: 'old', title: 'Ligar para o dentista', subjectId: '', date: '2026-10-01', kind: 'Tarefa', done: false, minutes: 10 }] });

test('a resposta da IA vira ações validadas, mesmo com texto em volta do JSON', () => {
  const result = parseCommand('```json\n{"reply":"Feito!","actions":[{"type":"compromisso","title":"Dentista","date":"2026-10-03","time":"15:00"},{"type":"compromisso","title":"sem data"},{"type":"invente"}]}\n```');
  assert.equal(result.reply, 'Feito!');
  assert.equal(result.actions.length, 1);
  assert.deepEqual(parseCommand('Não entendi.'), { reply: 'Não entendi.', actions: [] });
});

test('compromisso, anotação, gasto parcelado, foco e concluir viram dados válidos do espaço', () => {
  const { data, applied, failed } = applyCommands(base(), [
    { type: 'compromisso', title: 'Prova de PPB', date: '2026-10-05', time: '19:10', kind: 'Prova', subject: 'processos psicologicos' },
    { type: 'compromisso', title: 'Academia', date: '2026-10-03', area: 'saude' },
    { type: 'anotacao', text: 'Ideia: livro sobre hábitos\ncom capítulos curtos' },
    { type: 'financeiro', flow: 'expense', description: 'Notebook', amount: 325, category: 'compras', date: '2026-10-15', installments: 3 },
    { type: 'financeiro', flow: 'expense', description: 'Café', amount: 8.5, category: 'categoria que não existe', date: '2026-10-02' },
    { type: 'concluir', title: 'dentista' },
    { type: 'foco', activity: 'Leitura', minutes: 25 },
  ], { today: '2026-10-02', now, newId: ids() });
  assert.deepEqual(failed, []);
  assert.equal(applied.length, 7);
  const prova = data.tasks.find(task => task.title === 'Prova de PPB')!;
  assert.deepEqual([prova.subjectId, prova.areaId, prova.time, prova.kind], ['ppb', 'studies', '19:10', 'Prova']);
  assert.equal(data.tasks.find(task => task.title === 'Academia')!.areaId, 'health');
  assert.equal(data.tasks.find(task => task.id === 'old')!.done, true);
  assert.equal(data.notes[0].title, 'Ideia: livro sobre hábitos');
  const notebook = data.transactions!.filter(item => item.description === 'Notebook');
  assert.deepEqual(notebook.map(item => [item.date, item.status, item.installment?.index]), [['2026-10-15', 'pending', 1], ['2026-11-15', 'pending', 2], ['2026-12-15', 'pending', 3]]);
  const coffee = data.transactions!.find(item => item.description === 'Café')!;
  assert.deepEqual([coffee.amountCents, coffee.category, coffee.status], [850, 'Outros', 'paid']);
  assert.equal(data.activeFocus?.activity, 'Leitura');
  assert.equal(data.activeFocus?.targetSeconds, 1500);
  assert.match(applied[0].label, /^Prova: Prova de PPB · .*às 19:10$/);
  assert.equal(workspaceSchema.safeParse(data).success, true);
});

test('uma ação que falha não derruba as outras', () => {
  const started = applyCommands(base(), [{ type: 'foco', activity: 'Estudo' }], { today: '2026-10-02', now, newId: ids() }).data;
  const { applied, failed } = applyCommands(started, [{ type: 'foco', activity: 'Outro' }, { type: 'concluir', title: 'algo que não existe' }, { type: 'anotacao', text: 'ok' }], { today: '2026-10-02', now, newId: ids() });
  assert.equal(applied.length, 1);
  assert.equal(failed.length, 2);
});

test('o contexto mandado para a IA é curto e traz o que importa', () => {
  const context = commandContext(base(), '2026-10-02');
  assert.match(context, /^Hoje: sexta-feira, 2026-10-02\./);
  assert.match(context, /Atrasados: Ligar para o dentista/);
  assert.match(context, /Matérias e módulos: Processos Psicológicos Básicos/);
  assert.ok(context.length < 6000);
});

test('desfazer tira exatamente o que o comando criou e reabre o que ele concluiu', () => {
  const start = base();
  const { data, applied } = applyCommands(start, [
    { type: 'compromisso', title: 'Academia', date: '2026-10-03' },
    { type: 'financeiro', flow: 'expense', description: 'Curso', amount: 100, date: '2026-10-20', installments: 2 },
    { type: 'concluir', title: 'dentista' },
    { type: 'foco', activity: 'Leitura' },
  ], { today: '2026-10-02', now, newId: ids() });
  const edited = { ...data, notes: [{ id: 'later', title: 'Escrita depois', subjectId: '', content: '<p>x</p>', updatedAt: '2026-10-02T14:00:00Z' }] };
  const back = undoApplied(edited, applied);
  assert.deepEqual(back.tasks, start.tasks);
  assert.deepEqual(back.transactions, []);
  assert.equal(back.activeFocus, null);
  assert.equal(back.notes[0].id, 'later');
});
