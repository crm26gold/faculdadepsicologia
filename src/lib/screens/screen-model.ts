import { addDays, formatDate, type Workspace } from '../workspace';
import { currentBalance, money, monthLabel, monthOf, monthSummary, openItems } from '../finance';
import { todayAgenda } from '../today';

// What a "print" of a screen shows, computed with the same helpers as the screens themselves. Rendered as an
// image for assistants and bots (render.tsx); summarised as text where an image cannot be sent.
import { screens, screenViews, type Screen } from './names';
export { screens, screenViews, type Screen };
type Row = { primary: string; secondary?: string; badge?: string };
export type ScreenModel = { screen: Screen; title: string; subtitle: string; highlight?: { label: string; value: string; negative?: boolean }; sections: { title: string; rows: Row[]; empty: string }[] };

const MAX = 6;
const weekdays = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const longDay = (day: string) => `${weekdays[new Date(`${day}T12:00:00`).getDay()]}, ${formatDate(day)}`;
const statusWords = { active: 'em andamento', paused: 'pausado', completed: 'concluído', archived: 'arquivado' } as const;

export function screenModel(data: Workspace, screen: Screen, today: string): ScreenModel {
  const transactions = data.transactions ?? [];
  const agendaRows = (day: string) => todayAgenda(data, day).slice(0, MAX).map(entry => ({ primary: entry.title, secondary: entry.time ?? 'sem horário', badge: entry.done ? 'feito' : entry.kind }));
  switch (screen) {
    case 'financas': {
      const month = monthSummary(transactions, monthOf(today));
      const open = openItems(transactions, today);
      const balance = currentBalance(transactions, data.finance, today);
      return { screen, title: 'Finanças', subtitle: monthLabel(monthOf(today)),
        highlight: { label: data.finance ? `Saldo agora (início ${money(data.finance.openingCents)} em ${formatDate(data.finance.openingDate)})` : 'Resultado dos lançamentos', value: money(balance), negative: balance < 0 },
        sections: [
          { title: 'Este mês', empty: '', rows: [{ primary: 'Entrou', badge: money(month.received) }, { primary: 'Saiu', badge: money(month.paid) },
            { primary: 'A receber', badge: money(month.toReceive) }, { primary: 'A pagar', badge: money(month.toPay) }] },
          { title: 'Contas em aberto', empty: 'Nenhuma conta em aberto.', rows: [...open.late, ...open.week, ...open.later].slice(0, MAX)
            .map(item => ({ primary: item.description, secondary: `${item.type === 'income' ? 'receber' : 'pagar'} até ${formatDate(item.date)}${item.date < today ? ' · atrasada' : ''}`, badge: money(item.amountCents) })) },
        ] };
    }
    case 'agenda': {
      const days = [0, 1, 2, 3, 4, 5, 6].map(offset => addDays(today, offset)).filter(day => todayAgenda(data, day).length).slice(0, 4);
      return { screen, title: 'Agenda', subtitle: 'Próximos dias', sections: days.length ? days.map(day => ({ title: longDay(day), empty: '', rows: agendaRows(day) }))
        : [{ title: 'Próximos 7 dias', empty: 'Nada marcado nos próximos 7 dias.', rows: [] }] };
    }
    case 'habitos': return { screen, title: 'Rotina', subtitle: longDay(today), sections: [{ title: 'Hábitos de hoje', empty: 'Nenhum hábito cadastrado.',
      rows: (data.habits ?? []).toSorted((a, b) => a.time.localeCompare(b.time)).slice(0, MAX * 2).map(habit => ({ primary: habit.title, secondary: habit.time, badge: habit.completedDates.includes(today) ? 'feito' : 'a fazer' })) }] };
    case 'metas': return { screen, title: 'Planejamento', subtitle: 'Metas e projetos', sections: [
      { title: 'Metas', empty: 'Nenhuma meta.', rows: (data.goals ?? []).filter(goal => goal.status !== 'archived').slice(0, MAX).map(goal => ({ primary: goal.title, secondary: goal.deadline ? `até ${formatDate(goal.deadline)}` : undefined, badge: statusWords[goal.status] })) },
      { title: 'Projetos', empty: 'Nenhum projeto.', rows: (data.projects ?? []).filter(project => project.status !== 'archived').slice(0, MAX).map(project => ({ primary: project.title, secondary: project.deadline ? `até ${formatDate(project.deadline)}` : undefined, badge: statusWords[project.status] })) },
    ] };
    case 'anotacoes': return { screen, title: 'Caderno', subtitle: 'Anotações mais recentes', sections: [{ title: 'Recentes', empty: 'Nenhuma anotação.',
      rows: data.notes.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX * 2).map(note => ({ primary: note.title, secondary: formatDate(note.updatedAt.slice(0, 10)) })) }] };
    case 'meu_dia': {
      const open = openItems(transactions, today);
      const habits = data.habits ?? [];
      return { screen, title: 'Meu dia', subtitle: longDay(today), sections: [
        { title: 'Agenda de hoje', empty: 'Nada marcado para hoje.', rows: agendaRows(today) },
        { title: 'Contas da semana', empty: 'Nenhuma conta para esta semana.', rows: [...open.late, ...open.week].slice(0, 4).map(item => ({ primary: item.description, secondary: formatDate(item.date), badge: money(item.amountCents) })) },
        { title: 'Hábitos', empty: 'Nenhum hábito cadastrado.', rows: habits.length ? [{ primary: `${habits.filter(habit => habit.completedDates.includes(today)).length} de ${habits.length} feitos hoje` }] : [] },
      ] };
    }
  }
}

/** The same screen as plain text, for channels that cannot receive an image. */
export function screenText(model: ScreenModel) {
  return [`${model.title} · ${model.subtitle}`, model.highlight ? `${model.highlight.label}: ${model.highlight.value}` : '',
    ...model.sections.map(section => `${section.title}: ${section.rows.length ? section.rows.map(row => [row.primary, row.secondary, row.badge].filter(Boolean).join(' · ')).join('; ') : section.empty}`)]
    .filter(Boolean).join('\n');
}
