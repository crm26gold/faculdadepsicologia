import { z } from 'zod';
import { addDays, daySchema, formatDate, taskKinds, timeSchema, type Task, type Workspace } from './workspace';
import { captureNote } from './capture';
import { buildSeries, currentBalance, expenseCategories, incomeCategories, money, monthOf, monthSummary, natures, projectTo } from './finance';
import { startFocus } from './focus';
import { lifeAreas } from './life';
import { todayAgenda } from './today';

// What the assistant may do on its own. The model only proposes these shapes; every action is validated
// here and applied with the same rules as the screens. Shared by the chat, the voice mode and, later,
// Telegram, WhatsApp and MCP.
const name = z.string().trim().min(1).max(160);
export const commandAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('compromisso'), title: name, date: daySchema, time: timeSchema.optional(), kind: z.enum(taskKinds).optional(),
    minutes: z.number().int().min(5).max(240).optional(), area: z.string().max(100).optional(), subject: z.string().max(100).optional() }),
  z.object({ type: z.literal('anotacao'), text: z.string().trim().min(1).max(10_000) }),
  z.object({ type: z.literal('financeiro'), flow: z.enum(['income', 'expense']), description: name, amount: z.number().positive().max(1_000_000_000),
    category: z.string().max(100).optional(), date: daySchema, pending: z.boolean().optional(), nature: z.enum(['fixed', 'variable', 'oneoff']).optional(),
    installments: z.number().int().min(2).max(120).optional(), monthly: z.number().int().min(2).max(120).optional() }),
  z.object({ type: z.literal('foco'), activity: name, minutes: z.number().int().min(1).max(240).optional() }),
  z.object({ type: z.literal('concluir'), title: name }),
]);
export type CommandAction = z.infer<typeof commandAction>;
export const commandResult = z.object({ reply: z.string().trim().max(3000).default(''), actions: z.array(commandAction).max(8).default([]) });
export type CommandResult = z.infer<typeof commandResult>;
export type Undo = { kind: 'task' | 'note' | 'transactions' | 'focus' | 'reopen'; id: string };
export type Applied = { label: string; view: 'agenda' | 'notes' | 'finances' | 'focus'; id?: string; undo: Undo };

const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();
function matchByName<T extends { id: string; name: string }>(items: readonly T[], wanted?: string) {
  if (!wanted) return undefined;
  const target = plain(wanted);
  return items.find(item => plain(item.name) === target) ?? items.find(item => plain(item.name).includes(target) || target.includes(plain(item.name)));
}
const weekday = (day: string) => formatDate(day, { weekday: 'long' });

/** Applies validated actions one by one; a failing action is reported and does not stop the others. */
export function applyCommands(data: Workspace, actions: CommandAction[], options: { today: string; now: number; newId?: () => string }) {
  const newId = options.newId ?? (() => crypto.randomUUID());
  let next = data;
  const applied: Applied[] = [];
  const failed: string[] = [];
  for (const action of actions) {
    try {
      switch (action.type) {
        case 'compromisso': {
          const subject = matchByName(next.subjects, action.subject);
          const area = matchByName(lifeAreas(next), action.area);
          const task: Task = { id: newId(), title: action.title, subjectId: subject?.id ?? '', date: action.date, kind: action.kind ?? 'Compromisso',
            done: false, minutes: action.minutes ?? 30, ...(action.time ? { time: action.time } : {}), ...(area ? { areaId: area.id } : subject ? { areaId: 'studies' } : {}) };
          next = { ...next, tasks: [...next.tasks, task] };
          applied.push({ label: `${task.kind}: ${task.title} · ${action.date === options.today ? 'hoje' : action.date === addDays(options.today, 1) ? 'amanhã' : `${weekday(action.date)}, ${formatDate(action.date)}`}${task.time ? ` às ${task.time}` : ''}`, view: 'agenda', id: task.id, undo: { kind: 'task', id: task.id } });
          break;
        }
        case 'anotacao': {
          const note = captureNote(action.text, newId(), new Date(options.now).toISOString());
          next = { ...next, notes: [note, ...next.notes] };
          applied.push({ label: `Anotação em Para organizar: ${note.title}`, view: 'notes', id: note.id, undo: { kind: 'note', id: note.id } });
          break;
        }
        case 'financeiro': {
          const list = action.flow === 'income' ? incomeCategories : expenseCategories;
          const category = list.find(item => plain(item) === plain(action.category ?? '')) ?? 'Outros';
          const pending = action.pending ?? action.date > options.today;
          const series = buildSeries({ description: action.description, amountCents: Math.round(action.amount * 100), type: action.flow, category, date: action.date,
            nature: action.nature ?? (action.monthly ? 'fixed' : 'oneoff'), areaId: 'finance', status: pending ? 'pending' : 'paid', paidOn: pending ? undefined : action.date },
            action.installments ? { kind: 'installments', count: action.installments } : action.monthly ? { kind: 'monthly', months: action.monthly } : { kind: 'none' }, options.today, newId);
          next = { ...next, transactions: [...series, ...(next.transactions ?? [])] };
          const what = action.flow === 'income' ? (pending ? 'A receber' : 'Entrada') : (pending ? 'Conta a pagar' : 'Saída');
          applied.push({ label: `${what}: ${action.description} · ${money(Math.round(action.amount * 100))}${series.length > 1 ? ` × ${series.length} meses` : ''}${pending ? ` · ${formatDate(action.date)}` : ''} (${natures[series[0].nature ?? 'oneoff'].label})`, view: 'finances', id: series[0].id, undo: { kind: 'transactions', id: series[0].groupId ?? series[0].id } });
          break;
        }
        case 'foco': {
          const focusId = newId();
          next = startFocus(next, { id: focusId, now: options.now, activity: action.activity, targetSeconds: action.minutes ? action.minutes * 60 : 0 });
          applied.push({ label: `Foco ligado: ${action.activity}${action.minutes ? ` · ${action.minutes} min` : ''}`, view: 'focus', undo: { kind: 'focus', id: focusId } });
          break;
        }
        case 'concluir': {
          const open = next.tasks.filter(task => !task.done);
          const target = plain(action.title);
          const task = open.find(item => plain(item.title) === target) ?? open.find(item => plain(item.title).includes(target) || target.includes(plain(item.title)));
          if (!task) throw new Error(`não achei o compromisso “${action.title}” em aberto`);
          next = { ...next, tasks: next.tasks.map(item => item.id === task.id ? { ...item, done: true } : item) };
          applied.push({ label: `Concluído: ${task.title}`, view: 'agenda', id: task.id, undo: { kind: 'reopen', id: task.id } });
          break;
        }
      }
    } catch (error) {
      failed.push(error instanceof Error ? error.message : 'ação inválida');
    }
  }
  return { data: next, applied, failed };
}

