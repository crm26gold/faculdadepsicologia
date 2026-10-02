import { z } from 'zod';
import { addDays, dateKey, habitSchema, profileSchema, transactionSchema, type Workspace } from './workspace';
import { lifeAreas } from './life';

export type Transaction = z.infer<typeof transactionSchema>;
export type RoutineHabit = z.infer<typeof habitSchema>;
export type UserProfileData = z.infer<typeof profileSchema>;
export const emptyProfile: UserProfileData = { name: '', course: '', semester: '', institution: '', campus: '', registration: '', email: '', phone: '', photoUrl: '' };

export function moneyToCents(raw: string): number {
  // Accepts what people type in Brazil: "R$ 1.234,56", "1234,56", "1.500" or "19.90".
  let value = raw.trim().replace(/^R\$\s*/i, '');
  if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Informe um valor positivo com até duas casas decimais.');
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100_000_000_000) throw new Error('Valor fora do limite.');
  return cents;
}

export function toggleHabitDate(habit: RoutineHabit, date: string): RoutineHabit {
  return { ...habit, completedDates: habit.completedDates.includes(date) ? habit.completedDates.filter(item => item !== date) : [...habit.completedDates, date] };
}

export function calculateHabitStreak(completedDates: string[], referenceDate = dateKey()): number {
  if (!completedDates.length) return 0;
  const set = new Set(completedDates);
  let streak = 0;
  let current = referenceDate;

  if (set.has(current)) {
    streak++;
    current = addDays(current, -1);
  } else {
    current = addDays(current, -1);
    if (!set.has(current)) return 0;
  }

  while (set.has(current)) {
    streak++;
    current = addDays(current, -1);
  }

  return streak;
}

// Explicit, user-reviewed import. Never silently associate browser data with an account.
export function importLegacy(data: Workspace, raw: { finances: string | null; routine: string | null; profile: string | null }, today = dateKey()): Workspace {
  if (data.legacyImportId) throw new Error('Uma importação já foi realizada neste espaço.');
  const previousTransactions = z.array(z.object({ id: z.string(), description: z.string(), amount: z.number().finite().positive(), type: z.enum(['income', 'expense']), category: z.string(), date: z.string() })).max(5000).parse(JSON.parse(raw.finances ?? '[]'));
  const previousHabits = z.array(z.object({ id: z.string(), period: z.enum(['morning', 'afternoon', 'night']), time: z.string(), title: z.string(), area: z.string(), done: z.boolean() })).max(300).parse(JSON.parse(raw.routine ?? '[]'));
  const mapping: Record<string, string> = { Estudos: 'studies', Acadêmico: 'studies', Saúde: 'health', Organização: 'personal', Lazer: 'leisure' };
  const areas = new Set(lifeAreas(data).map(area => area.id));
  const transactions = previousTransactions.map(tx => transactionSchema.parse({ ...tx, amountCents: Math.round(tx.amount * 100) }));
  const habits = previousHabits.map(habit => habitSchema.parse({ ...habit, areaId: areas.has(mapping[habit.area]) ? mapping[habit.area] : '', completedDates: [] }));
  // Legacy done flags have no date: do not invent historical completions.
  const unique = <T extends { id: string }>(current: T[], incoming: T[]) => [...current, ...incoming.filter(item => !current.some(existing => existing.id === item.id))];
  return { ...data, transactions: unique(data.transactions ?? [], transactions), habits: unique(data.habits ?? [], habits),
    ...(raw.profile && !data.profile ? { profile: profileSchema.parse(JSON.parse(raw.profile)) } : {}), legacyImportId: `browser-v2-${today}` };
}
