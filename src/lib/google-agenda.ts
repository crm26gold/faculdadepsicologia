import { createHash } from 'node:crypto';
import { calendarEntries, type CalendarEntry } from './academic';
import { saoPauloInstant } from './calendar-export';
import { addDays, type Workspace } from './workspace';

// Jornada → Google: a copy of the agenda in a calendar the Jornada creates. The scope reaches only that calendar.
export const GOOGLE_AGENDA_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export const GOOGLE_AGENDA_WINDOW = { past: 7, ahead: 120, max: 800 };
const zone = 'America/Sao_Paulo';

export type AgendaEvent = { id: string; date: string; hash: string; body: Record<string, unknown> };
/** What the calendar already holds. Only events carrying the Jornada mark are ours to change. */
export type ExistingEvent = { id: string; hash?: string; date?: string };

export function saoPauloToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
/** Google event IDs use base32hex (0-9, a-v); a hex digest fits, and the same entry always gets the same ID. */
export const googleEventId = (entryId: string) => `jp${createHash('sha256').update(entryId).digest('hex').slice(0, 40)}`;

function eventBody(entry: CalendarEntry) {
  const start = entry.time ? saoPauloInstant(entry.date, entry.time) : null;
  const remind = entry.task?.remind;
  const end = entry.time && entry.endTime && entry.endTime > entry.time ? saoPauloInstant(entry.date, entry.endTime) : start && new Date(start.getTime() + 30 * 60_000);
  const notes = [entry.kind, entry.professor ? `Professor(a): ${entry.professor}` : '', entry.session ? 'Previsão da grade semanal. Confira feriados e calendário oficial.' : '',
    start && !(entry.endTime && entry.endTime > entry.time!) ? 'Horário de término não informado: o Google exige um fim, então aparecem 30 minutos.' : '',
    'Cópia da Jornada Plena. Altere na Jornada: mudanças feitas aqui são substituídas na próxima atualização.'].filter(Boolean);
  return {
    summary: `${entry.done ? '✓ ' : ''}${entry.title}`.slice(0, 300),
    ...(entry.location ? { location: entry.location.slice(0, 300) } : {}),
    description: notes.join('\n'),
    ...(start && end ? { start: { dateTime: start.toISOString(), timeZone: zone }, end: { dateTime: end.toISOString(), timeZone: zone } }
      : { start: { date: entry.date }, end: { date: addDays(entry.date, 1) } }),
    transparency: entry.time ? 'opaque' : 'transparent',
    status: 'confirmed',
    // With "Avisar", Google warns too (phone and, when insistent, e-mail). All-day entries keep Google's default:
    // Google counts their reminders from midnight, the Jornada warns at 8:00.
    ...(remind && start && !entry.done ? { reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: remind.minutes },
      ...(remind.level !== 'suave' && remind.minutes > 0 ? [{ method: 'popup', minutes: 0 }] : []),
      ...(remind.level === 'insistente' ? [{ method: 'email', minutes: remind.minutes }] : [])] } } : {}),
  };
}

/** The events the Google calendar should hold now: a week back to four months ahead, nearest first. */
export function agendaEvents(data: Workspace, today: string): AgendaEvent[] {
  const entries = calendarEntries(data, addDays(today, -GOOGLE_AGENDA_WINDOW.past), addDays(today, GOOGLE_AGENDA_WINDOW.ahead))
    .toSorted((a, b) => Math.abs(Date.parse(a.date) - Date.parse(today)) - Math.abs(Date.parse(b.date) - Date.parse(today)))
    .slice(0, GOOGLE_AGENDA_WINDOW.max);
  return entries.map(entry => {
    const body = eventBody(entry);
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 32);
    return { id: googleEventId(entry.id), date: entry.date, hash, body: { ...body, id: googleEventId(entry.id), extendedProperties: { private: { jornada: hash, jornadaDate: entry.date } } } };
  });
}

/** Insert what is missing, update what changed, remove our events that left the agenda. Past events outside the
 * window stay as they are, and events the person added by hand to this calendar are never touched. */
export function planSync(desired: AgendaEvent[], existing: ExistingEvent[], windowStart: string) {
  const ours = new Map(existing.filter(event => event.hash).map(event => [event.id, event]));
  const wanted = new Set(desired.map(event => event.id));
  return {
    insert: desired.filter(event => !ours.has(event.id)),
    update: desired.filter(event => { const found = ours.get(event.id); return found && found.hash !== event.hash; }),
    remove: [...ours.values()].filter(event => !wanted.has(event.id) && (event.date ?? '') >= windowStart).map(event => event.id),
  };
}
