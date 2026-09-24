'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download, SlidersHorizontal, Plus, Clock3, BookOpen, ArrowUpRight } from 'lucide-react';
import { addDays, classSchema, dateKey, formatDate, termSchema, type ClassSession, type Task, type Workspace } from '@/lib/workspace';
import { calendarEntries, monthDays, shiftMonth, weekdays, weekDays, type CalendarEntry } from '@/lib/academic';
import { downloadCalendar } from '@/lib/calendar-export';
import { Modal } from './modal';
import styles from './academic.module.css';

type Props = { data: Workspace; date: string; onDateChange: (date: string) => void; update: (change: (data: Workspace) => Workspace) => void; blocked: boolean; onNew: (date: string) => void; onEdit: (task: Task) => void };

export default function AcademicCalendar({ data, date, onDateChange, update, blocked, onNew, onEdit }: Props) {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(date);
  const [filter, setFilter] = useState('');
  const [details, setDetails] = useState<CalendarEntry | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const today = dateKey();
  const days = view === 'month' ? monthDays(cursor) : weekDays(cursor);
  const entries = calendarEntries(data, days[0], days.at(-1)!).filter((item) => !filter || item.subjectId === filter);
  const selected = calendarEntries(data, date, date).filter((item) => !filter || item.subjectId === filter);
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
  const entryButton = (item: CalendarEntry) => <button key={item.id} className={`${styles.event} ${item.color} ${item.done ? styles.done : ''}`} onClick={() => setDetails(item)}><span className={styles.eventTime}>{item.time ?? 'Sem horário'} · {item.kind}</span><strong>{item.title}</strong>{item.professor && <small>{item.professor}{item.location ? ` · ${item.location}` : ''}</small>}</button>;

  return <div className={styles.agenda}>
    <div className={styles.overview}>
      <div className={styles.overviewTitle}><span className={styles.iconTile}><CalendarDays size={25} aria-hidden="true" /></span><div><span className="eyebrow">Espaço para aprender</span><h2>Sua rotina, em perspectiva.</h2><p>Aulas, entregas e pequenos passos no mesmo lugar.</p></div></div>
      <div className={styles.metrics}><span><strong>{data.subjects.length}</strong> matérias</span><span><strong>{data.classes.filter((item) => item.enabled).length}</strong> horários na grade</span></div>
    </div>
    <div className={styles.actionbar}><div className={styles.syncNote}><span className={styles.dot} />Agenda pessoal · sem sincronização automática</div><div className="button-row"><button className="button outline" onClick={() => setScheduleOpen(true)}><SlidersHorizontal size={16} aria-hidden="true" />Minha grade</button><button className="button outline" onClick={() => setExportOpen(true)}><Download size={16} aria-hidden="true" />Exportar agenda</button><button className="button primary" disabled={blocked} onClick={() => onNew(date)}><Plus size={17} aria-hidden="true" />Novo compromisso</button></div></div>
    <div className={`${styles.calendarLayout} ${view === 'week' ? styles.wideCalendar : ''}`}>
      <section className={styles.calendarPanel}>
        <div className={styles.calendarToolbar}><div className={styles.monthNavigation}><button className="icon-button" aria-label={view === 'month' ? 'Mês anterior' : 'Semana anterior'} onClick={() => move(-1)}><ChevronLeft size={20} aria-hidden="true" /></button><h3 aria-live="polite">{view === 'month' ? formatDate(cursor, { month: 'long', year: 'numeric' }) : `${formatDate(days[0])} — ${formatDate(days[6])}`}</h3><button className="icon-button" aria-label={view === 'month' ? 'Próximo mês' : 'Próxima semana'} onClick={() => move(1)}><ChevronRight size={20} aria-hidden="true" /></button></div><div className={styles.viewControls}><button className="button outline" onClick={() => { setCursor(today); onDateChange(today); }}>Hoje</button><div className={styles.segmented} role="group" aria-label="Visualização da agenda"><button aria-pressed={view === 'month'} onClick={() => { setCursor(date); setView('month'); }}>Mês</button><button aria-pressed={view === 'week'} onClick={() => { setCursor(date); setView('week'); }}>Semana</button></div></div></div>
        <div className={styles.filterRow}><label htmlFor="calendar-subject"><BookOpen size={15} aria-hidden="true" /> Filtrar matéria</label><select id="calendar-subject" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Todas as matérias</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
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
    {details && <Modal title={details.title} onClose={() => setDetails(null)}><div className={styles.detailFacts}><p><CalendarDays size={17} aria-hidden="true" />{formatDate(details.date, { weekday: 'long', day: 'numeric', month: 'long' })}</p><p><Clock3 size={17} aria-hidden="true" />{details.time ?? 'Sem horário definido'}{details.time && ` — ${details.endTime ?? 'término a confirmar'}`}</p>{details.professor && <p>Professor(a): {details.professor}</p>}{details.location && <p>Local: {details.location}</p>}</div>{details.session && <p>Previsão da grade. Confira feriados, recessos e alterações com a faculdade.</p>}<div className="button-row"><button className="button primary" disabled={blocked} onClick={() => { if (details.task) onEdit(details.task); else setScheduleOpen(true); setDetails(null); }}>{details.task ? 'Editar compromisso' : 'Editar horário na grade'}</button>{details.task && <button className="button outline" disabled={blocked} onClick={() => { update((previous) => ({ ...previous, tasks: previous.tasks.map((task) => task.id === details.task!.id ? { ...task, done: !task.done } : task) })); setDetails(null); }}>{details.done ? 'Reabrir compromisso' : 'Concluir compromisso'}</button>}</div></Modal>}
    {exportOpen && <Modal title="Levar sua agenda para outro calendário" onClose={() => setExportOpen(false)}><p>O arquivo .ics contém os {entries.length} eventos do período e filtro exibidos. Pode ser importado no Google Agenda, Outlook ou Apple Calendário.</p><p>É uma cópia manual, não uma sincronização. Não inclui notas. Aulas sem primeira data ficam de fora; horários de término ausentes não são inventados.</p><p>Confira as projeções antes de importar. Importar o mesmo arquivo várias vezes pode duplicar eventos no serviço escolhido.</p><button className="button primary" onClick={() => { downloadCalendar(entries); setExportOpen(false); setNotice('Arquivo da agenda gerado. Importe no calendário de sua escolha.'); }}><Download size={17} aria-hidden="true" />Baixar arquivo .ics</button></Modal>}
    {notice && <p role="status" className={styles.inlineNotice}>{notice}<button className="text-button" onClick={() => setNotice('')}>Dispensar</button></p>}
  </div>;
}

