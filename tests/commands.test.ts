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

test('saldo inicial, semestre e perfil são ajustados pelo assistente e desfeitos sem apagar edições posteriores', () => {
  const start: Workspace = { ...base(), profile: { name: 'Ana', course: '', semester: '', institution: '', campus: '', registration: '', email: '', phone: '', photoUrl: 'data:image/png;base64,AAAA' } };
  const { data, applied, failed } = applyCommands(start, [
    { type: 'saldo_inicial', amount: 1250.5 },
    { type: 'semestre', start: '2026-08-03', end: '2026-12-18' },
    { type: 'perfil', fields: { institution: 'Anhanguera', semester: '3º' } },
  ], { today: '2026-10-02', now, newId: ids() });
  assert.deepEqual(failed, []);
  assert.deepEqual(data.finance, { openingCents: 125050, openingDate: '2026-10-02' });
  assert.deepEqual(data.term, { start: '2026-08-03', end: '2026-12-18' });
  assert.deepEqual([data.profile!.name, data.profile!.institution, data.profile!.semester, data.profile!.photoUrl], ['Ana', 'Anhanguera', '3º', 'data:image/png;base64,AAAA']);
  assert.equal(applied[2].label, 'Perfil atualizado: semestre, instituição');
  assert.doesNotThrow(() => workspaceSchema.parse(data));

  const corrected = applyCommands(data, [{ type: 'saldo_inicial', amount: -80, date: '2026-10-01' }], { today: '2026-10-02', now, newId: ids() });
  assert.match(corrected.applied[0].label, /antes: R\$\s?1\.250,50/);
  assert.deepEqual(undoApplied(corrected.data, corrected.applied).finance, data.finance);

  const undone = undoApplied(data, applied);
  assert.deepEqual([undone.finance, undone.term, undone.profile], [undefined, {}, start.profile]);
  const editedLater = { ...data, term: { start: '2026-08-10', end: '2026-12-18' } };
  assert.deepEqual(undoApplied(editedLater, applied).term, editedLater.term);
});

test('ajustes inválidos não mudam nada e explicam o motivo', () => {
  const { data, applied, failed } = applyCommands(base(), [
    { type: 'semestre', start: '2026-12-18', end: '2026-08-03' },
    { type: 'semestre' },
    { type: 'perfil', fields: { email: 'não é e-mail' } },
    { type: 'perfil', fields: { photoUrl: 'data:image/png;base64,AAAA' } as never },
  ], { today: '2026-10-02', now, newId: ids() });
  assert.equal(applied.length, 0);
  assert.equal(failed.length, 4);
  assert.match(failed[0], /fim do semestre/);
  assert.match(failed[1], /início ou o fim/);
  assert.match(failed[3], /Informe o que mudar/);
  assert.deepEqual([data.term, data.profile, data.finance], [{}, undefined, undefined]);
});

test('com a lixeira, até 5 exclusões são diretas; acima disso, e substituir o texto de uma nota, pedem confirmação', () => {
  const many = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `t${index}`, title: `Item ${index}`, subjectId: '', date: '2026-10-05', kind: 'Tarefa' as const, done: false, minutes: 10 }));
  const start: Workspace = { ...base(), tasks: many(7), notes: [{ id: 'n1', title: 'Nota', content: '<p>a</p>', subjectId: '', updatedAt: '2026-10-01T10:00:00Z' }] };
  const small = applyCommands(start, many(2).map(task => ({ type: 'excluir', entity: 'compromisso', target: task.id })), { today: '2026-10-02', now, newId: ids(), deleteDirectly: true });
  assert.deepEqual([small.applied.length, small.pending.length, small.data.tasks.length], [2, 0, 5]);
  assert.match(small.applied[0].label, /lixeira por 30 dias/);
  assert.equal(undoApplied(small.data, small.applied).tasks.length, 7, 'desfazer traz de volta');
  const large = applyCommands(start, many(6).map(task => ({ type: 'excluir', entity: 'compromisso', target: task.id })), { today: '2026-10-02', now, newId: ids(), deleteDirectly: true });
  assert.deepEqual([large.applied.length, large.pending.length], [0, 6], 'exclusão grande pede confirmação');
  const replace = applyCommands(start, [{ type: 'editar', entity: 'anotacao', target: 'n1', fields: { text: 'novo', replace: true } }], { today: '2026-10-02', now, newId: ids(), deleteDirectly: true });
  assert.equal(replace.pending.length, 1);
  const noTrash = applyCommands(start, [{ type: 'excluir', entity: 'compromisso', target: 't0' }], { today: '2026-10-02', now, newId: ids() });
  assert.equal(noTrash.pending.length, 1, 'sem lixeira, continua pedindo confirmação');
});

