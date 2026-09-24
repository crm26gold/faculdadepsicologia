import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, dateKey, demoWorkspace, emptyWorkspace, parseWorkspace, priorityTasks, workspaceSchema } from '../src/lib/workspace';

const today = '2030-01-07';

test('espaço privado começa totalmente vazio e sem metadados de migração', () => {
  const personal = emptyWorkspace();
  assert.deepEqual(personal, { version: 1, subjects: [], tasks: [], notes: [], sessions: [], classes: [], term: {} });
  assert.equal(Object.hasOwn(personal, 'curriculumVersion'), false);
  assert.deepEqual(parseWorkspace(JSON.stringify(personal)), personal);
});

test('demo contém três matérias genéricas sem nomes de professores', () => {
  const data = demoWorkspace(today);
  assert.equal(workspaceSchema.safeParse(data).success, true);
  assert.deepEqual(data.subjects, [
    { id: 'intro', name: 'Introdução à Psicologia', semester: 1, color: 'sage' },
    { id: 'neuro', name: 'Bases Biológicas', semester: 1, color: 'lavender' },
    { id: 'desenv', name: 'Psicologia do Desenvolvimento', semester: 1, color: 'sand' },
  ]);
  assert.equal(data.subjects.some((subject) => subject.professor), false);
  assert.deepEqual(data.classes.map(({ subjectId, weekday, startTime, intervalWeeks }) => ({ subjectId, weekday, startTime, intervalWeeks })), [
    { subjectId: 'intro', weekday: 1, startTime: '18:00', intervalWeeks: 1 },
    { subjectId: 'neuro', weekday: 3, startTime: '18:00', intervalWeeks: 1 },
    { subjectId: 'desenv', weekday: 5, startTime: '17:00', intervalWeeks: 3 },
  ]);
  assert.equal(data.classes.every((session) => !session.firstDate && !session.endTime && session.location.includes('exemplo')), true);
  assert.equal(Object.hasOwn(data, 'curriculumVersion'), false);
  assert.deepEqual(data.term, {});
  assert.deepEqual(data.sessions, []);
  assert.doesNotMatch(JSON.stringify(data), /[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\//i);
});

test('demo usa datas relativas inclusive na virada do ano', () => {
  const data = demoWorkspace('2030-12-31');
  assert.deepEqual(data.tasks.map((task) => task.date), ['2030-12-31', '2030-12-31', '2030-12-31', '2031-01-02', '2031-01-04']);
});

test('instâncias privadas e demonstrações não compartilham objetos mutáveis', () => {
  const personal = emptyWorkspace();
  const demo = demoWorkspace(today);
  const another = demoWorkspace(today);
  demo.subjects[0].name = 'Matéria de teste';
  demo.tasks[0].done = true;
  demo.notes[0].content = '<p>Alteração de teste</p>';
  demo.classes[0].enabled = false;
  demo.term.start = today;
  personal.subjects.push({ id: 'private-test', name: 'Matéria privada de teste', semester: 1, color: 'sage' });
  assert.equal(another.subjects[0].name, 'Introdução à Psicologia');
  assert.equal(another.tasks[0].done, false);
  assert.notEqual(another.notes[0].content, demo.notes[0].content);
  assert.equal(another.classes[0].enabled, true);
  assert.deepEqual(another.term, {});
  assert.equal(another.subjects.length, 3);
  assert.equal(emptyWorkspace().subjects.length, 0);
});

test('datas não deslocam por UTC e avançam entre meses e anos bissextos', () => {
  assert.equal(dateKey(new Date(2030, 0, 7, 23, 59)), today);
  assert.equal(addDays('2030-12-31', 1), '2031-01-01');
  assert.equal(addDays('2030-03-01', -1), '2030-02-28');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('prioridades limitam a três, omitem concluídas e futuras e preservam dados', () => {
  const data = demoWorkspace(today);
  data.tasks.push(...[1, 2, 3].map((n) => ({ ...data.tasks[0], id: `extra-${n}`, date: '2030-01-06', minutes: n * 10 })));
  const before = structuredClone(data);
  assert.deepEqual(priorityTasks(data, today).map((task) => task.id), ['extra-1', 'extra-2', 'extra-3']);
  assert.deepEqual(data, before);
  assert.deepEqual(priorityTasks(emptyWorkspace(), today), []);
});

test('backups antigos recebem campos opcionais sem preencher o espaço privado', () => {
  const { classes: _classes, term: _term, ...legacy } = demoWorkspace(today);
  assert.deepEqual(parseWorkspace(JSON.stringify(legacy)), { ...legacy, classes: [], term: {} });
  // Derive the compatibility marker without embedding a personal fixture.
  const curriculumVersion = workspaceSchema.shape.curriculumVersion.unwrap().value;
  const marked = { ...legacy, curriculumVersion };
  assert.deepEqual(parseWorkspace(JSON.stringify(marked)), { ...marked, classes: [], term: {} });
  assert.equal(Object.hasOwn(parseWorkspace(JSON.stringify(legacy)), 'curriculumVersion'), false);
  assert.deepEqual(parseWorkspace(JSON.stringify({ version: 1, subjects: [], notes: [], tasks: [], sessions: [] })), emptyWorkspace());
});

test('backup preserva campos editados e conteúdo formatado sem inserir exemplos', () => {
  const data = demoWorkspace(today);
  data.subjects[0].professor = 'Docente de teste';
  data.notes[0].content = '<p><strong>Ideia</strong> e <em>aprendizado</em> — ação</p>';
  data.classes[0].startTime = '16:00';
  data.classes[0].endTime = '17:00';
  data.classes[0].firstDate = today;
  data.term = { start: today, end: '2030-06-30' };
  data.sessions.push({ id: 'session-test', date: today, minutes: 25 });
  assert.deepEqual(parseWorkspace(JSON.stringify(data)), data);
});

test('backup rejeita versão incompatível, JSON inválido e cargas grandes', () => {
  for (const raw of ['invalid', 'null', '[]', '{}', JSON.stringify({ ...emptyWorkspace(), version: 2 }), 'x'.repeat(2_000_001)]) {
    assert.throws(() => parseWorkspace(raw));
  }
});

for (const collection of ['tasks', 'notes', 'classes'] as const) {
  test(`backup rejeita matéria desconhecida em ${collection}`, () => {
    const data = demoWorkspace(today);
    data[collection][0].subjectId = 'unknown-subject';
    assert.throws(() => parseWorkspace(JSON.stringify(data)));
  });
}

test('tarefas e notas podem ficar sem matéria, mas aulas exigem matéria existente', () => {
  const data = demoWorkspace(today);
  data.tasks[0].subjectId = '';
  data.notes[0].subjectId = '';
  assert.deepEqual(parseWorkspace(JSON.stringify(data)), data);
  data.classes[0].subjectId = '';
  assert.throws(() => parseWorkspace(JSON.stringify(data)));
});

for (const collection of ['subjects', 'tasks', 'notes', 'sessions', 'classes'] as const) {
  test(`backup rejeita IDs duplicados em ${collection}`, () => {
    const data = demoWorkspace(today);
    data.sessions.push({ id: 'session-test', date: today, minutes: 25 });
    assert.throws(() => parseWorkspace(JSON.stringify({ ...data, [collection]: [...data[collection], data[collection][0]] })));
  });
}

test('backup rejeita datas impossíveis e limites de coleções', () => {
  const data = demoWorkspace(today);
  for (const date of ['2030-02-29', '2030-02-31', '2030-13-01', '07/01/2030']) {
    assert.throws(() => parseWorkspace(JSON.stringify({ ...data, tasks: [{ ...data.tasks[0], date }] })));
  }
  const subjects = Array.from({ length: 101 }, (_, i) => ({ ...data.subjects[0], id: `subject-${i}` }));
  assert.equal(workspaceSchema.safeParse({ ...emptyWorkspace(), subjects }).success, false);
});
