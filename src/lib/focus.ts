import { CURRENT_EDITOR_GENERATION, dateKey, workspaceSchema, type ActiveFocus, type Workspace } from './workspace';
import { defaultAreas } from './life';

// Capture attribution once. Moving/deleting a task later must not rewrite history.
export function startFocus(data: Workspace, input: {
  id: string; now: number; taskId?: string; projectId?: string;
  activity?: string; areaId?: string; subjectId?: string; targetSeconds?: number;
}): Workspace {
  if (data.activeFocus) throw new Error('Encerre o foco atual antes de iniciar outro.');
  const task = input.taskId ? data.tasks.find(item => item.id === input.taskId) : undefined;
  if (input.taskId && !task) throw new Error('Tarefa não encontrada.');
  if (task && input.projectId && input.projectId !== task.projectId) throw new Error('O projeto não corresponde à tarefa.');
  const projectId = task?.projectId ?? input.projectId;
  const project = projectId ? data.projects?.find(item => item.id === projectId) : undefined;
  if (projectId && !project) throw new Error('Projeto não encontrado.');
  if (project?.status === 'archived') throw new Error('Restaure o projeto antes de iniciar um foco vinculado.');
  if (data.sessions.some(session => session.focusId === input.id)) throw new Error('Identificador de foco já utilizado.');
  const focus: ActiveFocus = {
    id: input.id, activity: input.activity?.trim() || task?.title || project?.title || 'Foco pessoal',
    areaId: input.areaId ?? task?.areaId ?? project?.areaId ?? '',
    subjectId: input.subjectId ?? task?.subjectId ?? '', targetSeconds: input.targetSeconds ?? 0,
    segments: [{ start: input.now, end: null }],
    ...(task || project ? { context: {
      ...(task ? { taskId: task.id, taskTitle: task.title } : {}),
      ...(project ? { projectId: project.id, projectTitle: project.title } : {}),
    } } : {}),
  };
  if (focus.areaId && !(data.areas ?? defaultAreas).some(area => area.id === focus.areaId)) throw new Error('Área não encontrada.');
  if (focus.subjectId && !data.subjects.some(subject => subject.id === focus.subjectId)) throw new Error('Matéria não encontrada.');
  return workspaceSchema.parse({ ...data, editorGeneration: CURRENT_EDITOR_GENERATION, activeFocus: focus });
}

// Completed sessions only; legacy minute records retain their original precision.
export function focusTotals(data: Workspace, filter: { from?: string; to?: string } = {}) {
  const byArea: Record<string, number> = Object.create(null);
  const byProject: Record<string, number> = Object.create(null);
  const byTask: Record<string, number> = Object.create(null);
  let seconds = 0;
  for (const session of data.sessions) {
    if ((filter.from && session.date < filter.from) || (filter.to && session.date > filter.to)) continue;
    const duration = session.seconds ?? session.minutes * 60;
    seconds += duration;
    for (const [map, key] of [[byArea, session.areaId], [byProject, session.context?.projectId], [byTask, session.context?.taskId]] as const) {
      const group = key || '';
      map[group] = (map[group] ?? 0) + duration;
    }
  }
  return { seconds, byArea, byProject, byTask };
}

