import { z } from 'zod';
import { addDays, dateKey, daySchema, type Workspace } from './workspace';
import { entities, normalized, records, recordTitle, type Entity } from './assistant-records';
import { commandContext } from './commands';
import { todayAgenda } from './today';
import { isUnorganized } from './capture';

export const assistantQuery = z.object({
  section: z.enum(['resumo', 'agenda', 'busca', 'pendentes', 'configuracoes', ...entities]).default('resumo'),
  search: z.string().max(160).default(''),
  from: daySchema.optional(), to: daySchema.optional(),
  includeContent: z.boolean().default(false),
});
const weekdays = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
// Related facts the screens show together, so one query answers "who teaches the 18:10 class".
// A missing value is null: the assistant says it is not registered instead of filling it in.
function relations(data: Workspace) {
  const courses = new Map((data.courses ?? []).map(course => [course.id, course.name]));
  const subjects = new Map(data.subjects.map(subject => [subject.id, { subject: subject.name, professor: subject.professor || null, course: subject.courseId ? courses.get(subject.courseId) ?? null : null }]));
  return { courses, subject: (id?: string) => (id ? subjects.get(id) : undefined) ?? { subject: null, professor: null, course: null } };
}
const empty = (where: string[], search: string) => ({ found: 0, message: `Não encontrei${search ? ` "${search}"` : ' registros'}. Procurei em: ${where.join(', ')}.` });

