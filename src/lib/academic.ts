import { addDays, dateKey, type ClassSession, type Subject, type Task, type Workspace } from './workspace';

export const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function monthDays(date: string) {
  const first = `${date.slice(0, 7)}-01`;
  const start = addDays(first, -new Date(`${first}T12:00:00`).getDay());
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}
export function shiftMonth(date: string, amount: number) {
  const result = new Date(`${date.slice(0, 7)}-01T12:00:00`);
  result.setMonth(result.getMonth() + amount);
  return dateKey(result);
}
export function weekDays(date: string) {
  const start = addDays(date, -((new Date(`${date}T12:00:00`).getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}
export type CalendarEntry = {
  id: string; title: string; subjectId: string; date: string; time?: string; endTime?: string;
  kind: Task['kind']; color: Subject['color']; done: boolean; professor?: string; location?: string;
  task?: Task; session?: ClassSession;
};
function ordinal(date: string) { return Date.parse(`${date}T12:00:00Z`) / 86_400_000; }
export function classOccurs(session: ClassSession, date: string, term: Workspace['term']) {
  if (!session.enabled || (term.start && date < term.start) || (term.end && date > term.end)) return false;
  if (new Date(`${date}T12:00:00`).getDay() !== session.weekday) return false;
  if (session.firstDate && date < session.firstDate) return false;
  if (session.intervalWeeks > 1) return !!session.firstDate && (ordinal(date) - ordinal(session.firstDate)) % (7 * session.intervalWeeks) === 0;
  return true;
}
export function calendarEntries(data: Workspace, from: string, to: string): CalendarEntry[] {
  const result: CalendarEntry[] = data.tasks.filter((item) => item.date >= from && item.date <= to).map((task) => ({ ...task, task, color: data.subjects.find((item) => item.id === task.subjectId)?.color ?? 'sage' }));
  // Bound computation even if a malformed caller supplies a huge interval.
  for (let date = from, count = 0; date <= to && count < 370; date = addDays(date, 1), count++) {
    for (const session of data.classes) {
      const subject = data.subjects.find((item) => item.id === session.subjectId);
      if (subject && classOccurs(session, date, data.term)) result.push({ id: `${session.id}:${date}`, title: subject.name, subjectId: subject.id, date, time: session.startTime, endTime: session.endTime, kind: 'Aula', color: subject.color, done: false, professor: subject.professor, location: session.location, session });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.title.localeCompare(b.title));
}

export type StudySuggestion = { id: string; title: string; reason: string; subjectId: string; date: string; minutes: number };
export function studySuggestions(data: Workspace, today: string): StudySuggestion[] {
  const suggestions: StudySuggestion[] = [];
  for (const task of data.tasks.filter((item) => !item.done && (item.kind === 'Prova' || item.kind === 'Trabalho') && item.date >= today && item.date <= addDays(today, 7)).sort((a, b) => a.date.localeCompare(b.date))) {
    suggestions.push({ id: `suggest-deadline-${task.id}-${today}`, title: `Preparar: ${task.title}`, reason: `${task.kind} em ${task.date.split('-').reverse().join('/')}. Comece com um bloco pequeno.`, subjectId: task.subjectId, date: today, minutes: 25 });
  }
  for (const entry of calendarEntries(data, today, addDays(today, 3)).filter((item) => item.session)) {
    if (suggestions.some((item) => item.subjectId === entry.subjectId)) continue;
    suggestions.push({ id: `suggest-review-${entry.subjectId}-${today}`, title: `Revisar: ${entry.title}`, reason: `Há uma aula prevista na grade em ${entry.date.split('-').reverse().join('/')} às ${entry.time}. Separe dúvidas e pontos principais.`, subjectId: entry.subjectId, date: today, minutes: 15 });
  }
  return suggestions.filter((item) => !data.tasks.some((task) => task.id === item.id));
}
