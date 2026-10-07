'use client';
import { useRef, useState } from 'react';
import { applyCommands, executionSummary, undoApplied, type Applied, type CommandAction, type PendingCommand } from '@/lib/commands';
import { dateKey, type Workspace } from '@/lib/workspace';
import { confirmationIntent } from '@/lib/assistant-query';
import type { VoiceTranscript } from '@/lib/voice/protocol';
import type { JobOutcome, PendingItem } from '@/lib/assistant-jobs';
import { confirmPending, confirmSummary, isConfirmable } from '@/lib/confirmable';

export type Execution = ReturnType<typeof applyCommands> & { saved: boolean; reply: string };
type Options = { data: Workspace; blocked: boolean; update: (change: (previous: Workspace) => Workspace) => boolean; ensureSaved: () => Promise<void> };
export function useAssistantExecutor(options: Options) {
  const latest = useRef(options); latest.current = options;
  const running = useRef(false);
  const pendingRef = useRef<{ items: PendingItem[]; createdAt: number }>({ items: [], createdAt: 0 });
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [executing, setExecuting] = useState(false);
  const lastApplied = useRef<Applied[]>([]);

  function cancel() { pendingRef.current = { items: [], createdAt: 0 }; setPending([]); }
  function reset(applied: Applied[] = []) { cancel(); lastApplied.current = applied; }
  function adopt(outcome: JobOutcome, data: Workspace) {
    latest.current = { ...latest.current, data };
    lastApplied.current = outcome.applied;
    pendingRef.current = { items: outcome.pending, createdAt: Date.now() };
    setPending(outcome.pending);
  }
  async function run(actions: CommandAction[], signal?: AbortSignal, confirmed?: PendingCommand[]): Promise<Execution> {
    if (running.current) throw new Error('Estou salvando o pedido anterior. Aguarde um instante.');
    if (latest.current.blocked) throw new Error('O salvamento está bloqueado. Confira o aviso na página antes de continuar.');
    signal?.throwIfAborted();
    running.current = true; setExecuting(true);
    let outcome: ReturnType<typeof applyCommands> | undefined;
    try {
      const accepted = latest.current.update(previous => {
        signal?.throwIfAborted();
        outcome = applyCommands(previous, actions, { today: dateKey(), now: Date.now(), confirmed });
        return outcome.data;
      });
      if (!accepted || !outcome) throw new Error('A alteração não foi aceita. Confira os dados e o aviso de salvamento.');
      const result = outcome as ReturnType<typeof applyCommands>;
      // Subsequent voice queries see this change even before React has painted it.
      latest.current = { ...latest.current, data: result.data };
      if (result.pending.length) {
        pendingRef.current = { items: result.pending, createdAt: Date.now() }; setPending(result.pending);
      } else cancel();
      if (result.applied.length) {
        lastApplied.current = result.applied;
        try { await latest.current.ensureSaved(); }
        catch (error) { return { ...result, saved: false, reply: `A alteração foi feita neste aparelho, mas o salvamento não foi confirmado. ${error instanceof Error ? error.message : 'Confira o aviso de sincronização.'} Não repita o pedido; confira os dados primeiro.` }; }
      }
      return { ...result, saved: true, reply: executionSummary(result) };
    } finally { running.current = false; setExecuting(false); }
  }
  async function confirm(transcript?: VoiceTranscript, signal?: AbortSignal) {
    const current = pendingRef.current;
    if (!current.items.length) throw new Error('Não há uma alteração aguardando confirmação.');
    if (transcript && (transcript.startedAt <= current.createdAt || confirmationIntent(transcript.text) !== 'confirm')) throw new Error('Para confirmar por voz, diga “confirmo a exclusão” ou “confirmo a substituição”. Você também pode tocar em Confirmar.');
    // Collective deletions run through the screen's own routes with this login; the screen decides permission.
    const collective = current.items.filter(isConfirmable);
    const personal = current.items.filter((item): item is PendingCommand => !isConfirmable(item));
    const shared = collective.length ? await confirmPending(collective, async (url, body) => {
      signal?.throwIfAborted();
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
      const answer = await response.json().catch(() => ({})) as { error?: string };
      return { ok: response.ok, error: answer.error };
    }) : null;
    if (!personal.length) {
      cancel();
      return { data: latest.current.data, applied: [], pending: [], failed: shared?.failed ?? [], saved: true, reply: shared ? confirmSummary(shared) : 'Nenhuma alteração foi feita.' } satisfies Execution;
    }
    // The engine compares both the exact action and the item's pre-confirmation fingerprint.
    const done = await run(personal.map(item => item.action), signal, personal);
    return shared ? { ...done, failed: [...shared.failed, ...done.failed], reply: [confirmSummary(shared), done.reply].filter(Boolean).join(' ') } : done;
  }
  async function undo(applied = lastApplied.current) {
    if (running.current || latest.current.blocked) throw new Error('Aguarde o salvamento antes de desfazer.');
    if (!applied.length) throw new Error('Não há uma ação desta conversa para desfazer.');
    running.current = true; setExecuting(true);
    try {
      const accepted = latest.current.update(previous => {
        const data = undoApplied(previous, applied);
        if (JSON.stringify(previous) === JSON.stringify(data)) throw new Error('Esses itens foram alterados depois. Confira os registros antes de desfazer.');
        latest.current = { ...latest.current, data };
        return data;
      });
      if (!accepted) throw new Error('Não consegui desfazer. Os itens podem ter mudado ou recebido vínculos depois.');
      await latest.current.ensureSaved(); lastApplied.current = []; cancel();
      return { saved: true, reply: 'Última ação desfeita e alteração salva.' };
    } finally { running.current = false; setExecuting(false); }
  }
  return { run, confirm, cancel, reset, adopt, undo, pending, executing, current: () => latest.current.data };
}
