import { addDays, type Workspace } from './workspace';
import type { Transaction } from './life-data';

export type Flow = Transaction['type'];
export type Nature = NonNullable<Transaction['nature']>;

export const expenseCategories = ['Moradia', 'Contas da casa', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Compras', 'Assinaturas', 'Dívidas e empréstimos', 'Impostos e taxas', 'Família e pets', 'Outros'];
export const incomeCategories = ['Salário', 'Trabalho extra', 'Vendas', 'Rendimentos', 'Reembolsos', 'Benefícios e auxílios', 'Presentes', 'Outros'];
export const natures: Record<Nature, { label: string; plural: string; hint: string }> = {
  fixed: { label: 'Fixa', plural: 'Fixas', hint: 'Todo mês, mesmo valor' },
  variable: { label: 'Variável', plural: 'Variáveis', hint: 'Acontece sempre, o valor muda' },
  oneoff: { label: 'Imediata', plural: 'Imediatas', hint: 'Só desta vez' },
};
export const flowWords = {
  expense: { done: 'Paga', pending: 'A pagar', late: 'Vencida', action: 'Paguei' },
  income: { done: 'Recebido', pending: 'A receber', late: 'Atrasado', action: 'Recebi' },
} as const;

export const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const isPending = (item: Transaction) => item.status === 'pending';
export const monthOf = (day: string) => day.slice(0, 7);

// Same day next month, clamped to the month's last day (31/01 → 28/02 → 31/03 keeps the original day).
export function shiftMonths(day: string, months: number) {
  const [year, month, date] = day.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(date, last)).padStart(2, '0')}`;
}

export function monthLabel(month: string) {
  const label = new Date(`${month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
}

export type Repeat = { kind: 'none' } | { kind: 'monthly'; months: number } | { kind: 'installments'; count: number };

// One form entry becomes the whole series: monthly bills or installments, each one editable on its own.
export function buildSeries(base: Omit<Transaction, 'id'>, repeat: Repeat, today: string, newId: () => string = () => crypto.randomUUID()): Transaction[] {
  const total = repeat.kind === 'monthly' ? repeat.months : repeat.kind === 'installments' ? repeat.count : 1;
  if (!Number.isInteger(total) || total < 1 || total > 120) throw new Error('Escolha de 1 a 120 meses.');
  if (total === 1) return [{ ...base, id: newId() }];
  const groupId = newId();
  return Array.from({ length: total }, (_, index) => {
    const date = shiftMonths(base.date, index);
    // The first entry keeps what the person chose; later months stay open until they arrive.
    const pending = base.status === 'pending' || (index > 0 && date > today);
    return { ...base, id: index === 0 ? groupId : newId(), date, groupId, status: pending ? 'pending' as const : 'paid' as const,
      paidOn: pending ? undefined : base.paidOn,
      installment: repeat.kind === 'installments' ? { index: index + 1, count: total } : undefined };
  });
}

export function monthSummary(items: Transaction[], month: string) {
  const inMonth = items.filter(item => monthOf(item.date) === month);
  const sum = (flow: Flow, pending: boolean) => inMonth.filter(item => item.type === flow && isPending(item) === pending).reduce((total, item) => total + item.amountCents, 0);
  const received = sum('income', false), toReceive = sum('income', true), paid = sum('expense', false), toPay = sum('expense', true);
  const byNature = (Object.keys(natures) as Nature[]).map(nature => ({ nature, cents: inMonth.filter(item => item.type === 'expense' && (item.nature ?? 'oneoff') === nature).reduce((total, item) => total + item.amountCents, 0) }));
  const categories = new Map<string, number>();
  for (const item of inMonth.filter(entry => entry.type === 'expense')) categories.set(item.category, (categories.get(item.category) ?? 0) + item.amountCents);
  return { received, toReceive, paid, toPay, balance: received - paid, projected: received + toReceive - paid - toPay,
    byNature, byCategory: [...categories].map(([category, cents]) => ({ category, cents })).toSorted((a, b) => b.cents - a.cents) };
}