/** Reverts what a command did, item by item, leaving later edits to other things untouched. */
export function undoApplied(data: Workspace, applied: Applied[]): Workspace {
  let next = data;
  for (const { undo } of applied) {
    if (undo.kind === 'task') next = { ...next, tasks: next.tasks.filter(task => task.id !== undo.id) };
    if (undo.kind === 'reopen') next = { ...next, tasks: next.tasks.map(task => task.id === undo.id ? { ...task, done: false } : task) };
    if (undo.kind === 'note') next = { ...next, notes: next.notes.filter(note => note.id !== undo.id) };
    if (undo.kind === 'transactions') next = { ...next, transactions: (next.transactions ?? []).filter(item => item.id !== undo.id && item.groupId !== undo.id) };
    if (undo.kind === 'focus' && next.activeFocus?.id === undo.id) next = { ...next, activeFocus: null };
  }
  return next;
}

// Money the assistant can talk about: balance now (if the person set a starting point), what is due and this month.
function finance(data: Workspace, today: string) {
  const items = data.transactions ?? [];
  if (!items.length && !data.finance) return 'Finanças: nada registrado ainda.';
  const next = projectTo(items, data.finance, today, addDays(today, 30));
  const month = monthSummary(items, monthOf(today));
  const top = month.byCategory.slice(0, 4).map(item => `${item.category} ${money(item.cents)}`).join(', ');
  return [
    data.finance ? `Saldo agora: ${money(currentBalance(items, data.finance, today))} (saldo inicial de ${money(data.finance.openingCents)} em ${formatDate(data.finance.openingDate)}).`
      : `Saldo: a pessoa ainda não informou o saldo inicial em Finanças; o resultado dos lançamentos é ${money(currentBalance(items, undefined, today))}.`,
    `Este mês: entrou ${money(month.received)}, saiu ${money(month.paid)}; ainda a receber ${money(month.toReceive)}, a pagar ${money(month.toPay)}.${top ? ` Maiores gastos: ${top}.` : ''}`,
    `Próximos 30 dias: a pagar ${money(next.toPay)}, a receber ${money(next.toReceive)}, previsão de saldo ${money(next.projected)}.`,
  ].join('\n');
}

