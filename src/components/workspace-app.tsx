'use client';

import dynamic from 'next/dynamic';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertCircle, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Cake, CalendarDays, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, CloudOff, Compass, Contact, FileText, GraduationCap, Layers, LayoutDashboard, LockKeyhole, Menu, MoreHorizontal, PenLine, Plus, Search, Settings2, ShieldCheck, Sparkles, Sprout, Target, Upload, Users, Wallet, X } from 'lucide-react';
import { addDays, colors, taskKinds, dateKey, formatDate, parseWorkspace, priorityTasks, type Course, type Note, type Subject, type Task, type Workspace } from '@/lib/workspace';
import { activeCourses, capitalize, courseKindLabels, courseOf, courseStatusLabels, courseUnits, ensureCourses, subjectsOfCourse, unitCount, unitPresets } from '@/lib/courses';
import { calendarEntries, weekdays } from '@/lib/academic';
import { greeting, monthCycles, todayAgenda, todayAlerts, waitingSince, type TodayAlert } from '@/lib/today';
import type { WaitingRequest } from '@/lib/assistant-jobs';
import { isUnorganized } from '@/lib/capture';
import { linkAssignment, moveAgendaTask, type AgendaAssignment, type AgendaLink } from '@/lib/assignment-agenda';
import { useWorkspace } from './use-workspace';
import { Modal } from './modal';
import { MobileDisclosure } from './mobile-disclosure';
import { FocusTimer } from './focus-timer';
import { FocusHistory } from './focus-history';
import { CaptureSheet } from './capture-sheet';
import { readCaptureLink } from '@/lib/capture-link';
import { AssistantBubble, AssistantChat, AssistantPanel } from './assistant';
import { useConversations } from './use-conversations';
import { CaptureInbox } from './capture-inbox';
import { AreaSelect, NoteOrganization, OrganizationPanel } from './life-organization';
import { areaName, itemArea, lifeAreas } from '@/lib/life';
import { ProfileSettings, WorkspaceThemeObserver, defaultUserProfile, type UserProfileData } from './profile-settings';
import { QuickCaptureWidget } from './quick-capture';
import { LegacyImport } from './legacy-import';
import { ColorOptions, CourseFields } from './course-form';
import { SubjectOptions } from './subject-options';
import { NotesLibrary } from './notes-library';
import { AssistantConnections } from './assistant-connections';
import { MyAiKeys } from './my-ai-keys';
import { WhatsAppMyLink } from './whatsapp-my-link';
import { OAUTH_RETURN_KEY } from './oauth-consent';
import type { Place } from '@/lib/notebooks';
import { CommunityPanel, usePendingInvite, type CommunityRoute } from './community/community-panel';
import { ConsentGate } from './community/consent-gate';
import { api, formatDay as formatShortDay } from './community/client';
import { WorkspaceNavigation } from './workspace-navigation';
import { AiPresence } from './ai-presence';
import { useLiveFollow } from './use-live-follow';
import type { Touched } from '@/lib/live-follow';
import { acceptedTerms, hasPro, statusLabels, upcomingBirthdays, type Contact as ContactRow, type Home } from '@/lib/community';