test('restaurar traz o item da lixeira de volta e recusa o que for ambíguo ou já estiver de volta', () => {
  const trash = [
    { id: 'lx-a', collection: 'tasks' as const, item_id: 'gone', item: { id: 'gone', title: 'Dentista', subjectId: '', date: '2026-10-05', kind: 'Compromisso', done: false, minutes: 30 }, deleted_at: '2026-10-02T10:00:00Z' },
    { id: 'lx-b', collection: 'notes' as const, item_id: 'n9', item: { id: 'n9', title: 'Ideia', content: '<p>x</p>', subjectId: '', updatedAt: '2026-10-01T10:00:00Z' }, deleted_at: '2026-10-02T09:00:00Z' },
    { id: 'lx-c', collection: 'notes' as const, item_id: 'n8', item: { id: 'n8', title: 'Ideia', content: '<p>y</p>', subjectId: '', updatedAt: '2026-10-01T09:00:00Z' }, deleted_at: '2026-10-02T08:00:00Z' },
  ];
  const restored = applyCommands(base(), [{ type: 'restaurar', target: 'dentista' }], { today: '2026-10-02', now, newId: ids(), trash });
  assert.deepEqual(restored.failed, []);
  assert.equal(restored.data.tasks.find(task => task.id === 'gone')?.title, 'Dentista');
  assert.equal(restored.applied[0].label, 'Restaurado: Dentista');
  const byId = applyCommands(base(), [{ type: 'restaurar', target: 'lx-b' }], { today: '2026-10-02', now, newId: ids(), trash });
  assert.equal(byId.data.notes[0].id, 'n9');
  const problems = applyCommands(restored.data, [{ type: 'restaurar', target: 'Ideia' }, { type: 'restaurar', target: 'gone' }, { type: 'restaurar', target: 'Nada' }], { today: '2026-10-02', now, newId: ids(), trash });
  assert.equal(problems.applied.length, 0);
  assert.match(problems.failed[0], /mais de um/);
  assert.match(problems.failed[1], /já está de volta/);
  assert.match(problems.failed[2], /não encontrei/);
  assert.match(applyCommands(base(), [{ type: 'restaurar', target: 'x' }], { today: '2026-10-02', now, newId: ids() }).failed[0], /lixeira não está disponível/);
});

test('anotação rápida vai direto ao caderno, à matéria ou à área; caderno novo é criado e o desfazer leva os dois', () => {
  const start = { ...base(), notebooks: [{ id: 'nb-ideias', name: 'Ideias', areaId: '', color: 'sage' as const }] };
  const { data, applied, failed } = applyCommands(start, [
    { type: 'anotacao', text: 'Livro sobre hábitos', notebook: 'ideias' },
    { type: 'anotacao', text: 'Resumo da aula 3', notebook: 'Processos Psicológicos Básicos' },
    { type: 'anotacao', text: 'Treino de força', area: 'saude' },
    { type: 'anotacao', text: 'Receita de pão', title: 'Pão de fermentação natural', notebook: 'Receitas' },
    { type: 'anotacao', text: 'coloca aí, depois a gente organiza' },
  ], { today: '2026-10-02', now, newId: ids() });
  assert.deepEqual(failed, []);
  assert.equal(workspaceSchema.safeParse(data).success, true);
  assert.deepEqual(applied.map(item => item.label), [
    'Anotação no caderno Ideias: Livro sobre hábitos',
    'Anotação em Processos Psicológicos Básicos: Resumo da aula 3',
    'Anotação em Saúde física: Treino de força',
    'Anotação no caderno Receitas (caderno criado): Pão de fermentação natural',
    'Anotação em Para organizar: coloca aí, depois a gente organiza',
  ]);
  const byTitle = (title: string) => data.notes.find(note => note.title === title)!;
  assert.equal(byTitle('Livro sobre hábitos').notebookId, 'nb-ideias');
  assert.equal(byTitle('Resumo da aula 3').subjectId, 'ppb', 'matéria já é um caderno: não duplica');
  assert.equal(data.notebooks?.filter(book => book.name === 'Processos Psicológicos Básicos').length, 0);
  assert.equal(byTitle('Treino de força').areaId, 'health');
  const recipes = data.notebooks?.find(book => book.name === 'Receitas');
  assert.ok(recipes);
  assert.equal(byTitle('Pão de fermentação natural').notebookId, recipes.id);
  const loose = byTitle('coloca aí, depois a gente organiza');
  assert.deepEqual([loose.subjectId, loose.notebookId, loose.areaId], ['', '', '']);
  const undone = undoApplied(data, applied.slice(3, 4));
  assert.equal(undone.notebooks?.some(book => book.name === 'Receitas'), false);
  assert.equal(undone.notes.some(note => note.title === 'Pão de fermentação natural'), false);
});

test('contexto conta os pendentes para organizar por voz', () => {
  const start = { ...base(), notes: [{ id: 'solta', title: 'Ideia solta', content: '', subjectId: '', areaId: '', notebookId: '', updatedAt: '2026-10-01T10:00:00Z' }] };
  const context = commandContext(start, '2026-10-02');
  assert.match(context, /Pendentes: 1 anotações em Para organizar \(Ideia solta \[solta\]\); 1 compromissos atrasados\./);
  assert.match(commandContext({ ...emptyWorkspace(), editorGeneration: CURRENT_EDITOR_GENERATION }, '2026-10-02'), /Pendentes: nada\./);
});
