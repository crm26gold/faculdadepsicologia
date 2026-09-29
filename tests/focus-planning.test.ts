import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, parseWorkspace, type Workspace } from '../src/lib/workspace';
import { startFocus, finishFocus, focusTotals } from '../src/lib/focus';

const now = new Date('2026-09-29T10:00:00').getTime();
const fixture = (): Workspace => ({ ...emptyWorkspace(), editorGeneration: 5,
  projects: [{ id: 'p', title: 'Projeto', status: 'active', areaId: 'work' }],
  tasks: [{ id: 't', title: 'Tarefa', subjectId: '', date: '2026-09-29', kind: 'Tarefa', minutes: 25, done: false, projectId: 'p' }],
});

test('foco vinculado sobrevive ao fechamento e preserva atribuição original', () => {
  const original = fixture();
  const started = startFocus(original, { id: 'f', now, taskId: 't' });
  assert.equal(original.activeFocus, undefined);
  const restored = parseWorkspace(JSON.stringify(started));
  restored.tasks = [];
  restored.projects = [];
  const finished = finishFocus(restored, now + 12_500);
  assert.deepEqual(finished.sessions[0].context, { taskId: 't', taskTitle: 'Tarefa', projectId: 'p', projectTitle: 'Projeto' });
  assert.equal(finished.sessions[0].areaId, 'work');
  assert.equal(parseWorkspace(JSON.stringify(finished)).sessions[0].seconds, 12.5);
  assert.equal(focusTotals(finished).byProject.p, 12.5);
  assert.equal(focusTotals(finished).byTask.t, 12.5);
});

test('impede sobreposição e vínculos inválidos sem modificar dados', () => {
  const data = fixture();
  const started = startFocus(data, { id: 'f', now, projectId: 'p' });
  assert.throws(() => startFocus(started, { id: 'g', now }));
  for (const input of [{ taskId: 'missing' }, { projectId: 'missing' }, { taskId: 't', projectId: 'other' }, { areaId: 'missing' }, { subjectId: 'missing' }]) {
    assert.throws(() => startFocus(data, { id: 'f', now, ...input }));
  }
  data.projects![0].status = 'archived';
  assert.throws(() => startFocus(data, { id: 'f', now, taskId: 't' }));
});

test('histórico antigo continua legível e novos vínculos exigem geração 6', () => {
  assert.equal(parseWorkspace(JSON.stringify(fixture())).editorGeneration, 5);
  const started = startFocus(fixture(), { id: 'f', now, taskId: 't' });
  assert.throws(() => parseWorkspace(JSON.stringify({ ...started, editorGeneration: 5 })));
  const completed = finishFocus(started, now + 1000);
  assert.throws(() => startFocus(completed, { id: 'f', now }));
  assert.throws(() => parseWorkspace(JSON.stringify({ ...completed, editorGeneration: 5 })));
});

test('totais usam segundos sem arredondar e não duplicam dimensões', () => {
  const data = finishFocus(startFocus(fixture(), { id: 'f', now, taskId: 't' }), now + 1500);
  data.sessions.push({ id: 'old', date: '2026-09-28', minutes: 2 });
  const all = focusTotals(data);
  assert.equal(all.seconds, 121.5);
  assert.equal(all.byProject[''], 120);
  assert.equal(focusTotals(data, { from: '2026-09-29', to: '2026-09-29' }).seconds, 1.5);
  assert.equal(focusTotals(data, { to: '2026-09-27' }).seconds, 0);
});
