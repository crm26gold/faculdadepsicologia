import type { Goal, Workspace } from './workspace';

/** Task completion is operational progress, never proof that a life goal was achieved. */
export function projectProgress(data: Workspace, projectId: string) {
  if (!data.projects?.some(project => project.id === projectId)) throw new Error('Projeto inexistente');
  const tasks = data.tasks.filter(task => task.projectId === projectId);
  const done = tasks.filter(task => task.done).length;
  return { total: tasks.length, done, percent: tasks.length ? Math.round(done / tasks.length * 100) : null };
}

export function goalProgress(goal: Goal): number | null {
  if (!goal.metric) return null;
  const { baseline, target, current } = goal.metric;
  return Math.round(Math.max(0, Math.min(100, (current - baseline) / (target - baseline) * 100)));
}

/** Unlink deliberately; never delete a project's tasks as a side effect. */
export function linkTaskToProject(data: Workspace, taskId: string, projectId?: string): Workspace {
  if (!data.tasks.some(task => task.id === taskId)) throw new Error('Tarefa inexistente');
  if (projectId && !data.projects?.some(project => project.id === projectId && project.status !== 'archived')) throw new Error('Projeto indisponível');
  return { ...data, tasks: data.tasks.map(task => {
    if (task.id !== taskId) return task;
    const { projectId: _previous, ...rest } = task;
    return projectId ? { ...rest, projectId } : rest;
  }) };
}