// Everything still open, oldest first: what is late, what is due this week, and what comes later.
export function openItems(items: Transaction[], today: string) {
  const open = items.filter(isPending).toSorted((a, b) => a.date.localeCompare(b.date) || b.amountCents - a.amountCents);
  const week = addDays(today, 7);
  return { late: open.filter(item => item.date < today), week: open.filter(item => item.date >= today && item.date <= week), later: open.filter(item => item.date > week) };
}

export const settle = (item: Transaction, today: string): Transaction => ({ ...item, status: 'paid', paidOn: today });
export const reopen = (item: Transaction): Transaction => ({ ...item, status: 'pending', paidOn: undefined });

export function seriesAfter(data: Workspace, item: Transaction) {
  return (data.transactions ?? []).filter(entry => item.groupId && entry.groupId === item.groupId && entry.date >= item.date);
}

export type Opening = NonNullable<Workspace['finance']>;
const settledOn = (item: Transaction) => item.paidOn ?? item.date;
const signed = (item: Transaction) => item.type === 'income' ? item.amountCents : -item.amountCents;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
export const lastDayOfMonth = (month: string) => addDays(shiftMonths(`${month}-01`, 1), -1);

// Money on hand now: the starting point the person typed, plus everything settled since that day.
export function currentBalance(items: Transaction[], opening: Opening | undefined, today: string) {
  const since = opening?.openingDate ?? '0000-01-01';
  return (opening?.openingCents ?? 0) + items.filter(item => !isPending(item) && settledOn(item) >= since && settledOn(item) <= today).reduce((sum, item) => sum + signed(item), 0);
}

// Day-to-day spending: what left the account in the last days outside bills and installments.
export function dailySpend(items: Transaction[], today: string, window = 30) {
  const from = addDays(today, -(window - 1));
  const loose = items.filter(item => item.type === 'expense' && !isPending(item) && !item.groupId && item.nature !== 'fixed' && settledOn(item) >= from && settledOn(item) <= today);
  if (!loose.length) return { perDayCents: 0, basisDays: 0 };
  const first = loose.map(settledOn).toSorted()[0];
  const basisDays = Math.max(7, Math.min(window, daysBetween(first, today) + 1));
  return { perDayCents: Math.round(loose.reduce((sum, item) => sum + item.amountCents, 0) / basisDays), basisDays };
}

// Where the balance goes by a date: scheduled bills and receivables plus the usual daily spending.
export function projectTo(items: Transaction[], opening: Opening | undefined, today: string, until: string, perDayCents = dailySpend(items, today).perDayCents) {
  const now = currentBalance(items, opening, today);
  const scheduled = items.filter(item => isPending(item) && item.date <= until);
  const toReceive = scheduled.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amountCents, 0);
  const toPay = scheduled.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amountCents, 0);
  const days = Math.max(0, daysBetween(today, until));
  const everyday = perDayCents * days;
  return { now, toReceive, toPay, days, everyday, projected: now + toReceive - toPay - everyday };
}

export function monthlyProjection(items: Transaction[], opening: Opening | undefined, today: string, until: string) {
  const perDayCents = dailySpend(items, today).perDayCents;
  const months: { month: string; end: string; balance: number; toPay: number; toReceive: number }[] = [];
  for (let month = monthOf(today); month <= monthOf(until); month = monthOf(shiftMonths(`${month}-01`, 1))) {
    const end = lastDayOfMonth(month) < until ? lastDayOfMonth(month) : until;
    const inMonth = items.filter(item => isPending(item) && monthOf(item.date) === month);
    months.push({ month, end, balance: projectTo(items, opening, today, end, perDayCents).projected,
      toPay: inMonth.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amountCents, 0),
      toReceive: inMonth.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amountCents, 0) });
  }
  return months;
}

