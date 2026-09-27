import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, parseWorkspace, workspaceSchema } from '../src/lib/workspace';
import { defaultAreas, lifeAreas, itemArea } from '../src/lib/life';
import { calendarEntries, studySuggestions } from '../src/lib/academic';

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
