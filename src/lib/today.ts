import { addDays, type Workspace } from './workspace';
import { calendarEntries } from './academic';
import { isUnorganized } from './capture';

// The month in four cycles: 1–7, 8–14, 15–21 and 22 to the last day (28, 29, 30 or 31).
export function monthCycles(today: string) {
  const [year, month, day] = today.split('-').map(Number);
  const last = new Date(year, month, 0).getDate();
  const cycles = [[1, 7], [8, 14], [15, 21], [22, last]].map(([start, end], index) => ({ index: index + 1, start, end, current: day >= start && day <= end }));
  const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return { month: label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1), day, last, cycle: cycles.find(item => item.current)!.index, cycles };
}

export const greeting = (hour: number) => hour < 5 ? 'Boa noite' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

export type TodayAlert = { id: string; tone: 'urgent' | 'attention' | 'info'; text: string; target: 'agenda' | 'notes' | 'focus' | 'studies'; date?: string };
// What deserves attention right now, most urgent first, without repeating today's agenda.
export function todayAlerts(data: Workspace, today: string, now = Date.now()): TodayAlert[] {
  const alerts: TodayAlert[] = [];
  const late = data.tasks.filter(task => !task.done && task.date < today);
  if (late.length) alerts.push({ id: 'late', tone: 'urgent', text: late.length === 1 ? `1 compromisso atrasado: ${late[0].title}` : `${late.length} compromissos atrasados`, target: 'agenda', date: late[0].date });
  const focus = data.activeFocus;
  if (focus) {
    const minutes = Math.floor(focus.segments.reduce((sum, part) => sum + Math.max(0, (part.end ?? now) - part.start), 0) / 60_000);
    const running = focus.segments.at(-1)?.end === null;
    alerts.push({ id: 'focus', tone: running && minutes >= 60 ? 'urgent' : 'info', text: `${running ? 'Foco ligado' : 'Foco pausado'}: ${focus.activity} · ${minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`}${running && minutes >= 60 ? ' — esqueceu ligado?' : ''}`, target: 'focus' });
  }
  for (const task of data.tasks.filter(item => !item.done && ['Prova', 'Trabalho', 'Pagamento'].includes(item.kind) && item.date > today && item.date <= addDays(today, 3)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2)) {
    const days = Math.round((Date.parse(`${task.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
    alerts.push({ id: `soon-${task.id}`, tone: 'attention', text: `${task.kind}: ${task.title} ${days === 1 ? 'amanhã' : `em ${days} dias`}`, target: 'agenda', date: task.date });
  }
  const loose = data.notes.filter(isUnorganized).length;
  if (loose) alerts.push({ id: 'loose', tone: 'info', text: loose === 1 ? '1 registro esperando organização' : `${loose} registros esperando organização`, target: 'notes' });
  return alerts;
}

export const todayAgenda = (data: Workspace, today: string) => calendarEntries(data, today, today);
