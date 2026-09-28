'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, CloudOff, Compass, FileText, LayoutDashboard, LockKeyhole, Menu, MoreHorizontal, Plus, Search, Settings2, ShieldCheck, Sparkles, Sprout, Upload, Wallet, X } from 'lucide-react';
import { addDays, colors, taskKinds, dateKey, formatDate, parseWorkspace, priorityTasks, type Note, type Subject, type Task, type Workspace } from '@/lib/workspace';
import { calendarEntries, weekdays } from '@/lib/academic';
import { useWorkspace } from './use-workspace';
import { Modal } from './modal';
import { FocusTimer } from './focus-timer';
import { CaptureInbox } from './capture-inbox';
import { AreaSelect, NoteOrganization, OrganizationPanel } from './life-organization';
import { areaName, itemArea, lifeAreas } from '@/lib/life';
import { FinancialController } from './financial-controller';
import { DailyRoutine } from './daily-routine';
import { ProfileSettings, defaultUserProfile, type UserProfileData } from './profile-settings';
import { QuickCaptureWidget } from './quick-capture';
import { LegacyImport } from './legacy-import';

const NoteEditor = dynamic(() => import('./note-editor'), { ssr: false, loading: () => <p className="muted">Abrindo editor…</p> });
const AcademicCalendar = dynamic(() => import('./academic-calendar'), { loading: () => <p role="status">Abrindo sua agenda…</p> });
const StudyPlanner = dynamic(() => import('./study-planner'), { loading: () => <p role="status">Organizando sugestões…</p> });
type View = 'today' | 'subjects' | 'notes' | 'agenda' | 'finances' | 'routine' | 'assistant' | 'settings';
type FormKind = 'subject' | 'task' | 'note';
const navigation = [
  { id: 'today', label: 'Meu dia', Icon: LayoutDashboard },
  { id: 'subjects', label: 'Matérias', Icon: BookOpen },
  { id: 'notes', label: 'Caderno', Icon: FileText },
  { id: 'agenda', label: 'Agenda', Icon: CalendarDays },
  { id: 'finances', label: 'Finanças', Icon: Wallet },
  { id: 'routine', label: 'Minha rotina', Icon: Compass },
  { id: 'assistant', label: 'Assistente', Icon: Sparkles },
] as const;
const names: Record<View, string> = { today: 'Meu dia', subjects: 'Minhas matérias', notes: 'Meu caderno', agenda: 'Minha agenda', finances: 'Finanças', routine: 'Minha rotina', assistant: 'Assistente de estudos', settings: 'Meu espaço' };
function download(data: Workspace) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `jornada-plena-${dateKey()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function WorkspaceApp({ mode, hostedPreview = false, authenticated = false }: { mode: 'local' | 'cloud' | 'demo'; hostedPreview?: boolean; authenticated?: boolean }) {
  const { data, ready, demo, status, error, blocked, update, ensureSaved } = useWorkspace(mode);
  const [view, setView] = useState<View>('today');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [form, setForm] = useState<{ kind: FormKind; task?: Task; subject?: Subject } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedNote, setSelectedNote] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [bookFilter, setBookFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [agendaDate, setAgendaDate] = useState(dateKey);
  const [imported, setImported] = useState<Workspace | null>(null);
  const [notice, setNotice] = useState('');
  const userProfile = data.profile ?? defaultUserProfile;
  const [focusRequest, setFocusRequest] = useState<{ id: string; subjectId: string } | null>(null);
  const today = dateKey();
  const main = useRef<HTMLElement>(null);
  const timerArea = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const visibleNotes = data.notes.filter((note) => (!subjectFilter || (subjectFilter === '__personal' ? !note.subjectId : note.subjectId === subjectFilter)) && (!bookFilter || (bookFilter === '__none' ? !note.notebookId : note.notebookId === bookFilter)) && (!areaFilter || (areaFilter === '__none' ? !itemArea(note) : itemArea(note) === areaFilter)));
  const activeNote = visibleNotes.find((note) => note.id === selectedNote) ?? visibleNotes[0];
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
  useEffect(() => { document.title = `${names[view]} · Jornada Plena`; }, [view]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  function navigate(next: View) { setView(next); setMobileMenu(false); requestAnimationFrame(() => main.current?.focus()); }
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
      if (!update((previous) => ({ ...previous, subjects: form.subject ? previous.subjects.map((item) => item.id === value.id ? value : item) : [...previous.subjects, value] }))) return;
    } else if (form.kind === 'task') {
      const value: Task = { ...form.task, time: text('time') || undefined, id: form.task?.id ?? crypto.randomUUID(), title: text('title'), date: text('date'), subjectId: text('subject'), areaId: text('area'), kind: text('kind') as Task['kind'], done: form.task?.done ?? false, minutes: Number(fields.get('minutes')) };
      if (!update((previous) => ({ ...previous, tasks: form.task ? previous.tasks.map((item) => item.id === value.id ? value : item) : [...previous.tasks, value] }))) return;
    } else {
      const id = crypto.randomUUID();
      if (!update((previous) => ({ ...previous, notes: [{ id, title: text('title'), subjectId: text('subject'), areaId: text('area') || data.notebooks?.find((book) => book.id === text('notebook'))?.areaId || (text('subject') ? 'studies' : ''), notebookId: text('notebook'), content: '<p></p>', updatedAt: new Date().toISOString() }, ...previous.notes] }))) return;
      setSelectedNote(id); setSubjectFilter(''); setBookFilter(''); setAreaFilter(''); navigate('notes');
    }
    setForm(null); setNotice('');
  }
  function toggleTask(task: Task) { update((previous) => ({ ...previous, tasks: previous.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) })); }
  function openSubject(item: Subject) { setBookFilter(''); setAreaFilter(''); setSubjectFilter(item.id); setSelectedNote(''); navigate('notes'); }

  const navContent = <>
    <div className="sidebar-header">
      <button className="brand" onClick={() => navigate('today')} aria-label="Jornada Plena — início">
        <span className="brand-icon"><Sprout aria-hidden="true" size={17} /></span>
        <span className="brand-text">Jornada<span className="brand-psi">Plena<span className="brand-dot">.</span></span></span>
      </button>
      <div className="sidebar-user-card" onClick={() => navigate('settings')} role="button" tabIndex={0} title="Meu perfil e configurações">
        <div className="user-avatar-badge" aria-hidden="true">
          {userProfile.photoUrl ? <img src={userProfile.photoUrl} alt="Avatar" /> : userProfile.name.slice(0,1) || 'P'}
        </div>
        <div className="user-meta-info">
          <strong>{userProfile.name || 'Meu espaço'}</strong>
          <span>{userProfile.course} · {userProfile.semester}</span>
        </div>
      </div>
    </div>
    <nav aria-label="Principal">
      {navigation.map(({ id, label, Icon }) => (
        <button
          key={id}
          aria-current={view === id ? 'page' : undefined}
          className={`nav-item ${view === id ? 'active' : ''}`}
          onClick={() => navigate(id)}
        >
          <Icon aria-hidden="true" size={18} />
          <span>{label}</span>
          {id === 'assistant' && <span className="nav-chip">Regras</span>}
        </button>
      ))}
    </nav>
    <div className="sidebar-bottom">
      <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')}>
        <Settings2 aria-hidden="true" size={18} />
        <span>Meu espaço</span>
      </button>
      <div className="sidebar-status-indicator">
        <span className="online-dot" title="Sistema online" />
        <small>{demo ? 'Demonstração pública' : mode === 'local' ? previewLabel : 'Conta ativa'}</small>
      </div>
    </div>
  </>;

  const taskRow = (task: Task) => <li className={`task-row ${task.done ? 'is-done' : ''}`} key={task.id}>
    <label className="task-checkbox"><input type="checkbox" checked={task.done} disabled={blocked} onChange={() => toggleTask(task)} aria-label={`Concluir: ${task.title}`} /><span className="check-visual"><Check size={13} aria-hidden="true" /></span></label>
    <button className="task-description" onClick={() => setForm({ kind: 'task', task })}><strong>{task.title}</strong><span><i className={`color-dot ${subject(task.subjectId)?.color ?? 'sage'}`} />{areaName(data, task)}{subject(task.subjectId) ? ` · ${subject(task.subjectId)?.name}` : ''}{task.date < today && !task.done && <em>Em atraso</em>}</span></button>
    <span className="task-duration"><Clock3 size={12} aria-hidden="true" />{task.minutes} min</span>
  </li>;

  const subjectCard = (item: Subject) => <article className={`subject-card ${item.color}`} key={item.id}>
    <div className="subject-card-top">
      <span className={`subject-symbol ${item.color}`}><BookOpen size={18} aria-hidden="true" /></span>
      <span className={`subject-sem-tag ${item.color}`}>{item.semester}º sem.</span>
      <button className="icon-button" aria-label={`Editar matéria: ${item.name}`} onClick={() => setForm({ kind: 'subject', subject: item })}>
        <MoreHorizontal size={17} aria-hidden="true" />
      </button>
    </div>
    <button className="subject-title" onClick={() => openSubject(item)}>
      <h3>{item.name}</h3>
      <span>{item.professor ? `Prof. ${item.professor}` : 'Sem professor informado'}</span>
    </button>
    <p className="subject-schedule">
      <Clock3 size={12} aria-hidden="true" />
      {data.classes.filter((session) => session.subjectId === item.id).map((session) => `${weekdays[session.weekday]} · ${session.startTime}${!session.enabled ? ' (pausada)' : session.intervalWeeks > 1 ? ` · a cada ${session.intervalWeeks} sem.` : ''}`).join(' / ') || 'Horário flexível / EAD'}
    </p>
    <div className="subject-card-footer">
      <span><FileText size={12} aria-hidden="true" />{data.notes.filter((note) => note.subjectId === item.id).length} anotações</span>
      <div className="subject-card-actions">
        <button
          type="button"
          className="subject-focus-btn"
          title="Focar 25 min nesta matéria"
          onClick={(e) => {
            e.stopPropagation();
            setFocusRequest({ id: crypto.randomUUID(), subjectId: item.id });
            navigate('today');
          }}
        >
          <Clock3 size={12} /> Foco 25m
        </button>
        <button aria-label={`Abrir caderno de ${item.name}`} className="icon-button" onClick={() => openSubject(item)}>
          <ArrowUpRight size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  </article>;

  return <div className="app-shell">
    <a className="skip-link" href="#main">Pular para o conteúdo</a>
    <aside className="sidebar">{navContent}</aside>
    {mobileMenu && <Modal title="Seu espaço" onClose={() => setMobileMenu(false)}><div className="mobile-navigation">{navContent}</div></Modal>}
    <div className="app-body">
      <header className="topbar">
        <div className="breadcrumb">
          <button className="icon-button mobile-menu-button" aria-label="Abrir navegação" onClick={() => setMobileMenu(true)}>
            <Menu size={20} aria-hidden="true" />
          </button>
          <span>Meu espaço</span>
          <ChevronRight aria-hidden="true" size={14} />
          <strong>{names[view]}</strong>
        </div>
        <div className="topbar-actions">
          <button className="search-trigger" aria-label="Buscar no meu espaço" onClick={() => setSearchOpen(true)}>
            <Search size={16} aria-hidden="true" />
            <span>Buscar no meu espaço</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button className="icon-button" aria-label="Ajuda e configurações" onClick={() => navigate('settings')}>
            <CircleHelp size={18} aria-hidden="true" />
          </button>
          <button className="avatar small" onClick={() => navigate('settings')} aria-label="Perfil Alexandre">
            {userProfile.photoUrl ? <img src={userProfile.photoUrl} alt="Avatar" /> : userProfile.name.slice(0,1) || 'P'}
          </button>
        </div>
      </header>

      <main id="main" tabIndex={-1} ref={main} className="main-content">
        <div className={`mode-banner ${demo ? 'demo-banner' : ''}`}>
          <span><CloudOff size={14} aria-hidden="true" />{demo ? 'Demonstração — dados fictícios. Não insira informações pessoais.' : mode === 'local' ? storageNotice : 'Espaço pessoal · acesso restrito à conta proprietária.'}</span>
          {demo && <button onClick={() => window.location.reload()} disabled={!ready}>Restaurar exemplos <ArrowRight size={13} aria-hidden="true" /></button>}
        </div>
        {error && <div className="error-banner" role="alert">{error}{ready && <button className="text-button" onClick={() => download(data)}>Exportar esta versão</button>}<button className="text-button" onClick={() => window.location.reload()}>Recarregar</button></div>}

        <div className="page-heading">
          <div>
            <span className="eyebrow">{ready && view === 'today' ? formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Sua vida, do seu jeito'}</span>
            <h1>{view === 'today' ? <>Um novo dia, <span>no seu ritmo.</span></> : names[view]}</h1>
            <p>{view === 'today' ? 'Você não precisa dar conta de tudo. Vamos cuidar do próximo passo.' : view === 'notes' ? 'Um lugar para guardar ideias e fazer conexões.' : view === 'subjects' ? 'Cada matéria, um novo universo para descobrir.' : view === 'agenda' ? 'Um pouco de organização abre espaço para o que importa.' : view === 'finances' ? 'Controle seu orçamento, mensalidades e despesas com clareza.' : view === 'routine' ? 'Defina seus blocos do dia e mantenha hábitos consistentes.' : view === 'assistant' ? 'Inteligência como apoio. Você no controle.' : 'Suas preferências, seus dados e suas conexões.'}</p>
          </div>
          <div className="heading-actions-row">
            {view === 'today' && <>
              <button className="button outline" onClick={() => setForm({ kind: 'task' })}><Plus size={16} aria-hidden="true" />Novo compromisso</button>
              <button className="button primary" onClick={() => setForm({ kind: 'note' })}><FileText size={16} aria-hidden="true" />Nova anotação</button>
            </>}
          </div>
        </div>

        {!ready && !error && <div className="loading-panel" role="status">Preparando seu espaço…</div>}

        {ready && <>
          {view === 'today' && <>
            {/* 4 BENTO METRIC CARDS (BROKER SAAS STYLE) */}
            <div className="bento-metric-row">
              <div className="bento-metric-card">
                <div className="metric-header">
                  <span className="metric-icon lavender"><Clock3 size={18} aria-hidden="true" /></span>
                  <span className="metric-label">Foco Registrado</span>
                </div>
                <div className="metric-value">{studyMinutes}<small> min</small></div>
                <span className="metric-sub">{studyMinutes > 0 ? 'Foco acumulado hoje' : 'Pronto para começar'}</span>
              </div>
              <div className="bento-metric-card">
                <div className="metric-header">
                  <span className="metric-icon sage"><CheckCheck size={18} aria-hidden="true" /></span>
                  <span className="metric-label">Tarefas de Hoje</span>
                </div>
                <div className="metric-value">{doneToday}<small> / {dueToday.length}</small></div>
                <span className="metric-sub">{dueToday.length === 0 ? 'Sem prazos para hoje' : `${progress}% concluído`}</span>
              </div>
              <div className="bento-metric-card">
                <div className="metric-header">
                  <span className="metric-icon blue"><BookOpen size={18} aria-hidden="true" /></span>
                  <span className="metric-label">Matérias Ativas</span>
                </div>
                <div className="metric-value">{data.subjects.length}</div>
                <span className="metric-sub">1º Semestre Psicologia UNIP</span>
              </div>
              <div className="bento-metric-card">
                <div className="metric-header">
                  <span className="metric-icon sand"><FileText size={18} aria-hidden="true" /></span>
                  <span className="metric-label">Captura Rápida</span>
                </div>
                <div className="metric-value">{data.notes.filter((n) => !n.areaId && !n.subjectId).length}</div>
                <span className="metric-sub">Ideias para triagem</span>
              </div>
            </div>

            {/* ANOTA AQUI · QUICK CAPTURE WIDGET */}
            <QuickCaptureWidget
              data={data}
              blocked={blocked}
              update={update}
              status={status}
              cloud={mode === 'cloud'}
              demo={demo}
              ensureSaved={ensureSaved}
              onOpen={(id) => {
                setSelectedNote(id);
                setSubjectFilter('');
                setBookFilter('');
                setAreaFilter('');
                navigate('notes');
              }}
            />

            {/* DASHBOARD SPLIT GRID */}
            <div className="dashboard-grid">
              <div className="dashboard-primary">
                {/* PRIORIDADES */}
                <section className="panel priorities">
                  <div className="section-heading">
                    <div><h2>Um passo de cada vez</h2><p>Até três prioridades. O resto pode esperar.</p></div>
                    <button className="icon-button" aria-label="Adicionar tarefa" disabled={blocked} onClick={() => setForm({ kind: 'task' })}><Plus size={18} aria-hidden="true" /></button>
                  </div>
                  <ul className="task-list" role="list">{priorities.map(taskRow)}{dueToday.filter((task) => task.done).slice(0, 1).map(taskRow)}</ul>
                  {!priorities.length && !doneToday && <div className="empty-inline"><CheckCheck size={22} aria-hidden="true" /><p>Nenhuma prioridade pendente por aqui.<br /><button className="text-button" onClick={() => setForm({ kind: 'task' })}>Escolher meu próximo passo</button></p></div>}
                  <div className="panel-footer"><span>{pending.length} {pending.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'} no seu espaço</span><button className="text-button" onClick={() => navigate('agenda')}>Ver minha agenda <ArrowRight size={13} aria-hidden="true" /></button></div>
                </section>

                {/* STUDY PLANNER COMPACT */}
                <StudyPlanner data={data} update={update} blocked={blocked} compact onAgenda={() => navigate('agenda')} />

                {/* MATÉRIAS */}
                <section className="subjects-section">
                  <div className="section-heading">
                    <h2>Meus universos de estudo</h2>
                    <button className="text-button" onClick={() => navigate('subjects')}>Ver matérias <ArrowRight size={13} aria-hidden="true" /></button>
                  </div>
                  <div className="subject-grid">
                    {data.subjects.slice(0, 3).map(subjectCard)}
                    {!data.subjects.length && <button className="add-subject-card" onClick={() => setForm({ kind: 'subject' })}><Plus aria-hidden="true" />Adicionar minha primeira matéria</button>}
                  </div>
                </section>
              </div>

              <aside className="dashboard-secondary">
                {/* SEMANA */}
                <section className="panel week-card">
                  <div className="section-heading"><h2>Sua semana</h2><CalendarDays size={16} aria-hidden="true" /></div>
                  <div className="week-strip">{Array.from({ length: 7 }, (_, index) => { const day = addDays(today, index); return <button key={day} className={day === today ? 'today' : ''} aria-label={`Abrir agenda de ${formatDate(day)}`} onClick={() => { setAgendaDate(day); navigate('agenda'); }}><span>{formatDate(day, { weekday: 'short' }).replace('.', '')}</span><strong>{new Date(`${day}T12:00:00`).getDate()}</strong><i className={upcoming.some((entry) => entry.date === day) ? 'has-task' : ''} /></button>; })}</div>
                  <h3 className="small-heading">Vem por aí</h3>
                  <div className="upcoming-list">{upcoming.slice(0, 3).map((task) => <button key={task.id} className="upcoming-item" onClick={() => { setAgendaDate(task.date); navigate('agenda'); }}><span className={`date-block ${subject(task.subjectId)?.color ?? 'sage'}`}><strong>{new Date(`${task.date}T12:00:00`).getDate()}</strong><small>{formatDate(task.date, { month: 'short' }).replace('.', '')}</small></span><span><strong>{task.title}</strong><small>{task.time ?? 'Sem horário'} · {task.kind}</small></span></button>)}{!upcoming.length && <p className="muted">Sua semana tem espaço para novos planos.</p>}</div>
                  <button className="text-button full-width" onClick={() => navigate('agenda')}>Abrir agenda <ArrowRight size={13} aria-hidden="true" /></button>
                </section>

                {/* SLEEK FOCUS TIMER */}
                <div ref={timerArea}>
                  <FocusTimer disabled={blocked} request={focusRequest} subjects={data.subjects} onComplete={(minutes, subjectId) => update((previous) => ({ ...previous, sessions: [...previous.sessions, { id: crypto.randomUUID(), date: dateKey(), minutes, subjectId }] }))} />
                </div>

                {/* PROGRESS RING */}
                <section className="panel daily-progress">
                  <span className="progress-ring" style={{ '--progress': `${progress}%` } as React.CSSProperties}><span>{progress}%</span></span>
                  <div><h2>Ritmo do dia</h2><p>{doneToday ? `${doneToday} ${doneToday === 1 ? 'passo concluído' : 'passos concluídos'} hoje. Bom trabalho!` : 'Seu progresso começa com uma pequena escolha.'}</p></div>
                </section>
              </aside>
            </div>
          </>}

          {view === 'subjects' && (
            <section>
              <div className="section-heading">
                <span className="muted">{data.subjects.length} matérias organizadas</span>
                <button className="button primary" disabled={blocked} onClick={() => setForm({ kind: 'subject' })}>
                  <Plus size={16} aria-hidden="true" /> Nova matéria
                </button>
              </div>
              <div className="subject-grid expanded">
                {data.subjects.map(subjectCard)}
                <button className="add-subject-card" disabled={blocked} onClick={() => setForm({ kind: 'subject' })}>
                  <Plus aria-hidden="true" /> Um novo universo de estudo
                </button>
              </div>
            </section>
          )}

          {view === 'notes' && <section className="notebook-layout"><aside className="note-index"><div className="section-heading"><h2>Anotações</h2><button className="icon-button" disabled={blocked} aria-label="Nova anotação" onClick={() => setForm({ kind: 'note' })}><Plus size={19} aria-hidden="true" /></button></div><label className="sr-only" htmlFor="note-filter">Filtrar anotações por matéria</label><select id="note-filter" value={subjectFilter} onChange={(event) => { setSubjectFilter(event.target.value); setSelectedNote(''); }}><option value="">Todas as matérias e pessoais</option><option value="__personal">Pessoais · sem matéria</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><div className="life-fields"><label htmlFor="note-area-filter">Filtrar área</label><select id="note-area-filter" value={areaFilter} onChange={(event) => { setAreaFilter(event.target.value); setSelectedNote(''); }}><option value="">Todas as áreas</option><option value="__none">Sem área</option>{lifeAreas(data).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><label htmlFor="notebook-filter">Filtrar caderno</label><select id="notebook-filter" value={bookFilter} onChange={(event) => { setBookFilter(event.target.value); setSelectedNote(''); }}><option value="">Todos os cadernos</option><option value="__none">Sem caderno</option>{data.notebooks?.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select><button className="text-button" onClick={() => navigate('settings')}>Gerenciar áreas e cadernos</button></div><div className="note-list">{visibleNotes.map((note) => <button key={note.id} className={`note-list-item ${activeNote?.id === note.id ? 'selected' : ''}`} onClick={() => setSelectedNote(note.id)}><FileText size={16} aria-hidden="true" /><span><strong>{note.title || 'Sem título'}</strong><small>{new Date(note.updatedAt).toLocaleDateString('pt-BR')}</small></span></button>)}</div></aside><div className="note-paper">{activeNote ? <><div className="note-meta"><span><LockKeyhole size={13} aria-hidden="true" />{demo ? 'Exemplo temporário' : mode === 'local' ? 'Armazenamento local' : 'Anotação pessoal'}</span><span role="status">{status}</span></div><label htmlFor="note-title" className="sr-only">Título da anotação</label><input id="note-title" className="note-title-input" value={activeNote.title} maxLength={160} disabled={blocked} onChange={(event) => editNote({ title: event.target.value })} placeholder="Sem título" /><label className="sr-only" htmlFor="note-subject">Matéria da anotação</label><select id="note-subject" className="note-subject-select" value={activeNote.subjectId} disabled={blocked} onChange={(event) => editNote({ subjectId: event.target.value })}><option value="">Pessoal · sem matéria</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><NoteOrganization data={data} note={activeNote} blocked={blocked} onChange={editNote} /><NoteEditor noteId={activeNote.id} cloud={mode === 'cloud'} key={activeNote.id} content={activeNote.content} disabled={blocked} onChange={(content) => editNote({ content })} /></> : <div className="empty-state"><FileText size={40} aria-hidden="true" /><h2>Sua próxima ideia mora aqui.</h2><p>Crie uma anotação para começar a escrever.</p><button className="button primary" disabled={blocked} onClick={() => setForm({ kind: 'note' })}>Criar anotação <Plus size={16} aria-hidden="true" /></button></div>}</div></section>}

          {view === 'agenda' && <AcademicCalendar data={data} date={agendaDate} onDateChange={setAgendaDate} update={update} blocked={blocked} onNew={(date) => { setAgendaDate(date); setForm({ kind: 'task' }); }} onEdit={(task) => setForm({ kind: 'task', task })} />}

          {view === 'finances' && <FinancialController data={data} update={update} blocked={blocked} />}

          {view === 'routine' && <DailyRoutine data={data} update={update} blocked={blocked} />}

          {view === 'assistant' && <StudyPlanner data={data} update={update} blocked={blocked} onAgenda={() => navigate('agenda')} />}

          {view === 'settings' && <>
            {!demo && <LegacyImport data={data} update={update} blocked={blocked} />}
            <ProfileSettings
              data={data}
              update={update}
              blocked={blocked}
              demo={demo}
              mode={mode}
              privacyNotice={privacyNotice}
              downloadData={() => download(data)}
              onImportClick={() => fileInput.current?.click()}
              authenticated={authenticated}
            />
          </>}
        </>}
        <footer className="page-footer"><span><Sprout aria-hidden="true" size={15} />Sua vida é uma jornada, não uma corrida.</span><span>{status} · v0.2</span></footer>
      </main>
    </div>

    {form && <Modal title={form.kind === 'subject' ? form.subject ? 'Editar matéria' : 'Uma nova matéria' : form.kind === 'task' ? form.task ? 'Editar compromisso' : 'Um novo passo' : 'Capture uma ideia'} onClose={() => setForm(null)}><form onSubmit={submitForm} className="entry-form"><label htmlFor="entry-title">{form.kind === 'subject' ? 'Nome da matéria' : form.kind === 'task' ? 'O que você quer fazer?' : 'Título da anotação'}</label><input id="entry-title" name="title" required autoFocus maxLength={form.kind === 'subject' ? 100 : 160} defaultValue={form.subject?.name ?? form.task?.title ?? ''} placeholder={form.kind === 'subject' ? 'Ex.: Psicologia Social' : form.kind === 'task' ? 'Um pequeno passo já conta' : 'Dê um nome à sua ideia'} />{form.kind === 'subject' ? <><label htmlFor="entry-professor">Professor(a) · opcional</label><input id="entry-professor" name="professor" maxLength={100} defaultValue={form.subject?.professor ?? ''} /><label htmlFor="entry-semester">Semestre</label><input id="entry-semester" name="semester" type="number" min={1} max={20} defaultValue={form.subject?.semester ?? 1} required /><fieldset className="color-options"><legend>Cor da matéria</legend>{colors.map((color, index) => <label key={color} className={color}><input type="radio" name="color" value={color} defaultChecked={(form.subject?.color ?? 'sage') === color} />{['Verde', 'Lilás', 'Areia', 'Azul', 'Rosa'][index]}</label>)}</fieldset></> : <><label htmlFor="entry-area">Área da vida · opcional</label><AreaSelect id="entry-area" name="area" data={data} value={form.task ? itemArea(form.task) : subjectFilter && subjectFilter !== '__personal' ? 'studies' : ''} />{form.kind === 'note' && <><label htmlFor="entry-notebook">Caderno · opcional</label><select id="entry-notebook" name="notebook" defaultValue={bookFilter === '__none' ? '' : bookFilter}><option value="">Sem caderno</option>{data.notebooks?.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select></>}<label htmlFor="entry-subject">Matéria · opcional</label><select id="entry-subject" name="subject" defaultValue={form.task?.subjectId ?? (subjectFilter === '__personal' ? '' : subjectFilter)}><option value="">Pessoal · sem matéria</option>{data.subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{form.kind === 'task' && <><div className="form-grid"><div><label htmlFor="entry-date">Data</label><input id="entry-date" name="date" type="date" required defaultValue={form.task?.date ?? (view === 'agenda' ? agendaDate : today)} /></div><div><label htmlFor="entry-minutes">Tempo estimado (min)</label><input id="entry-minutes" name="minutes" type="number" min={5} max={240} required defaultValue={form.task?.minutes ?? 25} /></div></div><label htmlFor="entry-time">Horário · opcional</label><input id="entry-time" name="time" type="time" defaultValue={form.task?.time ?? ''} /><label htmlFor="entry-kind">Tipo</label><select id="entry-kind" name="kind" defaultValue={form.task?.kind ?? 'Compromisso'}>{taskKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></>}</>}<div className="form-footer"><button type="button" className="button outline" onClick={() => setForm(null)}>Cancelar</button><button className="button primary" disabled={blocked}>Salvar <Check size={17} aria-hidden="true" /></button></div></form></Modal>}

    {searchOpen && <Modal title="Encontre no seu espaço" onClose={() => { setSearchOpen(false); setQuery(''); }}><label className="sr-only" htmlFor="workspace-search">Buscar matérias, anotações e tarefas</label><input id="workspace-search" className="search-input" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Uma matéria, uma ideia, um compromisso…" /><div className="search-results">{!query.trim() ? <p className="muted">Digite para buscar. Nada é enviado a serviços externos.</p> : <>{data.subjects.filter((item) => item.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).map((item) => <button key={item.id} onClick={() => { openSubject(item); setSearchOpen(false); }}><BookOpen size={17} aria-hidden="true" /><span>{item.name}<small>Matéria</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}{data.notes.filter((item) => `${item.title} ${item.content.replace(/<[^>]*>/g, ' ')}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).map((item) => <button key={item.id} onClick={() => { setSelectedNote(item.id); setSubjectFilter(''); setBookFilter(''); setAreaFilter(''); navigate('notes'); setSearchOpen(false); }}><FileText size={17} aria-hidden="true" /><span>{item.title}<small>Anotação</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}{data.tasks.filter((item) => item.title.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).map((item) => <button key={item.id} onClick={() => { setAgendaDate(item.date); navigate('agenda'); setSearchOpen(false); }}><CalendarDays size={17} aria-hidden="true" /><span>{item.title}<small>{formatDate(item.date)}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}<p className="search-end">Fim dos resultados para “{query}”.</p></>}</div></Modal>}
    {!demo && imported && <Modal title="Restaurar este backup?" onClose={() => setImported(null)}><p>Ele contém {imported.subjects.length} matérias, {imported.notes.length} anotações e {imported.tasks.length} compromissos. Isso substituirá os dados deste espaço.</p><p>Exporte uma cópia atual antes de continuar.</p><div className="button-row"><button className="button outline" onClick={() => download(data)}>Exportar versão atual</button><button className="button primary" disabled={blocked} onClick={() => { update(() => imported); setImported(null); setSelectedNote(''); setSubjectFilter(''); setBookFilter(''); setAreaFilter(''); setNotice('Restauração enviada. Confira o indicador de salvamento antes de sair.'); }}>Confirmar restauração</button></div></Modal>}
    {notice && <div className="toast" role="status"><Check size={16} aria-hidden="true" /><span>{notice}</span><button className="icon-button" aria-label="Dispensar aviso" onClick={() => setNotice('')}><X size={16} aria-hidden="true" /></button></div>}
  </div>;
}
