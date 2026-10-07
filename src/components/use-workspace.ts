'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CURRENT_EDITOR_GENERATION, dateKey, demoWorkspace, emptyWorkspace, LOCAL_KEY, parseWorkspace, type Workspace } from '@/lib/workspace';
import { ensureCourses } from '@/lib/courses';

export function useWorkspace(mode: 'local' | 'cloud' | 'demo') {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const demo = mode === 'demo';
  const [status, setStatus] = useState('Carregando…');
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const current = useRef(data);
  const saved = useRef(data);
  const baseline = useRef<string | null>(null);
  const key = useRef(LOCAL_KEY);
  const revision = useRef(0);
  const owner = useRef<string | undefined>(undefined);
  const saving = useRef(false);
  const stop = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        let initial: Workspace;
        if (mode === 'demo') {
          initial = demoWorkspace(dateKey());
        } else if (mode === 'local') {
          key.current = LOCAL_KEY;
          const raw = localStorage.getItem(key.current);
          // Reading never overwrites or reseeds a previous workspace.
          initial = raw !== null ? parseWorkspace(raw) : emptyWorkspace();
          baseline.current = raw;
        } else {
          const response = await fetch('/api/workspace', { cache: 'no-store' });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          initial = parseWorkspace(JSON.stringify(result.data));
          revision.current = result.revision;
          owner.current = result.accountId;
        }
        // Held in memory only; the next accepted update() persists it.
        initial = ensureCourses(initial);
        if (!active) return;
        current.current = initial; saved.current = initial; setData(initial);
        setStatus(mode === 'demo' ? 'Exemplos temporários · não salvos' : mode === 'local' ? 'Somente neste navegador' : revision.current === 0 ? 'Nenhum registro salvo na nuvem ainda' : 'Sincronizado');
        setReady(true);
      } catch {
        if (!active) return;
        stop.current = true; setBlocked(true); setError('Não foi possível carregar seus dados. Nada foi substituído. Tente recarregar ou recuperar seu backup.');
      }
    }
    void load();
    const storageChanged = (event: StorageEvent) => {
      if ((event.key === key.current || event.key === null) && event.newValue !== baseline.current) {
        stop.current = true; setBlocked(true);
        setError('Outra aba alterou este espaço. Exporte uma cópia e recarregue para evitar sobrescrever alterações.');
      }
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (saved.current !== current.current) { event.preventDefault(); event.returnValue = ''; }
    };
    if (mode === 'local') window.addEventListener('storage', storageChanged);
    if (mode !== 'demo') window.addEventListener('beforeunload', beforeUnload);
    return () => { active = false; window.removeEventListener('storage', storageChanged); window.removeEventListener('beforeunload', beforeUnload); };
  }, [mode]);

  const flush = useCallback(async () => {
    if (saving.current || stop.current) return;
    saving.current = true;
    try {
      while (saved.current !== current.current) {
        const snapshot = current.current;
        setStatus('Salvando…');
        const raw = JSON.stringify(snapshot);
        parseWorkspace(raw);
        if (mode === 'local') {
          if (localStorage.getItem(key.current) !== baseline.current) throw new Error('Outra aba alterou os dados. Exporte esta versão e recarregue.');
          localStorage.setItem(key.current, raw);
          baseline.current = raw;
        } else {
          const response = await fetch('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: snapshot, revision: revision.current, accountId: owner.current }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          revision.current = result.revision;
        }
        saved.current = snapshot;
      }
      setStatus(mode === 'local' ? 'Salvo neste navegador' : 'Sincronizado');
    } catch (reason) {
      stop.current = true; setBlocked(true); setStatus('Não salvo');
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar. Exporte uma cópia antes de sair.');
    } finally { saving.current = false; }
  }, [mode]);

  const update = useCallback((change: (previous: Workspace) => Workspace) => {
    if (!ready || stop.current) return false;
    let next: Workspace;
    try { next = parseWorkspace(JSON.stringify({ ...change(current.current), editorGeneration: CURRENT_EDITOR_GENERATION })); }
    catch { setError('Alteração inválida ou limite de dados atingido. A versão anterior foi preservada.'); return false; }
    setError('');
    current.current = next; setData(next);
    // True means accepted locally, not yet confirmed by the remote database.
    if (mode === 'demo') { saved.current = next; return true; }
    void flush();
    return true;
  }, [flush, ready, mode]);

  function resetDemo() {
    if (!demo) return;
    const next = demoWorkspace(dateKey());
    current.current = next; saved.current = next; setData(next); setError('');
  }

  async function ensureSaved() {
    if (stop.current) throw new Error('A sincronização está bloqueada. Confira o aviso antes de continuar.');
    const deadline = Date.now() + 30_000;
    while (saved.current !== current.current) {
      if (stop.current) throw new Error('Salvamento interrompido. Exporte seus dados antes de sair.');
      if (Date.now() > deadline) throw new Error('A sincronização está demorando. Aguarde e tente novamente.');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  async function refresh(expectedAccount = owner.current) {
    await ensureSaved();
    if (mode !== 'cloud') return current.current;
    const snapshot = current.current;
    const response = await fetch(`/api/workspace${expectedAccount ? `?accountId=${encodeURIComponent(expectedAccount)}` : ''}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não consegui atualizar seu espaço.');
    if (expectedAccount && result.accountId !== expectedAccount) throw new Error('A conta mudou. Recarregue antes de recuperar o pedido.');
    const next = parseWorkspace(JSON.stringify(result.data));
    // A server result must never erase changes accepted locally while fetching.
    if (stop.current || saving.current || current.current !== snapshot || saved.current !== snapshot) throw new Error('Seu espaço mudou neste aparelho. Aguarde a sincronização antes de recuperar o pedido.');
    if (result.revision < revision.current) throw new Error('Recebi uma versão anterior do espaço. Tente atualizar novamente.');
    revision.current = result.revision;
    current.current = next; saved.current = next; setData(next); setStatus('Sincronizado');
    return next;
  }
  return { data, ready, demo, status, error, blocked, update, resetDemo, ensureSaved, refresh, revisionNow: () => revision.current, snapshotNow: () => current.current };
}
