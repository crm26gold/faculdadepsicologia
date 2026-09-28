import { dateKey, type ActiveFocus, type Workspace } from './workspace';

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
  const totals = new Map<string, number>();
  for (const part of pauseFocus(focus, now).segments) {
    let cursor = part.start;
    const end = part.end ?? cursor;
    while (cursor < end) {
      const midnight = new Date(cursor);
      midnight.setHours(24, 0, 0, 0);
      const until = Math.min(end, midnight.getTime());
      const date = dateKey(new Date(cursor));
      totals.set(date, (totals.get(date) ?? 0) + (until - cursor) / 1000);
      cursor = until;
    }
  }
  const entries = [...totals].map(([date, seconds]) => ({
    id: `${focus.id}:${date}`, focusId: focus.id, date, seconds, minutes: seconds / 60,
    activity: focus.activity, areaId: focus.areaId,
    subjectId: data.subjects.some(s => s.id === focus.subjectId) ? focus.subjectId : '',
  }));
  return { ...data, activeFocus: null, sessions: [...data.sessions, ...entries.filter(entry => !data.sessions.some(existing => existing.id === entry.id))] };
}
export function formatFocusTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return [Math.floor(whole / 3600), Math.floor(whole % 3600 / 60), whole % 60].map(n => String(n).padStart(2, '0')).join(':');
}