const NoteEditor = dynamic(() => import('./note-editor'), { ssr: false, loading: () => <p className="muted">Abrindo editor…</p> });
const AcademicCalendar = dynamic(() => import('./academic-calendar'), { loading: () => <p role="status">Abrindo sua agenda…</p> });
const StudyPlanner = dynamic(() => import('./study-planner'), { loading: () => <p role="status">Organizando sugestões…</p> });
const panelLoading = () => <div className="workspace-panel-loading" role="status"><span className="workspace-loading-mark" aria-hidden="true" /><span>Abrindo seu espaço…</span></div>;
const FinancialController = dynamic(() => import('./financial-controller').then(module => module.FinancialController), { loading: panelLoading });
const DailyRoutine = dynamic(() => import('./daily-routine').then(module => module.DailyRoutine), { loading: panelLoading });
const FlashcardsDeck = dynamic(() => import('./flashcards-deck').then(module => module.FlashcardsDeck), { loading: panelLoading });
const PlanningPanel = dynamic(() => import('./planning-panel').then(module => module.PlanningPanel), { loading: panelLoading });
const AdminPanel = dynamic(() => import('./community/admin-panel').then(module => module.AdminPanel), { loading: panelLoading });
const AiSettings = dynamic(() => import('./community/ai-settings').then(module => module.AiSettings), { loading: panelLoading });
const ContactsPanel = dynamic(() => import('./community/contacts-panel').then(module => module.ContactsPanel), { loading: panelLoading });
const AccountSettings = dynamic(() => import('./community/account-settings').then(module => module.AccountSettings), { loading: panelLoading });
const TelegramAdmin = dynamic(() => import('./messenger-settings').then(module => module.TelegramAdmin), { loading: panelLoading });
const TelegramLink = dynamic(() => import('./messenger-settings').then(module => module.TelegramLink), { loading: panelLoading });
const WhatsAppAdmin = dynamic(() => import('./whatsapp-settings').then(module => module.WhatsAppAdmin), { loading: panelLoading });
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
const subtitles: Record<View, string> = {
  today: '', studies: 'Graduação, pós, cursos livres e extensões, cada um no seu lugar.', community: 'Seus grupos, salas e trabalhos em conjunto.',
  notes: 'Ideias, aulas e reflexões, organizadas do seu jeito.', agenda: 'Compromissos, aulas e prazos de todas as áreas da vida.', focus: 'Para onde vai o seu tempo, dia após dia.',
  planning: 'Metas apontam a direção; projetos organizam os passos.', finances: 'O que entra, o que sai e o que está por vir.', routine: 'Seus hábitos, por período do dia.',
  flashcards: 'Cartões de pergunta e resposta para fixar o que você aprende.', assistant: 'Converse por voz ou escreva para cuidar da sua jornada.', contacts: 'Sua agenda de pessoas. Só você vê.',
  admin: 'Pessoas, papéis e planos, com histórico de tudo.', settings: 'Seu perfil, suas áreas da vida e seus dados.',
};
const viewOf = (value: string) => (value === 'subjects' ? 'studies' : value) as View; // old links to "Matérias"
const SHORTCUT_KEY = 'jornada-atalho-barra';
const BUBBLE_KEY = 'jornada-assistente-escondido';
const FOLLOW_KEY = 'jornada-acompanhar-ia';
const viewTransitions: Variants = {
  ...Object.fromEntries(Object.keys(names).map((name) => [name, { opacity: 1, y: [8, 0] }])),
  still: { opacity: 1, y: 0 },
};
const tabLabel = (id: View, label: string) => id === 'today' ? 'Hoje' : id === 'community' ? 'Salas' : id === 'planning' ? 'Metas' : id === 'routine' ? 'Rotina' : label;
function download(data: Workspace) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `jornada-plena-${dateKey()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function WorkspaceApp({ mode, hostedPreview = false, authenticated = false }: { mode: 'local' | 'cloud' | 'demo'; hostedPreview?: boolean; authenticated?: boolean }) {
  const { data, ready, demo, status, error, blocked, update, ensureSaved, refresh, revisionNow, snapshotNow } = useWorkspace(mode);
  const [view, setView] = useState<View>('today');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const reducedMotion = useReducedMotion();
  const [form, setForm] = useState<FormState | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedNote, setSelectedNote] = useState('');
  const [notesPlace, setNotesPlace] = useState<Place | null>(null);
  const [agendaDate, setAgendaDate] = useState(dateKey);
  const [imported, setImported] = useState<Workspace | null>(null);
  const [notice, setNotice] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [capturePlace, setCapturePlace] = useState<Place | undefined>();
  // Read before the history setup below rewrites the address without its query.
  const [initialSearch] = useState(() => typeof window === 'undefined' ? '' : window.location.search);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [shortcut, setShortcut] = useState<View>('studies');
  const [financeRequest, setFinanceRequest] = useState(0);
  const [financeOpen, setFinanceOpen] = useState(0);
  const [bubbleHidden, setBubbleHidden] = useState(false);
  const [agendaFocus, setAgendaFocus] = useState<'late' | 'day' | null>(null);
  const [waiting, setWaiting] = useState<WaitingRequest[]>([]);
  const [focusJob, setFocusJob] = useState<string>();
  const userProfile = data.profile ?? defaultUserProfile;
  useEffect(() => {
    if (mode === 'demo') return;
    try { setSidebarCollapsed(localStorage.getItem('jornada-navigation-collapsed-v1') === '1'); } catch {}
  }, [mode]);
  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    if (mode !== 'demo') try { localStorage.setItem('jornada-navigation-collapsed-v1', next ? '1' : '0'); } catch {}
  }
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
  // Back to an MCP consent (ChatGPT, Claude) that started before Google login. Same-origin path only.
  useEffect(() => {
    if (!cloud || !home) return;
    let target: string | null = null;
    try { target = localStorage.getItem(OAUTH_RETURN_KEY); localStorage.removeItem(OAUTH_RETURN_KEY); } catch { return; }
    if (target && /^\/oauth\/authorize\?[^#\s]*$/.test(target)) window.location.assign(target);
  }, [cloud, home]);
  useEffect(() => { if (cloud && home && acceptedTerms(home)) api<ContactRow[]>('/api/contacts').then(setContacts).catch(() => setContacts([])); }, [cloud, home]);
  // The person's own confirmations still waiting, read again on each return to Meu dia and after the assistant window closes.
  const consented = cloud && !!home && acceptedTerms(home), accountId = home?.account.user_id;
  useEffect(() => {
    if (!consented || view !== 'today' || assistantOpen) return;
    let current = true;
    api<{ accountId: string; waiting?: WaitingRequest[] }>('/api/assistant/jobs?status=needs_confirmation')
      .then(page => { if (current) setWaiting(page.accountId === accountId ? page.waiting ?? [] : []); }, () => { if (current) setWaiting([]); });
    return () => { current = false; };
  }, [consented, accountId, view, assistantOpen]);
  usePendingInvite(cloud && !!home && acceptedTerms(home), (spaceId, message) => {
    if (spaceId) { setCommunityRoute({ kind: 'space', id: spaceId }); setView('community'); setNotice('Convite aceito. Bem-vindo(a) à sala!'); refreshHome(); }
    else if (message) setNotice(message);
  });
  const pro = !cloud || !home || hasPro(home);
  const visibleNavigation = navigation.filter(item => item.id !== 'admin' || !!home?.account.is_master);
  const shortcutOptions = navigation.filter(item => !['today', 'agenda', 'admin'].includes(item.id) && (cloud || !serverViews.has(item.id)));
  const tabShortcut = shortcutOptions.find(item => item.id === shortcut) ?? shortcutOptions[0];
  const conversations = useConversations(mode, home?.account.user_id);
  const { messages: assistantMessages, setMessages: setAssistantMessages } = conversations;
  useEffect(() => { if (mode === 'demo') return; try { const saved = viewOf(localStorage.getItem(SHORTCUT_KEY) ?? ''); if (names[saved]) setShortcut(saved); setBubbleHidden(localStorage.getItem(BUBBLE_KEY) === '1'); } catch {} }, [mode]);
  const today = dateKey();
  const main = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = data.tasks.filter((task) => !task.done);
  const dueToday = data.tasks.filter((task) => task.date === today);
  const priorities = priorityTasks(data, today);
  const upcoming = calendarEntries(data, addDays(today, 1), addDays(today, 7)).filter((entry) => !entry.done);
  const doneToday = dueToday.filter((task) => task.done).length;
  const studyMinutes = Math.floor(data.sessions.filter((session) => session.date === today).reduce((sum, session) => sum + session.minutes, 0));
  const progress = dueToday.length ? Math.round(doneToday / dueToday.length * 100) : 0;
  const cycles = monthCycles(today);
  const agendaToday = todayAgenda(data, today);
  const alerts = todayAlerts(data, today);
  const loose = data.notes.filter(isUnorganized).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const subject = (id: string) => data.subjects.find((item) => item.id === id);
  const courses = data.courses ?? [];
  const searchTerm = searchOpen ? query.trim().toLocaleLowerCase('pt-BR') : '';
  const searchCourses = searchTerm ? courses.filter(item => item.name.toLocaleLowerCase('pt-BR').includes(searchTerm)) : [];
  const searchSubjects = searchTerm ? data.subjects.filter(item => item.name.toLocaleLowerCase('pt-BR').includes(searchTerm)) : [];
  const searchNotes = searchTerm ? data.notes.filter(item => `${item.title} ${item.content.replace(/<[^>]*>/g, ' ')}`.toLocaleLowerCase('pt-BR').includes(searchTerm)) : [];
  const searchTasks = searchTerm ? data.tasks.filter(item => item.title.toLocaleLowerCase('pt-BR').includes(searchTerm)) : [];
  const searchCount = searchCourses.length + searchSubjects.length + searchNotes.length + searchTasks.length;
  const active = activeCourses(data);
  const studyCourse = studiesRoute.kind === 'course' ? courses.find((item) => item.id === studiesRoute.id) : undefined;
  const unitsOf = (item: Pick<Subject, 'courseId'>) => { const course = courseOf(data, item); return course ? courseUnits(course) : unitPresets[0]; };
  const formCourseId = form?.courseId ?? form?.subject?.courseId ?? studyCourse?.id ?? active[0]?.id ?? courses[0]?.id ?? '';
  const firstName = (userProfile.name || home?.account.display_name || '').trim().split(/\s+/)[0];
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
  // A capture link from an assistant ("manda o arquivo") opens Registro rápido at that destination, once.
  useEffect(() => {
    const link = readCaptureLink(initialSearch, Date.now());
    if (!link) return;
    if (window.location.search) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash);
    if ('expired' in link) { setNotice('Este link de envio expirou. Peça outro ao assistente.'); return; }
    setCapturePlace(link.place); pushModal('capture'); setCaptureOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSearch]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  });

  // A modal's own history entry is replaced (never stacked on) when leaving it for another place.
  // Following assistants live: a change made elsewhere opens its screen and the pointer shows the item.
  const [followPaused, setFollowPaused] = useState(() => { try { return localStorage.getItem(FOLLOW_KEY) === 'off'; } catch { return false; } });
  const [aiTouch, setAiTouch] = useState<Touched | null>(null);
  function pauseFollow() { setFollowPaused(true); setAiTouch(null); try { localStorage.setItem(FOLLOW_KEY, 'off'); } catch {} }
  useLiveFollow({ enabled: cloud && ready && !demo && !followPaused && !!home, accountId: home?.account.user_id, revision: revisionNow, snapshot: snapshotNow, refresh,
    onTouched: items => { navigate(items[0].view); setAiTouch({ ...items[0] }); } });
  function navigate(next: View) {
    const modal = !!window.history.state?.modal;
    if (modal || next !== view || (next === 'studies' && studiesRoute.kind === 'course')) {
      window.history[modal ? 'replaceState' : 'pushState']({ app: 'jornada-plena', view: next }, '', `#${next}`);
    }
    if (next === 'studies') setStudiesRoute({ kind: 'list' });
    setAgendaFocus(null); setFocusJob(undefined); if (next !== 'notes' || next !== view) { setNotesPlace(null); setSelectedNote(''); }
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
  function closeCapture() { setCaptureOpen(false); setCapturePlace(undefined); popModal('capture'); }
  function openAssistant() { pushModal('assistant'); setAssistantOpen(true); }
  function closeAssistant() { setAssistantOpen(false); popModal('assistant'); }
  function openNote(id: string) { setCaptureOpen(false); setAssistantOpen(false); navigate('notes'); setSelectedNote(id); requestAnimationFrame(() => main.current?.scrollIntoView({ block: 'start' })); }
  // Alerts land exactly on the items they mention.
  function openInbox() { navigate('notes'); setNotesPlace({ kind: 'inbox' }); requestAnimationFrame(() => main.current?.scrollIntoView({ block: 'start' })); }
  function openAlert(alert: TodayAlert) {
    if (alert.target === 'notes') { openInbox(); return; }
    if (alert.target === 'finances') { navigate('finances'); setFinanceOpen(Date.now()); return; }
    if (alert.date) setAgendaDate(alert.date);
    navigate(alert.target);
    if (alert.target === 'agenda') setAgendaFocus(alert.id === 'late' ? 'late' : 'day');
  }
  // A waiting request opens its own conversation with that confirmation; confirming stays there, with the person.
  async function openWaiting(item: WaitingRequest) {
    if (!await conversations.reveal(item.conversationId).catch(() => false)) { setNotice('Não consegui abrir a conversa deste pedido. Tente de novo em instantes.'); return; }
    navigate('assistant'); setFocusJob(item.id);
  }
  function captureTask() { swapModal('form'); setCaptureOpen(false); setForm({ kind: 'task' }); }
  function captureFocus() { setCaptureOpen(false); navigate('focus'); setFocusRequest({ id: crypto.randomUUID(), subjectId: '' }); }
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
      navigate('notes'); setSelectedNote(id);
    }
    closeForm(); setNotice('');
  }
  function addToAgenda(assignment: AgendaAssignment): AgendaLink | null {
    // Already in the agenda and linked: nothing to save, only say where it is.
    const probe = linkAssignment(data, assignment, '');
    if (probe.data === data) return probe.link;
    const outcome: { link?: AgendaLink } = {};
    const saved = update((previous) => { const result = linkAssignment(previous, assignment, crypto.randomUUID()); outcome.link = result.link; return result.data; });
    return saved ? outcome.link ?? null : null;
  }
  function moveToDeadline(taskId: string, due: string) { return update((previous) => moveAgendaTask(previous, taskId, due)); }
  function toggleTask(task: Task) { update((previous) => ({ ...previous, tasks: previous.tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item) })); }
  function openSubject(item: Subject) { navigate('notes'); setNotesPlace({ kind: 'subject', id: item.id }); }
  function deleteCourse(course: Course) {
    if (!window.confirm(`Excluir o curso ${course.name}? Ele está vazio e você pode cadastrá-lo de novo quando quiser.`)) return;
    if (!update((previous) => ({ ...previous, courses: (previous.courses ?? []).filter((item) => item.id !== course.id) }))) return;
    const state = window.history.state ?? {};
    const steps = (state.modal === 'form' ? 1 : 0) + (state.course === course.id ? 1 : 0);
    setForm(null); setStudiesRoute({ kind: 'list' }); setNotice('Curso excluído.');
    if (steps) window.history.go(-steps);
    requestAnimationFrame(() => main.current?.focus());
  }

  const navContent = (mobile = false) => <WorkspaceNavigation
    items={visibleNavigation.map((item) => ({ ...item, badge: proViews.has(item.id) && !pro ? 'Pro' : item.id === 'community' && home?.to_review.length ? home.to_review.length : undefined }))}
    view={view} onNavigate={navigate} collapsed={!mobile && sidebarCollapsed} onToggle={toggleSidebar} mobile={mobile}
    name={userProfile.name || home?.account.display_name || 'Meu espaço'} email={home?.account.email || userProfile.email || ''} photo={userProfile.photoUrl}
    status={status} modeLabel={demo ? 'Demonstração' : cloud ? 'Espaço pessoal' : previewLabel}
  />;

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

  return <div className="app-shell workspace-shell" data-sidebar-collapsed={sidebarCollapsed}>
    <WorkspaceThemeObserver demo={demo} />
    <a className="skip-link" href="#main">Pular para o conteúdo</a>
    <aside className="sidebar" aria-label="Navegação lateral">{navContent()}</aside>
    {mobileMenu && <Modal title="Seu espaço" className="navigation-drawer" onClose={closeMenu}><div className="mobile-navigation">{navContent(true)}</div><label className="tabbar-shortcut" htmlFor="tabbar-shortcut">Atalho da barra inferior<select id="tabbar-shortcut" value={tabShortcut.id} onChange={(event) => chooseShortcut(event.target.value as View)}>{shortcutOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></Modal>}
    <div className="app-body">
      <header className="topbar">
        <div className="breadcrumb">
          <button type="button" className="icon-button mobile-menu-button" aria-label="Abrir navegação" aria-haspopup="dialog" aria-expanded={mobileMenu} onClick={openMobileMenu}>
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
          {view !== 'today' && <><span>Meu espaço</span><ChevronRight aria-hidden="true" size={14} /></>}
          {view === 'studies' && studyCourse && <><span><button type="button" className="cm-crumb" onClick={showStudies}>Estudos</button></span><ChevronRight aria-hidden="true" size={14} /></>}
          {view === 'today' && ready ? <span className="topbar-today"><strong>{greeting(new Date().getHours())}{firstName ? `, ${firstName}` : ''}</strong><span className="topbar-cycle"><span className="sr-only">{`${cycles.month}: semana ${cycles.cycle} de 4, dia ${cycles.day} de ${cycles.last}`}</span><span className="cycle-bars" aria-hidden="true">{cycles.cycles.map((cycle) => <i key={cycle.index} className={cycle.current ? 'on' : cycle.end < cycles.day ? 'past' : ''} />)}</span><span aria-hidden="true"><span className="cycle-month">{cycles.month} · </span>semana {cycles.cycle}/4<span className="cycle-day"> · dia {cycles.day}/{cycles.last}</span></span></span></span> : <strong>{pageName}</strong>}
        </div>
        <div className="topbar-actions">
          <button type="button" className="button primary topbar-capture" disabled={!ready} onClick={openCapture}><img src="/brand/simbolo-reduzido.svg" alt="" width={22} height={22} />Registrar</button>
          <button type="button" className="search-trigger" aria-label="Buscar no meu espaço" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" onClick={openSearch}>
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
        {(demo || mode !== 'cloud') && <div className={`mode-banner ${demo ? 'demo-banner' : ''}`}>
          <span><CloudOff size={14} aria-hidden="true" />{demo ? 'Demonstração — dados fictícios. Não insira informações pessoais.' : mode === 'local' ? storageNotice : 'Espaço pessoal · privado, visível só para você.'}</span>
          {demo && <button onClick={() => window.location.reload()} disabled={!ready}>Restaurar exemplos <ArrowRight size={13} aria-hidden="true" /></button>}
        </div>}
        {error && <div className="error-banner" role="alert">{error}{ready && <button className="text-button" onClick={() => download(data)}>Exportar esta versão</button>}<button className="text-button" onClick={() => window.location.reload()}>Recarregar</button></div>}

        {view !== 'today' && <div className="page-heading">
          <div>
            <h1>{pageName}</h1>
            <p>{view === 'studies' && studyCourse ? [courseKindLabels[studyCourse.kind], studyCourse.institution, studyCourse.stage].filter(Boolean).join(' · ') : subtitles[view]}</p>
          </div>
          <div className="heading-actions-row">
            {ready && view === 'studies' && !studyCourse && <button className="button primary" disabled={blocked || courses.length >= 30} onClick={() => openForm({ kind: 'course' })}><Plus size={16} aria-hidden="true" />Novo curso</button>}
          </div>
        </div>}

        {!ready && !error && <div className="loading-panel" role="status">Preparando seu espaço…</div>}

        {ready && <motion.div className="workspace-view" initial={false} variants={viewTransitions} animate={reducedMotion ? 'still' : view} transition={{ duration: 0.22, ease: 'easeOut' }}>
          {!serverViews.has(view) && (view === 'focus' || (!!data.activeFocus && view !== 'today')) && <FocusTimer data={data} disabled={blocked} status={status} demo={demo} request={focusRequest} update={update} />}
          {view === 'today' && <>
            <section className="today-hero" aria-labelledby="today-title">
              <div className="today-intro">
              <div className="today-head">
                <div><span className="today-kicker">SEU DIA, COM MAIS PRESENÇA</span><h1 id="today-title">Um passo de cada vez.</h1><p className="today-date">{capitalize(formatDate(today, { weekday: 'long', day: 'numeric', month: 'long' }))}</p></div>
              </div>
              <div className="today-actions" role="group" aria-label="Ações rápidas do dia">
                <button type="button" className="today-action" disabled={blocked} aria-label="Registrar ideia" onClick={() => openForm({ kind: 'note' })}><PenLine size={18} aria-hidden="true" /><span className="long">Registrar ideia</span><span className="short" aria-hidden="true">Ideia</span><ArrowUpRight size={14} aria-hidden="true" /></button>
                <button type="button" className="today-action" aria-label="Entrar em foco" onClick={() => { navigate('focus'); setFocusRequest({ id: crypto.randomUUID(), subjectId: '' }); }}><Clock3 size={18} aria-hidden="true" /><span className="long">Entrar em foco</span><span className="short" aria-hidden="true">Foco</span><ArrowUpRight size={14} aria-hidden="true" /></button>
                <button type="button" className="today-action" aria-label="Abrir assistente" onClick={() => navigate('assistant')}><Sparkles size={18} aria-hidden="true" /><span className="long">Abrir assistente</span><span className="short" aria-hidden="true">Assistente</span><ArrowUpRight size={14} aria-hidden="true" /></button>
              </div>
              </div>
              <div className="today-agenda-preview">
              <div className="today-agenda-heading">
              <h2 className="today-subtitle">{agendaToday.length ? `Hoje você tem ${agendaToday.length} ${agendaToday.length === 1 ? 'item' : 'itens'}` : 'Agenda de hoje'}</h2>
                <button type="button" className="today-new" disabled={blocked} onClick={() => openForm({ kind: 'task' })}><Plus size={16} aria-hidden="true" />Novo compromisso</button>
              </div>
              {agendaToday.length ? <ul className="today-agenda">{agendaToday.slice(0, 5).map((entry) => { const course = entry.session ? courseOf(data, { courseId: subject(entry.subjectId)?.courseId }) : undefined; return <li key={entry.id} className={entry.task ? 'with-check' : ''}>{entry.task && <label className="task-checkbox"><input type="checkbox" checked={entry.done} disabled={blocked} onChange={() => toggleTask(entry.task!)} aria-label={`Concluir: ${entry.title}`} /><span className="check-visual"><Check size={13} aria-hidden="true" /></span></label>}<button type="button" className={entry.done ? 'done' : ''} onClick={() => { setAgendaDate(today); navigate('agenda'); }}><span className="today-time">{entry.time ?? 'Dia todo'}</span><span className="today-what"><strong>{entry.title}</strong><small>{[entry.kind, course?.name, entry.professor, entry.location, entry.task?.projectId ? `Projeto: ${data.projects?.find((p) => p.id === entry.task!.projectId)?.title ?? ''}` : ''].filter(Boolean).join(' · ')}</small></span>{entry.done && <Check size={16} aria-label="Concluído" />}</button></li>; })}</ul> : <p className="today-empty">Nada marcado para hoje. Um bom dia para avançar no que importa.</p>}
              {agendaToday.length > 5 && <button type="button" className="text-button" onClick={() => { setAgendaDate(today); navigate('agenda'); }}>Mais {agendaToday.length - 5} hoje na agenda <ArrowRight size={13} aria-hidden="true" /></button>}
              </div>
            </section>

            {consented && waiting.length > 0 && <section className="panel today-waiting" aria-labelledby="today-waiting-title">
              <h2 id="today-waiting-title">Pedidos aguardando você ({waiting.length})</h2>
              <p>Exclusões e substituições que o assistente preparou. Nada muda até você confirmar na conversa.</p>
              <ul>{waiting.map((item) => <li key={item.id}><button type="button" onClick={() => void openWaiting(item)}>
                <span className="today-waiting-what"><strong>{item.summary}{item.more > 0 ? ` e mais ${item.more} ${item.more === 1 ? 'item' : 'itens'}` : ''}</strong><small>Pedido <time dateTime={item.requestedAt}>{waitingSince(item.requestedAt)}</time></small></span>
                <span className="today-waiting-go">Revisar<ArrowRight size={14} aria-hidden="true" /></span>
              </button></li>)}</ul>
            </section>}

            {alerts.length > 0 && <section className="panel today-alerts" aria-labelledby="today-alerts-title">
              <h2 id="today-alerts-title">Atenção</h2>
              <ul>{alerts.map((alert) => <li key={alert.id} className={alert.tone}><button type="button" onClick={() => openAlert(alert)}><span className="today-alert-dot" aria-hidden="true" /><span>{alert.text}</span><ArrowRight size={14} aria-hidden="true" /></button></li>)}</ul>
            </section>}

            {/* Foco e tarefas do dia; registros soltos ficam no aviso de Atenção */}
            <div className="bento-metric-row two">
              <button type="button" className="bento-metric-card" onClick={() => navigate('focus')}>
                <span className="metric-header">
                  <span className="metric-icon lavender"><Clock3 size={18} aria-hidden="true" /></span>
                  <span className="metric-label">Foco hoje</span><ArrowRight className="metric-go" size={14} aria-hidden="true" />
                </span>
                <span className="metric-value">{studyMinutes}<small> min</small></span>
                <span className="metric-sub">{studyMinutes > 0 ? 'Foco acumulado hoje' : 'Pronto para começar'}</span>
              </button>
              <button type="button" className="bento-metric-card" onClick={() => navigate('agenda')}>
                <span className="metric-header">
                  <span className="metric-icon sage"><CheckCheck size={18} aria-hidden="true" /></span>
                  <span className="metric-label">Tarefas de hoje</span><ArrowRight className="metric-go" size={14} aria-hidden="true" />
                </span>
                <span className="metric-value">{doneToday}<small> / {dueToday.length}</small></span>
                <span className="metric-sub">{dueToday.length === 0 ? 'Sem prazos para hoje' : `${progress}% concluído`}</span>
                {dueToday.length > 0 && <span className="metric-completion-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>}
              </button>
            </div>

            {/* DASHBOARD SPLIT GRID */}
            <div className="dashboard-grid">
              <div className="dashboard-primary">
                {/* STUDY PLANNER COMPACT */}
                <StudyPlanner data={data} update={update} blocked={blocked} onAgenda={() => navigate('agenda')} />

                {/* ESTUDOS */}
                <section className="subjects-section">
                  <div className="section-heading">
                    <h2>Meus estudos</h2>
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
                  <div className="week-strip">{Array.from({ length: 7 }, (_, index) => { const day = addDays(today, index); return <button key={day} className={day === today ? 'today' : ''} aria-label={`Abrir agenda de ${formatDate(day)}`} onClick={() => { setAgendaDate(day); navigate('agenda'); }}><span>{formatDate(day, { weekday: 'short' }).replace('.', '')}</span><strong>{new Date(`${day}T12:00:00`).getDate()}</strong><i className={(day === today ? agendaToday.length > 0 : upcoming.some((entry) => entry.date === day)) ? 'has-task' : ''} /></button>; })}</div>
                  <h3 className="small-heading">Vem por aí</h3>
                  <div className="upcoming-list">{upcoming.slice(0, 3).map((task) => <button key={task.id} className="upcoming-item" onClick={() => { setAgendaDate(task.date); navigate('agenda'); }}><span className={`date-block ${subject(task.subjectId)?.color ?? 'sage'}`}><strong>{new Date(`${task.date}T12:00:00`).getDate()}</strong><small>{formatDate(task.date, { month: 'short' }).replace('.', '')}</small></span><span><strong>{task.title}</strong><small>{task.time ?? 'Sem horário'} · {task.kind}</small></span></button>)}{!upcoming.length && <p className="muted">Sua semana tem espaço para novos planos.</p>}</div>
                  <button className="text-button full-width" onClick={() => navigate('agenda')}>Abrir agenda <ArrowRight size={13} aria-hidden="true" /></button>
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

          {view === 'notes' && <NotesLibrary data={data} blocked={blocked} demo={demo} cloud={mode === 'cloud'} status={status} update={update} place={notesPlace} noteId={selectedNote} onPlace={setNotesPlace} onNote={setSelectedNote} onManage={() => navigate('settings')} />}

          {view === 'community' && (cloud && home ? <CommunityPanel home={home} route={communityRoute} onRoute={route => { setCommunityRoute(route); requestAnimationFrame(() => main.current?.scrollIntoView({ block: 'start' })); }} refreshHome={refreshHome} onAddToAgenda={addToAgenda} onMoveAgendaTask={moveToDeadline} /> : <ServerOnly view="community" cloud={cloud} error={homeError} />)}
          {view === 'contacts' && (cloud && home ? <ContactsPanel /> : <ServerOnly view="contacts" cloud={cloud} error={homeError} />)}
          {view === 'admin' && (cloud && home?.account.is_master ? <><AiSettings /><WhatsAppAdmin /><TelegramAdmin /><AdminPanel me={home.account.user_id} onOpenSpace={id => { setCommunityRoute({ kind: 'space', id }); navigate('community'); }} /></> : <ServerOnly view="admin" cloud={cloud} error={homeError} />)}

          {view === 'agenda' && <AcademicCalendar focus={agendaFocus} data={data} date={agendaDate} onDateChange={setAgendaDate} update={update} blocked={blocked} onNew={(date) => { setAgendaDate(date); openForm({ kind: 'task' }); }} onEdit={(task) => openForm({ kind: 'task', task })} />}

          {view === 'planning' && (pro ? <PlanningPanel data={data} blocked={blocked} update={update} /> : <ProOnly />)}

          {view === 'finances' && (pro ? <FinancialController addRequest={financeRequest} openRequest={financeOpen} data={data} update={update} blocked={blocked} /> : <ProOnly />)}

          {view === 'routine' && (pro ? <DailyRoutine data={data} update={update} blocked={blocked} /> : <ProOnly />)}

          {view === 'focus' && <FocusHistory data={data} blocked={blocked} update={update} />}
          {view === 'flashcards' && <FlashcardsDeck data={data} blocked={blocked} update={update} />}

          {view === 'assistant' && <>
            <section className="assistant-inline" aria-label="Conversa com o assistente">
              {bubbleHidden && <button type="button" className="text-button desktop-only assistant-show-bubble" onClick={() => setBubble(false)}>Mostrar a bolinha nas outras telas</button>}
              <AssistantChat refreshWorkspace={() => refresh(home?.account.user_id)} conversations={conversations} cloud={cloud} blocked={blocked} demo={demo} data={data} onNavigate={(target) => navigate(target)} update={update} ensureSaved={ensureSaved} messages={assistantMessages} setMessages={setAssistantMessages} onOpenNote={openNote} focusJob={focusJob} />
            </section>
          </>}

          {view === 'settings' && <>
            {cloud && home && <AccountSettings home={home} refreshHome={refreshHome} />}
            {cloud && home && <TelegramLink key={`telegram-${home.account.user_id}`} />}
            {cloud && home && <AssistantConnections update={update} />}
            {cloud && home && <MyAiKeys key={`ai-keys-${home.account.user_id}`} />}
            {cloud && home && <WhatsAppMyLink key={`whatsapp-${home.account.user_id}`} />}
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
        </motion.div>}
        <footer className="page-footer"><span><Sprout aria-hidden="true" size={15} />Sua vida é uma jornada, não uma corrida.</span><span>{status}</span></footer>
      </main>
      <nav className="mobile-tabbar" aria-label="Atalhos mobile">
        {[navigation[0], navigation.find((item) => item.id === 'agenda')!].map(({ id, label, Icon }) => <button key={id} type="button" aria-label={`Ir para ${label}`} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={21} aria-hidden="true" /><span>{tabLabel(id, label)}</span></button>)}
        <button type="button" className="tabbar-center" aria-haspopup="dialog" disabled={!ready} onClick={openCapture}><span className="tabbar-center-badge"><img src="/brand/simbolo.svg" alt="" width={56} height={56} /></span><span>Registrar</span></button>
        {[tabShortcut].map(({ id, label, Icon }) => <button key={id} type="button" aria-label={`Ir para ${label}`} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={21} aria-hidden="true" /><span>{tabLabel(id, label)}</span></button>)}
        <button type="button" aria-label="Ver todas as áreas" aria-expanded={mobileMenu} onClick={openMobileMenu}><Menu size={21} aria-hidden="true" /><span>Mais</span></button>
      </nav>
    </div>

    {form && <Modal title={form.kind === 'course' ? form.course ? 'Editar curso' : 'Novo curso' : form.kind === 'subject' ? `${form.subject ? 'Editar' : 'Adicionar'} ${unitsOf({ courseId: formCourseId }).singular}` : form.kind === 'task' ? form.task ? 'Editar compromisso' : 'Um novo passo' : 'Capture uma ideia'} onClose={closeForm}><form onSubmit={submitForm} className="entry-form"><label htmlFor="entry-title">{form.kind === 'subject' || form.kind === 'course' ? 'Nome' : form.kind === 'task' ? 'O que você quer fazer?' : 'Título da anotação'}</label><input id="entry-title" name="title" required autoFocus maxLength={form.kind === 'subject' || form.kind === 'course' ? 100 : 160} defaultValue={form.course?.name ?? form.subject?.name ?? form.task?.title ?? ''} placeholder={form.kind === 'course' ? 'Ex.: Psicologia, Hipnose clínica, Pós em Pedagogia' : form.kind === 'subject' ? 'Ex.: Psicologia Social, Fundamentos, Módulo 1' : form.kind === 'task' ? 'Um pequeno passo já conta' : 'Dê um nome à sua ideia'} />{form.kind === 'course' ? <CourseFields course={form.course} color={colors.find((color) => !courses.some((item) => item.color === color)) ?? 'sage'} /> : form.kind === 'subject' ? <><label htmlFor="entry-course">Curso</label><select id="entry-course" name="course" required value={formCourseId} onChange={(event) => setForm({ ...form, courseId: event.target.value })}>{courses.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status !== 'active' ? ` · ${courseStatusLabels[item.status].toLowerCase()}` : ''}</option>)}</select><label htmlFor="entry-professor">Professor(a) · opcional</label><input id="entry-professor" name="professor" maxLength={100} defaultValue={form.subject?.professor ?? ''} /><label htmlFor="entry-semester">Semestre · opcional</label><input id="entry-semester" name="semester" type="number" min={1} max={20} defaultValue={form.subject?.semester ?? ''} /><ColorOptions legend="Cor" value={form.subject?.color ?? 'sage'} /></> : <><label htmlFor="entry-area">Área da vida · opcional</label><AreaSelect id="entry-area" name="area" data={data} value={form.task ? itemArea(form.task) : notesPlace?.kind === 'subject' ? 'studies' : notesPlace?.kind === 'area' ? notesPlace.id : ''} />{form.kind === 'note' && <><label htmlFor="entry-notebook">Caderno · opcional</label><select id="entry-notebook" name="notebook" defaultValue={notesPlace?.kind === 'notebook' ? notesPlace.id : ''}><option value="">Sem caderno</option>{data.notebooks?.map((book) => <option key={book.id} value={book.id}>{book.name}</option>)}</select></>}<label htmlFor="entry-subject">Matéria · opcional</label><select id="entry-subject" name="subject" defaultValue={form.task?.subjectId ?? (notesPlace?.kind === 'subject' ? notesPlace.id : '')}><option value="">Pessoal · sem matéria</option><SubjectOptions data={data} /></select>{form.kind === 'task' && <><label htmlFor="entry-project">Projeto · opcional</label><select id="entry-project" name="project" defaultValue={form.task?.projectId ?? ''}><option value="">Sem projeto</option>{data.projects?.filter((p) => p.status !== 'archived' || p.id === form.task?.projectId).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select><div className="form-grid"><div><label htmlFor="entry-date">Data</label><input id="entry-date" name="date" type="date" required defaultValue={form.task?.date ?? (view === 'agenda' ? agendaDate : today)} /></div><div><label htmlFor="entry-minutes">Tempo estimado (min)</label><input id="entry-minutes" name="minutes" type="number" min={5} max={240} required defaultValue={form.task?.minutes ?? 25} /></div></div><label htmlFor="entry-time">Horário · opcional</label><input id="entry-time" name="time" type="time" defaultValue={form.task?.time ?? ''} /><label htmlFor="entry-kind">Tipo</label><select id="entry-kind" name="kind" defaultValue={form.task?.kind ?? 'Compromisso'}>{taskKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></>}</>}{form.course && subjectsOfCourse(data, form.course.id).length > 0 && <p id="course-delete-help" className="form-hint">Para excluir, primeiro leve as partes deste curso ({courseUnits(form.course).plural}) para outro curso, pelo campo Curso de cada uma.</p>}<div className="form-footer">{form.course && <button type="button" className="button outline cm-danger" disabled={blocked || subjectsOfCourse(data, form.course.id).length > 0} aria-describedby={subjectsOfCourse(data, form.course.id).length ? 'course-delete-help' : undefined} onClick={() => deleteCourse(form.course!)}>Excluir curso</button>}<button type="button" className="button outline" onClick={closeForm}>Cancelar</button><button className="button primary" disabled={blocked}>Salvar <Check size={17} aria-hidden="true" /></button></div></form></Modal>}

    {searchOpen && <Modal title="Encontre no seu espaço" onClose={closeSearch}>
      <label className="sr-only" htmlFor="workspace-search">Buscar cursos, matérias, anotações e tarefas</label>
      <input id="workspace-search" className="search-input" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Um curso, uma matéria, uma ideia, um compromisso…" />
      <div className="search-results">
        {!searchTerm ? <p className="muted">Digite para buscar. Nada é enviado a serviços externos.</p> : <>
          <p className="search-results-summary" role="status">{searchCount === 0 ? `Nada encontrado para “${query.trim()}”. Tente outro nome ou uma palavra do conteúdo.` : `${searchCount} ${searchCount === 1 ? 'resultado encontrado' : 'resultados encontrados'}`}</p>
          {searchCourses.map(item => <button type="button" key={item.id} onClick={() => openCourse(item.id)}><GraduationCap size={17} aria-hidden="true" /><span>{item.name}<small>Curso</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}
          {searchSubjects.map(item => <button type="button" key={item.id} onClick={() => { openSubject(item); setSearchOpen(false); }}><BookOpen size={17} aria-hidden="true" /><span>{item.name}<small>{capitalize(unitsOf(item).singular)}{courseOf(data, item) ? ` · ${courseOf(data, item)!.name}` : ''}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}
          {searchNotes.map(item => <button type="button" key={item.id} onClick={() => { navigate('notes'); setSelectedNote(item.id); setSearchOpen(false); }}><FileText size={17} aria-hidden="true" /><span>{item.title}<small>Anotação</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}
          {searchTasks.map(item => <button type="button" key={item.id} onClick={() => { setAgendaDate(item.date); navigate('agenda'); setSearchOpen(false); }}><CalendarDays size={17} aria-hidden="true" /><span>{item.title}<small>{formatDate(item.date)}</small></span><ArrowUpRight size={17} aria-hidden="true" /></button>)}
        </>}
      </div>
    </Modal>}
    {!demo && imported && <Modal title="Restaurar este backup?" onClose={() => setImported(null)}><p>Ele contém {imported.subjects.length} matérias, {imported.notes.length} anotações e {imported.tasks.length} compromissos. Isso substituirá os dados deste espaço.</p><p>Exporte uma cópia atual antes de continuar.</p><div className="button-row"><button className="button outline" onClick={() => download(data)}>Exportar versão atual</button><button className="button primary" disabled={blocked} onClick={() => { update(() => ensureCourses(imported)); setImported(null); setSelectedNote(''); setNotesPlace(null); setNotice('Restauração enviada. Confira o indicador de salvamento antes de sair.'); }}>Confirmar restauração</button></div></Modal>}
    {captureOpen && <CaptureSheet data={data} blocked={blocked} status={status} cloud={cloud} demo={demo} update={update} ensureSaved={ensureSaved} onClose={closeCapture} onOpenNote={openNote} onTask={captureTask} onFocus={captureFocus} onMoney={captureMoney} place={capturePlace} />}
    {ready && !bubbleHidden && view !== 'assistant' && !(cloud && home && !acceptedTerms(home)) && <AssistantBubble persist={!demo} showIntro={view === 'today'} onOpen={openAssistant} onHide={() => setBubble(true)} />}
    <AiPresence touch={aiTouch} onPause={pauseFollow} />
    {assistantOpen && <AssistantPanel refreshWorkspace={() => refresh(home?.account.user_id)} conversations={conversations} cloud={cloud} blocked={blocked} demo={demo} data={data} onNavigate={(target) => { closeAssistant(); navigate(target); }} update={update} ensureSaved={ensureSaved} messages={assistantMessages} setMessages={setAssistantMessages} onClose={closeAssistant} onOpenNote={openNote} />}
    {cloud && home && !acceptedTerms(home) && <ConsentGate onAccepted={refreshHome} />}
    {notice && <div className={`toast${/^(Não|Erro)/.test(notice) ? ' problem' : ''}`} role="status">{/^(Não|Erro)/.test(notice) ? <AlertCircle size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}<span>{notice}</span><button className="icon-button" aria-label="Dispensar aviso" onClick={() => setNotice('')}><X size={16} aria-hidden="true" /></button></div>}
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