export function queryWorkspace(data: Workspace, input: unknown, today: string) {
  const query = assistantQuery.parse(input);
  const related = relations(data);
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
      entries.push(...todayAgenda(data, day).map(entry => {
        const facts = related.subject(entry.subjectId);
        return { id: entry.task?.id ?? entry.id, title: entry.title, date: day, weekday: weekdays[new Date(`${day}T12:00:00`).getDay()], time: entry.time ?? null, endTime: entry.endTime ?? null,
          done: entry.done, kind: entry.kind, location: entry.location || null, ...facts, subjectId: entry.subjectId || null, recurring: !!entry.session };
      }).filter(entry => !query.search || [entry.title, entry.course, entry.professor, entry.subject].some(value => value && normalized(value).includes(normalized(query.search)))));
    }
    const items = entries.slice(0, 40);
    return { today, from: start, through: addDays(day, -1), truncated: day <= end || entries.length > 40, items, ...(items.length ? { found: items.length } : empty([`agenda de ${start} a ${addDays(day, -1)}`], query.search)) };
  }
  // What is waiting for a decision, for "vamos organizar os pendentes": the assistant walks it one item at a time.
  if (query.section === 'pendentes') {
    const limit = 15;
    const notes = data.notes.filter(isUnorganized).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const late = data.tasks.filter(task => !task.done && task.date < today).toSorted((a, b) => a.date.localeCompare(b.date));
    const bills = (data.transactions ?? []).filter(row => row.status === 'pending' && row.date < today).toSorted((a, b) => a.date.localeCompare(b.date));
    const loose = (data.transactions ?? []).filter(row => row.category === 'Outros').toSorted((a, b) => b.date.localeCompare(a.date));
    const groups = {
      anotacoesParaOrganizar: { total: notes.length, items: notes.slice(0, limit).map(note => ({ id: note.id, title: note.title, updatedAt: note.updatedAt })) },
      compromissosAtrasados: { total: late.length, items: late.slice(0, limit).map(task => ({ id: task.id, title: task.title, date: task.date, ...related.subject(task.subjectId) })) },
      contasVencidas: { total: bills.length, items: bills.slice(0, limit).map(row => ({ id: row.id, description: row.description, date: row.date, amountInReais: row.amountCents / 100, flow: row.type })) },
      lancamentosSemCategoria: { total: loose.length, items: loose.slice(0, limit).map(row => ({ id: row.id, description: row.description, date: row.date, amountInReais: row.amountCents / 100, flow: row.type })) },
    };
    const found = Object.values(groups).reduce((sum, group) => sum + group.total, 0);
    return { today, ...groups, ...(found ? { found } : { found: 0, message: 'Nada pendente: anotações organizadas, compromissos em dia, contas pagas e lançamentos com categoria.' }) };
  }
  // One search across every section: titles, names and descriptions, with the section of each hit.
  if (query.section === 'busca') {
    if (!query.search.trim()) throw new Error('Diga o que procurar.');
    const wanted = normalized(query.search);
    const hits = entities.flatMap(entity => records(data, entity)
      .filter(item => normalized(recordTitle(item)).includes(wanted) || (entity === 'materia' && normalized(String(item.professor ?? '')).includes(wanted)))
      .slice(0, 10).map(item => ({ section: entity, id: item.id, title: recordTitle(item), ...(item.date ? { date: item.date } : {}) })));
    const where = [...entities];
    return { today, search: query.search, items: hits.slice(0, 40), ...(hits.length ? { found: hits.length } : empty(where, query.search)) };
  }
  const items = records(data, query.section as Entity).filter(item => matches(query.section === 'anotacao' ? { ...item, date: dateKey(new Date(String(item.updatedAt))) } : item));
  const content = query.section === 'anotacao' && query.includeContent;
  // Full notes are sent only for an explicit, targeted request, never as ambient voice context.
  if (content && !query.search) throw new Error('Escolha uma anotação pelo título ou ID para ler o conteúdo.');
  const pageSize = content ? 5 : 30;
  const selected = items.slice(0, pageSize).map(item => Object.fromEntries(Object.entries(item).filter(([key]) => !['content', 'completedDates'].includes(key))));
  // Classes and subjects carry their course, subject and professor, with null for what is not registered.
  if (query.section === 'aula') selected.forEach((item, index) => { const source = items[index];
    Object.assign(item, related.subject(String(source.subjectId)), { weekdayName: weekdays[Number(source.weekday)], endTime: source.endTime ?? null, location: source.location || null }); });
  if (query.section === 'materia') selected.forEach((item, index) => { const source = items[index];
    Object.assign(item, { professor: source.professor || null, course: source.courseId ? related.courses.get(String(source.courseId)) ?? null : null }); });
  if (content) selected.forEach((item, index) => { item.text = String(items[index].content).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').slice(0, 5000); });
  if (query.section === 'habito') selected.forEach((item, index) => { item.doneToday = (items[index].completedDates as string[]).includes(today); });
  const finance = query.section === 'financeiro' ? { totalsInReais: {
    paidExpenses: items.filter(item => item.type === 'expense' && item.status !== 'pending').reduce((sum, item) => sum + Number(item.amountCents), 0) / 100,
    received: items.filter(item => item.type === 'income' && item.status !== 'pending').reduce((sum, item) => sum + Number(item.amountCents), 0) / 100,
    toPay: items.filter(item => item.type === 'expense' && item.status === 'pending').reduce((sum, item) => sum + Number(item.amountCents), 0) / 100,
    toReceive: items.filter(item => item.type === 'income' && item.status === 'pending').reduce((sum, item) => sum + Number(item.amountCents), 0) / 100,
  } } : {};
  return { today, total: items.length, truncated: items.length > pageSize, items: selected, ...finance, ...(items.length ? {} : empty([query.section], query.search)) };
}

export function confirmationIntent(text: string): 'confirm' | 'cancel' | null {
  const value = normalized(text).replace(/[.,!?]/g, '').trim();
  if (/^(cancelar|cancela|nao|nao confirmo|nao quero|deixa pra la|desistir|desisto)(\s|$)/.test(value)) return 'cancel';
  return /^(sim[ ,]*)?(eu )?confirmo( a)? (exclusao|substituicao|remocao)( de (todos )?(esses|estes|os) (itens|registros))?$/.test(value) ? 'confirm' : null;
}
