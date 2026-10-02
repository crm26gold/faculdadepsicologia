import { addDays, type Workspace } from './workspace';
import { calendarEntries } from './academic';
import { isUnorganized } from './capture';
import { money } from './finance';

// The month in four cycles: 1–7, 8–14, 15–21 and 22 to the last day (28, 29, 30 or 31).
export function monthCycles(today: string) {
  const [year, month, day] = today.split('-').map(Number);
  const last = new Date(year, month, 0).getDate();
  const cycles = [[1, 7], [8, 14], [15, 21], [22, last]].map(([start, end], index) => ({ index: index + 1, start, end, current: day >= start && day <= end }));
  const label = new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return { month: label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1), day, last, cycle: cycles.find(item => item.current)!.index, cycles };
}

export const greeting = (hour: number) => hour < 5 ? 'Boa noite' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

export type TodayAlert = { id: string; tone: 'urgent' | 'attention' | 'info'; text: string; target: 'agenda' | 'notes' | 'focus' | 'studies' | 'finances'; date?: string };
// What deserves attention right now, most urgent first, without repeating today's agenda.
export function todayAlerts(data: Workspace, today: string, now = Date.now()): TodayAlert[] {
  const alerts: TodayAlert[] = [];
  const late = data.tasks.filter(task => !task.done && task.date < today);
  if (late.length) alerts.push({ id: 'late', tone: 'urgent', text: late.length === 1 ? `1 compromisso atrasado: ${late[0].title}` : `${late.length} compromissos atrasados`, target: 'agenda', date: late[0].date });
  const open = (data.transactions ?? []).filter(item => item.status === 'pending');
  const bills = (from: string, to: string) => open.filter(item => item.type === 'expense' && item.date >= from && item.date <= to);
  const total = (items: typeof open) => money(items.reduce((sum, item) => sum + item.amountCents, 0));
  const describe = (items: typeof open, one: string, many: string) => items.length === 1 ? `${one}: ${items[0].description} · ${money(items[0].amountCents)}` : `${items.length} ${many} · ${total(items)}`;
  const lateBills = bills('0000-01-01', addDays(today, -1));
  if (lateBills.length) alerts.push({ id: 'bills-late', tone: 'urgent', text: describe(lateBills, 'Conta vencida', 'contas vencidas'), target: 'finances' });
  const dueToday = bills(today, today);
  if (dueToday.length) alerts.push({ id: 'bills-today', tone: 'urgent', text: describe(dueToday, 'Conta para pagar hoje', 'contas para pagar hoje'), target: 'finances' });
  const focus = data.activeFocus;
  if (focus) {
    const minutes = Math.floor(focus.segments.reduce((sum, part) => sum + Math.max(0, (part.end ?? now) - part.start), 0) / 60_000);
    const running = focus.segments.at(-1)?.end === null;
    alerts.push({ id: 'focus', tone: running && minutes >= 60 ? 'urgent' : 'info', text: `${running ? 'Foco ligado' : 'Foco pausado'}: ${focus.activity} · ${minutes >= 60 ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`}${running && minutes >= 60 ? ' — esqueceu ligado?' : ''}`, target: 'focus' });
  }
  const tomorrow = bills(addDays(today, 1), addDays(today, 1));
  if (tomorrow.length) alerts.push({ id: 'bills-tomorrow', tone: 'attention', text: tomorrow.length === 1 ? `Amanhã tem conta para pagar: ${tomorrow[0].description} · ${money(tomorrow[0].amountCents)}` : `Amanhã tem ${tomorrow.length} contas para pagar · ${total(tomorrow)}`, target: 'finances' });
  for (const task of data.tasks.filter(item => !item.done && ['Prova', 'Trabalho', 'Pagamento'].includes(item.kind) && item.date > today && item.date <= addDays(today, 3)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 2)) {
    const days = Math.round((Date.parse(`${task.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
    alerts.push({ id: `soon-${task.id}`, tone: 'attention', text: `${task.kind}: ${task.title} ${days === 1 ? 'amanhã' : `em ${days} dias`}`, target: 'agenda', date: task.date });
  }
  const income = open.filter(item => item.type === 'income' && item.date <= today);
  if (income.length) alerts.push({ id: 'income-due', tone: 'info', text: income.length === 1 ? `Para receber: ${income[0].description} · ${money(income[0].amountCents)} — já caiu?` : `${income.length} valores para receber · ${total(income)} — já caíram?`, target: 'finances' });
  const loose = data.notes.filter(isUnorganized).length;
  if (loose) alerts.push({ id: 'loose', tone: 'info', text: loose === 1 ? '1 registro esperando organização' : `${loose} registros esperando organização`, target: 'notes' });
  return alerts;
}

export const todayAgenda = (data: Workspace, today: string) => calendarEntries(data, today, today);
