import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyChanges, mergeChanges, workspaceChanges, workspaceChangesSchema } from '../src/lib/workspace-sync';
import { CURRENT_EDITOR_GENERATION, demoWorkspace, emptyWorkspace, parseWorkspace, type Workspace } from '../src/lib/workspace';

const today = '2026-10-08';
const parsed = (value: unknown) => parseWorkspace(JSON.stringify(value));
const base = () => parsed({ ...emptyWorkspace(), editorGeneration: CURRENT_EDITOR_GENERATION,
  tasks: [{ id: 't1', title: 'Pagar a luz', subjectId: '', date: today, kind: 'Tarefa', done: false, minutes: 15 }, { id: 't2', title: 'Academia', subjectId: '', date: today, kind: 'Tarefa', done: false, minutes: 60 }],
  notes: [{ id: 'n1', title: 'Viagem', content: '<p>praia</p>', subjectId: '', updatedAt: '2026-10-07T10:00:00Z' }],
  transactions: [{ id: 'x1', description: 'Mercado', amountCents: 25000, type: 'expense', category: 'Alimentação', date: today, status: 'paid', paidOn: today, areaId: 'finance' }] });
const edit = (doc: Workspace, change: (copy: Workspace) => void) => { const copy = structuredClone(doc); change(copy); return parsed(copy); };
const save = (server: Workspace, screen: Workspace, from: Workspace) => mergeChanges(server, workspaceChanges(from, screen) ?? {});

test('salvar só o que mudou: um item novo, um editado e um removido, sem mandar o resto', () => {
  const start = base();
  const next = edit(start, copy => {
    copy.notes.unshift({ id: 'n2', title: 'Ideias', content: '', subjectId: '', updatedAt: '2026-10-08T10:00:00Z' });
    copy.tasks[0].done = true;
    copy.transactions = [];
  });
  const changes = workspaceChanges(start, next)!;
  assert.ok(workspaceChangesSchema.safeParse(changes).success);
  assert.deepEqual(Object.keys(changes.lists!).sort(), ['notes', 'tasks', 'transactions'], 'só as listas que mudaram');
  assert.deepEqual(changes.lists!.tasks!.put!.map(item => item.data.id), ['t1'], 'só o compromisso editado vai');
  assert.equal(changes.lists!.notes!.put![0].base, null, 'item novo vai sem impressão anterior');
  assert.deepEqual(changes.lists!.notes!.order, ['n2', 'n1'], 'a ordem vai porque a anotação nova entrou no começo');
  assert.equal(changes.lists!.tasks!.order, undefined, 'editar não manda a ordem');
  assert.deepEqual(changes.lists!.transactions!.remove!.map(item => item.id), ['x1']);
  assert.equal(changes.settings, undefined, 'os campos únicos não mudaram');
  assert.ok(JSON.stringify(changes).length < JSON.stringify(next).length, 'vai menos do que o documento inteiro');
  assert.deepEqual(parsed(save(start, next, start).merged), next, 'aplicar as mudanças dá exatamente a versão da tela');
  assert.equal(workspaceChanges(next, next), null, 'nada mudou, nada vai');
});

test('dois lugares mudando registros diferentes ao mesmo tempo: os dois ficam, sem aviso', () => {
  const start = base();
  const server = edit(start, copy => { copy.tasks[1].title = 'Academia às 7h'; });
  const screen = edit(start, copy => { copy.tasks[0].done = true; copy.notes[0].title = 'Viagem de férias'; });
  const { merged, conflicts } = save(server, screen, start);
  const result = parsed(merged);
  assert.deepEqual(conflicts, []);
  assert.equal(result.tasks.find(task => task.id === 't2')!.title, 'Academia às 7h', 'a mudança do outro lugar continua');
  assert.equal(result.tasks.find(task => task.id === 't1')!.done, true, 'a mudança desta tela entrou');
  assert.equal(result.notes[0].title, 'Viagem de férias');
});

