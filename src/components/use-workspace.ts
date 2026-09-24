'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dateKey, demoWorkspace, emptyWorkspace, LOCAL_KEY, parseWorkspace, type Workspace } from '@/lib/workspace';

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
        }
        if (!active) return;
        current.current = initial; saved.current = initial; setData(initial);
        setStatus(mode === 'demo' ? 'Exemplos temporários · não salvos' : mode === 'local' ? 'Somente neste navegador' : 'Sincronizado');
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
          const response = await fetch('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: snapshot, revision: revision.current }) });
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
    if (!ready || stop.current) return;
    let next: Workspace;
    try { next = parseWorkspace(JSON.stringify(change(current.current))); }
    catch { setError('Alteração inválida ou limite de dados atingido. A versão anterior foi preservada.'); return; }
    setError('');
    current.current = next; setData(next);
    if (mode === 'demo') { saved.current = next; return; }
    void flush();
  }, [flush, ready, mode]);

  function resetDemo() {
    if (!demo) return;
    const next = demoWorkspace(dateKey());
    current.current = next; saved.current = next; setData(next); setError('');
  }

  return { data, ready, demo, status, error, blocked, update, resetDemo };
}
