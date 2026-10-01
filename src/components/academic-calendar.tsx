'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download, SlidersHorizontal, Plus, Clock3, BookOpen, ArrowUpRight } from 'lucide-react';
import { addDays, dateKey, formatDate, type Task, type Workspace } from '@/lib/workspace';
import { calendarEntries, monthDays, shiftMonth, weekdays, weekDays, type CalendarEntry } from '@/lib/academic';
import { downloadCalendar } from '@/lib/calendar-export';
import { Modal } from './modal';
import { ScheduleSettings } from './schedule-settings';
import { SubjectOptions } from './subject-options';
import styles from './academic.module.css';
import { areaName, itemArea, lifeAreas } from '@/lib/life';

type Props = { data: Workspace; date: string; onDateChange: (date: string) => void; update: (change: (data: Workspace) => Workspace) => boolean; blocked: boolean; onNew: (date: string) => void; onEdit: (task: Task) => void };

export default function AcademicCalendar({ data, date, onDateChange, update, blocked, onNew, onEdit }: Props) {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(date);
  const [filter, setFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const matches = (item: CalendarEntry) => (!filter || item.subjectId === filter) && (!areaFilter || (areaFilter === '__none' ? !itemArea(item) : itemArea(item) === areaFilter));
  const [details, setDetails] = useState<CalendarEntry | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const today = dateKey();
  const days = view === 'month' ? monthDays(cursor) : weekDays(cursor);
  const entries = calendarEntries(data, days[0], days.at(-1)!).filter(matches);
  const selected = calendarEntries(data, date, date).filter(matches);
  const pending = data.classes.filter((item) => item.enabled && item.intervalWeeks > 1 && !item.firstDate);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const moveFocus = useRef(false);
  useEffect(() => { if (moveFocus.current) { refs.current.get(date)?.focus(); moveFocus.current = false; } }, [date]);
  function move(direction: number) {
    const next = view === 'month' ? shiftMonth(cursor, direction) : addDays(cursor, direction * 7);
    setCursor(next); onDateChange(next);
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, day: string) {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next = offsets[event.key] ? addDays(day, offsets[event.key]) : '';
    if (event.key === 'Home') next = addDays(day, -new Date(`${day}T12:00:00`).getDay());
    if (event.key === 'End') next = addDays(day, 6 - new Date(`${day}T12:00:00`).getDay());
    if (event.key === 'PageUp' || event.key === 'PageDown') next = shiftMonth(day, event.key === 'PageUp' ? -1 : 1);
    if (!next) return;
    event.preventDefault(); moveFocus.current = true;
    if (next < days[0] || next > days.at(-1)!) setCursor(next);
    onDateChange(next);
  }
  const entryButton = (item: CalendarEntry) => <button key={item.id} className={`${styles.event} ${item.color} ${item.done ? styles.done : ''}`} onClick={() => setDetails(item)}><span className={styles.eventTime}>{item.time ?? 'Sem horário'} · {item.kind}</span><strong>{item.title}</strong><small>{areaName(data, item)}</small>{item.professor && <small>{item.professor}{item.location ? ` · ${item.location}` : ''}</small>}</button>;

  return <div className={styles.agenda}>
    <div className={styles.overview}>
      <div className={styles.overviewTitle}><span className={styles.iconTile}><CalendarDays size={25} aria-hidden="true" /></span><div><span className="eyebrow">Todas as áreas da vida</span><h2>Sua rotina, em perspectiva.</h2><p>Estudos, trabalho, saúde, descanso e vida pessoal no mesmo calendário.</p></div></div>
      <div className={styles.metrics}><span><strong>{data.subjects.length}</strong> matérias</span><span><strong>{data.classes.filter((item) => item.enabled).length}</strong> horários na grade</span></div>
    </div>
    <div className={styles.actionbar}><div className={styles.syncNote}><span className={styles.dot} />Agenda pessoal · sem sincronização automática</div><div className="button-row"><button className="button outline" onClick={() => setScheduleOpen(true)}><SlidersHorizontal size={16} aria-hidden="true" />Minha grade</button><button className="button outline" onClick={() => setExportOpen(true)}><Download size={16} aria-hidden="true" />Exportar agenda</button><button className="button primary" disabled={blocked} onClick={() => onNew(date)}><Plus size={17} aria-hidden="true" />Novo compromisso</button></div></div>
    <div className={`${styles.calendarLayout} ${view === 'week' ? styles.wideCalendar : ''}`}>
      <section className={styles.calendarPanel}>
        <div className={styles.calendarToolbar}><div className={styles.monthNavigation}><button className="icon-button" aria-label={view === 'month' ? 'Mês anterior' : 'Semana anterior'} onClick={() => move(-1)}><ChevronLeft size={20} aria-hidden="true" /></button><h3 aria-live="polite">{view === 'month' ? formatDate(cursor, { month: 'long', year: 'numeric' }) : `${formatDate(days[0])} — ${formatDate(days[6])}`}</h3><button className="icon-button" aria-label={view === 'month' ? 'Próximo mês' : 'Próxima semana'} onClick={() => move(1)}><ChevronRight size={20} aria-hidden="true" /></button></div><div className={styles.viewControls}><button className="button outline" onClick={() => { setCursor(today); onDateChange(today); }}>Hoje</button><div className={styles.segmented} role="group" aria-label="Visualização da agenda"><button aria-pressed={view === 'month'} onClick={() => { setCursor(date); setView('month'); }}>Mês</button><button aria-pressed={view === 'week'} onClick={() => { setCursor(date); setView('week'); }}>Semana</button></div></div></div>
        <div className={styles.filterRow}><label htmlFor="calendar-area">Filtrar área da vida</label><select id="calendar-area" value={areaFilter} onChange={(event) => { setAreaFilter(event.target.value); setFilter(''); }}><option value="">Todas as áreas</option><option value="__none">Sem área</option>{lifeAreas(data).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><label htmlFor="calendar-subject"><BookOpen size={15} aria-hidden="true" /> Filtrar matéria</label><select id="calendar-subject" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Todas as matérias</option><SubjectOptions data={data} /></select></div>
        {view === 'month' ? <table className={styles.monthTable}><caption className="sr-only">Calendário mensal. Use as setas para escolher dias, Home e End para início e fim da semana e Page Up ou Page Down para mudar de mês.</caption><thead><tr>{weekdays.map((day) => <th key={day} scope="col"><abbr title={day}>{day.slice(0, 3)}</abbr></th>)}</tr></thead><tbody>{Array.from({ length: 6 }, (_, row) => <tr key={row}>{days.slice(row * 7, row * 7 + 7).map((day) => {
          const items = entries.filter((item) => item.date === day);
          return <td key={day}><button ref={(element) => { if (element) refs.current.set(day, element); else refs.current.delete(day); }} tabIndex={day === date || (!days.includes(date) && day === days[0]) ? 0 : -1} onKeyDown={(event) => keyboard(event, day)} className={`${styles.day} ${day.slice(0, 7) !== cursor.slice(0, 7) ? styles.outside : ''} ${day === date ? styles.selected : ''}`} aria-label={`${formatDate(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${items.length} compromissos`} aria-current={day === today ? 'date' : undefined} aria-pressed={day === date} onClick={() => onDateChange(day)}><span className={styles.dayNumber}>{Number(day.slice(-2))}</span><span className={styles.dayItems}>{items.slice(0, 3).map((item) => <span key={item.id} className={`${styles.dayPill} ${item.color}`}><b>{item.time ?? '•'}</b> {item.title}</span>)}{items.length > 3 && <span className={styles.more}>+{items.length - 3} compromissos</span>}</span><span className={styles.mobileCount}>{items.length > 0 && `${items.length} ${items.length === 1 ? 'evento' : 'eventos'}`}</span></button></td>;
        })}</tr>)}</tbody></table> : <div className={styles.weekGrid}>{days.map((day) => <section key={day} className={`${styles.weekColumn} ${day === today ? styles.weekToday : ''}`}><button className={styles.weekHeading} aria-label={`Selecionar ${formatDate(day)}`} onClick={() => onDateChange(day)}><span>{formatDate(day, { weekday: 'short' })}</span><strong>{Number(day.slice(-2))}</strong></button><div className={styles.weekEvents}>{entries.filter((item) => item.date === day).map(entryButton)}{!entries.some((item) => item.date === day) && <span className={styles.freeDay}>Um respiro.</span>}</div></section>)}</div>}
        <div className={styles.calendarFoot}><span><i className={styles.dot} />Aulas previstas pela grade</span><span>Fuso: São Paulo · feriados não descontados</span></div>
      </section>
      <aside className={styles.agendaAside}><section className={styles.sideCard}><span className="eyebrow">Seu dia em detalhes</span><h3>{formatDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}</h3><div className={styles.dayDetails}>{selected.map(entryButton)}{selected.length === 0 && <div className={styles.emptyDay}><CalendarDays size={30} aria-hidden="true" /><p>Nenhum compromisso neste dia.</p><small>Você pode deixar esse espaço livre.</small></div>}</div><button className="text-button" disabled={blocked} onClick={() => onNew(date)}><Plus size={15} aria-hidden="true" />Adicionar neste dia</button></section>
      <section className={`${styles.sideCard} ${styles.pendingCard}`}><span className="eyebrow">Ajustes da sua grade</span><h3>{pending.length ? 'Uma data faz diferença.' : 'Sua grade, do seu jeito.'}</h3><p>{pending.length ? `${pending.map((item) => `${data.subjects.find((subject) => subject.id === item.subjectId)?.name}: ${weekdays[item.weekday]} às ${item.startTime}, a cada ${item.intervalWeeks} semanas`).join('. ')}. Falta a primeira data para marcar os dias corretos.` : 'Edite horários e recorrências sempre que a faculdade atualizar a grade.'}</p>{(!data.term.start || !data.term.end) && <small>Período letivo a confirmar. As aulas exibidas são projeções semanais, não confirmação do calendário oficial.</small>}<button className="text-button" onClick={() => setScheduleOpen(true)}>Revisar minha grade <ArrowUpRight size={15} aria-hidden="true" /></button></section></aside>
    </div>
    {scheduleOpen && <ScheduleSettings data={data} update={update} blocked={blocked} onClose={() => setScheduleOpen(false)} />}
    {details && <Modal title={details.title} onClose={() => setDetails(null)}><div className={styles.detailFacts}><p>{areaName(data, details)}</p><p><CalendarDays size={17} aria-hidden="true" />{formatDate(details.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p><p><Clock3 size={17} aria-hidden="true" />{details.time ?? 'Sem horário definido'}{details.time && ` — ${details.endTime ?? 'término a confirmar'}`}</p>{details.professor && <p>Professor(a): {details.professor}</p>}{details.location && <p>Local: {details.location}</p>}</div>{details.session && <p>Previsão da grade. Confira feriados, recessos e alterações com a faculdade.</p>}<div className="button-row"><button className="button primary" disabled={blocked} onClick={() => { if (details.task) onEdit(details.task); else setScheduleOpen(true); setDetails(null); }}>{details.task ? 'Editar compromisso' : 'Editar horário na grade'}</button>{details.task && <button className="button outline" disabled={blocked} onClick={() => { update((previous) => ({ ...previous, tasks: previous.tasks.map((task) => task.id === details.task!.id ? { ...task, done: !task.done } : task) })); setDetails(null); }}>{details.done ? 'Reabrir compromisso' : 'Concluir compromisso'}</button>}</div></Modal>}
    {exportOpen && <Modal title="Levar sua agenda para outro calendário" onClose={() => setExportOpen(false)}><p>O arquivo .ics contém os {entries.length} eventos do período e filtro exibidos. Pode ser importado no Google Agenda, Outlook ou Apple Calendário.</p><p>É uma cópia manual, não uma sincronização. Não inclui notas. Aulas sem primeira data ficam de fora; horários de término ausentes não são inventados.</p><p>Confira as projeções antes de importar. Importar o mesmo arquivo várias vezes pode duplicar eventos no serviço escolhido.</p><button className="button primary" onClick={() => { downloadCalendar(entries); setExportOpen(false); setNotice('Arquivo da agenda gerado. Importe no calendário de sua escolha.'); }}><Download size={17} aria-hidden="true" />Baixar arquivo .ics</button></Modal>}
    {notice && <p role="status" className={styles.inlineNotice}>{notice}<button className="text-button" onClick={() => setNotice('')}>Dispensar</button></p>}
  </div>;
}
