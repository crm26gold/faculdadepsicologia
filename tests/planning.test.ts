import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyWorkspace, workspaceSchema, CURRENT_EDITOR_GENERATION, type Workspace } from '../src/lib/workspace';
import { goalProgress, projectProgress, linkTaskToProject } from '../src/lib/planning';

const fixture = (): Workspace => ({ ...emptyWorkspace(), editorGeneration: CURRENT_EDITOR_GENERATION,
  goals: [{ id: 'goal', title: 'Ler mais', status: 'active', areaId: 'studies', metric: { unit: 'livros', baseline: 0, current: 1, target: 4 } }],
  projects: [{ id: 'project', title: 'Leitura do mês', goalId: 'goal', status: 'active' }],
  tasks: [{ id: 'task', title: 'Ler capítulo', projectId: 'project', subjectId: '', date: '2026-09-29', done: false, kind: 'Tarefa', minutes: 25 }],
});

test('planejamento preserva backups antigos sem inventar metas', () => {
  const old = workspaceSchema.parse(emptyWorkspace());
  assert.equal(old.goals, undefined); assert.equal(old.projects, undefined);
});
test('planejamento e vínculos sobrevivem à serialização', () => {
  assert.deepEqual(workspaceSchema.parse(JSON.parse(JSON.stringify(fixture()))), fixture());
});
test('campos novos exigem geração atual e versões futuras são recusadas', () => {
  for (const generation of [undefined, 2, 3, 4, 7]) assert.equal(workspaceSchema.safeParse({ ...fixture(), editorGeneration: generation }).success, false);
  assert.equal(workspaceSchema.safeParse({ ...fixture(), editorGeneration: 5 }).success, true);
});
test('metas e projetos recusam IDs duplicados e áreas desconhecidas', () => {
  for (const collection of ['goals', 'projects'] as const) {
    const data = fixture();
    assert.equal(workspaceSchema.safeParse({ ...data, [collection]: [data[collection]![0], data[collection]![0]] }).success, false);
    assert.equal(workspaceSchema.safeParse({ ...data, [collection]: [{ ...data[collection]![0], areaId: 'missing' }] }).success, false);
  }
});
test('referências órfãs e datas impossíveis são recusadas', () => {
  const data = fixture();
  assert.equal(workspaceSchema.safeParse({ ...data, goals: [] }).success, false);
  assert.equal(workspaceSchema.safeParse({ ...data, projects: [] }).success, false);
  assert.equal(workspaceSchema.safeParse({ ...data, goals: [{ ...data.goals![0], deadline: '2026-02-30' }] }).success, false);
});
test('progresso operacional não conclui a meta nem o projeto', () => {
  const data = fixture(); data.tasks[0].done = true;
  assert.deepEqual(projectProgress(data, 'project'), { done: 1, total: 1, percent: 100 });
  assert.equal(goalProgress(data.goals![0]), 25);
  assert.equal(data.goals![0].status, 'active'); assert.equal(data.projects![0].status, 'active');
  assert.equal(projectProgress({ ...data, tasks: [] }, 'project').percent, null);
  assert.throws(() => projectProgress(data, 'missing'));
});
test('medição suporta aumento, redução e limites sem confundir ausência com zero', () => {
  const goal = fixture().goals![0];
  assert.equal(goalProgress({ ...goal, metric: undefined }), null);
  for (const [current, expected] of [[90, 50], [120, 0], [60, 100]]) {
    assert.equal(goalProgress({ ...goal, metric: { unit: 'unidades', baseline: 100, target: 80, current } }), expected);
  }
  assert.equal(workspaceSchema.safeParse({ ...fixture(), goals: [{ ...goal, metric: { unit: 'x', baseline: 1, target: 1, current: 1 } }] }).success, false);
});
test('desvincular é imutável e não remove a tarefa; projetos arquivados recusam novos vínculos', () => {
  const data = fixture();
  const unlinked = linkTaskToProject(data, 'task');
  assert.equal(unlinked.tasks.length, 1); assert.equal(unlinked.tasks[0].projectId, undefined);
  assert.equal(data.tasks[0].projectId, 'project');
  assert.equal(linkTaskToProject(unlinked, 'task', 'project').tasks[0].projectId, 'project');
  assert.throws(() => linkTaskToProject(data, 'missing', 'project'));
  assert.throws(() => linkTaskToProject(data, 'task', 'missing'));
  data.projects![0].status = 'archived';
  assert.throws(() => linkTaskToProject(data, 'task', 'project'));
});