// Ticks only redraw. Persisted wall-clock intervals survive browser suspension.
export function focusMilliseconds(focus: ActiveFocus, now: number) {
  return focus.segments.reduce((sum, part) => sum + Math.max(0, (part.end ?? now) - part.start), 0);
}
export function pauseFocus(focus: ActiveFocus, now: number): ActiveFocus {
  return { ...focus, segments: focus.segments.map(part => part.end === null ? { ...part, end: Math.max(part.start, now) } : part) };
}
export function resumeFocus(focus: ActiveFocus, now: number): ActiveFocus {
  if (focus.segments.at(-1)?.end === null) return focus;
  return { ...focus, segments: [...focus.segments, { start: Math.max(now, focus.segments.at(-1)?.end ?? now), end: null }] };
}
export function finishFocus(data: Workspace, now: number): Workspace {
  const focus = data.activeFocus;
  if (!focus) return data;
  const totals = new Map<string, number>(), spans = new Map<string, { start: number; end: number }>();
  for (const part of pauseFocus(focus, now).segments) {
    let cursor = part.start;
    const end = part.end ?? cursor;
    while (cursor < end) {
      const midnight = new Date(cursor);
      midnight.setHours(24, 0, 0, 0);
      const until = Math.min(end, midnight.getTime());
      const date = dateKey(new Date(cursor));
      totals.set(date, (totals.get(date) ?? 0) + (until - cursor) / 1000);
      const span = spans.get(date); spans.set(date, { start: Math.min(span?.start ?? cursor, cursor), end: Math.max(span?.end ?? until, until) });
      cursor = until;
    }
  }
  const entries = [...totals].map(([date, seconds]) => ({
    id: `${focus.id}:${date}`, focusId: focus.id, date, seconds, minutes: seconds / 60,
    startedAt: new Date(spans.get(date)!.start).toISOString(), endedAt: new Date(spans.get(date)!.end).toISOString(),
    activity: focus.activity, areaId: focus.areaId,
    ...(focus.context ? { context: focus.context } : {}),
    subjectId: data.subjects.some(s => s.id === focus.subjectId) ? focus.subjectId : '',
  }));
  return { ...data, activeFocus: null, sessions: [...data.sessions, ...entries.filter(entry => !data.sessions.some(existing => existing.id === entry.id))] };
}
/** Ends the focus at a past moment ("esqueci o foco ligado, saí às 19:10"): time after it is not counted. */
export function finishFocusAt(data: Workspace, endAt: number, now: number): Workspace {
  const focus = data.activeFocus;
  if (!focus) return data;
  if (endAt > now) throw new Error('Esse horário ainda não chegou. Diga até que horas você ficou em foco.');
  if (endAt <= focus.segments[0].start) throw new Error('Esse horário é antes de o foco começar. Diga até que horas você ficou em foco.');
  const segments = focus.segments.filter(part => part.start < endAt).map(part => ({ start: part.start, end: Math.min(part.end ?? endAt, endAt) }));
  return finishFocus({ ...data, activeFocus: { ...focus, segments } }, endAt);
}
export function formatFocusTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return [Math.floor(whole / 3600), Math.floor(whole % 3600 / 60), whole % 60].map(n => String(n).padStart(2, '0')).join(':');
}

/** A finished focus record with a corrected length. `end` (HH:MM, São Paulo) needs the record's own times. */
export function adjustSession(data: Workspace, id: string, change: { minutes?: number; end?: string }): Workspace {
  const session = data.sessions.find(item => item.id === id);
  if (!session) throw new Error('Não encontrei esse registro de foco.');
  let seconds: number;
  if (change.end) {
    if (!session.startedAt || !session.endedAt) throw new Error('Este registro é antigo e não guardou o horário. Diga a duração certa, por exemplo 2h34.');
    const [hour, minute] = change.end.split(':').map(Number);
    const ended = Date.parse(session.endedAt), started = Date.parse(session.startedAt);
    // The new end on the record's own day, in São Paulo time (UTC−3, no daylight saving).
    const target = Date.parse(`${session.date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`);
    if (!(target > started)) throw new Error('O fim precisa ser depois do início do foco.');
    if (target >= ended) throw new Error('Esse horário é depois do fim registrado. Para aumentar, diga a duração certa.');
    seconds = Math.max(60, (session.seconds ?? session.minutes * 60) - (ended - target) / 1000);
    return { ...data, sessions: data.sessions.map(item => item.id === id ? { ...item, seconds, minutes: seconds / 60, endedAt: new Date(target).toISOString() } : item) };
  }
  if (!change.minutes || change.minutes < 1 || change.minutes > 1440) throw new Error('Diga uma duração entre 1 minuto e 24 horas.');
  seconds = Math.round(change.minutes * 60);
  return { ...data, sessions: data.sessions.map(item => item.id === id ? { ...item, seconds, minutes: seconds / 60 } : item) };
}
