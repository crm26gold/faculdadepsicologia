'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Cake, CalendarDays, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, CloudOff, Compass, Contact, FileText, GraduationCap, Layers, LayoutDashboard, LockKeyhole, Menu, MoreHorizontal, PenLine, Plus, Search, Settings2, ShieldCheck, Sparkles, Sprout, Target, Upload, Users, Wallet, X } from 'lucide-react';
import { addDays, colors, taskKinds, dateKey, formatDate, parseWorkspace, priorityTasks, type Course, type Note, type Subject, type Task, type Workspace } from '@/lib/workspace';
import { activeCourses, capitalize, courseKindLabels, courseOf, courseStatusLabels, courseUnits, ensureCourses, subjectsOfCourse, unitCount, unitPresets } from '@/lib/courses';
import { calendarEntries, weekdays } from '@/lib/academic';
import { useWorkspace } from './use-workspace';
import { Modal } from './modal';
import { MobileDisclosure } from './mobile-disclosure';
import { FocusTimer } from './focus-timer';
import { FocusHistory } from './focus-history';
import { CaptureSheet } from './capture-sheet';
import { AssistantBubble, AssistantChat, AssistantPanel, type AssistantMessage } from './assistant';
import { CaptureInbox } from './capture-inbox';
import { AreaSelect, NoteOrganization, OrganizationPanel } from './life-organization';
import { areaName, itemArea, lifeAreas } from '@/lib/life';
import { FinancialController } from './financial-controller';
import { DailyRoutine } from './daily-routine';
import { ProfileSettings, defaultUserProfile, type UserProfileData } from './profile-settings';
import { QuickCaptureWidget } from './quick-capture';
import { LegacyImport } from './legacy-import';
import { FlashcardsDeck } from './flashcards-deck';
import { ColorOptions, CourseFields } from './course-form';
import { SubjectOptions } from './subject-options';
import { PlanningPanel } from './planning-panel';
import { CommunityPanel, usePendingInvite, type CommunityRoute } from './community/community-panel';
import { AdminPanel } from './community/admin-panel';
import { ContactsPanel } from './community/contacts-panel';
import { AccountSettings } from './community/account-settings';
import { ConsentGate } from './community/consent-gate';
import { api, formatDay as formatShortDay } from './community/client';
import { acceptedTerms, hasPro, statusLabels, upcomingBirthdays, type Contact as ContactRow, type Home } from '@/lib/community';