test('o mesmo registro mudado nos dois lugares: fica a versão mais recente, com aviso', () => {
  const start = base();
  const server = edit(start, copy => { copy.tasks[0].title = 'Pagar a luz até sexta'; });
  const screen = edit(start, copy => { copy.tasks[0].title = 'Pagar a luz hoje'; });
  const { merged, conflicts } = save(server, screen, start);
  assert.deepEqual(conflicts, [{ list: 'tasks', id: 't1' }]);
  assert.equal(parsed(merged).tasks[0].title, 'Pagar a luz hoje');
});

test('uma edição nunca some porque o outro lugar apagou o registro, e apagar não leva o que o outro editou', () => {
  const start = base();
  const removedThere = edit(start, copy => { copy.notes = []; });
  const editedHere = edit(start, copy => { copy.notes[0].content = '<p>praia e serra</p>'; });
  const kept = save(removedThere, editedHere, start);
  assert.equal(parsed(kept.merged).notes[0].content, '<p>praia e serra</p>');
  assert.deepEqual(kept.conflicts, [{ list: 'notes', id: 'n1' }]);
  const editedThere = edit(start, copy => { copy.transactions![0].description = 'Mercado do mês'; });
  const removedHere = edit(start, copy => { copy.transactions = []; });
  const stays = save(editedThere, removedHere, start);
  assert.equal(parsed(stays.merged).transactions![0].description, 'Mercado do mês');
  assert.deepEqual(stays.conflicts, [{ list: 'transactions', id: 'x1' }]);
});

test('campos únicos se juntam campo a campo, e uma lista opcional ausente continua ausente', () => {
  const start = base();
  assert.equal(start.areas, undefined);
  const server = edit(start, copy => { copy.term = { ...copy.term, start: '2026-08-03' }; });
  const screen = edit(start, copy => { copy.finance = { openingCents: 50000, openingDate: today }; });
  const { merged, conflicts } = save(server, screen, start);
  const result = parsed(merged);
  assert.deepEqual(conflicts, []);
  assert.equal(result.term.start, '2026-08-03', 'o semestre mudado lá continua');
  assert.equal(result.finance?.openingCents, 50000, 'o saldo inicial mudado aqui entrou');
  assert.equal(result.areas, undefined, 'sem lista de áreas, valem as áreas padrão');
  const blank = parsed(emptyWorkspace()), emptied = edit(blank, copy => { copy.areas = []; });
  assert.deepEqual(parsed(save(blank, emptied, blank).merged).areas, [], 'uma lista de áreas vazia continua vazia');
});

test('a ordem: o que esta tela pôs no começo vai para o começo, e o que o outro lugar criou mantém o lugar', () => {
  const start = base();
  const server = edit(start, copy => { copy.notes.unshift({ id: 'n9', title: 'Do assistente', content: '', subjectId: '', updatedAt: '2026-10-08T09:00:00Z' }); });
  const screen = edit(start, copy => { copy.notes.unshift({ id: 'n2', title: 'Desta tela', content: '', subjectId: '', updatedAt: '2026-10-08T10:00:00Z' }); });
  const { merged, conflicts } = save(server, screen, start);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(parsed(merged).notes.map(note => note.id), ['n9', 'n2', 'n1']);
});

test('um espaço de demonstração inteiro vai e volta igual pelas mudanças', () => {
  const start = parsed(demoWorkspace(today));
  const next = edit(start, copy => {
    copy.tasks.reverse();
    copy.notes = copy.notes.slice(1);
    copy.habits = [...(copy.habits ?? []), { id: 'h-novo', period: 'morning', title: 'Beber água', time: '08:00', completedDates: [today], areaId: 'health' }];
    copy.profile = { name: 'Pessoa', course: '', semester: '', institution: '', campus: '', registration: '', email: '', phone: '', photoUrl: '' };
  });
  assert.deepEqual(parsed(save(start, next, start).merged), next);
});

