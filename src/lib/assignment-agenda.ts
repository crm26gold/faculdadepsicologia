import type { Task, Workspace } from './workspace';

// A group work's deadline in the person's own agenda: one task per work, found by its link or, for
// tasks saved before the link existed, by the same title. Runs in the browser.
export type AgendaAssignment = { id: string; title: string; due: string };
export type AgendaLink =
  | { status: 'added'; task: Task }
  | { status: 'exists'; task: Task }
  | { status: 'moved'; task: Task; due: string };

export const agendaTitle = (title: string) => `Entregar: ${title}`.slice(0, 160);

export function findAssignmentTask(data: Workspace, assignment: AgendaAssignment) {
  return data.tasks.find(task => task.assignmentId === assignment.id)
    ?? data.tasks.find(task => !task.assignmentId && task.kind === 'Trabalho' && task.title === agendaTitle(assignment.title));
}

/** Adds the deadline once. A task already there is linked and returned; a changed deadline is reported, never moved silently. */
export function linkAssignment(data: Workspace, assignment: AgendaAssignment, newId: string): { data: Workspace; link: AgendaLink } {
  const found = findAssignmentTask(data, assignment);
  if (!found) {
    const task: Task = { id: newId, title: agendaTitle(assignment.title), subjectId: '', date: assignment.due, kind: 'Trabalho', done: false, minutes: 30, assignmentId: assignment.id };
    return { data: { ...data, tasks: [...data.tasks, task] }, link: { status: 'added', task } };
  }
  const task = found.assignmentId ? found : { ...found, assignmentId: assignment.id };
  const next = task === found ? data : { ...data, tasks: data.tasks.map(item => item.id === found.id ? task : item) };
  return { data: next, link: task.date === assignment.due ? { status: 'exists', task } : { status: 'moved', task, due: assignment.due } };
}

export const moveAgendaTask = (data: Workspace, taskId: string, due: string): Workspace =>
  ({ ...data, tasks: data.tasks.map(task => task.id === taskId ? { ...task, date: due } : task) });