const NoteEditor = dynamic(() => import('./note-editor'), { ssr: false, loading: () => <p className="muted">Abrindo editor…</p> });
const AcademicCalendar = dynamic(() => import('./academic-calendar'), { loading: () => <p role="status">Abrindo sua agenda…</p> });
const StudyPlanner = dynamic(() => import('./study-planner'), { loading: () => <p role="status">Organizando sugestões…</p> });
type View = 'today' | 'community' | 'studies' | 'notes' | 'agenda' | 'focus' | 'planning' | 'finances' | 'routine' | 'flashcards' | 'assistant' | 'contacts' | 'admin' | 'settings';
type FormKind = 'subject' | 'task' | 'note' | 'course';
type FormState = { kind: FormKind; task?: Task; subject?: Subject; course?: Course; courseId?: string };
type StudiesRoute = { kind: 'list' } | { kind: 'course'; id: string };
const navigation = [
  { id: 'today', label: 'Meu dia', Icon: LayoutDashboard },
  { id: 'studies', label: 'Estudos', Icon: GraduationCap },
  { id: 'community', label: 'Salas e grupos', Icon: Users },
  { id: 'notes', label: 'Caderno', Icon: FileText },
  { id: 'agenda', label: 'Agenda', Icon: CalendarDays },
  { id: 'focus', label: 'Foco', Icon: Clock3 },
  { id: 'planning', label: 'Metas e projetos', Icon: Target },
  { id: 'finances', label: 'Finanças', Icon: Wallet },
  { id: 'routine', label: 'Minha rotina', Icon: Compass },
  { id: 'flashcards', label: 'Flashcards', Icon: Layers },
  { id: 'assistant', label: 'Assistente', Icon: Sparkles },
  { id: 'contacts', label: 'Contatos', Icon: Contact },
  { id: 'admin', label: 'Administração', Icon: ShieldCheck },
] as const;
const proViews = new Set<View>(['planning', 'finances', 'routine']);
const serverViews = new Set<View>(['community', 'contacts', 'admin']);
const names: Record<View, string> = { today: 'Meu dia', community: 'Salas e grupos', contacts: 'Meus contatos', admin: 'Administração', studies: 'Meus estudos', notes: 'Meu caderno', agenda: 'Minha agenda', focus: 'Meu foco', planning: 'Metas e projetos', finances: 'Finanças', routine: 'Minha rotina', flashcards: 'Flashcards', assistant: 'Assistente', settings: 'Meu espaço' };
const viewOf = (value: string) => (value === 'subjects' ? 'studies' : value) as View; // old links to "Matérias"
const SHORTCUT_KEY = 'jornada-atalho-barra';
const BUBBLE_KEY = 'jornada-assistente-escondido';
const tabLabel = (id: View, label: string) => id === 'today' ? 'Hoje' : id === 'community' ? 'Salas' : id === 'planning' ? 'Metas' : id === 'routine' ? 'Rotina' : label;
function download(data: Workspace) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `jornada-plena-${dateKey()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function WorkspaceApp({ mode, hostedPreview = false, authenticated = false }: { mode: 'local' | 'cloud' | 'demo'; hostedPreview?: boolean; authenticated?: boolean }) {
  const { data, ready, demo, status, error, blocked, update, ensureSaved } = useWorkspace(mode);
  const [view, setView] = useState<View>('today');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedNote, setSelectedNote] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [bookFilter, setBookFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [agendaDate, setAgendaDate] = useState(dateKey);
  const [imported, setImported] = useState<Workspace | null>(null);
  const [notice, setNotice] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [shortcut, setShortcut] = useState<View>('studies');
  const [financeRequest, setFinanceRequest] = useState(0);
  const [bubbleHidden, setBubbleHidden] = useState(false);
  const userProfile = data.profile ?? defaultUserProfile;
  const [focusRequest, setFocusRequest] = useState<{ id: string; subjectId: string } | null>(null);
  const cloud = mode === 'cloud';
  const [home, setHome] = useState<Home | null>(null);
  const [homeError, setHomeError] = useState('');
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [communityRoute, setCommunityRoute] = useState<CommunityRoute>({ kind: 'list' });
  const [studiesRoute, setStudiesRoute] = useState<StudiesRoute>({ kind: 'list' });
  const refreshHome = useCallback(() => {
    if (!cloud) return;
    api<Home>('/api/me').then(value => { setHome(value); setHomeError(''); }).catch(reason => setHomeError(reason instanceof Error ? reason.message : 'Não foi possível carregar sua conta.'));
  }, [cloud]);
  useEffect(() => { refreshHome(); }, [refreshHome]);
  useEffect(() => { if (cloud && home && acceptedTerms(home)) api<ContactRow[]>('/api/contacts').then(setContacts).catch(() => setContacts([])); }, [cloud, home]);
  usePendingInvite(cloud && !!home && acceptedTerms(home), (spaceId, message) => {
    if (spaceId) { setCommunityRoute({ kind: 'space', id: spaceId }); setView('community'); setNotice('Convite aceito. Bem-vindo(a) à sala!'); refreshHome(); }
    else if (message) setNotice(message);
  });
  const pro = !cloud || !home || hasPro(home);
  const visibleNavigation = navigation.filter(item => item.id !== 'admin' || !!home?.account.is_master);
  const shortcutOptions = navigation.filter(item => !['today', 'agenda', 'admin'].includes(item.id) && (cloud || !serverViews.has(item.id)));
  const tabShortcut = shortcutOptions.find(item => item.id === shortcut) ?? shortcutOptions[0];
  useEffect(() => { if (mode === 'demo') return; try { const saved = viewOf(localStorage.getItem(SHORTCUT_KEY) ?? ''); if (names[saved]) setShortcut(saved); setBubbleHidden(localStorage.getItem(BUBBLE_KEY) === '1'); } catch {} }, [mode]);
  const today = dateKey();
  const main = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const visibleNotes = data.notes.filter((note) => (!subjectFilter || (subjectFilter === '__personal' ? !note.subjectId : note.subjectId === subjectFilter)) && (!bookFilter || (bookFilter === '__none' ? !note.notebookId : note.notebookId === bookFilter)) && (!areaFilter || (areaFilter === '__none' ? !itemArea(note) : itemArea(note) === areaFilter)));
  const activeNote = visibleNotes.find((note) => note.id === selectedNote) ?? visibleNotes[0];
  const pending = data.tasks.filter((task) => !task.done);
  const dueToday = data.tasks.filter((task) => task.date === today);
  const priorities = priorityTasks(data, today);
  const upcoming = calendarEntries(data, today, addDays(today, 7)).filter((entry) => !entry.done);
  const doneToday = dueToday.filter((task) => task.done).length;
  const studyMinutes = Math.floor(data.sessions.filter((session) => session.date === today).reduce((sum, session) => sum + session.minutes, 0));
  const progress = dueToday.length ? Math.round(doneToday / dueToday.length * 100) : 0;
  const subject = (id: string) => data.subjects.find((item) => item.id === id);
  const courses = data.courses ?? [];
  const active = activeCourses(data);
  const studyCourse = studiesRoute.kind === 'course' ? courses.find((item) => item.id === studiesRoute.id) : undefined;
  const unitsOf = (item: Pick<Subject, 'courseId'>) => { const course = courseOf(data, item); return course ? courseUnits(course) : unitPresets[0]; };
  const formCourseId = form?.courseId ?? form?.subject?.courseId ?? studyCourse?.id ?? active[0]?.id ?? courses[0]?.id ?? '';
  const studiesNames = active.slice(0, 2).map((item) => item.name).join(' · ');
  const studiesMore = active.length > 2 ? `+${active.length - 2}` : '';
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
  const pageName = view === 'studies' && studyCourse ? studyCourse.name : names[view];
  useEffect(() => { document.title = `${pageName} · Jornada Plena`; }, [pageName]);
  useEffect(() => {
    const initial = viewOf(window.location.hash.slice(1));
    if (initial && initial !== 'today' && names[initial]) setView(initial);
    if (initial === 'studies' && window.history.state?.course) setStudiesRoute({ kind: 'course', id: window.history.state.course });
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.history.state || window.history.state.app !== 'jornada-plena') {
      // Keeps Next's own keys (a first entry without them reloads the page on Back) and the real starting view.
      const start = viewOf(window.location.hash.slice(1));
      window.history.replaceState({ ...window.history.state, app: 'jornada-plena', view: names[start] ? start : 'today' }, '', start === 'studies' ? '#studies' : window.location.hash || window.location.pathname);
    }

    const onPopState = (event: PopStateEvent) => {
      if (form) {
        setForm(null);
        return;
      }
      if (captureOpen) {
        setCaptureOpen(false);
        return;
      }
      if (assistantOpen) {
        setAssistantOpen(false);
        return;
      }
      if (mobileMenu) {
        setMobileMenu(false);
        return;
      }
      if (searchOpen) {
        setSearchOpen(false);
        return;
      }
      if (imported) {
        setImported(null);
        return;
      }

      const targetView = viewOf(event.state?.view || window.location.hash.slice(1) || 'today');
      if (names[targetView]) {
        const course = targetView === 'studies' ? event.state?.course as string | undefined : undefined;
        if (targetView === 'studies') setStudiesRoute(course ? { kind: 'course', id: course } : { kind: 'list' });
        if (targetView === 'studies' && (view !== 'studies' || course !== (studiesRoute.kind === 'course' ? studiesRoute.id : undefined))) requestAnimationFrame(() => main.current?.focus());
        setView(targetView);
      } else {
        setView('today');
        window.history.pushState({ app: 'jornada-plena', view: 'today' }, '', window.location.pathname);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [form, captureOpen, assistantOpen, mobileMenu, searchOpen, imported, view, studiesRoute]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  });

  // A modal's own history entry is replaced (never stacked on) when leaving it for another place.
  function navigate(next: View) {
    const modal = !!window.history.state?.modal;
    if (modal || next !== view || (next === 'studies' && studiesRoute.kind === 'course')) {
      window.history[modal ? 'replaceState' : 'pushState']({ app: 'jornada-plena', view: next }, '', `#${next}`);
    }
    if (next === 'studies') setStudiesRoute({ kind: 'list' });
    setView(next);
    setMobileMenu(false);
    requestAnimationFrame(() => main.current?.focus());
  }

  // The list entry sits below every course entry, so Back from a course always lands on Estudos.
  function openCourse(id: string) {
    const state = window.history.state ?? {};
    const listed = state.view === 'studies' && !state.course;
    if (state.modal && listed) window.history.replaceState({ app: 'jornada-plena', view: 'studies', course: id }, '', '#studies');
    else {
      if (state.modal || !listed) window.history[state.modal ? 'replaceState' : 'pushState']({ app: 'jornada-plena', view: 'studies' }, '', '#studies');
      window.history.pushState({ app: 'jornada-plena', view: 'studies', course: id }, '', '#studies');
    }
    setStudiesRoute({ kind: 'course', id }); setView('studies'); setMobileMenu(false); setSearchOpen(false); setQuery('');
    requestAnimationFrame(() => main.current?.focus());
  }

  function showStudies() {
    if (window.history.state?.course) window.history.back();
    else navigate('studies');
    setStudiesRoute({ kind: 'list' });
    requestAnimationFrame(() => main.current?.focus());
  }

  function handleGoBack() {
    if (form) {
      closeForm();
      return;
    }
    if (mobileMenu) {
      closeMenu();
      return;
    }
    if (searchOpen) {
      closeSearch();
      return;
    }
    if (studyCourse && view === 'studies') showStudies();
    else if (view !== 'today') {
      navigate('today');
    }
  }

  function pushModal(modal: 'menu' | 'form' | 'search' | 'capture' | 'assistant') {
    window.history.pushState({ app: 'jornada-plena', view, ...(view === 'studies' && studiesRoute.kind === 'course' ? { course: studiesRoute.id } : {}), modal }, '', window.location.hash || `#${view}`);
  }
  function popModal(modal: 'menu' | 'form' | 'search' | 'capture' | 'assistant') { if (window.history.state?.modal === modal) window.history.back(); }
  // Swapping one layer for another reuses the same history entry, so Back never needs two taps.
  function swapModal(modal: 'form') { const state = window.history.state ?? {}; if (state.modal) window.history.replaceState({ ...state, modal }, '', window.location.hash || `#${view}`); else pushModal(modal); }

  function openCapture() { if (captureOpen) return; pushModal('capture'); setCaptureOpen(true); }
  function closeCapture() { setCaptureOpen(false); popModal('capture'); }
  function openAssistant() { pushModal('assistant'); setAssistantOpen(true); }
  function closeAssistant() { setAssistantOpen(false); popModal('assistant'); }
  function openNote(id: string) { setCaptureOpen(false); setAssistantOpen(false); setSelectedNote(id); setSubjectFilter(''); setBookFilter(''); setAreaFilter(''); navigate('notes'); }
  function captureTask() { swapModal('form'); setCaptureOpen(false); setForm({ kind: 'task' }); }
  function captureFocus() { setCaptureOpen(false); if (serverViews.has(view)) navigate('today'); else popModal('capture'); setFocusRequest({ id: crypto.randomUUID(), subjectId: '' }); }
  function captureMoney() { setCaptureOpen(false); setFinanceRequest(Date.now()); navigate('finances'); }
  function setBubble(hidden: boolean) {
    setBubbleHidden(hidden);
    if (!demo) try { if (hidden) localStorage.setItem(BUBBLE_KEY, '1'); else localStorage.removeItem(BUBBLE_KEY); } catch {}
    setNotice(hidden ? 'Assistente escondido. Para trazê-lo de volta, abra Assistente no menu.' : 'A bolinha do assistente voltou.');
  }
  function chooseShortcut(next: View) { setShortcut(next); if (!demo) try { localStorage.setItem(SHORTCUT_KEY, next); } catch {} }

  function openMobileMenu() { pushModal('menu'); setMobileMenu(true); }
  function closeMenu() { setMobileMenu(false); popModal('menu'); }

  function openForm(value: FormState) { pushModal('form'); setForm(value); }
  function closeForm() { setForm(null); popModal('form'); }

  function openSearch() { pushModal('search'); setSearchOpen(true); }
  function closeSearch() { setSearchOpen(false); setQuery(''); popModal('search'); }
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
    if (form.kind === 'course') {
      const mode = text('units');
      const units = mode === 'custom' ? { singular: text('unitSingular'), plural: text('unitPlural') } : mode === 'auto' ? undefined : { ...unitPresets[Number(mode)] };
      if (units && (!units.singular || !units.plural)) { setNotice('Informe como chamar as partes no singular e no plural.'); return; }
      if (!form.course && courses.length >= 30) { setNotice('Limite de 30 cursos atingido.'); return; }
      const value: Course = { ...form.course, id: form.course?.id ?? crypto.randomUUID(), name: text('title'), kind: text('courseKind') as Course['kind'], institution: text('institution') || undefined, stage: text('stage') || undefined, color: text('color') as Course['color'], status: text('status') as Course['status'], units };
      if (!update((previous) => ({ ...previous, courses: form.course ? (previous.courses ?? []).map((item) => item.id === value.id ? value : item) : [...(previous.courses ?? []), value] }))) return;
      if (!form.course) { setForm(null); setNotice(''); openCourse(value.id); return; }
    } else if (form.kind === 'subject') {
      const target = courses.find((item) => item.id === text('course'));
      if (!target) { setNotice('Escolha um curso antes de salvar.'); return; }
      const value: Subject = { ...form.subject, professor: text('professor') || undefined, id: form.subject?.id ?? crypto.randomUUID(), name: text('title'), semester: Number(fields.get('semester')) || undefined, color: text('color') as Subject['color'], courseId: target.id };
      if (!update((previous) => ({ ...previous, subjects: form.subject ? previous.subjects.map((item) => item.id === value.id ? value : item) : [...previous.subjects, value] }))) return;
      closeForm(); setNotice(studyCourse && studyCourse.id !== target.id ? `“${value.name}” agora está em ${target.name}.` : ''); return;
    } else if (form.kind === 'task') {
      const value: Task = { ...form.task, time: text('time') || undefined, id: form.task?.id ?? crypto.randomUUID(), title: text('title'), date: text('date'), subjectId: text('subject'), areaId: text('area') || undefined, kind: text('kind') as Task['kind'], done: form.task?.done ?? false, minutes: Number(fields.get('minutes')), projectId: text('project') || undefined };
      if (!update((previous) => ({ ...previous, tasks: form.task ? previous.tasks.map((item) => item.id === value.id ? value : item) : [...previous.tasks, value] }))) return;
    } else {
      const id = crypto.randomUUID();
      if (!update((previous) => ({ ...previous, notes: [{ id, title: text('title'), subjectId: text('subject'), areaId: text('area') || data.notebooks?.find((book) => book.id === text('notebook'))?.areaId || (text('subject') ? 'studies' : ''), notebookId: text('notebook'), content: '<p></p>', updatedAt: new Date().toISOString() }, ...previous.notes] }))) return;
      setSelectedNote(id); setSubjectFilter(''); setBookFilter(''); setAreaFilter(''); navigate('notes');
    }
    closeForm(); setNotice('');
  }
  function addToAgenda(title: string, date: string) {
    return update((previous) => ({ ...previous, tasks: [...previous.tasks, { id: crypto.randomUUID(), title: title.slice(0, 160), subjectId: '', date, kind: 'Trabalho', done: false, minutes: 30 }] }));
  }
  function toggleTask(task: Task) { update((previous) => ({ ...previous, tasks: previous.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) })); }
  function openSubject(item: Subject) { setBookFilter(''); setAreaFilter(''); setSubjectFilter(item.id); setSelectedNote(''); navigate('notes'); }
  function deleteCourse(course: Course) {
    if (!window.confirm(`Excluir o curso ${course.name}? Ele está vazio e você pode cadastrá-lo de novo quando quiser.`)) return;
    if (!update((previous) => ({ ...previous, courses: (previous.courses ?? []).filter((item) => item.id !== course.id) }))) return;
    const state = window.history.state ?? {};
    const steps = (state.modal === 'form' ? 1 : 0) + (state.course === course.id ? 1 : 0);
    setForm(null); setStudiesRoute({ kind: 'list' }); setNotice('Curso excluído.');
    if (steps) window.history.go(-steps);
    requestAnimationFrame(() => main.current?.focus());
  }

  const navContent = <>
    <div className="sidebar-header">
      <button className="brand" onClick={() => navigate('today')} aria-label="Jornada Plena — início">
        <span className="brand-icon"><img src="/brand/simbolo-reduzido.svg" alt="" width={34} height={34} /></span>
        <span className="brand-text">Jornada<span className="brand-psi">Plena<span className="brand-dot">.</span></span></span>
      </button>
      <div className="sidebar-user-card" onClick={() => navigate('settings')} role="button" tabIndex={0} title="Meu perfil e configurações">
        <div className="user-avatar-badge" aria-hidden="true">
          {userProfile.photoUrl ? <img src={userProfile.photoUrl} alt="Avatar" /> : userProfile.name.slice(0,1) || 'P'}
        </div>
        <div className="user-meta-info">
          <strong>{userProfile.name || home?.account.display_name || 'Meu espaço'}</strong>
          {studiesNames ? <span className="user-meta-studies" title={active.map((item) => item.name).join(' · ')}><span>{studiesNames}</span>{studiesMore && <b>{studiesMore}</b>}</span> : <span>{[userProfile.course, userProfile.semester].filter(Boolean).join(' · ') || (home?.account.is_master ? 'Administração' : 'Meu espaço pessoal')}</span>}
        </div>
      </div>
    </div>
    <nav aria-label="Principal">
      {visibleNavigation.map(({ id, label, Icon }) => (
        <button
          key={id}
          aria-current={view === id ? 'page' : undefined}
          className={`nav-item ${view === id ? 'active' : ''}`}
          onClick={() => navigate(id)}
        >
          <Icon aria-hidden="true" size={18} />
          <span>{label}</span>
          {id === 'assistant' && <span className="nav-chip">Regras</span>}
          {proViews.has(id) && !pro && <span className="nav-chip">Pro</span>}
          {id === 'community' && !!home?.to_review.length && <span className="nav-chip">{home.to_review.length}</span>}
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

  const taskRow = (task: Task) => {
    const taskProject = task.projectId ? data.projects?.find((p) => p.id === task.projectId) : undefined;
    return <li className={`task-row ${task.done ? 'is-done' : ''}`} key={task.id}>
      <label className="task-checkbox"><input type="checkbox" checked={task.done} disabled={blocked} onChange={() => toggleTask(task)} aria-label={`Concluir: ${task.title}`} /><span className="check-visual"><Check size={13} aria-hidden="true" /></span></label>
      <button className="task-description" onClick={() => openForm({ kind: 'task', task })}><strong>{task.title}</strong><span><i className={`color-dot ${subject(task.subjectId)?.color ?? 'sage'}`} />{areaName(data, task)}{subject(task.subjectId) ? ` · ${subject(task.subjectId)?.name}` : ''}{taskProject ? ` · Projeto: ${taskProject.title}` : ''}{task.date < today && !task.done && <em>Em atraso</em>}</span></button>
      <span className="task-duration"><Clock3 size={12} aria-hidden="true" />{task.minutes} min</span>
    </li>;
  };

  const subjectCard = (item: Subject) => <article className={`subject-card ${item.color}`} key={item.id}>
    <div className="subject-card-top">
      <span className={`subject-symbol ${item.color}`}><BookOpen size={18} aria-hidden="true" /></span>
      {item.semester && <span className={`subject-sem-tag ${item.color}`}>{item.semester}º sem.</span>}
      <button className="icon-button" aria-label={`Editar ${unitsOf(item).singular}: ${item.name}`} onClick={() => openForm({ kind: 'subject', subject: item })}>
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
          title={`Focar 25 min em ${item.name}`}
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

  const courseCard = (course: Course) => <article className={`subject-card course-card ${course.color}`} key={course.id}>
    <div className="subject-card-top">
      <span className={`subject-symbol ${course.color}`}><GraduationCap size={18} aria-hidden="true" /></span>
      <span className={`subject-sem-tag ${course.color}`}>{courseKindLabels[course.kind]}</span>
      {course.status !== 'active' && <span className="tiny-tag">{courseStatusLabels[course.status]}</span>}
      <button className="icon-button" aria-label={`Editar curso: ${course.name}`} disabled={blocked} onClick={() => openForm({ kind: 'course', course })}>
        <MoreHorizontal size={17} aria-hidden="true" />
      </button>
    </div>
    <button className="subject-title" onClick={() => openCourse(course.id)}>
      <h3>{course.name}</h3>
      <span>{[course.institution, course.stage].filter(Boolean).join(' · ') || 'Sem instituição ou etapa informada'}</span>
    </button>
    <div className="subject-card-footer">
      <span><BookOpen size={12} aria-hidden="true" />{unitCount(course, subjectsOfCourse(data, course.id).length)}</span>
      <ArrowUpRight size={17} aria-hidden="true" />
    </div>
  </article>;

  return <div className="app-shell">
    <a className="skip-link" href="#main">Pular para o conteúdo</a>
    <aside className="sidebar">{navContent}</aside>
    {mobileMenu && <Modal title="Seu espaço" onClose={closeMenu}><div className="mobile-navigation">{navContent}</div><label className="tabbar-shortcut" htmlFor="tabbar-shortcut">Botão da barra, ao lado do Registrar<select id="tabbar-shortcut" value={tabShortcut.id} onChange={(event) => chooseShortcut(event.target.value as View)}>{shortcutOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></Modal>}
    <div className="app-body">
      <header className="topbar">
        <div className="breadcrumb">
          <button className="icon-button mobile-menu-button" aria-label="Abrir navegação" onClick={openMobileMenu}>
            <Menu size={20} aria-hidden="true" />
          </button>
          {view !== 'today' && (
            <button
              type="button"
              className="topbar-back-button"
              aria-label={view === 'studies' && studyCourse ? 'Voltar para Estudos' : 'Voltar para início'}
              onClick={handleGoBack}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Voltar</span>
            </button>
          )}
          <span>Meu espaço</span>
          <ChevronRight aria-hidden="true" size={14} />
          {view === 'studies' && studyCourse && <><span><button type="button" className="cm-crumb" onClick={showStudies}>Estudos</button></span><ChevronRight aria-hidden="true" size={14} /></>}
          <strong>{pageName}</strong>
        </div>
        <div className="topbar-actions">
          <button type="button" className="button primary topbar-capture" disabled={!ready} onClick={openCapture}><img src="/brand/simbolo-reduzido.svg" alt="" width={22} height={22} />Registrar</button>
          <button className="search-trigger" aria-label="Buscar no meu espaço" onClick={openSearch}>
            <Search size={16} aria-hidden="true" />
            <span>Buscar no meu espaço</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button className="icon-button" aria-label="Ajuda e configurações" onClick={() => navigate('settings')}>
            <CircleHelp size={18} aria-hidden="true" />
          </button>
          <button className="avatar small" onClick={() => navigate('settings')} aria-label="Meu perfil e configurações">
            {userProfile.photoUrl ? <img src={userProfile.photoUrl} alt="Avatar" /> : userProfile.name.slice(0,1) || 'P'}
          </button>
        </div>
      </header>

      <main id="main" tabIndex={-1} ref={main} className="main-content">
        <div className={`mode-banner ${demo ? 'demo-banner' : ''}`}>
          <span><CloudOff size={14} aria-hidden="true" />{demo ? 'Demonstração — dados fictícios. Não insira informações pessoais.' : mode === 'local' ? storageNotice : 'Espaço pessoal · privado, visível só para você.'}</span>
          {demo && <button onClick={() => window.location.reload()} disabled={!ready}>Restaurar exemplos <ArrowRight size={13} aria-hidden="true" /></button>}
        </div>
        {error && <div className="error-banner" role="alert">{error}{ready && <button className="text-button" onClick={() => download(data)}>Exportar esta versão</button>}<button className="text-button" onClick={() => window.location.reload()}>Recarregar</button></div>}

        <div className="page-heading">
          <div>
            <span className="eyebrow">{ready && view === 'today' ? formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Sua vida, do seu jeito'}</span>
            <h1>{view === 'today' ? <>Um novo dia, <span>no seu ritmo.</span></> : pageName}</h1>
            <p>{view === 'studies' && studyCourse ? [courseKindLabels[studyCourse.kind], studyCourse.institution, studyCourse.stage].filter(Boolean).join(' · ') : view === 'today' ? 'Você não precisa dar conta de tudo. Vamos cuidar do próximo passo.' : view === 'notes' ? 'Um lugar para guardar ideias e fazer conexões.' : view === 'studies' ? 'Graduação, pós, cursos livres e extensões — cada um no seu lugar.' : view === 'agenda' ? 'Um pouco de organização abre espaço para o que importa.' : view === 'planning' ? 'Metas apontam a direção e projetos organizam os passos práticos.' : view === 'finances' ? 'Controle seu orçamento, mensalidades e despesas com clareza.' : view === 'routine' ? 'Defina seus blocos do dia e mantenha hábitos consistentes.' : view === 'assistant' ? 'Inteligência como apoio. Você no controle.' : view === 'community' ? 'Conectividade com segurança: cada grupo vê só o que é seu.' : view === 'contacts' ? 'Sua agenda privada. Ninguém mais vê.' : view === 'admin' ? 'Pessoas, papéis, planos e estrutura, com histórico de tudo.' : 'Suas preferências, seus dados e suas conexões.'}</p>
          </div>
          <div className="heading-actions-row">
            {view === 'today' && <>
              <button className="button outline" onClick={() => openForm({ kind: 'task' })}><Plus size={16} aria-hidden="true" />Novo compromisso</button>
              <button className="button primary" onClick={() => openForm({ kind: 'note' })}><FileText size={16} aria-hidden="true" />Nova anotação</button>
            </>}
            {ready && view === 'studies' && !studyCourse && <button className="button primary" disabled={blocked || courses.length >= 30} onClick={() => openForm({ kind: 'course' })}><Plus size={16} aria-hidden="true" />Novo curso</button>}
          </div>
        </div>

        {!ready && !error && <div className="loading-panel" role="status">Preparando seu espaço…</div>}

        {ready && <>
          {!serverViews.has(view) && <FocusTimer data={data} disabled={blocked} status={status} demo={demo} request={focusRequest} update={update} />}
          {view === 'today' && <>
            {/* 4 BENTO METRIC CARDS (BROKER SAAS STYLE) */}
            <div className="bento-metric-row">
              <button type="button" className="bento-metric-card" onClick={() => navigate('focus')}>
                <span className="metric-header">
                  <span className="metric-icon lavender"><Clock3 size={18} aria-hidden="true" /></span>
                  <span className="metric-label">Foco Registrado</span><ArrowRight className="metric-go" size={14} aria-hidden="true" />
                </span>
                <span className="metric-value">{studyMinutes}<small> min</small></span>
                <span className="metric-sub">{studyMinutes > 0 ? 'Foco acumulado hoje' : 'Pronto para começar'}</span>
              </button>
              <button type="button" className="bento-metric-card" onClick={() => navigate('agenda')}>
                <span className="metric-header">
                  <span className="metric-icon sage"><CheckCheck size={18} aria-hidden="true" /></span>
                  <span className="metric-label">Tarefas de Hoje</span><ArrowRight className="metric-go" size={14} aria-hidden="true" />
                </span>
                <span className="metric-value">{doneToday}<small> / {dueToday.length}</small></span>
                <span className="metric-sub">{dueToday.length === 0 ? 'Sem prazos para hoje' : `${progress}% concluído`}</span>
              </button>
              <button type="button" className="bento-metric-card" onClick={() => navigate('studies')}>
                <span className="metric-header">
                  <span className="metric-icon blue"><GraduationCap size={18} aria-hidden="true" /></span>
                  <span className="metric-label">Estudos ativos</span><ArrowRight className="metric-go" size={14} aria-hidden="true" />
                </span>
                <span className="metric-value">{active.length}</span>
                <span className="metric-sub metric-clamp" title={active.map((item) => item.name).join(' · ') || undefined}>{studiesNames ? [studiesNames, studiesMore].filter(Boolean).join(' ') : courses.length ? 'Nenhum curso em andamento' : 'Cadastre seu primeiro curso'}</span>
              </button>
              <button type="button" className="bento-metric-card" onClick={() => navigate('notes')}>
                <span className="metric-header">
                  <span className="metric-icon sand"><FileText size={18} aria-hidden="true" /></span>
                  <span className="metric-label">Captura Rápida</span><ArrowRight className="metric-go" size={14} aria-hidden="true" />
                </span>
                <span className="metric-value">{data.notes.filter((n) => !n.areaId && !n.subjectId).length}</span>
                <span className="metric-sub">Ideias para triagem</span>
              </button>
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
                    <button className="icon-button" aria-label="Adicionar tarefa" disabled={blocked} onClick={() => openForm({ kind: 'task' })}><Plus size={18} aria-hidden="true" /></button>
                  </div>
                  <ul className="task-list" role="list">{priorities.map(taskRow)}{dueToday.filter((task) => task.done).slice(0, 1).map(taskRow)}</ul>
                  {!priorities.length && !doneToday && <div className="empty-inline"><CheckCheck size={22} aria-hidden="true" /><p>Nenhuma prioridade pendente por aqui.<br /><button className="text-button" onClick={() => openForm({ kind: 'task' })}>Escolher meu próximo passo</button></p></div>}
                  <div className="panel-footer"><span>{pending.length} {pending.length === 1 ? 'tarefa pendente' : 'tarefas pendentes'} no seu espaço</span><button className="text-button" onClick={() => navigate('agenda')}>Ver minha agenda <ArrowRight size={13} aria-hidden="true" /></button></div>
                </section>

                {/* STUDY PLANNER COMPACT */}
                <StudyPlanner data={data} update={update} blocked={blocked} compact onAgenda={() => navigate('agenda')} />

                {/* ESTUDOS */}
                <section className="subjects-section">
                  <div className="section-heading">
                    <h2>Meus universos de estudo</h2>
                    <button className="text-button" onClick={() => navigate('studies')}>Ver estudos <ArrowRight size={13} aria-hidden="true" /></button>
                  </div>
                  <div className="subject-grid">
                    {active.slice(0, 3).map(courseCard)}
                    {!active.length && <button className="add-subject-card" disabled={blocked || courses.length >= 30} onClick={() => openForm({ kind: 'course' })}><Plus aria-hidden="true" />{courses.length ? 'Cadastrar outro curso' : 'Cadastrar meu primeiro curso'}</button>}
                  </div>
                </section>
              </div>

              <aside className="dashboard-secondary">
                {cloud && home && (home.my_parts.length > 0 || home.to_review.length > 0) && <section className="panel cm-today">
                  <div className="section-heading"><h2><PenLine size={16} aria-hidden="true" /> Trabalhos em grupo</h2><button className="text-button" onClick={() => { setCommunityRoute({ kind: 'list' }); navigate('community'); }}>Abrir <ArrowRight size={13} aria-hidden="true" /></button></div>
                  <ul className="cm-todo">
                    {home.my_parts.slice(0, 3).map(part => <li key={part.id}><button onClick={() => { setCommunityRoute({ kind: 'work', id: part.assignment_id }); navigate('community'); }}><span className={`cm-status ${part.status}`}>{statusLabels[part.status]}</span><strong>{part.title}</strong><small>{part.assignment_title}{part.due_date ? ` · ${formatShortDay(part.due_date)}` : ''}</small></button></li>)}
                    {home.to_review.slice(0, 3).map(part => <li key={part.id}><button onClick={() => { setCommunityRoute({ kind: 'work', id: part.assignment_id }); navigate('community'); }}><span className="cm-status submitted">Revisar</span><strong>{part.title}</strong><small>{part.assignment_title}</small></button></li>)}
                  </ul>
                </section>}
                {cloud && upcomingBirthdays(contacts, today, 7).length > 0 && <section className="panel cm-today">
                  <div className="section-heading"><h2><Cake size={16} aria-hidden="true" /> Aniversários da semana</h2></div>
                  <ul className="cm-todo">{upcomingBirthdays(contacts, today, 7).map(({ contact, inDays }) => <li key={contact.id}><button onClick={() => navigate('contacts')}><span className="cm-status approved">{inDays === 0 ? 'Hoje!' : inDays === 1 ? 'Amanhã' : `em ${inDays} dias`}</span><strong>{contact.name}</strong><small>Mande um parabéns 🎉</small></button></li>)}</ul>
                </section>}
                {/* SEMANA */}
                <section className="panel week-card">
                  <div className="section-heading"><h2>Sua semana</h2><CalendarDays size={16} aria-hidden="true" /></div>
                  <div className="week-strip">{Array.from({ length: 7 }, (_, index) => { const day = addDays(today, index); return <button key={day} className={day === today ? 'today' : ''} aria-label={`Abrir agenda de ${formatDate(day)}`} onClick={() => { setAgendaDate(day); navigate('agenda'); }}><span>{formatDate(day, { weekday: 'short' }).replace('.', '')}</span><strong>{new Date(`${day}T12:00:00`).getDate()}</strong><i className={upcoming.some((entry) => entry.date === day) ? 'has-task' : ''} /></button>; })}</div>
                  <h3 className="small-heading">Vem por aí</h3>
                  <div className="upcoming-list">{upcoming.slice(0, 3).map((task) => <button key={task.id} className="upcoming-item" onClick={() => { setAgendaDate(task.date); navigate('agenda'); }}><span className={`date-block ${subject(task.subjectId)?.color ?? 'sage'}`}><strong>{new Date(`${task.date}T12:00:00`).getDate()}</strong><small>{formatDate(task.date, { month: 'short' }).replace('.', '')}</small></span><span><strong>{task.title}</strong><small>{task.time ?? 'Sem horário'} · {task.kind}</small></span></button>)}{!upcoming.length && <p className="muted">Sua semana tem espaço para novos planos.</p>}</div>
                  <button className="text-button full-width" onClick={() => navigate('agenda')}>Abrir agenda <ArrowRight size={13} aria-hidden="true" /></button>
                </section>


                {/* PROGRESS RING */}
                <section className="panel daily-progress">
                  <span className="progress-ring" style={{ '--progress': `${progress}%` } as React.CSSProperties}><span>{progress}%</span></span>
                  <div><h2>Ritmo do dia</h2><p>{doneToday ? `${doneToday} ${doneToday === 1 ? 'passo concluído' : 'passos concluídos'} hoje. Bom trabalho!` : 'Seu progresso começa com uma pequena escolha.'}</p></div>
                </section>
              </aside>
            </div>
          </>}

          {view === 'studies' && (studyCourse ? (
            <section className="cm-page">
              <div className="cm-crumbs"><button className="text-button" onClick={showStudies}><ArrowLeft size={14} aria-hidden="true" /> Todos os estudos</button></div>
              <div className={`cm-hero course-bar ${studyCourse.color}`}>
                <div>
                  <span className="eyebrow">Curso{studyCourse.status !== 'active' ? ` · ${courseStatusLabels[studyCourse.status].toLowerCase()}` : ''}</span>
                  <p>{unitCount(studyCourse, subjectsOfCourse(data, studyCourse.id).length)}</p>
                </div>
                <div className="button-row"><button className="button outline" disabled={blocked} onClick={() => openForm({ kind: 'course', course: studyCourse })}><Settings2 size={16} aria-hidden="true" />Editar curso</button></div>
              </div>
              <div className="subject-grid expanded">
                {subjectsOfCourse(data, studyCourse.id).map(subjectCard)}
                <button className="add-subject-card" disabled={blocked || data.subjects.length >= 100} onClick={() => openForm({ kind: 'subject', courseId: studyCourse.id })}>
                  <Plus aria-hidden="true" /> Adicionar {courseUnits(studyCourse).singular}
                </button>
              </div>
            </section>
          ) : (
            <section>
              {courses.length > 0 && <div className="section-heading"><h2>Em andamento</h2><span className="muted">{active.length === 1 ? '1 curso' : `${active.length} cursos`}</span></div>}
              <div className="subject-grid expanded">
                {active.map(courseCard)}
                <button className="add-subject-card" disabled={blocked || courses.length >= 30} onClick={() => openForm({ kind: 'course' })}>
                  <Plus aria-hidden="true" /> {courses.length ? 'Adicionar outro curso' : 'Cadastrar meu primeiro curso'}
                </button>
              </div>
              {courses.length > active.length && <>
                <div className="section-heading studies-secondary"><h2>Pausados e concluídos</h2></div>
                <div className="subject-grid expanded">{courses.filter((item) => item.status !== 'active').map(courseCard)}</div>
              </>}
            </section>
          ))}

          {view === 'notes' && <section className="notebook-layout"><aside className="note-index"><MobileDisclosure label="Cadernos, filtros e anotações"><div className="section-heading"><h2>Anotações</h2><button className="icon-button" disabled={blocked} aria-label="Nova anotação" onClick={() => openForm({ kind: 'note' })}><Plus size={19} aria-hidden="true" /></button></div><label className="sr-only" htmlFor="note-filter">Filtrar anotações por matéria</label><select id="note-filter" value={subjectFilter} onChange={(event) => { setSubjectFilter(event.target.value); setSelectedNote(''); }}><option value="">Todas as matérias e pessoais</option><option value="__personal">Pessoais · sem matéria</option><SubjectOptions data={data} /></select><div className="life-fields"><label htmlFor="note-area-filter">Filtrar área</label><select id="note-area-filter" value={areaFilter} onChange={(event) => { setAreaFilter(event.target.value); setSelectedNote(''); }}><option value="">Todas as áreas</option><option value="__none">Sem área</option>{lifeAreas(data).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><label htmlFor="notebook-filter">Filtrar caderno</label><select id="notebook-filter" value={bookFilter} onChange={(event) => { setBookFilter(event.target.value); setSelectedNote(''); }}><option value="">Todos os cadernos</option><option value="__none">Sem caderno</option>{data.notebooks?.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select><button className="text-button" onClick={() => navigate('settings')}>Gerenciar áreas e cadernos</button></div><div className="note-list">{visibleNotes.map((note) => <button key={note.id} className={`note-list-item ${activeNote?.id === note.id ? 'selected' : ''}`} onClick={() => setSelectedNote(note.id)}><FileText size={16} aria-hidden="true" /><span><strong>{note.title || 'Sem título'}</strong><small>{new Date(note.updatedAt).toLocaleDateString('pt-BR')}</small></span></button>)}</div></MobileDisclosure></aside><div className="note-paper">{activeNote ? <><div className="note-meta"><button type="button" className="note-return-btn" onClick={handleGoBack} aria-label="Voltar para início"><ArrowLeft size={13} aria-hidden="true" /> Voltar</button><span><LockKeyhole size={13} aria-hidden="true" />{demo ? 'Exemplo temporário' : mode === 'local' ? 'Armazenamento local' : 'Anotação pessoal'}</span><span role="status">{status}</span></div><label htmlFor="note-title" className="sr-only">Título da anotação</label><input id="note-title" className="note-title-input" value={activeNote.title} maxLength={160} disabled={blocked} onChange={(event) => editNote({ title: event.target.value })} placeholder="Sem título" /><MobileDisclosure label="Organizar esta anotação"><label className="sr-only" htmlFor="note-subject">Matéria da anotação</label><select id="note-subject" className="note-subject-select" value={activeNote.subjectId} disabled={blocked} onChange={(event) => editNote({ subjectId: event.target.value })}><option value="">Pessoal · sem matéria</option><SubjectOptions data={data} /></select><NoteOrganization data={data} note={activeNote} blocked={blocked} onChange={editNote} /></MobileDisclosure><NoteEditor demo={demo} noteId={activeNote.id} cloud={mode === 'cloud'} key={activeNote.id} content={activeNote.content} disabled={blocked} onChange={(content) => editNote({ content })} /></> : <div className="empty-state"><FileText size={40} aria-hidden="true" /><h2>Sua próxima ideia mora aqui.</h2><p>Crie uma anotação para começar a escrever.</p><button className="button primary" disabled={blocked} onClick={() => openForm({ kind: 'note' })}>Criar anotação <Plus size={16} aria-hidden="true" /></button></div>}</div></section>}

          {view === 'community' && (cloud && home ? <CommunityPanel home={home} route={communityRoute} onRoute={route => { setCommunityRoute(route); requestAnimationFrame(() => main.current?.scrollIntoView({ block: 'start' })); }} refreshHome={refreshHome} onAddToAgenda={addToAgenda} /> : <ServerOnly view="community" cloud={cloud} error={homeError} />)}
          {view === 'contacts' && (cloud && home ? <ContactsPanel /> : <ServerOnly view="contacts" cloud={cloud} error={homeError} />)}
          {view === 'admin' && (cloud && home?.account.is_master ? <AdminPanel me={home.account.user_id} onOpenSpace={id => { setCommunityRoute({ kind: 'space', id }); navigate('community'); }} /> : <ServerOnly view="admin" cloud={cloud} error={homeError} />)}

          {view === 'agenda' && <AcademicCalendar data={data} date={agendaDate} onDateChange={setAgendaDate} update={update} blocked={blocked} onNew={(date) => { setAgendaDate(date); openForm({ kind: 'task' }); }} onEdit={(task) => openForm({ kind: 'task', task })} />}

          {view === 'planning' && (pro ? <PlanningPanel data={data} blocked={blocked} update={update} /> : <ProOnly />)}

          {view === 'finances' && (pro ? <FinancialController addRequest={financeRequest} data={data} update={update} blocked={blocked} /> : <ProOnly />)}

          {view === 'routine' && (pro ? <DailyRoutine data={data} update={update} blocked={blocked} /> : <ProOnly />)}

          {view === 'focus' && <FocusHistory data={data} blocked={blocked} update={update} />}
          {view === 'flashcards' && <FlashcardsDeck data={data} blocked={blocked} update={update} />}

          {view === 'assistant' && <>
            <section className="panel assistant-inline" aria-labelledby="assistant-inline-title">
              <div className="section-heading"><h2 id="assistant-inline-title">Converse com o assistente</h2>{bubbleHidden && <button type="button" className="text-button desktop-only" onClick={() => setBubble(false)}>Mostrar a bolinha do assistente</button>}</div>
              <AssistantChat cloud={cloud} blocked={blocked} demo={demo} update={update} ensureSaved={ensureSaved} messages={assistantMessages} setMessages={setAssistantMessages} onOpenNote={openNote} />
            </section>
            <StudyPlanner data={data} update={update} blocked={blocked} onAgenda={() => navigate('agenda')} />
          </>}

          {view === 'settings' && <>
            {cloud && home && <AccountSettings home={home} refreshHome={refreshHome} />}
            {!demo && <LegacyImport data={data} update={update} blocked={blocked} />}
            {!demo && <input className="sr-only" tabIndex={-1} ref={fileInput} type="file" accept=".json,application/json" aria-label="Selecionar backup JSON" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { if (file.size > 2_000_000) throw new Error(); setImported(parseWorkspace(await file.text())); } catch { setNotice('Backup inválido ou maior que 2 MB. Nada foi alterado.'); } }} />}
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
      <nav className="mobile-tabbar" aria-label="Atalhos mobile">
        {[navigation[0], navigation.find((item) => item.id === 'agenda')!].map(({ id, label, Icon }) => <button key={id} type="button" aria-label={`Ir para ${label}`} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={21} aria-hidden="true" /><span>{tabLabel(id, label)}</span></button>)}
        <button type="button" className="tabbar-center" aria-haspopup="dialog" disabled={!ready} onClick={openCapture}><span className="tabbar-center-badge"><img src="/brand/simbolo.svg" alt="" width={56} height={56} /></span><span>Registrar</span></button>
        {[tabShortcut].map(({ id, label, Icon }) => <button key={id} type="button" aria-label={`Ir para ${label}`} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={21} aria-hidden="true" /><span>{tabLabel(id, label)}</span></button>)}
        <button type="button" aria-label="Ver todas as áreas" aria-expanded={mobileMenu} onClick={openMobileMenu}><Menu size={21} aria-hidden="true" /><span>Mais</span></button>
      </nav>
    </div>

    {form && <Modal title={form.kind === 'course' ? form.course ? 'Editar curso' : 'Novo curso' : form.kind === 'subject' ? `${form.subject ? 'Editar' : 'Adicionar'} ${unitsOf({ courseId: formCourseId }).singular}` : form.kind === 'task' ? form.task ? 'Editar compromisso' : 'Um novo passo' : 'Capture uma ideia'} onClose={closeForm}><form onSubmit={submitForm} className="entry-form"><label htmlFor="entry-title">{form.kind === 'subject' || form.kind === 'course' ? 'Nome' : form.kind === 'task' ? 'O que você quer fazer?' : 'Título da anotação'}</label><input id="entry-title" name="title" required autoFocus maxLength={form.kind === 'subject' || form.kind === 'course' ? 100 : 160} defaultValue={form.course?.name ?? form.subject?.name ?? form.task?.title ?? ''} placeholder={form.kind === 'course' ? 'Ex.: Psicologia, Hipnose clínica, Pós em Pedagogia' : form.kind === 'subject' ? 'Ex.: Psicologia Social, Fundamentos, Módulo 1' : form.kind === 'task' ? 'Um pequeno passo já conta' : 'Dê um nome à sua ideia'} />{form.kind === 'course' ? <CourseFields course={form.course} color={colors.find((color) => !courses.some((item) => item.color === color)) ?? 'sage'} /> : form.kind === 'subject' ? <><label htmlFor="entry-course">Curso</label><select id="entry-course" name="course" required value={formCourseId} onChange={(event) => setForm({ ...form, courseId: event.target.value })}>{courses.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status !== 'active' ? ` · ${courseStatusLabels[item.status].toLowerCase()}` : ''}</option>)}</select><label htmlFor="entry-professor">Professor(a) · opcional</label><input id="entry-professor" name="professor" maxLength={100} defaultValue={form.subject?.professor ?? ''} /><label htmlFor="entry-semester">Semestre · opcional</label><input id="entry-semester" name="semester" type="number" min={1} max={20} defaultValue={form.subject?.semester ?? ''} /><ColorOptions legend="Cor" value={form.subject?.color ?? 'sage'} /></> : <><label htmlFor="entry-area">Área da vida · opcional</label><AreaSelect id="entry-area" name="area" data={data} value={form.task ? itemArea(form.task) : subjectFilter && subjectFilter !== '__personal' ? 'studies' : ''} />{form.kind === 'note' && <><label htmlFor="entry-notebook">Caderno · opcional</label><select id="entry-notebook" name="notebook" defaultValue={bookFilter === '__none' ? '' : bookFilter}><option value="">Sem caderno</option>{data.notebooks?.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select></>}<label htmlFor="entry-subject">Matéria · opcional</label><select id="entry-subject" name="subject" defaultValue={form.task?.subjectId ?? (subjectFilter === '__personal' ? '' : subjectFilter)}><option value="">Pessoal · sem matéria</option><SubjectOptions data={data} /></select>{form.kind === 'task' && <><label htmlFor="entry-project">Projeto · opcional</label><select id="entry-project" name="project" defaultValue={form.task?.projectId ?? ''}><option value="">Sem projeto</option>{data.projects?.filter((p) => p.status !== 'archived' || p.id === form.task?.projectId).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select><div className="form-grid"><div><label htmlFor="entry-date">Data</label><input id="entry-date" name="date" type="date" required defaultValue={form.task?.date ?? (view === 'agenda' ? agendaDate : today)} /></div><div><label htmlFor="entry-minutes">Tempo estimado (min)</label><input id="entry-minutes" name="minutes" type="number" min={5} max={240} required defaultValue={form.task?.minutes ?? 25} /></div></div><label htmlFor="entry-time">Horário · opcional</label><input id="entry-time" name="time" type="time" defaultValue={form.task?.time ?? ''} /><label htmlFor="entry-kind">Tipo</label><select id="entry-kind" name="kind" defaultValue={form.task?.kind ?? 'Compromisso'}>{taskKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></>}</>}{form.course && subjectsOfCourse(data, form.course.id).length > 0 && <p id="course-delete-help" className="form-hint">Para excluir, primeiro leve as partes deste curso ({courseUnits(form.course).plural}) para outro curso, pelo campo Curso de cada uma.</p>}<div className="form-footer">{form.course && <button type="button" className="button outline cm-danger" disabled={blocked || subjectsOfCourse(data, form.course.id).length > 0} aria-describedby={subjectsOfCourse(data, form.course.id).length ? 'course-delete-help' : undefined} onClick={() => deleteCourse(form.course!)}>Excluir curso</button>}<button type="button" className="button outline" onClick={closeForm}>Cancelar</button><button className="button primary" disabled={blocked}>Salvar <Check size={17} aria-hidden="true" /></button></div></form></Modal>}

    {searchOpen && <Modal title="Encontre no seu espaço" onClose={closeSearch}><label className="sr-only" htmlFor="workspace-search">Buscar cursos, matérias, anotações e tarefas</label><input id="workspace-search" className="search-input" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Um curso, uma matéria, uma ideia, um compromisso…" /><div className="search-results">{!query.trim() ? <p className="muted">Digite para buscar. Nada é enviado a serviços externos.</p> : <>{courses.filter((item) => item.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).map((item) => <button key={item.id} onClick={() => openCourse(item.id)}><GraduationCap size={17} aria-hidden="true" /><span>{item.name}<small>Curso</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}{data.subjects.filter((item) => item.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).map((item) => <button key={item.id} onClick={() => { openSubject(item); setSearchOpen(false); }}><BookOpen size={17} aria-hidden="true" /><span>{item.name}<small>{capitalize(unitsOf(item).singular)}{courseOf(data, item) ? ` · ${courseOf(data, item)!.name}` : ''}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}{data.notes.filter((item) => `${item.title} ${item.content.replace(/<[^>]*>/g, ' ')}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).map((item) => <button key={item.id} onClick={() => { setSelectedNote(item.id); setSubjectFilter(''); setBookFilter(''); setAreaFilter(''); navigate('notes'); setSearchOpen(false); }}><FileText size={17} aria-hidden="true" /><span>{item.title}<small>Anotação</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}{data.tasks.filter((item) => item.title.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).map((item) => <button key={item.id} onClick={() => { setAgendaDate(item.date); navigate('agenda'); setSearchOpen(false); }}><CalendarDays size={17} aria-hidden="true" /><span>{item.title}<small>{formatDate(item.date)}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}<p className="search-end">Fim dos resultados para “{query}”.</p></>}</div></Modal>}
    {!demo && imported && <Modal title="Restaurar este backup?" onClose={() => setImported(null)}><p>Ele contém {imported.subjects.length} matérias, {imported.notes.length} anotações e {imported.tasks.length} compromissos. Isso substituirá os dados deste espaço.</p><p>Exporte uma cópia atual antes de continuar.</p><div className="button-row"><button className="button outline" onClick={() => download(data)}>Exportar versão atual</button><button className="button primary" disabled={blocked} onClick={() => { update(() => ensureCourses(imported)); setImported(null); setSelectedNote(''); setSubjectFilter(''); setBookFilter(''); setAreaFilter(''); setNotice('Restauração enviada. Confira o indicador de salvamento antes de sair.'); }}>Confirmar restauração</button></div></Modal>}
    {captureOpen && <CaptureSheet data={data} blocked={blocked} status={status} cloud={cloud} demo={demo} update={update} ensureSaved={ensureSaved} onClose={closeCapture} onOpenNote={openNote} onTask={captureTask} onFocus={captureFocus} onMoney={captureMoney} />}
    {ready && !bubbleHidden && !(cloud && home && !acceptedTerms(home)) && <AssistantBubble persist={!demo} onOpen={openAssistant} onHide={() => setBubble(true)} />}
    {assistantOpen && <AssistantPanel cloud={cloud} blocked={blocked} demo={demo} update={update} ensureSaved={ensureSaved} messages={assistantMessages} setMessages={setAssistantMessages} onClose={closeAssistant} onOpenNote={openNote} />}
    {cloud && home && !acceptedTerms(home) && <ConsentGate onAccepted={refreshHome} />}
    {notice && <div className="toast" role="status"><Check size={16} aria-hidden="true" /><span>{notice}</span><button className="icon-button" aria-label="Dispensar aviso" onClick={() => setNotice('')}><X size={16} aria-hidden="true" /></button></div>}
  </div>;
}

function ServerOnly({ view, cloud, error }: { view: 'community' | 'contacts' | 'admin'; cloud: boolean; error: string }) {
  if (cloud) return error ? <div className="error-banner" role="alert">{error}</div> : <p role="status" className="loading-panel">Carregando sua conta…</p>;
  const text = view === 'community'
    ? 'Salas, grupos e trabalhos em grupo funcionam com a conta conectada: cada pessoa entrega a sua parte e o sistema monta o documento final padronizado.'
    : view === 'contacts' ? 'Sua agenda privada de contatos, com lembrete de aniversários, fica disponível ao entrar com sua conta.'
    : 'O painel de administração é exclusivo da conta master.';
  return <div className="empty-state"><Users size={40} aria-hidden="true" /><h2>{names[view]}</h2><p>{text}</p></div>;
}

function ProOnly() {
  return <div className="empty-state"><Sparkles size={40} aria-hidden="true" /><h2>Este bloco faz parte do Pro</h2>
    <p>No plano Acadêmico você usa tudo dos seus estudos: cursos, matérias, caderno, agenda, foco, flashcards, salas e trabalhos em grupo.<br />Finanças, rotina e metas completam a sua Jornada Plena no Pro.</p></div>;
}
