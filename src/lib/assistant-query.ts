import { z } from 'zod';
import { addDays, dateKey, daySchema, type Workspace } from './workspace';
import { entities, normalized, records, recordTitle, type Entity } from './assistant-records';
import { commandContext } from './commands';
import { todayAgenda } from './today';

export const assistantQuery = z.object({
  section: z.enum(['resumo', 'agenda', 'configuracoes', ...entities]).default('resumo'),
  search: z.string().max(160).default(''),
  from: daySchema.optional(), to: daySchema.optional(),
  includeContent: z.boolean().default(false),
});
export function queryWorkspace(data: Workspace, input: unknown, today: string) {
  const query = assistantQuery.parse(input);
  if (query.section === 'resumo') return { today, summary: commandContext(data, today) };
  // The single settings, read only when asked: opening balance, semester and profile without the photo.
  if (query.section === 'configuracoes') {
    const { photoUrl: _photo, ...profile } = data.profile ?? { photoUrl: '' };
    return { today, saldoInicial: data.finance ? { emReais: data.finance.openingCents / 100, data: data.finance.openingDate } : null, semestre: data.term, perfil: profile };
  }
  if (query.from && query.to && query.from > query.to) throw new Error('A data final deve vir depois da inicial.');
  const matches = (item: { id: string; date?: unknown; title?: unknown; name?: unknown; description?: unknown; front?: unknown }) => {
    const title = recordTitle(item);
    return (!query.search || item.id === query.search || normalized(title).includes(normalized(query.search)))
      && (!query.from || typeof item.date !== 'string' || item.date >= query.from)
      && (!query.to || typeof item.date !== 'string' || item.date <= query.to);
  };
  if (query.section === 'agenda') {
    const start = query.from ?? today, end = query.to ?? addDays(start, 7);
    const entries = [];
    let day = start;
    for (let index = 0; day <= end && index < 31; index++, day = addDays(day, 1)) {
      entries.push(...todayAgenda(data, day).map(entry => ({ id: entry.task?.id ?? entry.id, title: entry.title, date: day, time: entry.time,
        done: entry.done, kind: entry.kind, location: entry.location, subjectId: entry.subjectId, recurring: !!entry.session })).filter(matches));
    }
    return { today, from: start, through: addDays(day, -1), truncated: day <= end || entries.length > 40, items: entries.slice(0, 40) };
  }
  const items = records(data, query.section as Entity).filter(item => matches(query.section === 'anotacao' ? { ...item, date: dateKey(new Date(String(item.updatedAt))) } : item));
  const content = query.section === 'anotacao' && query.includeContent;
  // Full notes are sent only for an explicit, targeted request, never as ambient voice context.
  if (content && !query.search) throw new Error('Escolha uma anotação pelo título ou ID para ler o conteúdo.');
  const pageSize = content ? 5 : 30;
  const selected = items.slice(0, pageSize).map(item => Object.fromEntries(Object.entries(item).filter(([key]) => !['content', 'completedDates'].includes(key))));
  if (content) selected.forEach((item, index) => { item.text = String(items[index].content).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').slice(0, 5000); });
  if (query.section === 'habito') selected.forEach((item, index) => { item.doneToday = (items[index].completedDates as string[]).includes(today); });
  const finance = query.section === 'financeiro' ? { totalsInReais: {
    paidExpenses: items.filter(item => item.type === 'expense' && item.status !== 'pending').reduce((sum, item) => sum + Number(item.amountCents), 0) / 100,
    received: items.filter(item => item.type === 'income' && item.status !== 'pending').reduce((sum, item) => sum + Number(item.amountCents), 0) / 100,
    toPay: items.filter(item => item.type === 'expense' && item.status === 'pending').reduce((sum, item) => sum + Number(item.amountCents), 0) / 100,
    toReceive: items.filter(item => item.type === 'income' && item.status === 'pending').reduce((sum, item) => sum + Number(item.amountCents), 0) / 100,
  } } : {};
  return { today, total: items.length, truncated: items.length > pageSize, items: selected, ...finance };
}

export function confirmationIntent(text: string): 'confirm' | 'cancel' | null {
  const value = normalized(text).replace(/[.,!?]/g, '').trim();
  if (/^(cancelar|cancela|nao|nao confirmo|nao quero|deixa pra la|desistir|desisto)(\s|$)/.test(value)) return 'cancel';
  return /^(sim[ ,]*)?(eu )?confirmo( a)? (exclusao|substituicao|remocao)( de (todos )?(esses|estes|os) (itens|registros))?$/.test(value) ? 'confirm' : null;
}
