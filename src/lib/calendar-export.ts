import { type CalendarEntry } from './academic';

const escapeText = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const stamp = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
// Resolve the wall-clock time in the course timezone using Intl's zone data,
// rather than the timezone of the device exporting the calendar.
export function saoPauloInstant(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let instant = wall;
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  for (let index = 0; index < 3; index++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    instant += wall - shown;
  }
  return new Date(instant);
}
function fold(line: string) {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = '';
  for (const character of line) {
    if (encoder.encode(current + character).length > 75) { lines.push(current); current = ' '; }
    current += character;
  }
  lines.push(current);
  return lines.join('\r\n');
}
export function calendarIcs(entries: CalendarEntry[], now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Faculdade Psi//Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Faculdade Psi', 'X-WR-TIMEZONE:America/Sao_Paulo'];
  for (const item of entries) {
    lines.push('BEGIN:VEVENT', `UID:${encodeURIComponent(item.id)}@faculdade-psi`, `DTSTAMP:${stamp(now)}`);
    if (item.time) {
      lines.push(`DTSTART:${stamp(saoPauloInstant(item.date, item.time))}`);
      if (item.endTime) lines.push(`DTEND:${stamp(saoPauloInstant(item.date, item.endTime))}`);
    } else lines.push(`DTSTART;VALUE=DATE:${item.date.replaceAll('-', '')}`);
    lines.push(`SUMMARY:${escapeText(item.title)}`);
    if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
    lines.push(`DESCRIPTION:${escapeText([item.kind, item.professor ? `Professor(a): ${item.professor}` : '', item.session ? 'Previsão da grade semanal. Confira feriados e calendário oficial.' : '', item.time && !item.endTime ? 'Horário de término não informado.' : ''].filter(Boolean).join('\n'))}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
export function downloadCalendar(entries: CalendarEntry[]) {
  const url = URL.createObjectURL(new Blob([calendarIcs(entries)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'faculdade-psi-agenda.ics'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
