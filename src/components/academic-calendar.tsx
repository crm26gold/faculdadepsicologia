'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Download, SlidersHorizontal, Plus, Clock3, BookOpen, ArrowUpRight, AlertTriangle, Check, PenLine, BellRing, MapPin, ListFilter, X } from 'lucide-react';
import { addDays, dateKey, formatDate, type Task, type Workspace } from '@/lib/workspace';
import { calendarEntries, monthDays, shiftMonth, weekdays, weekDays, type CalendarEntry } from '@/lib/academic';
import { downloadCalendar } from '@/lib/calendar-export';
import { Modal } from './modal';
import { GoogleAgendaPanel } from './google-agenda-panel';
import { ScheduleSettings } from './schedule-settings';
import { SubjectOptions } from './subject-options';
import styles from './academic.module.css';
import { areaName, itemArea, lifeAreas } from '@/lib/life';

type Props = { data: Workspace; date: string; onDateChange: (date: string) => void; update: (change: (data: Workspace) => Workspace) => boolean; blocked: boolean; onNew: (date: string) => void; onEdit: (task: Task) => void; focus?: 'late' | 'day' | null };
const upper = (text: string) => text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);

export default function AcademicCalendar({ data, date, onDateChange, update, blocked, onNew, onEdit, focus = null }: Props) {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(date);
  const [filter, setFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = (filter ? 1 : 0) + (areaFilter ? 1 : 0);
  const matches = (item: CalendarEntry) => (!filter || item.subjectId === filter) && (!areaFilter || (areaFilter === '__none' ? !itemArea(item) : itemArea(item) === areaFilter));
  const [details, setDetails] = useState<CalendarEntry | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [googleReturn, setGoogleReturn] = useState('');
  // Back from the Google consent screen: show the outcome where the connection lives, once.
  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get('google_agenda');
    if (!outcome) return;
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash);
    setGoogleReturn(outcome); setExportOpen(true);
  }, []);
  const [notice, setNotice] = useState('');
  const today = dateKey();
  const days = view === 'month' ? monthDays(cursor) : weekDays(cursor);
  const entries = calendarEntries(data, days[0], days.at(-1)!).filter(matches);
  const selected = calendarEntries(data, date, date).filter(matches);
  const pending = data.classes.filter((item) => item.enabled && item.intervalWeeks > 1 && !item.firstDate);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const moveFocus = useRef(false);
  useEffect(() => { if (moveFocus.current) { refs.current.get(date)?.focus(); moveFocus.current = false; } }, [date]);
  // Coming from a Meu dia alert: land exactly on the items it talks about.
  const late = data.tasks.filter((task) => !task.done && task.date < today).toSorted((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
  const lateList = useRef<HTMLElement>(null);
  const dayCard = useRef<HTMLElement>(null);
  useEffect(() => { const target = focus === 'late' ? lateList.current : focus === 'day' ? dayCard.current : null; if (target) requestAnimationFrame(() => { target.scrollIntoView({ block: 'start' }); target.focus({ preventScroll: true }); }); }, [focus]);
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
  // One line of the day: time on the left, a bar in the area's color, what it is and where. Bell = it will warn.
  const entryButton = (item: CalendarEntry) => <button key={item.id} data-tone={item.color} className={`${styles.event} ${item.done ? styles.done : ''}`} onClick={() => setDetails(item)}
    aria-label={`${item.time ?? 'Sem horário'} · ${item.kind}: ${item.title}${item.done ? ', concluído' : ''}${item.task?.remind ? ', com aviso' : ''}`}>
    <span className={styles.eventClock}>{item.time ? <><strong>{item.time}</strong>{item.endTime && <small>{item.endTime}</small>}</> : <small>Dia todo</small>}</span>
    <span className={styles.eventBody}>
      <strong>{item.done && <Check size={14} aria-hidden="true" />}{item.title}</strong>
      <small>{[item.kind, areaName(data, item), item.professor].filter(Boolean).join(' · ')}</small>
      {item.location && <small className={styles.eventPlace}><MapPin size={12} aria-hidden="true" />{item.location}</small>}
    </span>
    {item.task?.remind && <BellRing size={15} aria-hidden="true" className={styles.eventBell} />}
  </button>;

  return <div className={styles.agenda}>
    {(focus === 'late' || late.length > 0) && <section ref={lateList} tabIndex={-1} id="agenda-atrasados" className={styles.lateCard} aria-labelledby="late-title"><h2 id="late-title"><AlertTriangle size={18} aria-hidden="true" /> Atrasados ({late.length})</h2>{late.length ? <ul>{late.map((task) => <li key={task.id}><span className={styles.lateDate}>{formatDate(task.date, { day: 'numeric', month: 'short' })}</span><span className={styles.lateWhat}><strong>{task.title}</strong><small>{[task.time, task.kind, areaName(data, task)].filter(Boolean).join(' · ')}</small></span><span className={styles.lateActions}><button className="button outline" disabled={blocked} onClick={() => update((previous) => ({ ...previous, tasks: previous.tasks.map((item) => item.id === task.id ? { ...item, done: true } : item) }))}><Check size={15} aria-hidden="true" />Concluir</button><button className="button outline" disabled={blocked} onClick={() => onEdit(task)}><PenLine size={15} aria-hidden="true" />Remarcar</button></span></li>)}</ul> : <p>Nada atrasado. Tudo em dia.</p>}</section>}
    <div className={styles.actionbar}>
      <button className={`button primary ${styles.newButton}`} disabled={blocked} onClick={() => onNew(date)}><Plus size={17} aria-hidden="true" />Novo compromisso</button>
      <button className={`button outline ${styles.toolButton}`} aria-label="Minha grade" title="Minha grade de aulas" onClick={() => setScheduleOpen(true)}><SlidersHorizontal size={16} aria-hidden="true" /><span>Minha grade</span></button>
      <button className={`button outline ${styles.toolButton}`} aria-label="Google Agenda" title="Google Agenda" onClick={() => setExportOpen(true)}><CalendarCheck size={16} aria-hidden="true" /><span>Google Agenda</span></button>
    </div>
    <div className={`${styles.calendarLayout} ${view === 'week' ? styles.wideCalendar : ''}`}>
      <section className={styles.calendarPanel}>
        <div className={styles.calendarToolbar}>
          <h3 aria-live="polite" className={styles.monthTitle}>{view === 'month' ? <>{upper(formatDate(cursor, { month: 'long' }))} <span>{cursor.slice(0, 4)}</span></> : `${formatDate(days[0])} — ${formatDate(days[6])}`}</h3>
          <div className={styles.monthNavigation}><button className="icon-button" aria-label={view === 'month' ? 'Mês anterior' : 'Semana anterior'} onClick={() => move(-1)}><ChevronLeft size={20} aria-hidden="true" /></button><button className={styles.todayChip} onClick={() => { setCursor(today); onDateChange(today); }}>Hoje</button><button className="icon-button" aria-label={view === 'month' ? 'Próximo mês' : 'Próxima semana'} onClick={() => move(1)}><ChevronRight size={20} aria-hidden="true" /></button></div>
          <div className={styles.viewControls}><div className={styles.segmented} role="group" aria-label="Visualização da agenda"><button aria-pressed={view === 'month'} onClick={() => { setCursor(date); setView('month'); }}>Mês</button><button aria-pressed={view === 'week'} onClick={() => { setCursor(date); setView('week'); }}>Semana</button></div>
            <button className={styles.filterToggle} aria-expanded={filtersOpen || activeFilters > 0} aria-controls="calendar-filters" onClick={() => setFiltersOpen(open => !open)}><ListFilter size={16} aria-hidden="true" />Filtros{activeFilters > 0 && <b>{activeFilters}</b>}</button></div>
        </div>
        {(filtersOpen || activeFilters > 0) && <div id="calendar-filters" className={styles.filterRow}><label htmlFor="calendar-area">Filtrar área da vida</label><select id="calendar-area" value={areaFilter} onChange={(event) => { setAreaFilter(event.target.value); setFilter(''); }}><option value="">Todas as áreas</option><option value="__none">Sem área</option>{lifeAreas(data).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><label htmlFor="calendar-subject"><BookOpen size={15} aria-hidden="true" /> Filtrar matéria</label><select id="calendar-subject" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Todas as matérias</option><SubjectOptions data={data} /></select>{activeFilters > 0 && <button className="text-button" onClick={() => { setFilter(''); setAreaFilter(''); setFiltersOpen(false); }}><X size={14} aria-hidden="true" />Limpar filtros</button>}</div>}
        {view === 'month' ? <table className={styles.monthTable}><caption className="sr-only">Calendário mensal. Use as setas para escolher dias, Home e End para início e fim da semana e Page Up ou Page Down para mudar de mês.</caption><thead><tr>{weekdays.map((day) => <th key={day} scope="col"><abbr title={day}>{day.slice(0, 3)}</abbr></th>)}</tr></thead><tbody>{Array.from({ length: 6 }, (_, row) => <tr key={row}>{days.slice(row * 7, row * 7 + 7).map((day) => {
          const items = entries.filter((item) => item.date === day);
          return <td key={day}><button ref={(element) => { if (element) refs.current.set(day, element); else refs.current.delete(day); }} tabIndex={day === date || (!days.includes(date) && day === days[0]) ? 0 : -1} onKeyDown={(event) => keyboard(event, day)} className={`${styles.day} ${day.slice(0, 7) !== cursor.slice(0, 7) ? styles.outside : ''} ${day === date ? styles.selected : ''}`} aria-label={`${formatDate(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${items.length} compromissos`} aria-current={day === today ? 'date' : undefined} aria-pressed={day === date} onClick={() => onDateChange(day)}><span className={styles.dayNumber}>{Number(day.slice(-2))}</span><span className={styles.dayItems}>{items.slice(0, 3).map((item) => <span key={item.id} data-tone={item.color} className={`${styles.dayPill} ${item.done ? styles.pillDone : ''}`}><b>{item.time ?? '•'}</b> {item.title}</span>)}{items.length > 3 && <span className={styles.more}>+{items.length - 3}</span>}</span><span className={styles.dots} aria-hidden="true">{items.slice(0, 4).map((item) => <i key={item.id} data-tone={item.color} />)}{items.length > 4 && <em>+</em>}</span></button></td>;
        })}</tr>)}</tbody></table> : <div className={styles.weekGrid}>{days.map((day) => <section key={day} className={`${styles.weekColumn} ${day === today ? styles.weekToday : ''}`}><button className={styles.weekHeading} aria-label={`Selecionar ${formatDate(day)}`} onClick={() => onDateChange(day)}><span>{formatDate(day, { weekday: 'short' })}</span><strong>{Number(day.slice(-2))}</strong></button><div className={styles.weekEvents}>{entries.filter((item) => item.date === day).map(entryButton)}{!entries.some((item) => item.date === day) && <span className={styles.freeDay}>Um respiro.</span>}</div></section>)}</div>}
        <div className={styles.calendarFoot}><span><i className={styles.dot} />Aulas previstas pela grade</span><span>Fuso: São Paulo · feriados não descontados</span></div>
      </section>
      <aside className={styles.agendaAside}><section ref={dayCard} tabIndex={-1} id="agenda-dia" className={`${styles.sideCard} ${styles.dayCard}`} aria-labelledby="agenda-dia-title">
        <header className={styles.dayHeader}><span className={styles.dayBadge} aria-hidden="true"><small>{formatDate(date, { weekday: 'short' }).replace('.', '')}</small><strong>{Number(date.slice(-2))}</strong></span>
          <span><span className="eyebrow">{date === today ? 'Hoje' : date === addDays(today, 1) ? 'Amanhã' : 'Dia selecionado'}</span><h3 id="agenda-dia-title">{upper(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}</h3><small>{selected.length === 0 ? 'Dia livre' : selected.length === 1 ? '1 compromisso' : `${selected.length} compromissos`}</small></span>
          <button className="icon-button" aria-label="Adicionar neste dia" disabled={blocked} onClick={() => onNew(date)}><Plus size={18} aria-hidden="true" /></button></header>
        <div className={styles.dayDetails}>{selected.map(entryButton)}{selected.length === 0 && <div className={styles.emptyDay}><CalendarDays size={30} aria-hidden="true" /><p>Nenhum compromisso neste dia.</p><small>Você pode deixar esse espaço livre.</small></div>}</div></section>
      {pending.length > 0 && <section className={`${styles.sideCard} ${styles.pendingCard}`}><span className="eyebrow">Grade de aulas</span><h3>Falta uma data</h3><p>{pending.map((item) => `${data.subjects.find((subject) => subject.id === item.subjectId)?.name}: ${weekdays[item.weekday]} às ${item.startTime}, a cada ${item.intervalWeeks} semanas`).join('. ')}. Informe a primeira data para marcar os dias certos.</p><button className="text-button" onClick={() => setScheduleOpen(true)}>Revisar minha grade <ArrowUpRight size={15} aria-hidden="true" /></button></section>}</aside>
    </div>
    {scheduleOpen && <ScheduleSettings data={data} update={update} blocked={blocked} onClose={() => setScheduleOpen(false)} />}
    {details && <Modal title={details.title} onClose={() => setDetails(null)}><div className={styles.detailFacts}><p>{areaName(data, details)}</p><p><CalendarDays size={17} aria-hidden="true" />{formatDate(details.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p><p><Clock3 size={17} aria-hidden="true" />{details.time ?? 'Sem horário definido'}{details.time && ` — ${details.endTime ?? 'término a confirmar'}`}</p>{details.professor && <p>Professor(a): {details.professor}</p>}{details.location && <p>Local: {details.location}</p>}</div>{details.session && <p>Aula prevista pela sua grade. Feriados e mudanças da instituição não entram automaticamente.</p>}<div className="button-row"><button className="button primary" disabled={blocked} onClick={() => { if (details.task) onEdit(details.task); else setScheduleOpen(true); setDetails(null); }}>{details.task ? 'Editar compromisso' : 'Editar horário na grade'}</button>{details.task && <button className="button outline" disabled={blocked} onClick={() => { update((previous) => ({ ...previous, tasks: previous.tasks.map((task) => task.id === details.task!.id ? { ...task, done: !task.done } : task) })); setDetails(null); }}>{details.done ? 'Reabrir compromisso' : 'Concluir compromisso'}</button>}</div></Modal>}
    {exportOpen && <Modal title="Google Agenda" onClose={() => { setExportOpen(false); setGoogleReturn(''); }}><GoogleAgendaPanel returned={googleReturn} /><details className="calendar-file"><summary>Usa Outlook ou Apple? Baixe um arquivo .ics</summary><p className="muted small">Cópia única dos {entries.length} eventos na tela, sem anotações. Não se atualiza, e importar de novo pode duplicar.</p><button className="button outline" onClick={() => { downloadCalendar(entries); setExportOpen(false); setNotice('Arquivo da agenda gerado. Importe no calendário de sua escolha.'); }}><Download size={17} aria-hidden="true" />Baixar arquivo .ics</button></details></Modal>}
    {notice && <p role="status" className={styles.inlineNotice}>{notice}<button className="text-button" onClick={() => setNotice('')}>Dispensar</button></p>}
  </div>;
}