function ScheduleSettings({ data, update, blocked, onClose }: Pick<Props, 'data' | 'update' | 'blocked'> & { onClose: () => void }) {
  const [editing, setEditing] = useState<ClassSession | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    const fields = new FormData(event.currentTarget);
    const parsed = classSchema.safeParse({ ...editing, weekday: Number(fields.get('weekday')), startTime: fields.get('startTime'), endTime: fields.get('endTime') || undefined, intervalWeeks: Number(fields.get('intervalWeeks')), firstDate: fields.get('firstDate') || undefined, location: fields.get('location'), enabled: fields.get('enabled') === 'on' });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    update((previous) => ({ ...previous, classes: previous.classes.map((item) => item.id === parsed.data.id ? parsed.data : item) }));
    setEditing(null); setError(''); setMessage('Horário atualizado.');
  }
  return <Modal title="Minha grade de aulas" onClose={onClose}><p>Transcrita da foto enviada. Nomes, professores e horários podem ser ajustados; não foram adicionadas provas ou datas não informadas.</p>{error && <p role="alert" className="error-banner">{error}</p>}{message && <p role="status">{message}</p>}
    {editing ? <form onSubmit={saveClass} className="entry-form"><h3>{data.subjects.find((item) => item.id === editing.subjectId)?.name}</h3><label htmlFor="class-weekday">Dia da semana</label><select id="class-weekday" name="weekday" defaultValue={editing.weekday}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select><div className="form-grid"><div><label htmlFor="class-start">Início</label><input id="class-start" name="startTime" type="time" required defaultValue={editing.startTime} /></div><div><label htmlFor="class-end">Término (opcional)</label><input id="class-end" name="endTime" type="time" defaultValue={editing.endTime} /></div></div><label htmlFor="class-frequency">Repetir a cada quantas semanas?</label><input id="class-frequency" name="intervalWeeks" type="number" min={1} max={12} required defaultValue={editing.intervalWeeks} /><label htmlFor="class-first">Primeira aula (necessária para intervalos maiores que 1 semana)</label><input id="class-first" name="firstDate" type="date" defaultValue={editing.firstDate} /><label htmlFor="class-location">Local ou modalidade</label><input id="class-location" name="location" maxLength={160} defaultValue={editing.location} /><label className={styles.checkboxLabel}><input name="enabled" type="checkbox" defaultChecked={editing.enabled} />Mostrar esta aula na agenda</label><div className="button-row"><button type="button" className="button outline" onClick={() => { setEditing(null); setError(''); }}>Voltar à grade</button><button className="button primary" disabled={blocked}>Salvar horário</button></div></form> : <><div className={styles.scheduleList}>{data.classes.map((item) => { const subject = data.subjects.find((entry) => entry.id === item.subjectId); return <button key={item.id} className={styles.scheduleRow} disabled={blocked} onClick={() => { setEditing(item); setMessage(''); }}><span className={`${styles.scheduleTime} ${subject?.color ?? 'sage'}`}><strong>{weekdays[item.weekday].slice(0, 3)}</strong>{item.startTime}</span><span><strong>{subject?.name}</strong><small>{subject?.professor ? `${subject.professor} · ` : ''}{item.intervalWeeks === 1 ? 'Toda semana' : `A cada ${item.intervalWeeks} semanas`}{item.location ? ` · ${item.location}` : ''}{!item.enabled ? ' · Pausada' : ''}{item.intervalWeeks > 1 && !item.firstDate ? ' · Data inicial a confirmar' : ''}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>; })}</div><form className="entry-form" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); const term = termSchema.safeParse({ start: fields.get('termStart') || undefined, end: fields.get('termEnd') || undefined }); if (!term.success) { setError(term.error.issues[0].message); return; } update((previous) => ({ ...previous, term: term.data })); setError(''); setMessage('Período letivo atualizado.'); }}><h3>Período letivo</h3><p>Opcional. Ao preencher, as aulas recorrentes ficam limitadas a estas datas. Feriados não são descontados automaticamente.</p><div className="form-grid"><div><label htmlFor="term-start">Início do semestre</label><input id="term-start" name="termStart" type="date" defaultValue={data.term.start} /></div><div><label htmlFor="term-end">Fim do semestre</label><input id="term-end" name="termEnd" type="date" defaultValue={data.term.end} /></div></div><button className="button primary" disabled={blocked}>Salvar período</button></form></>}
  </Modal>;
}
