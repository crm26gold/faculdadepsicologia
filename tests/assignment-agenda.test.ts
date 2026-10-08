import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkAssignment, moveAgendaTask } from '../src/lib/assignment-agenda';
import { emptyWorkspace, parseWorkspace, type Workspace } from '../src/lib/workspace';

const work = { id: '00000000-0000-4000-8000-0000000000d1', title: 'Direitos Humanos', due: '2026-10-15' };

test('"Na minha agenda" tocado duas vezes deixa uma tarefa só, ligada ao trabalho', () => {
  const first = linkAssignment(emptyWorkspace(), work, 'task-1');
  assert.equal(first.link.status, 'added');
  const second = linkAssignment(first.data, work, 'task-2');
  assert.equal(second.link.status, 'exists');
  assert.equal(second.data, first.data, 'nada a gravar no segundo toque');
  assert.deepEqual(second.data.tasks.map(task => [task.id, task.title, task.date, task.assignmentId]), [['task-1', 'Entregar: Direitos Humanos', '2026-10-15', work.id]]);
  assert.equal(parseWorkspace(JSON.stringify(second.data)).tasks[0].assignmentId, work.id, 'o vínculo sobrevive à gravação');
});

test('tarefa antiga com o mesmo título ganha o vínculo em vez de outra cópia; prazo mudado é avisado, não trocado sozinho', () => {
  const legacy = (id: string) => ({ id, title: 'Entregar: Direitos Humanos', subjectId: '', date: '2026-10-15', kind: 'Trabalho' as const, done: false, minutes: 30 });
  const start: Workspace = { ...emptyWorkspace(), tasks: [legacy('old-1'), legacy('old-2')] };
  const linked = linkAssignment(start, work, 'never-used');
  assert.equal(linked.link.status, 'exists');
  assert.deepEqual(linked.data.tasks.map(task => [task.id, task.assignmentId ?? null]), [['old-1', work.id], ['old-2', null]], 'a segunda cópia antiga fica para a pessoa decidir');
  const moved = linkAssignment(linked.data, { ...work, due: '2026-10-22' }, 'never-used');
  assert.equal(moved.link.status, 'moved');
  assert.equal(moved.data.tasks[0].date, '2026-10-15', 'a data só muda quando a pessoa pede');
  const updated = moveAgendaTask(moved.data, moved.link.task.id, '2026-10-22');
  assert.equal(updated.tasks[0].date, '2026-10-22');
  assert.equal(linkAssignment(updated, { ...work, due: '2026-10-22' }, 'never-used').link.status, 'exists');
});
