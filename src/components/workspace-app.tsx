'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Brain, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, Clock3, CloudOff, Compass, FileText, GraduationCap, LayoutDashboard, Leaf, LockKeyhole, Menu, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Sparkles, Sprout, Target, Upload, X } from 'lucide-react';
import { addDays, colors, dateKey, formatDate, parseWorkspace, priorityTasks, type Note, type Subject, type Task, type Workspace } from '@/lib/workspace';
import { calendarEntries, weekdays } from '@/lib/academic';
import { useWorkspace } from './use-workspace';
import { Modal } from './modal';
import { FocusTimer } from './focus-timer';

const NoteEditor = dynamic(() => import('./note-editor'), { ssr: false, loading: () => <p className="muted">Abrindo editor…</p> });
const AcademicCalendar = dynamic(() => import('./academic-calendar'), { loading: () => <p role="status">Abrindo sua agenda…</p> });
const StudyPlanner = dynamic(() => import('./study-planner'), { loading: () => <p role="status">Organizando sugestões…</p> });
type View = 'today' | 'subjects' | 'notes' | 'agenda' | 'assistant' | 'settings';
type FormKind = 'subject' | 'task' | 'note';
const navigation = [
  { id: 'today', label: 'Meu dia', Icon: LayoutDashboard },
  { id: 'subjects', label: 'Matérias', Icon: BookOpen },
  { id: 'notes', label: 'Caderno', Icon: FileText },
  { id: 'agenda', label: 'Agenda', Icon: CalendarDays },
  { id: 'assistant', label: 'Assistente', Icon: Sparkles },
] as const;
const names: Record<View, string> = { today: 'Meu dia', subjects: 'Minhas matérias', notes: 'Meu caderno', agenda: 'Minha agenda', assistant: 'Assistente de estudos', settings: 'Meu espaço' };
function download(data: Workspace) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `faculdade-psi-${dateKey()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function WorkspaceApp({ mode, hostedPreview = false, authenticated = false }: { mode: 'local' | 'cloud' | 'demo'; hostedPreview?: boolean; authenticated?: boolean }) {
  const { data, ready, demo, status, error, blocked, update } = useWorkspace(mode);
  const [view, setView] = useState<View>('today');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [form, setForm] = useState<{ kind: FormKind; task?: Task; subject?: Subject } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedNote, setSelectedNote] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [agendaDate, setAgendaDate] = useState(dateKey);
  const [imported, setImported] = useState<Workspace | null>(null);
  const [notice, setNotice] = useState('');
  const today = dateKey();
  const main = useRef<HTMLElement>(null);
  const timerArea = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeNote = data.notes.find((note) => note.id === selectedNote) ?? data.notes.find((note) => !subjectFilter || note.subjectId === subjectFilter);
  const pending = data.tasks.filter((task) => !task.done);
  const dueToday = data.tasks.filter((task) => task.date === today);
  const priorities = priorityTasks(data, today);
  const upcoming = calendarEntries(data, today, addDays(today, 7)).filter((entry) => !entry.done);
  const doneToday = dueToday.filter((task) => task.done).length;
  const studyMinutes = data.sessions.filter((session) => session.date === today).reduce((sum, session) => sum + session.minutes, 0);
  const progress = dueToday.length ? Math.round(doneToday / dueToday.length * 100) : 0;
  const subject = (id: string) => data.subjects.find((item) => item.id === id);
  const previewLabel = authenticated ? 'Administrador · conectado' : hostedPreview ? 'Prévia online' : 'Prévia local';
  const storageNotice = authenticated
    ? 'Conta administradora · sessão autenticada. Dados só neste navegador, sem sincronização na nuvem.'
    : hostedPreview
    ? 'Prévia online · acesso protegido pela Vercel. Dados só neste navegador, sem backup na nuvem.'
    : 'Espaço local · sem login ou backup na nuvem. Use apenas neste dispositivo de confiança.';
  const privacyNotice = authenticated
    ? 'Seu login é validado no servidor. As anotações ainda ficam somente neste navegador e neste endereço, sem criptografia própria ou sincronização na nuvem. Sair da conta não apaga nem criptografa os dados locais. Use um dispositivo de confiança e exporte seu backup antes de mudar de endereço ou limpar o navegador.'
    : hostedPreview
    ? 'O acesso ao site exige autorização na Vercel. Suas anotações ficam somente neste navegador e neste endereço, sem criptografia própria e sem sincronização. Não guarde informações sensíveis nesta prévia nem use computador compartilhado. Limpar os dados do navegador pode apagar suas anotações. Antes de mudar de endereço ou dispositivo, exporte seu backup.'
    : 'Esta versão guarda dados no navegador, sem criptografia própria e sem autenticação local. Não use em computador compartilhado. Limpar os dados do navegador pode apagar suas anotações.';

  useEffect(() => {
    if (!authenticated) return;
    const refresh = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener('pageshow', refresh);
    return () => window.removeEventListener('pageshow', refresh);
  }, [authenticated]);
  useEffect(() => { document.title = `${names[view]} · Faculdade Psi`; }, [view]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  function navigate(next: View) { setView(next); setMobileMenu(false); setFocusMode(false); requestAnimationFrame(() => main.current?.focus()); }
  function editNote(patch: Partial<Note>) {
    if (!activeNote) return;
    update((previous) => ({ ...previous, notes: previous.notes.map((note) => note.id === activeNote.id ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note) }));
  }
  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;
    const fields = new FormData(event.currentTarget);
    const text = (name: string) => String(fields.get(name) ?? '').trim();
    if (!text('title')) { setNotice('Preencha um nome antes de salvar.'); return; }
    if (form.kind === 'subject') {
      const value: Subject = { ...form.subject, professor: text('professor') || undefined, id: form.subject?.id ?? crypto.randomUUID(), name: text('title'), semester: Number(fields.get('semester')), color: text('color') as Subject['color'] };
      update((previous) => ({ ...previous, subjects: form.subject ? previous.subjects.map((item) => item.id === value.id ? value : item) : [...previous.subjects, value] }));
    } else if (form.kind === 'task') {
      const value: Task = { ...form.task, time: text('time') || undefined, id: form.task?.id ?? crypto.randomUUID(), title: text('title'), date: text('date'), subjectId: text('subject'), kind: text('kind') as Task['kind'], done: form.task?.done ?? false, minutes: Number(fields.get('minutes')) };
      update((previous) => ({ ...previous, tasks: form.task ? previous.tasks.map((item) => item.id === value.id ? value : item) : [...previous.tasks, value] }));
    } else {
      const id = crypto.randomUUID();
      update((previous) => ({ ...previous, notes: [{ id, title: text('title'), subjectId: text('subject'), content: '<p></p>', updatedAt: new Date().toISOString() }, ...previous.notes] }));
      setSelectedNote(id); setSubjectFilter(''); navigate('notes');
    }
    setForm(null); setNotice('');
  }
  function toggleTask(task: Task) { update((previous) => ({ ...previous, tasks: previous.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) })); }
  function openSubject(item: Subject) { setSubjectFilter(item.id); setSelectedNote(''); navigate('notes'); }

  const navContent = <>
    <button className="brand" onClick={() => navigate('today')} aria-label="Faculdade Psi — início"><span className="brand-icon"><Sprout aria-hidden="true" size={25} /></span><span>Faculdade<span className="brand-psi">Psi<span className="brand-dot">.</span></span></span></button>
    <div className="workspace-label"><span className="mini-avatar">P</span><span>Meu espaço pessoal<small>Psicologia · minha jornada</small></span><LockKeyhole aria-hidden="true" size={13} /></div>
    <p className="nav-caption">Seu aprendizado</p>
    <nav aria-label="Principal">{navigation.map(({ id, label, Icon }) => <button key={id} aria-current={view === id ? 'page' : undefined} className={`nav-item ${view === id ? 'active' : ''}`} onClick={() => navigate(id)}><Icon aria-hidden="true" size={19} /><span>{label}</span>{id === 'assistant' && <span className="nav-chip">IA</span>}</button>)}</nav>
    <div className="sidebar-bottom"><div className="journey-card"><Leaf aria-hidden="true" size={20} /><p>Pequenos passos.<br /><strong>Grandes descobertas.</strong></p><span>Você não precisa fazer tudo hoje.</span></div><button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}><Settings2 aria-hidden="true" size={19} />Meu espaço</button><div className="sidebar-profile"><span className="avatar">P</span><span>Minha jornada<small>{demo ? 'Demonstração pública' : mode === 'local' ? previewLabel : 'Conta proprietária'}</small></span><span className="online-dot" /></div></div>
  </>;

  const taskRow = (task: Task) => <li className={`task-row ${task.done ? 'is-done' : ''}`} key={task.id}>
    <label className="task-checkbox"><input type="checkbox" checked={task.done} disabled={blocked} onChange={() => toggleTask(task)} aria-label={`Concluir: ${task.title}`} /><span className="check-visual"><Check size={13} aria-hidden="true" /></span></label>
    <button className="task-description" onClick={() => setForm({ kind: 'task', task })}><strong>{task.title}</strong><span><i className={`color-dot ${subject(task.subjectId)?.color ?? 'sage'}`} />{subject(task.subjectId)?.name ?? 'Pessoal'}{task.date < today && !task.done && <em>Em atraso</em>}</span></button>
    <span className="task-duration"><Clock3 size={12} aria-hidden="true" />{task.minutes} min</span>
  </li>;

  const subjectCard = (item: Subject) => <article className={`subject-card ${item.color}`} key={item.id}>
    <div className="subject-card-top"><span className={`subject-symbol ${item.color}`}><BookOpen size={20} aria-hidden="true" /></span><button className="icon-button" aria-label={`Editar matéria: ${item.name}`} onClick={() => setForm({ kind: 'subject', subject: item })}><MoreHorizontal size={19} aria-hidden="true" /></button></div>
    <button className="subject-title" onClick={() => openSubject(item)}><h3>{item.name}</h3><span>{item.semester}º semestre{item.professor ? ` · Prof. ${item.professor}` : ''}</span></button>
    <p className="subject-schedule">{data.classes.filter((session) => session.subjectId === item.id).map((session) => `${weekdays[session.weekday]} · ${session.startTime}${!session.enabled ? ' · pausada' : session.intervalWeeks > 1 ? ` · a cada ${session.intervalWeeks} semanas${!session.firstDate ? ' (data a confirmar)' : ''}` : ''}`).join(' / ') || 'Horário não informado'}</p>
    <div className="subject-card-footer"><span><FileText size={13} aria-hidden="true" />{data.notes.filter((note) => note.subjectId === item.id).length} anotações</span><button aria-label={`Abrir caderno de ${item.name}`} className="icon-button" onClick={() => openSubject(item)}><ArrowUpRight size={19} aria-hidden="true" /></button></div>
  </article>;

  return <div className={`app-shell ${focusMode ? 'is-focused' : ''}`}>
    <a className="skip-link" href="#main">Pular para o conteúdo</a>
    <aside className="sidebar">{navContent}</aside>
    {mobileMenu && <Modal title="Seu espaço" onClose={() => setMobileMenu(false)}><div className="mobile-navigation">{navContent}</div></Modal>}
    <div className="app-body">
      <header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu-button" aria-label="Abrir navegação" onClick={() => setMobileMenu(true)}><Menu size={21} aria-hidden="true" /></button><span>Meu espaço</span><ChevronRight aria-hidden="true" size={14} /><strong>{names[view]}</strong></div><div className="topbar-actions"><button className="search-trigger" aria-label="Buscar no meu espaço" onClick={() => setSearchOpen(true)}><Search size={17} aria-hidden="true" /><span>Buscar no meu espaço</span><kbd>Ctrl K</kbd></button><button className="icon-button" aria-label="Ajuda e configurações" onClick={() => navigate('settings')}><CircleHelp size={19} aria-hidden="true" /></button><span className="avatar small">P</span></div></header>
      <main id="main" tabIndex={-1} ref={main} className="main-content">
        <div className={`mode-banner ${demo ? 'demo-banner' : ''}`}><span><CloudOff size={14} aria-hidden="true" />{demo ? 'Demonstração — dados fictícios. Não insira informações pessoais.' : mode === 'local' ? storageNotice : 'Espaço pessoal · acesso restrito à conta proprietária.'}</span>{demo && <button onClick={() => window.location.reload()} disabled={!ready}>Restaurar exemplos <ArrowRight size={13} aria-hidden="true" /></button>}</div>
        {error && <div className="error-banner" role="alert">{error}{ready && <button className="text-button" onClick={() => download(data)}>Exportar esta versão</button>}<button className="text-button" onClick={() => window.location.reload()}>Recarregar</button></div>}
        <div className="page-heading"><div><span className="eyebrow">{ready && view === 'today' ? formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Seu aprendizado, do seu jeito'}</span><h1>{view === 'today' ? <>Um novo dia, <span>no seu ritmo.</span></> : names[view]}</h1><p>{view === 'today' ? 'Você não precisa dar conta de tudo. Vamos cuidar do próximo passo.' : view === 'notes' ? 'Um lugar para guardar ideias e fazer conexões.' : view === 'subjects' ? 'Cada matéria, um novo universo para descobrir.' : view === 'agenda' ? 'Um pouco de organização abre espaço para o que importa.' : view === 'assistant' ? 'Inteligência como apoio. Você no controle.' : 'Suas preferências, seus dados e suas conexões.'}</p></div><button className="button outline" aria-pressed={focusMode} onClick={() => { if (view !== 'today') setView('today'); setFocusMode(!focusMode); }}><Target size={17} aria-hidden="true" />{focusMode ? 'Sair do foco' : 'Modo foco'}</button></div>
        {!ready && !error && <div className="loading-panel" role="status">Preparando seu espaço…</div>}
        {ready && <>
          {view === 'today' && <div className="dashboard-grid"><div className="dashboard-primary">
            <section className="welcome-card"><div className="welcome-copy"><span className="welcome-kicker"><span /> Seu próximo passo</span><h2>O importante não é correr.<br />É continuar.</h2><p>{priorities.length ? `Que tal começar com “${priorities[0].title}”? Separe ${priorities[0].minutes} minutos, sem pressão.` : 'Adicione uma pequena tarefa para hoje. Um capítulo, uma ideia, uma descoberta.'}</p><button className="button cream" onClick={() => priorities.length ? timerArea.current?.scrollIntoView({ behavior: 'auto', block: 'center' }) : setForm({ kind: 'task' })}>{priorities.length ? 'Encontrar meu foco' : 'Planejar meu primeiro passo'}<ArrowRight size={17} aria-hidden="true" /></button></div><div className="growth-art" aria-hidden="true"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-sun" /><div className="art-stem" /><div className="art-leaf leaf-one" /><div className="art-leaf leaf-two" /><div className="art-leaf leaf-three" /><div className="art-ground" /><span className="art-spark spark-one">+</span><span className="art-spark spark-two">✦</span></div></section>
            <div className="stats-row"><div><span className="stat-icon sage"><CheckCheck size={20} aria-hidden="true" /></span><span><strong>{doneToday}<small> / {dueToday.length}</small></strong><small>Tarefas de hoje</small></span></div><div><span className="stat-icon lavender"><Clock3 size={20} aria-hidden="true" /></span><span><strong>{studyMinutes}<small> min</small></strong><small>Seu tempo de foco</small></span></div><div><span className="stat-icon sand"><BookOpen size={20} aria-hidden="true" /></span><span><strong>{data.subjects.length}</strong><small>Matérias no seu espaço</small></span></div></div>
            <section className="panel priorities"><div className="section-heading"><div><h2>Um passo de cada vez</h2><p>Até três prioridades. O resto pode esperar.</p></div><button className="icon-button" aria-label="Adicionar tarefa" disabled={blocked} onClick={() => setForm({ kind: 'task' })}><Plus size={20} aria-hidden="true" /></button></div><ul className="task-list" role="list">{priorities.map(taskRow)}{dueToday.filter((task) => task.done).slice(0, 1).map(taskRow)}</ul>{!priorities.length && !doneToday && <div className="empty-inline"><CheckCheck size={25} aria-hidden="true" /><p>Nenhuma prioridade por aqui.<br /><button className="text-button" onClick={() => setForm({ kind: 'task' })}>Escolher meu próximo passo</button></p></div>}<div className="panel-footer"><span>{pending.length} {pending.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'} no seu espaço</span><button className="text-button" onClick={() => navigate('agenda')}>Ver minha agenda <ArrowRight size={14} aria-hidden="true" /></button></div></section>
            <StudyPlanner data={data} update={update} blocked={blocked} compact onAgenda={() => navigate('agenda')} />
            <section className="subjects-section"><div className="section-heading"><h2>Meus universos de estudo</h2><button className="text-button" onClick={() => navigate('subjects')}>Ver matérias <ArrowRight size={14} aria-hidden="true" /></button></div><div className="subject-grid">{data.subjects.slice(0, 3).map(subjectCard)}{!data.subjects.length && <button className="add-subject-card" onClick={() => setForm({ kind: 'subject' })}><Plus aria-hidden="true" />Adicionar minha primeira matéria</button>}</div></section>
            <section className="quick-note"><span className="quick-note-icon"><FileText size={22} aria-hidden="true" /></span><div><h2>Uma ideia que acabou de chegar?</h2><p>Guarde agora. Organize depois.</p></div><button className="button outline" disabled={blocked} onClick={() => setForm({ kind: 'note' })}><Plus size={16} aria-hidden="true" />Anotar</button></section>
          </div><aside className="dashboard-secondary">
            <section className="panel week-card"><div className="section-heading"><h2>Sua semana</h2><CalendarDays size={17} aria-hidden="true" /></div><div className="week-strip">{Array.from({ length: 7 }, (_, index) => { const day = addDays(today, index); return <button key={day} className={day === today ? 'today' : ''} aria-label={`Abrir agenda de ${formatDate(day)}`} onClick={() => { setAgendaDate(day); navigate('agenda'); }}><span>{formatDate(day, { weekday: 'short' }).replace('.', '')}</span><strong>{new Date(`${day}T12:00:00`).getDate()}</strong><i className={upcoming.some((entry) => entry.date === day) ? 'has-task' : ''} /></button>; })}</div><h3 className="small-heading">Vem por aí</h3><div className="upcoming-list">{upcoming.slice(0, 3).map((task) => <button key={task.id} className="upcoming-item" onClick={() => { setAgendaDate(task.date); navigate('agenda'); }}><span className={`date-block ${subject(task.subjectId)?.color ?? 'sage'}`}><strong>{new Date(`${task.date}T12:00:00`).getDate()}</strong><small>{formatDate(task.date, { month: 'short' }).replace('.', '')}</small></span><span><strong>{task.title}</strong><small>{task.time ?? 'Sem horário'} · {task.kind}</small></span></button>)}{!upcoming.length && <p className="muted">Sua semana tem espaço para novos planos.</p>}</div><button className="text-button full-width" onClick={() => navigate('agenda')}>Abrir agenda <ArrowRight size={14} aria-hidden="true" /></button></section>
            <div ref={timerArea}><FocusTimer disabled={blocked} onComplete={(minutes) => update((previous) => ({ ...previous, sessions: [...previous.sessions, { id: crypto.randomUUID(), date: dateKey(), minutes }] }))} /></div>
            <section className="daily-progress"><span className="progress-ring" style={{ '--progress': `${progress}%` } as React.CSSProperties}><span>{progress}%</span></span><div><h2>Cada passo conta</h2><p>{doneToday ? `${doneToday} ${doneToday === 1 ? 'passo dado' : 'passos dados'} hoje. Reconheça seu esforço.` : 'Seu progresso começa com uma pequena escolha.'}</p></div></section>
          </aside></div>}

          {view === 'subjects' && <section><div className="section-heading"><span className="muted">{data.subjects.length} matérias organizadas</span><button className="button primary" disabled={blocked} onClick={() => setForm({ kind: 'subject' })}><Plus size={17} aria-hidden="true" />Nova matéria</button></div><div className="subject-grid expanded">{data.subjects.map(subjectCard)}<button className="add-subject-card" disabled={blocked} onClick={() => setForm({ kind: 'subject' })}><Plus aria-hidden="true" />Um novo universo de estudo</button></div></section>}

          {view === 'notes' && <section className="notebook-layout"><aside className="note-index"><div className="section-heading"><h2>Anotações</h2><button className="icon-button" disabled={blocked} aria-label="Nova anotação" onClick={() => setForm({ kind: 'note' })}><Plus size={19} aria-hidden="true" /></button></div><label className="sr-only" htmlFor="note-filter">Filtrar anotações por matéria</label><select id="note-filter" value={subjectFilter} onChange={(event) => { setSubjectFilter(event.target.value); setSelectedNote(''); }}><option value="">Todas as matérias</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="note-list">{data.notes.filter((note) => !subjectFilter || note.subjectId === subjectFilter).map((note) => <button key={note.id} className={`note-list-item ${activeNote?.id === note.id ? 'selected' : ''}`} onClick={() => setSelectedNote(note.id)}><FileText size={16} aria-hidden="true" /><span><strong>{note.title || 'Sem título'}</strong><small>{new Date(note.updatedAt).toLocaleDateString('pt-BR')}</small></span></button>)}</div></aside><div className="note-paper">{activeNote ? <><div className="note-meta"><span><LockKeyhole size={13} aria-hidden="true" />{demo ? 'Exemplo temporário' : mode === 'local' ? 'Armazenamento local' : 'Anotação pessoal'}</span><span role="status">{status}</span></div><label htmlFor="note-title" className="sr-only">Título da anotação</label><input id="note-title" className="note-title-input" value={activeNote.title} maxLength={160} disabled={blocked} onChange={(event) => editNote({ title: event.target.value })} placeholder="Sem título" /><label className="sr-only" htmlFor="note-subject">Matéria da anotação</label><select id="note-subject" className="note-subject-select" value={activeNote.subjectId} disabled={blocked} onChange={(event) => editNote({ subjectId: event.target.value })}><option value="">Pessoal · sem matéria</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><NoteEditor key={activeNote.id} content={activeNote.content} disabled={blocked} onChange={(content) => editNote({ content })} /></> : <div className="empty-state"><FileText size={40} aria-hidden="true" /><h2>Sua próxima ideia mora aqui.</h2><p>Crie uma anotação para começar a escrever.</p><button className="button primary" disabled={blocked} onClick={() => setForm({ kind: 'note' })}>Criar anotação <Plus size={16} aria-hidden="true" /></button></div>}</div></section>}

          {view === 'agenda' && <AcademicCalendar data={data} date={agendaDate} onDateChange={setAgendaDate} update={update} blocked={blocked} onNew={(date) => { setAgendaDate(date); setForm({ kind: 'task' }); }} onEdit={(task) => setForm({ kind: 'task', task })} />}

          {view === 'assistant' && <StudyPlanner data={data} update={update} blocked={blocked} onAgenda={() => navigate('agenda')} />}

{view === 'settings' && <div className="settings-grid"><section className="panel"><h2>Seu espaço, com transparência</h2><p>{demo ? 'Ambiente público para experimentar a interface. As alterações ficam apenas na memória desta aba e desaparecem ao recarregar. Não insira informações pessoais.' : mode === 'local' ? privacyNotice : 'Seu acesso é validado no servidor. Backups e permissões de infraestrutura precisam ser administrados separadamente.'}</p><div className="notice"><ShieldCheck size={20} aria-hidden="true" />Sem cadastro público. Sem cobrança. Sem envio de conteúdo à IA.</div>{!demo && <><h3>Uma cópia é sempre uma boa ideia</h3><p>Exporte seus dados em JSON. O arquivo pode conter informações pessoais: guarde-o com cuidado.</p><div className="button-row"><button className="button primary" onClick={() => download(data)}><ArrowDownToLine size={16} aria-hidden="true" />Exportar meus dados</button><button className="button outline" disabled={blocked} onClick={() => fileInput.current?.click()}><Upload size={16} aria-hidden="true" />Importar backup</button></div><input className="sr-only" tabIndex={-1} ref={fileInput} type="file" accept=".json,application/json" aria-label="Selecionar backup JSON" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { if (file.size > 2_000_000) throw new Error(); setImported(parseWorkspace(await file.text())); } catch { setNotice('Backup inválido ou maior que 2 MB. Nada foi alterado.'); } event.target.value = ''; }} /></>}{(mode === 'cloud' || authenticated) && <form action="/auth/logout" method="post"><button className="button outline">Sair da conta</button></form>}</section><section className="panel integrations-panel"><h2>Conexões do aplicativo</h2><p>Uma conexão no Codex não configura automaticamente o aplicativo.</p>{[{ name: 'Supabase', detail: 'Login e armazenamento', state: demo ? 'Desativado na demo' : mode === 'cloud' ? 'Acesso autenticado' : 'Aguardando configuração' }, { name: 'Inteligência artificial', detail: 'Assistentes de estudo', state: 'Não conectada' }, { name: 'Calendários externos', detail: 'Arquivo .ics · importação manual', state: 'Exportação disponível' }, { name: 'Microsoft e UNIP', detail: 'Recursos institucionais', state: 'A avaliar' }].map((item) => <div className="integration-row" key={item.name}><span><strong>{item.name}</strong><small>{item.detail}</small></span><span className="tiny-tag">{item.state}</span></div>)}<small>A primeira versão é pessoal. Convites e colaboração serão liberados apenas após os testes de acesso.</small></section></div>}
        </>}
        <footer className="page-footer"><span><Sprout aria-hidden="true" size={15} />Seu aprendizado é uma jornada, não uma corrida.</span><span>{status} · v0.2</span></footer>
      </main>
    </div>

    {form && <Modal title={form.kind === 'subject' ? form.subject ? 'Editar matéria' : 'Uma nova matéria' : form.kind === 'task' ? form.task ? 'Editar compromisso' : 'Um novo passo' : 'Capture uma ideia'} onClose={() => setForm(null)}><form onSubmit={submitForm} className="entry-form"><label htmlFor="entry-title">{form.kind === 'subject' ? 'Nome da matéria' : form.kind === 'task' ? 'O que você quer fazer?' : 'Título da anotação'}</label><input id="entry-title" name="title" required autoFocus maxLength={form.kind === 'subject' ? 100 : 160} defaultValue={form.subject?.name ?? form.task?.title ?? ''} placeholder={form.kind === 'subject' ? 'Ex.: Psicologia Social' : form.kind === 'task' ? 'Um pequeno passo já conta' : 'Dê um nome à sua ideia'} />{form.kind === 'subject' ? <><label htmlFor="entry-professor">Professor(a) · opcional</label><input id="entry-professor" name="professor" maxLength={100} defaultValue={form.subject?.professor ?? ''} /><label htmlFor="entry-semester">Semestre</label><input id="entry-semester" name="semester" type="number" min={1} max={20} defaultValue={form.subject?.semester ?? 1} required /><fieldset className="color-options"><legend>Cor da matéria</legend>{colors.map((color, index) => <label key={color} className={color}><input type="radio" name="color" value={color} defaultChecked={(form.subject?.color ?? 'sage') === color} />{['Verde', 'Lilás', 'Areia', 'Azul', 'Rosa'][index]}</label>)}</fieldset></> : <><label htmlFor="entry-subject">Matéria</label><select id="entry-subject" name="subject" defaultValue={form.task?.subjectId ?? subjectFilter}><option value="">Pessoal · sem matéria</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{form.kind === 'task' && <><div className="form-grid"><div><label htmlFor="entry-date">Data</label><input id="entry-date" name="date" type="date" required defaultValue={form.task?.date ?? (view === 'agenda' ? agendaDate : today)} /></div><div><label htmlFor="entry-minutes">Tempo estimado (min)</label><input id="entry-minutes" name="minutes" type="number" min={5} max={240} required defaultValue={form.task?.minutes ?? 25} /></div></div><label htmlFor="entry-time">Horário · opcional</label><input id="entry-time" name="time" type="time" defaultValue={form.task?.time ?? ''} /><label htmlFor="entry-kind">Tipo</label><select id="entry-kind" name="kind" defaultValue={form.task?.kind ?? 'Estudo'}>{['Estudo', 'Prova', 'Trabalho', 'Aula'].map((kind) => <option key={kind}>{kind}</option>)}</select></>}</>}<div className="form-footer"><button type="button" className="button outline" onClick={() => setForm(null)}>Cancelar</button><button className="button primary" disabled={blocked}>Salvar <Check size={17} aria-hidden="true" /></button></div></form></Modal>}

    {searchOpen && <Modal title="Encontre no seu espaço" onClose={() => { setSearchOpen(false); setQuery(''); }}><label className="sr-only" htmlFor="workspace-search">Buscar matérias, anotações e tarefas</label><input id="workspace-search" className="search-input" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Uma matéria, uma ideia, um compromisso…" /><div className="search-results">{!query.trim() ? <p className="muted">Digite para buscar. Nada é enviado a serviços externos.</p> : <>{data.subjects.filter((item) => item.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).map((item) => <button key={item.id} onClick={() => { openSubject(item); setSearchOpen(false); }}><BookOpen size={17} aria-hidden="true" /><span>{item.name}<small>Matéria</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}{data.notes.filter((item) => `${item.title} ${item.content.replace(/<[^>]*>/g, ' ')}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).map((item) => <button key={item.id} onClick={() => { setSelectedNote(item.id); setSubjectFilter(''); navigate('notes'); setSearchOpen(false); }}><FileText size={17} aria-hidden="true" /><span>{item.title}<small>Anotação</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}{data.tasks.filter((item) => item.title.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).map((item) => <button key={item.id} onClick={() => { setAgendaDate(item.date); navigate('agenda'); setSearchOpen(false); }}><CalendarDays size={17} aria-hidden="true" /><span>{item.title}<small>{formatDate(item.date)}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}<p className="search-end">Fim dos resultados para “{query}”.</p></>}</div></Modal>}
    {!demo && imported && <Modal title="Restaurar este backup?" onClose={() => setImported(null)}><p>Ele contém {imported.subjects.length} matérias, {imported.notes.length} anotações e {imported.tasks.length} compromissos. Isso substituirá os dados deste espaço.</p><p>Exporte uma cópia atual antes de continuar.</p><div className="button-row"><button className="button outline" onClick={() => download(data)}>Exportar versão atual</button><button className="button primary" disabled={blocked} onClick={() => { update(() => imported); setImported(null); setSelectedNote(''); setSubjectFilter(''); setNotice('Restauração enviada. Confira o indicador de salvamento antes de sair.'); }}>Confirmar restauração</button></div></Modal>}
    {notice && <div className="toast" role="status"><Check size={16} aria-hidden="true" /><span>{notice}</span><button className="icon-button" aria-label="Dispensar aviso" onClick={() => setNotice('')}><X size={16} aria-hidden="true" /></button></div>}
  </div>;
}
