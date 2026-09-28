import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, parseWorkspace, workspaceSchema } from '../src/lib/workspace';
import { defaultAreas, lifeAreas, itemArea } from '../src/lib/life';
import { calendarEntries, studySuggestions } from '../src/lib/academic';
import { calculateHabitStreak } from '../src/lib/life-data';

test('old workspaces remain readable without seeding or classifying personal notes', () => {
  const before = emptyWorkspace();
  assert.deepEqual(parseWorkspace(JSON.stringify(before)), before);
  assert.equal(itemArea({ subjectId: '' }), '');
  assert.equal(itemArea({ subjectId: 'subject' }), 'studies');
  assert.equal(lifeAreas(before).length, 11);
  assert.ok(defaultAreas.some((area) => area.id === 'spiritual'));
});
test('personal notebooks and all life commitments survive serialization', () => {
  const data = workspaceSchema.parse({ ...emptyWorkspace(), editorGeneration: 2,
    notebooks: [{ id: 'diary', name: 'Diário', areaId: 'emotional', color: 'blue' }],
    notes: [{ id: 'n', title: 'Reflexão', subjectId: '', areaId: 'emotional', notebookId: 'diary', content: '<p>Texto</p>', updatedAt: '2026-09-27T12:00:00Z' }],
    tasks: [{ id: 't', title: 'Reunião', subjectId: '', areaId: 'work', kind: 'Reunião', date: '2026-09-27', minutes: 30, done: false }],
  });
  assert.deepEqual(parseWorkspace(JSON.stringify(data)), data);
  const entries = calendarEntries(data, '2026-09-27', '2026-09-27');
  assert.equal(entries[0].areaId, 'work');
  assert.equal(studySuggestions(data, '2026-09-27').length, 0);
});
test('invalid references and duplicate life areas are rejected', () => {
  assert.equal(workspaceSchema.safeParse({ ...emptyWorkspace(), areas: [defaultAreas[0], defaultAreas[0]] }).success, false);
  assert.equal(workspaceSchema.safeParse({ ...emptyWorkspace(), notebooks: [{ id: 'n', name: 'Diário', color: 'blue', areaId: 'absent' }] }).success, false);
  assert.equal(workspaceSchema.safeParse({ ...emptyWorkspace(), notes: [{ id: 'n', title: 'Reflexão', subjectId: '', notebookId: 'absent', content: '', updatedAt: '2026-09-27T12:00:00Z' }] }).success, false);
});

test('finances, daily routine and user profile survive serialization and validate correctly', () => {
  const data = workspaceSchema.parse({
    ...emptyWorkspace(),
    editorGeneration: 3,
    transactions: [
      { id: 'tx-1', description: 'Mensalidade', amountCents: 45000, type: 'expense', category: 'Faculdade', date: '2026-09-27', areaId: 'studies' },
      { id: 'tx-2', description: 'Bolsa estágio', amountCents: 120000, type: 'income', category: 'Remuneração', date: '2026-09-27', areaId: 'work' },
    ],
    habits: [
      { id: 'hb-1', period: 'morning', time: '07:30', title: 'Meditação e leitura', areaId: 'emotional', completedDates: ['2026-09-26', '2026-09-27'] },
    ],
    profile: {
      name: 'Estudante Real',
      course: 'Psicologia',
      semester: '1º Semestre',
      institution: 'UNIP',
      campus: 'Campus Central',
      registration: 'PSI2026',
      email: '',
      phone: '',
      photoUrl: '',
    },
    sessions: [
      { id: 'sess-1', date: '2026-09-27', minutes: 25, subjectId: '' },
    ],
  });

  const parsed = parseWorkspace(JSON.stringify(data));
  assert.deepEqual(parsed, data);
  assert.equal(parsed.transactions?.length, 2);
  assert.equal(parsed.habits?.[0].completedDates.length, 2);
  assert.equal(parsed.profile?.name, 'Estudante Real');

  // Duplicate transaction or habit IDs are rejected
  assert.equal(workspaceSchema.safeParse({ ...data, transactions: [data.transactions![0], data.transactions![0]] }).success, false);
  assert.equal(workspaceSchema.safeParse({ ...data, habits: [data.habits![0], data.habits![0]] }).success, false);
  // Invalid areaId in habit is rejected
  assert.equal(workspaceSchema.safeParse({ ...data, habits: [{ ...data.habits![0], areaId: 'non-existent-area' }] }).success, false);
});

test('calculateHabitStreak counts consecutive days correctly', () => {
  assert.equal(calculateHabitStreak([], '2026-09-28'), 0);
  assert.equal(calculateHabitStreak(['2026-09-28'], '2026-09-28'), 1);
  assert.equal(calculateHabitStreak(['2026-09-27'], '2026-09-28'), 1);
  assert.equal(calculateHabitStreak(['2026-09-27', '2026-09-28'], '2026-09-28'), 2);
  assert.equal(calculateHabitStreak(['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'], '2026-09-28'), 4);
  assert.equal(calculateHabitStreak(['2026-09-25', '2026-09-27', '2026-09-28'], '2026-09-28'), 2);
  assert.equal(calculateHabitStreak(['2026-09-25'], '2026-09-28'), 0);
});

test('flashcards survive serialization, reject duplicates and non-existent subjects', () => {
  const base = emptyWorkspace();
  const valid = workspaceSchema.parse({
    ...base,
    subjects: [{ id: 'sub-psi', name: 'Psicologia Geral', color: 'sage', semester: 1, professor: '' }],
    flashcards: [
      { id: 'fc-1', subjectId: 'sub-psi', front: 'Conceito de Id', back: 'Princípio do prazer', intervalDays: 3, repetitionCount: 2, lastStudied: '2026-09-27' },
      { id: 'fc-2', subjectId: '', front: 'Conceito Geral', back: 'Resposta geral', intervalDays: 1, repetitionCount: 0 },
    ],
  });
  const parsed = parseWorkspace(JSON.stringify(valid));
  assert.equal(parsed.flashcards?.length, 2);
  assert.equal(parsed.flashcards?.[0].front, 'Conceito de Id');

  // Duplicate ID rejected
  assert.equal(workspaceSchema.safeParse({
    ...valid,
    flashcards: [valid.flashcards![0], valid.flashcards![0]],
  }).success, false);

  // Non-existent subjectId rejected
  assert.equal(workspaceSchema.safeParse({
    ...valid,
    flashcards: [{ id: 'fc-bad', subjectId: 'non-existent', front: 'F', back: 'B', intervalDays: 1, repetitionCount: 0 }],
  }).success, false);
});


