'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './community/client';
import { conversationFingerprint, conversationKey, conversationTitle, legacyConversations, LEGACY_ARCHIVE_KEY, LEGACY_CHAT_KEY, mergeConversations, newConversation, parseConversation, type AssistantMessage, type Conversation, type ConversationLibrary } from '@/lib/conversations';

type Cache = ConversationLibrary & { scope: string; legacyRecovered?: boolean };
type RemotePage = { accountId: string; items: unknown[]; hasMore: boolean };
export function useConversations(mode: 'local' | 'cloud' | 'demo', account?: string) {
  const scope = mode === 'cloud' && !account ? '' : mode === 'demo' ? 'demo' : conversationKey(mode === 'cloud' ? account : undefined);
  const [library, setLibrary] = useState<Cache>({ scope: '', activeId: '', items: [] });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Somente neste aparelho');
  const [hasMore, setHasMore] = useState(false);
  const [hasLegacy, setHasLegacy] = useState(false);
  const [otherTab, setOtherTab] = useState(false);
  const current = useRef(library);
  const liveScope = useRef(scope); liveScope.current = scope;
  const serial = useRef(Promise.resolve());
  const changedElsewhere = useRef(false);
  const page = useRef(0);
  const ready = loaded && library.scope === scope && !!scope && !otherTab;
  const items = library.scope === scope ? library.items : [];
  const active = items.find(item => item.id === library.activeId);
  const change = useCallback((update: (previous: Cache) => Cache, target = scope) => {
    if (!target || target !== liveScope.current) return;
    const next = update(current.current);
    if (next.scope !== target) return;
    if (mode !== 'demo' && !changedElsewhere.current) {
      try { localStorage.setItem(target, JSON.stringify(next)); }
      catch { setError('O aparelho não conseguiu guardar a conversa. Exporte uma cópia antes de sair; liberar espaço pode ajudar.'); }
    }
    current.current = next; setLibrary(next);
  }, [mode, scope]);

  const readRemote = useCallback(async (target = scope) => {
    if (mode !== 'cloud' || !account || target !== liveScope.current) return;
    try {
      const result = await api<RemotePage>('/api/conversations');
      if (target !== liveScope.current || result.accountId !== account) return;
      const remote = result.items.flatMap(row => { const item = parseConversation(row); return item ? [item] : []; });
      const merged = mergeConversations(current.current, remote);
      change(previous => ({ ...previous, ...merged.library, scope: target }), target);
      setError(merged.conflicts ? 'Preservei as alterações deste aparelho em uma conversa separada. A versão da conta também está na lista; compare as duas antes de continuar.' : '');
      page.current = 0; setHasMore(result.hasMore); setStatus('Conversas da conta disponíveis');
    } catch { if (target === liveScope.current) { setStatus('Cópia neste aparelho'); setError('Não consegui abrir o histórico da conta. Suas conversas deste aparelho continuam disponíveis.'); } }
  }, [mode, account, scope, change]);

  useEffect(() => {
    setLoaded(false); setOtherTab(false); changedElsewhere.current = false; setHasMore(false); setHasLegacy(false); setError(''); page.current = 0;
    if (!scope) return;
    let initial: Cache;
    try {
      const cache = mode === 'demo' ? null : JSON.parse(localStorage.getItem(scope) ?? 'null');
      const records: Conversation[] = Array.isArray(cache?.items) ? cache.items.flatMap((item: unknown) => { const parsed = parseConversation(item); return parsed ? [parsed] : []; }) : [];
      initial = { scope, legacyRecovered: cache?.legacyRecovered === true, activeId: records.some(item => item.id === cache?.activeId) ? cache.activeId : records[0]?.id || '', items: records };
      // Old global keys cannot identify their owner. Cloud users explicitly recover them locally.
      if (!cache && mode === 'local') {
        initial.items = legacyConversations(JSON.parse(localStorage.getItem(LEGACY_CHAT_KEY) ?? '[]'), JSON.parse(localStorage.getItem(LEGACY_ARCHIVE_KEY) ?? '[]'));
        initial.activeId = initial.items[0]?.id || '';
      }
      if (mode === 'cloud' && !initial.legacyRecovered) setHasLegacy(!!(localStorage.getItem(LEGACY_CHAT_KEY) || localStorage.getItem(LEGACY_ARCHIVE_KEY)));
    } catch { initial = { scope, activeId: '', items: [] }; setError('Não consegui ler parte do histórico antigo. Os arquivos originais continuam neste aparelho.'); }
    if (!initial.items.length) { const first = newConversation(mode === 'cloud'); initial = { scope, activeId: first.id, items: [first] }; }
    change(() => initial); setLoaded(true); void readRemote(scope);
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== scope || event.newValue === JSON.stringify(current.current)) return;
      changedElsewhere.current = true; setOtherTab(true); setError('Outra aba atualizou as conversas deste aparelho. Exporte a conversa atual e recarregue a página antes de continuar.');
    };
    window.addEventListener('storage', storageChanged);
    return () => window.removeEventListener('storage', storageChanged);
  }, [mode, scope, change, readRemote]);

  const flush = useCallback(async (id = current.current.activeId) => {
    const target = scope;
    const save = async () => {
      if (!target || target !== liveScope.current || current.current.scope !== target || changedElsewhere.current) return;
      const item = current.current.items.find(row => row.id === id);
      if (!item?.synced || !item.dirty || item.conflict || !item.messages.length || mode !== 'cloud' || !account) return;
      if (item.messages.length > 1000) { setError('Esta conversa atingiu o limite de sincronização. Todas as mensagens continuam neste aparelho; exporte e abra uma nova conversa.'); return; }
      const content = conversationFingerprint(item);
      setStatus('Guardando conversa na conta…');
      try {
        const result = await api<{ revision: number; updatedAt: string }>('/api/conversations', { action: 'save', accountId: account, conversation: item });
        if (target !== liveScope.current) return;
        change(previous => ({ ...previous, items: previous.items.map(row => row.id === id ? { ...row, revision: result.revision, dirty: conversationFingerprint(row) !== content } : row) }), target);
        setStatus('Conversa guardada na conta');
      } catch (cause) {
        if (target !== liveScope.current) return;
        if (cause instanceof ApiError && cause.status === 409) change(previous => ({ ...previous, items: previous.items.map(row => row.id === id ? { ...row, conflict: true } : row) }), target);
        setStatus('Cópia neste aparelho'); setError(cause instanceof Error ? cause.message : 'Não consegui guardar a conversa na conta.');
      }
    };
    const pending = serial.current.then(save); serial.current = pending.catch(() => {}); await pending;
  }, [mode, account, scope, otherTab, change]);
  useEffect(() => {
    if (!ready || !active?.synced || !active.dirty || active.conflict) return;
    const timer = setTimeout(() => { void flush(active.id); }, 1200);
    return () => clearTimeout(timer);
  }, [ready, active, flush]);
  const activeId = active?.id;
  const setMessages = useCallback((update: (previous: AssistantMessage[]) => AssistantMessage[]) => {
    change(previous => ({ ...previous, items: previous.items.map(item => {
    if (item.id !== activeId) return item;
    const messages = update(item.messages);
    return { ...item, messages, dirty: true, title: item.title === 'Nova conversa' ? conversationTitle(messages) : item.title, updatedAt: new Date().toISOString() };
    }) }));
    if (activeId && current.current.activeId !== activeId) void flush(activeId);
  }, [change, activeId, flush]);
  async function startNew() {
    const target = scope; await flush();
    if (target !== liveScope.current) return;
    const item = newConversation(mode === 'cloud');
    change(previous => ({ ...previous, activeId: item.id, items: [...previous.items.filter(row => row.messages.length || row.pinned), item] }));
  }
  async function open(id: string) {
    const target = scope; await flush();
    if (target === liveScope.current) change(previous => previous.items.some(item => item.id === id) ? { ...previous, activeId: id } : previous);
  }
  function edit(id: string, fields: Partial<Pick<Conversation, 'title' | 'pinned' | 'archived' | 'mode' | 'synced'>>) {
    change(previous => ({ ...previous, items: previous.items.map(item => item.id === id ? { ...item, ...fields, dirty: true, updatedAt: new Date().toISOString() } : item) }));
    void flush(id);
  }
  async function remove(id: string) {
    const target = scope; await serial.current;
    if (target !== liveScope.current) return;
    const item = current.current.items.find(row => row.id === id);
    if (mode === 'cloud' && account) await api('/api/conversations', { action: 'delete', accountId: account, id, revision: item?.revision ?? 0 });
    if (target !== liveScope.current) return;
    change(previous => {
      const records = previous.items.filter(row => row.id !== id);
      if (!records.length) records.push(newConversation(mode === 'cloud'));
      return { ...previous, items: records, activeId: records.some(row => row.id === previous.activeId) ? previous.activeId : records[0].id };
    });
  }
  function append(result: RemotePage, target: string) {
    if (target !== liveScope.current || result.accountId !== account) return false;
    const records = result.items.flatMap(row => { const item = parseConversation(row); return item ? [item] : []; });
    change(previous => ({ ...previous, items: [...previous.items, ...records.filter(item => !previous.items.some(row => row.id === item.id))] }), target);
    return true;
  }
  async function loadMore() {
    const target = scope;
    const result = await api<RemotePage>(`/api/conversations?page=${page.current + 1}`);
    if (!append(result, target)) return;
    page.current++; setHasMore(result.hasMore);
  }
  // Opens a conversation of this account even if it is not loaded yet (an external assistant may have just created it).
  async function reveal(id: string) {
    const target = scope;
    if (mode === 'cloud' && account && !current.current.items.some(item => item.id === id) && !append(await api<RemotePage>(`/api/conversations?id=${id}`), target)) return false;
    await open(id);
    return current.current.activeId === id;
  }
  function recoverLegacy() {
    try {
      const recovered = legacyConversations(JSON.parse(localStorage.getItem(LEGACY_CHAT_KEY) ?? '[]'), JSON.parse(localStorage.getItem(LEGACY_ARCHIVE_KEY) ?? '[]'));
      change(previous => ({ ...previous, legacyRecovered: true, items: [...previous.items, ...recovered.map(item => ({ ...item, id: crypto.randomUUID(), synced: false, revision: 0 }))] }));
      setHasLegacy(false);
    } catch { setError('Não consegui recuperar o histórico antigo. Os arquivos originais continuam neste aparelho.'); }
  }
  return { active, items, accountId: mode === 'cloud' ? account : undefined, messages: active?.messages ?? [], ready, error, status, hasMore, hasLegacy,
    setMessages, startNew, open, reveal, edit, remove, loadMore, flush, recoverLegacy, reload: () => readRemote(scope) };
}
export type ConversationManager = ReturnType<typeof useConversations>;
