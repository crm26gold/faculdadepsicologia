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