test('o mesmo ajuste feito nos dois lugares não conta como conflito', () => {
  const start = base();
  const both = edit(start, copy => { copy.tasks[0].done = true; copy.term = { start: '2026-08-03' }; });
  assert.deepEqual(save(both, both, start).conflicts, []);
});

test('uma lista opcional que deixa de existir só some vazia: o que outro lugar pôs nela fica', () => {
  const blank = parsed(emptyWorkspace());
  const withAreas = edit(blank, copy => { copy.areas = []; });
  const changes = workspaceChanges(withAreas, blank)!;
  assert.deepEqual(changes.lists!.areas, { present: false });
  assert.equal(parsed(mergeChanges(withAreas, changes).merged).areas, undefined, 'volta para as áreas padrão');
  const filledThere = edit(withAreas, copy => { copy.areas = [{ id: 'casa', name: 'Casa', color: 'sand', hidden: false }]; });
  assert.deepEqual(parsed(mergeChanges(filledThere, changes).merged).areas!.map(area => area.id), ['casa']);
});

test('no servidor: app antigo, regra entre registros e limite de tamanho barram a gravação sem mudar nada', () => {
  const start = base();
  const generation = start.editorGeneration!;
  const done = workspaceChanges(start, edit(start, copy => { copy.tasks[0].done = true; }))!;
  assert.deepEqual(applyChanges(start, done, generation - 1, false), { refused: 'outdated' }, 'um aparelho com app antigo apagaria campos que não conhece');
  const saved = applyChanges(start, done, generation, false);
  assert.ok('workspace' in saved && saved.workspace.tasks[0].done && saved.conflicts.length === 0);

  // Uma meta apagada num lugar enquanto, em outro, um projeto novo foi ligado a ela.
  const planned = edit(start, copy => { copy.goals = [{ id: 'g1', title: 'Juntar R$ 5 mil', status: 'active' }]; });
  const goalGone = edit(planned, copy => { copy.goals = []; });
  const linked = workspaceChanges(planned, edit(planned, copy => { copy.projects = [{ id: 'p1', title: 'Reserva de emergência', goalId: 'g1', status: 'active' }]; }))!;
  assert.deepEqual(applyChanges(goalGone, linked, generation, true), { refused: 'clash' }, 'duas mudanças que não combinam');
  assert.deepEqual(applyChanges(goalGone, linked, generation, false), { refused: 'invalid' }, 'sem outra gravação no meio, o pedido é que está errado');

  const huge = { lists: { notes: { put: Array.from({ length: 11 }, (_, at) => ({ data: { id: `grande-${at}`, title: 'Diário', content: 'x'.repeat(190_000), subjectId: '', updatedAt: '2026-10-08T10:00:00Z' }, base: null })) } } };
  assert.deepEqual(applyChanges(start, huge, generation, false), { refused: 'full' });
});

test('o pedido de mudanças recusa chaves estranhas e listas desconhecidas', () => {
  assert.equal(workspaceChangesSchema.safeParse({ settings: { __proto__x: { value: 1, base: null } } }).success, false);
  const proto = workspaceChangesSchema.parse(JSON.parse('{"settings":{"__proto__":{"value":1,"base":null}},"lists":{"tasks":{"put":[{"data":{"id":"a","__proto__":{"polluted":true}},"base":null}]}}}'));
  assert.deepEqual(Object.getOwnPropertyNames(proto.settings), [], 'a chave __proto__ é descartada');
  assert.equal((proto.lists!.tasks!.put![0].data as Record<string, unknown>).polluted, undefined, 'nada contamina o protótipo');
  assert.equal(workspaceChangesSchema.safeParse({ lists: { senhas: { put: [] } } }).success, false);
  assert.equal(workspaceChangesSchema.safeParse({ lists: { tasks: { put: [{ data: { title: 'sem id' }, base: null }] } } }).success, false);
  const sneaky = mergeChanges(base(), { settings: { tasks: { value: [], base: null } } });
  assert.equal(sneaky.merged.tasks.length, 2, 'uma lista não muda pelos campos únicos');
});
