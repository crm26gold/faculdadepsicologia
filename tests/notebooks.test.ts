import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteExcerpt, notesIn, parsePlace, placeFields, placeGroups, placeKey, placeOf, placeTrail } from '../src/lib/notebooks';
import { CURRENT_EDITOR_GENERATION, emptyWorkspace, workspaceSchema, type Workspace } from '../src/lib/workspace';

const note = (id: string, over: Partial<Workspace['notes'][number]> = {}) => ({ id, title: id, subjectId: '', content: '<p>Texto</p>', updatedAt: `2026-10-0${id.length}T12:00:00Z`, ...over });
const data = (): Workspace => ({ ...emptyWorkspace(), editorGeneration: CURRENT_EDITOR_GENERATION,
  courses: [{ id: 'psi', name: 'Psicologia', kind: 'graduacao', color: 'rose', status: 'active' }, { id: 'ia', name: 'IA para negócios', kind: 'livre', color: 'sage', status: 'paused' }],
  subjects: [{ id: 'etica', name: 'Ética', color: 'rose', courseId: 'psi' }, { id: 'ia1', name: 'IA 1', color: 'sage', courseId: 'ia' }],
  notebooks: [{ id: 'diario', name: 'Diário', areaId: 'emotional', color: 'lavender' }],
  notes: [note('a', { subjectId: 'etica' }), note('bb', { notebookId: 'diario', areaId: 'emotional' }), note('ccc', { areaId: 'health' }), note('dddd'), note('eeeee', { subjectId: 'etica', notebookId: 'diario' })] });

test('cada anotação mora em um só lugar: matéria, caderno, área ou Para organizar', () => {
  const space = data();
  assert.deepEqual(space.notes.map(item => placeKey(placeOf(item))), ['subject:etica', 'notebook:diario', 'area:health', 'inbox', 'subject:etica']);
  assert.deepEqual(notesIn(space, { kind: 'subject', id: 'etica' }).map(item => item.id), ['eeeee', 'a']);
  assert.deepEqual(parsePlace('notebook:diario'), { kind: 'notebook', id: 'diario' });
  assert.deepEqual(parsePlace('qualquer'), { kind: 'inbox' });
  assert.deepEqual(placeTrail(space, { kind: 'subject', id: 'etica' }), ['Estudos', 'Psicologia', 'Ética']);
});

test('mover limpa o lugar antigo e herda a área do caderno', () => {
  const space = data();
  assert.deepEqual(placeFields(space, { kind: 'notebook', id: 'diario' }), { subjectId: '', notebookId: 'diario', areaId: 'emotional' });
  assert.deepEqual(placeFields(space, { kind: 'subject', id: 'etica' }), { subjectId: 'etica', notebookId: '', areaId: 'studies' });
  assert.deepEqual(placeFields(space, { kind: 'inbox' }), { subjectId: '', notebookId: '', areaId: '' });
  const moved = { ...space, notes: space.notes.map(item => item.id === 'dddd' ? { ...item, ...placeFields(space, { kind: 'subject', id: 'etica' }) } : item) };
  assert.equal(workspaceSchema.safeParse(moved).success, true);
});

test('grupos da biblioteca: Para organizar, cursos (ativos primeiro), cadernos e áreas', () => {
  const groups = placeGroups(data());
  assert.deepEqual(groups.slice(0, 4).map(group => group.label), ['Para organizar', 'Estudos · Psicologia', 'Estudos · IA para negócios', 'Meus cadernos']);
  assert.deepEqual(groups[1].options, [{ key: 'subject:etica', label: 'Ética', count: 2 }]);
  assert.equal(groups[0].options[0].count, 1);
  assert.equal(noteExcerpt({ content: '<p>Olá &amp; <strong>mundo</strong></p><p>segunda</p>' }), 'Olá & mundo segunda');
});
