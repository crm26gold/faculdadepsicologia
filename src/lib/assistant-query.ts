import { z } from 'zod';
import { addDays, dateKey, daySchema, type Workspace } from './workspace';
import { entities, normalized, records, recordTitle, recordVersion, type Entity, type RecordItem } from './assistant-records';
import { commandContext } from './commands';
import { todayAgenda } from './today';
import { isUnorganized } from './capture';
import { placeOf, placeTrail } from './notebooks';

export const assistantQuery = z.object({
  section: z.enum(['resumo', 'agenda', 'busca', 'pendentes', 'focos', 'configuracoes', ...entities]).default('resumo'),
  search: z.string().max(160).default(''),
  from: daySchema.optional(), to: daySchema.optional(),
  includeContent: z.boolean().default(false),
  cursor: z.string().max(40).optional().describe('Só na busca: o "cursor" da página anterior, para continuar a mesma busca.'),
  limit: z.number().int().min(1).max(40).optional().describe('Só na busca: itens por página, de 1 a 40 (padrão 40).'),
});
const weekdays = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
/** A note's HTML as plain words, for searching and excerpts. */
export const plainText = (html: string) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ')
  .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? whole;
    const point = Number(code[1] === 'x' || code[1] === 'X' ? `0${code.slice(1)}` : code.slice(1));
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
  }).replace(/\s+/g, ' ').trim();
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
/** Up to 236 characters around where `wanted` (already normalized) appears in `text`, or null when it does not. */
export function excerpt(text: string, wanted: string, size = 236) {
  // Folded one character at a time, so a position in the folded text maps back to the original.
  let folded = '';
  const origin: number[] = [];
  for (let index = 0; index < text.length; index++) for (const char of fold(text[index])) { folded += char; origin.push(index); }
  const hit = wanted ? folded.indexOf(wanted) : -1;
  if (hit < 0) return null;
  const start = origin[hit], end = origin[hit + wanted.length - 1] + 1;
  const from = Math.max(0, Math.min(start - Math.floor((size - (end - start)) / 2), text.length - size));
  const to = Math.min(text.length, from + size);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`;
}
// The cursor carries where the next page starts and which search it belongs to.
const searchKey = (search: string) => recordVersion(['busca', normalized(search)]).slice(0, 8);
function readCursor(cursor: string, key: string) {
  const match = /^(\d{1,5})\.([a-z0-9]{1,16})$/.exec(cursor);
  if (!match || match[2] !== key) throw new Error('Esse cursor não vale para esta busca. Repita a busca sem cursor.');
  return Number(match[1]);
}
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
  // Each item read carries its record's version; a class is versioned as stored, without the computed title.
  const version = (entity: Entity, item: RecordItem) => recordVersion(entity === 'aula' ? data.classes.find(entry => entry.id === item.id) ?? item : item);
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
          done: entry.done, kind: entry.kind, location: entry.location || null, ...facts, subjectId: entry.subjectId || null, recurring: !!entry.session,
          ...(entry.task ? { versao: recordVersion(entry.task) } : {}) };
      }).filter(entry => !query.search || [entry.title, entry.course, entry.professor, entry.subject].some(value => value && normalized(value).includes(normalized(query.search)))));
    }
    const items = entries.slice(0, 40);
    return { today, from: start, through: addDays(day, -1), truncated: day <= end || entries.length > 40, items, ...(items.length ? { found: items.length } : empty([`agenda de ${start} a ${addDays(day, -1)}`], query.search)) };
  }
  // Finished focus records, newest first, with when they started and ended (null in records made before that).
  if (query.section === 'focos') {
    const time = (iso?: string) => iso ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : null;
    const list = data.sessions.filter(item => (!query.from || item.date >= query.from) && (!query.to || item.date <= query.to)
      && (!query.search || normalized(item.activity ?? '').includes(normalized(query.search))))
      .toSorted((a, b) => (b.endedAt ?? b.date).localeCompare(a.endedAt ?? a.date)).slice(0, 20)
      .map(item => ({ id: item.id, date: item.date, activity: item.activity || null, minutes: Math.round(item.minutes), startedAt: time(item.startedAt), endedAt: time(item.endedAt), versao: recordVersion(item) }));
    return { today, items: list, ...(list.length ? { found: list.length } : empty(['registros de foco'], query.search)) };
  }
  // What is waiting for a decision, for "vamos organizar os pendentes": the assistant walks it one item at a time.
  if (query.section === 'pendentes') {
    const limit = 15;
    const notes = data.notes.filter(isUnorganized).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const late = data.tasks.filter(task => !task.done && task.date < today).toSorted((a, b) => a.date.localeCompare(b.date));
    const bills = (data.transactions ?? []).filter(row => row.status === 'pending' && row.date < today).toSorted((a, b) => a.date.localeCompare(b.date));
    const loose = (data.transactions ?? []).filter(row => row.category === 'Outros').toSorted((a, b) => b.date.localeCompare(a.date));
    const groups = {
      anotacoesParaOrganizar: { total: notes.length, items: notes.slice(0, limit).map(note => ({ id: note.id, title: note.title, updatedAt: note.updatedAt, versao: recordVersion(note) })) },
      compromissosAtrasados: { total: late.length, items: late.slice(0, limit).map(task => ({ id: task.id, title: task.title, date: task.date, ...related.subject(task.subjectId), versao: recordVersion(task) })) },
      contasVencidas: { total: bills.length, items: bills.slice(0, limit).map(row => ({ id: row.id, description: row.description, date: row.date, amountInReais: row.amountCents / 100, flow: row.type, versao: recordVersion(row) })) },
      lancamentosSemCategoria: { total: loose.length, items: loose.slice(0, limit).map(row => ({ id: row.id, description: row.description, date: row.date, amountInReais: row.amountCents / 100, flow: row.type, versao: recordVersion(row) })) },
    };
    const found = Object.values(groups).reduce((sum, group) => sum + group.total, 0);
    return { today, ...groups, ...(found ? { found } : { found: 0, message: 'Nada pendente: anotações organizadas, compromissos em dia, contas pagas e lançamentos com categoria.' }) };
  }
  // One search across every section: titles and names everywhere, plus the text of notes and the back of flashcards
  // with the excerpt where it appears. Title hits come first; "cursor" continues the same search on the next page.
  if (query.section === 'busca') {
    if (!query.search.trim()) throw new Error('Diga o que procurar.');
    const wanted = normalized(query.search);
    const key = searchKey(query.search);
    const offset = query.cursor === undefined ? 0 : readCursor(query.cursor, key);
    const hits = entities.flatMap(entity => records(data, entity).flatMap(item => {
      const title = recordTitle(item);
      const inTitle = normalized(title).includes(wanted) || (entity === 'materia' && normalized(String(item.professor ?? '')).includes(wanted));
      const body = entity === 'anotacao' ? plainText(String(item.content ?? '')) : entity === 'flashcard' ? String(item.back ?? '') : '';
      const trecho = inTitle || !body ? null : excerpt(body, wanted);
      if (!inTitle && !trecho) return [];
      return [{ rank: inTitle ? 0 : 1, hit: { section: entity, id: item.id, title, ...(item.date ? { date: item.date } : {}), ...(trecho ? { trecho } : {}),
        ...(entity === 'anotacao' ? { lugar: placeTrail(data, placeOf(item as never)).join(' › ') } : {}), versao: version(entity, item) } }];
    })).toSorted((a, b) => a.rank - b.rank).map(entry => entry.hit);
    const pageSize = query.limit ?? 40;
    const next = offset + pageSize < hits.length ? `${offset + pageSize}.${key}` : null;
    return { today, search: query.search, items: hits.slice(offset, offset + pageSize), ...(next ? { cursor: next } : {}),
      ...(hits.length ? { found: hits.length } : empty([...entities], query.search)) };
  }
  const items = records(data, query.section as Entity).filter(item => matches(query.section === 'anotacao' ? { ...item, date: dateKey(new Date(String(item.updatedAt))) } : item));
  const content = query.section === 'anotacao' && query.includeContent;
  // Full notes are sent only for an explicit, targeted request, never as ambient voice context.
  if (content && !query.search) throw new Error('Escolha uma anotação pelo título ou ID para ler o conteúdo.');
  const pageSize = content ? 5 : 30;
  const selected = items.slice(0, pageSize).map(item => ({ ...Object.fromEntries(Object.entries(item).filter(([key]) => !['content', 'completedDates'].includes(key))),
    versao: version(query.section as Entity, item) }) as Record<string, unknown>);
  // Classes and subjects carry their course, subject and professor, with null for what is not registered.
  if (query.section === 'aula') selected.forEach((item, index) => { const source = items[index];
    Object.assign(item, related.subject(String(source.subjectId)), { weekdayName: weekdays[Number(source.weekday)], endTime: source.endTime ?? null, location: source.location || null }); });
  if (query.section === 'materia') selected.forEach((item, index) => { const source = items[index];
    Object.assign(item, { professor: source.professor || null, course: source.courseId ? related.courses.get(String(source.courseId)) ?? null : null }); });
  if (content) selected.forEach((item, index) => { item.text = String(items[index].content).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').slice(0, 5000); });
  if (query.section === 'anotacao') selected.forEach((item, index) => { const place = placeOf(items[index] as never);
    Object.assign(item, { lugar: placeTrail(data, place).join(' › '), tipoDeLugar: { inbox: 'Para organizar', subject: 'matéria', notebook: 'caderno', area: 'área' }[place.kind] }); });
  if (query.section === 'caderno') selected.forEach((item, index) => { item.anotacoes = data.notes.filter(note => note.notebookId === items[index].id).length; });
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