/** What the model needs to know about this person's space, kept short to save tokens. */
export function commandContext(data: Workspace, today: string) {
  const agenda = todayAgenda(data, today).map(entry => `${entry.time ?? 'sem horário'} ${entry.title} (${entry.kind})${entry.done ? ' [feito]' : ''}`);
  const late = data.tasks.filter(task => !task.done && task.date < today).slice(0, 8).map(task => `${task.title} (${formatDate(task.date)})`);
  const upcoming = data.tasks.filter(task => !task.done && task.date > today && task.date <= addDays(today, 7)).slice(0, 10).map(task => `${formatDate(task.date)}${task.time ? ` ${task.time}` : ''} ${task.title}`);
  const bills = (data.transactions ?? []).filter(item => item.status === 'pending' && item.date <= addDays(today, 15)).slice(0, 10).map(item => `${formatDate(item.date)} ${item.type === 'income' ? 'receber' : 'pagar'} ${item.description} ${money(item.amountCents)}`);
  return [
    `Hoje: ${weekday(today)}, ${today}.`,
    `Áreas da vida: ${lifeAreas(data).filter(area => !area.hidden).map(area => area.name).join('; ')}.`,
    data.subjects.length ? `Matérias e módulos: ${data.subjects.map(subject => subject.name).join('; ')}.` : '',
    `Agenda de hoje: ${agenda.join('; ') || 'nada'}.`,
    late.length ? `Atrasados: ${late.join('; ')}.` : '',
    upcoming.length ? `Próximos 7 dias: ${upcoming.join('; ')}.` : '',
    bills.length ? `Contas e recebimentos em aberto (15 dias): ${bills.join('; ')}.` : '',
    data.activeFocus ? `Há um foco ligado: ${data.activeFocus.activity}.` : '',
    finance(data, today),
  ].filter(Boolean).join('\n').slice(0, 6000);
}

export const commandSystem = `Você é o assistente pessoal da Jornada Plena, um organizador da vida inteira (estudos, trabalho, rotina, saúde, finanças, relações e projetos).
Converse de verdade, como um bom assistente: natural, caloroso e direto, em português do Brasil. Responda perguntas, ajude a pensar, dê sugestões, lembre do que foi dito antes na conversa.
Quando a pessoa pedir para registrar, anotar, agendar, lançar um gasto ou um recebimento, começar um foco ou marcar algo como feito, você mesmo executa com as ações abaixo e conta o que fez, já com a categoria certa.
Sempre devolva SOMENTE um JSON, sem texto fora dele, no formato:
{"reply": "sua resposta para a pessoa", "actions": [ ... ]}
A resposta deve soar falada: frases curtas e claras, sem listas longas nem markdown; pode ser mais longa só quando a pessoa pedir explicação.
Ações possíveis (só quando a pessoa pedir algo para registrar; numa conversa comum, "actions" fica vazio):
- {"type":"compromisso","title":"...","date":"AAAA-MM-DD","time":"HH:MM"(opcional),"kind":um de ${taskKinds.join('|')} (opcional),"minutes":5-240 (opcional),"area":"nome da área"(opcional),"subject":"nome da matéria"(opcional)}
- {"type":"anotacao","text":"o conteúdo a guardar"} — para ideias, lembretes sem data e qualquer coisa que não seja compromisso nem dinheiro
- {"type":"financeiro","flow":"expense"|"income","description":"...","amount":número em reais,"category":uma de [${expenseCategories.join(', ')}] para saídas ou [${incomeCategories.join(', ')}] para entradas,"date":"AAAA-MM-DD","pending":true se ainda vai pagar/receber,"nature":"fixed"|"variable"|"oneoff","installments":número de parcelas (opcional),"monthly":meses se repete todo mês (opcional)}
- {"type":"foco","activity":"...","minutes":número (opcional)} — para começar a contar tempo
- {"type":"concluir","title":"nome do compromisso"} — marcar como feito
Regras: datas relativas ("amanhã", "sexta", "dia 10") viram datas reais a partir de hoje. Gasto já feito = pending false; conta futura = pending true.
Ao registrar, confirme de forma natural (por exemplo: "Anotei: R$ 50 em lanche, na categoria Alimentação"). Se for uma pergunta sobre o dia, a agenda ou as contas, responda usando o contexto e não crie ações.
Nunca invente dados que a pessoa não disse. Se faltar algo essencial (por exemplo o valor de um gasto), pergunte na resposta e não crie a ação.`;

/** Model output → validated result, tolerating code fences and stray text around the JSON. */
export function parseCommand(raw: string): CommandResult {
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return { reply: raw.trim().slice(0, 3000), actions: [] };
  let value: unknown;
  try { value = JSON.parse(raw.slice(start, end + 1)); } catch { return { reply: raw.trim().slice(0, 3000), actions: [] }; }
  const object = value as { reply?: unknown; actions?: unknown };
  const actions = Array.isArray(object.actions) ? object.actions.flatMap(item => { const parsed = commandAction.safeParse(item); return parsed.success ? [parsed.data] : []; }) : [];
  return { reply: typeof object.reply === 'string' ? object.reply.trim().slice(0, 3000) : '', actions: actions.slice(0, 8) };
}