// Repeating bills shown once: the next open entry of each series, with how many remain and until when.
export function collapseSeries(open: Transaction[], all: Transaction[]) {
  const seen = new Set<string>();
  return open.filter(item => !item.groupId || (!seen.has(item.groupId) && seen.add(item.groupId))).map(item => {
    const rest = item.groupId ? all.filter(entry => entry.groupId === item.groupId && isPending(entry) && entry.date > item.date) : [];
    return { item, remaining: rest.length, until: rest.at(-1)?.date };
  });
}

export type Insight = { id: string; tone: 'good' | 'warn' | 'info'; text: string };
export function insights(items: Transaction[], opening: Opening | undefined, today: string): Insight[] {
  const out: Insight[] = [];
  const month = monthOf(today), previous = monthOf(shiftMonths(`${month}-01`, -1));
  const late = items.filter(item => isPending(item) && item.type === 'expense' && item.date < today);
  if (late.length) out.push({ id: 'late', tone: 'warn', text: `${late.length === 1 ? '1 conta vencida' : `${late.length} contas vencidas`} somando ${money(late.reduce((sum, item) => sum + item.amountCents, 0))}.` });
  const groups = new Map<string, Transaction[]>();
  for (const item of items.filter(entry => entry.groupId)) groups.set(item.groupId!, [...(groups.get(item.groupId!) ?? []), item]);
  for (const series of groups.values()) {
    const last = series.toSorted((a, b) => a.date.localeCompare(b.date)).at(-1)!;
    if (!isPending(last) || last.date < today) continue;
    const when = monthOf(last.date) === month ? 'termina este mês' : monthOf(last.date) === monthOf(shiftMonths(`${month}-01`, 1)) ? 'termina no mês que vem' : '';
    if (when) out.push({ id: `ends-${last.groupId}`, tone: 'good', text: `${last.description} ${when}: ${last.type === 'expense' ? 'menos' : 'uma entrada a menos de'} ${money(last.amountCents)} por mês depois disso.` });
  }
  const debt = items.filter(item => isPending(item) && item.type === 'expense' && item.installment);
  if (debt.length) out.push({ id: 'debt', tone: 'info', text: `Parcelas ainda a pagar: ${money(debt.reduce((sum, item) => sum + item.amountCents, 0))}, até ${monthLabel(monthOf(debt.toSorted((a, b) => a.date.localeCompare(b.date)).at(-1)!.date)).toLocaleLowerCase('pt-BR')}.` });
  const byCategory = (m: string) => { const map = new Map<string, number>(); for (const item of items.filter(entry => entry.type === 'expense' && !isPending(entry) && monthOf(settledOn(entry)) === m)) map.set(item.category, (map.get(item.category) ?? 0) + item.amountCents); return map; };
  const now = byCategory(month), before = byCategory(previous);
  const jumps = [...now].map(([category, cents]) => ({ category, cents, before: before.get(category) ?? 0 })).filter(row => row.before > 0 && row.cents - row.before >= 5000 && row.cents >= row.before * 1.2).toSorted((a, b) => (b.cents - b.before) - (a.cents - a.before));
  if (jumps[0]) out.push({ id: 'jump', tone: 'warn', text: `${jumps[0].category}: ${money(jumps[0].cents)} este mês, ${Math.round((jumps[0].cents / jumps[0].before - 1) * 100)}% acima do mês passado.` });
  const pace = dailySpend(items, today);
  if (pace.perDayCents) out.push({ id: 'pace', tone: 'info', text: `No ritmo dos últimos ${pace.basisDays} dias, o dia a dia (fora contas fixas e parcelas) custa cerca de ${money(pace.perDayCents)} por dia.` });
  if (!opening) out.push({ id: 'opening', tone: 'info', text: 'Informe quanto você tem hoje para o saldo e as projeções ficarem reais.' });
  return out;
}
