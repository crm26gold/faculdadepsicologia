'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './community/client';
import { jobCanResume, jobFinished, type AssistantJob, type JobOutcome } from '@/lib/assistant-jobs';
import type { AssistantMessage } from '@/lib/conversations';
import type { CommandAction } from '@/lib/commands';
import { dateKey, type Workspace } from '@/lib/workspace';

type Options = { accountId?: string; conversationId?: string; ready: boolean; messages: AssistantMessage[];
  setMessages: (update: (previous: AssistantMessage[]) => AssistantMessage[]) => void;
  ensureSaved: () => Promise<void>; refresh: () => Promise<Workspace>; adopt: (result: JobOutcome, data: Workspace) => void };
type JobPage = { accountId: string; jobs: AssistantJob[] };
export function useAssistantJobs(options: Options) {
  const latest = useRef(options); latest.current = options;
  const { accountId, conversationId, ready } = options;
  const [jobs, setJobs] = useState<AssistantJob[]>([]);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<string>();
  const adopted = useRef(new Set<string>());
  const processing = useRef(false);
  const currentScope = `${accountId || ''}:${conversationId || ''}`;
  const scope = useRef(currentScope); scope.current = currentScope;

  const consume = useCallback(async (page: JobPage, target: string) => {
    if (scope.current !== target || page.accountId !== latest.current.accountId) return;
    setJobs(page.jobs);
    if (processing.current) return;
    const completed = page.jobs.filter(job => job.result && jobFinished(job) && !adopted.current.has(`${job.id}:${job.status}`));
    if (!completed.length) return;
    processing.current = true;
    try {
      const data = completed.some(job => job.result?.saved) ? await latest.current.refresh() : null;
      if (scope.current !== target) return;
      // Oldest first; the most recent pending command is the one offered for confirmation.
      for (const job of completed.toReversed()) {
        const result = job.result!;
        const known = latest.current.messages.find(item => item.id === `job:${job.id}`);
        const message: AssistantMessage = { id: `job:${job.id}`, from: 'assistant', text: result.reply, saved: result.saved, applied: result.applied.length ? result.applied : undefined };
        latest.current.setMessages(previous => previous.some(item => item.id === message.id) ? previous.map(item => item.id === message.id && item.saved !== true ? message : item) : [...previous, message]);
        if (data && result.saved && (!known || known.applied?.length || result.pending.length)) {
          latest.current.adopt(result, data);
          setPendingId(result.pending.length ? job.id : undefined);
        }
        adopted.current.add(`${job.id}:${job.status}`);
      }
    } catch (cause) { if (scope.current === target) setError(cause instanceof Error ? cause.message : 'Não consegui recuperar o resultado.'); }
    finally { processing.current = false; }
  }, []);
  const load = useCallback(async () => {
    const target = currentScope;
    if (!accountId || !conversationId || !ready) return;
    try { await consume(await api<JobPage>(`/api/assistant/jobs?conversation=${conversationId}`), target); }
    catch (cause) { if (scope.current === target) setError(cause instanceof Error ? cause.message : 'Não consegui abrir seus pedidos.'); }
  }, [accountId, conversationId, currentScope, ready, consume]);
  useEffect(() => { adopted.current = new Set(); setJobs([]); setPendingId(undefined); setError(''); void load(); }, [load]);
  const working = jobs.some(job => job.status === 'queued' || job.status === 'working');
  useEffect(() => {
    if (!working || !ready) return;
    const timer = setInterval(() => { void load(); }, 3000);
    return () => clearInterval(timer);
  }, [working, ready, load]);

  async function run(key: string, message: string, signal: AbortSignal, actions?: CommandAction[]) {
    const target = currentScope, initial = latest.current;
    if (!initial.accountId || !initial.conversationId || !initial.ready) throw new Error('Abra a conversa na sua conta antes de executar.');
    signal.throwIfAborted(); await initial.ensureSaved(); signal.throwIfAborted();
    // Once accepted, ending a call must not cancel the server's transaction.
    const accepted = await api<{ id: string; status: AssistantJob['status'] }>('/api/assistant/jobs', { action: 'start', accountId: initial.accountId,
      conversationId: initial.conversationId, key: `${initial.conversationId}:${key}`.slice(0, 180), input: { message, today: dateKey(),
        history: initial.messages.slice(-12).map(item => ({ role: item.from === 'me' ? 'user' : 'assistant', text: item.text.slice(0, 3000) })), ...(actions ? { actions } : {}) } });
    if (scope.current === target) { setError(''); void load(); }
    const until = Date.now() + 65_000;
    while (!signal.aborted && Date.now() < until && scope.current === target) {
      let page: JobPage;
      try { page = await api<JobPage>(`/api/assistant/jobs?id=${accepted.id}`); }
      catch {
        if (scope.current === target) setError('O pedido foi aceito, mas a conexão não trouxe o resultado. Atualize os pedidos antes de repetir a ação.');
        break;
      }
      if (page.accountId !== initial.accountId) throw new Error('Sua conta mudou. O pedido permanece na conta que o enviou.');
      const job = page.jobs[0];
      if (job && jobFinished(job) && job.result) { await consume(page, target); return job.result; }
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    return { saved: false, applied: [], pending: [], failed: [], reply: 'Seu pedido foi recebido e continua no sistema. O resultado aparecerá nesta conversa; não repita a ação.' } satisfies JobOutcome;
  }
  async function resume(job: AssistantJob) {
    if (!accountId || !jobCanResume(job)) return;
    setError(''); adopted.current.delete(`${job.id}:failed`);
    try { await api('/api/assistant/jobs', { action: 'resume', accountId, id: job.id }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não consegui retomar o pedido.'); }
  }
  async function settle() {
    if (!accountId || !pendingId) return;
    try {
      await api('/api/assistant/jobs', { action: 'settle', accountId, id: pendingId });
      adopted.current.add(`${pendingId}:done`); setPendingId(undefined); await load();
    } catch { setError('A decisão foi tratada nesta conversa, mas o histórico do pedido não foi atualizado. Confira os registros antes de confirmar novamente.'); }
  }
  return { jobs, working, error, run, resume, settle, reload: load };
}
