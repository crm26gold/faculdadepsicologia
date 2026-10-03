import 'server-only';
import { jobInputSchema, type JobOutcome } from '../assistant-jobs';
import { applyCommands, commandContext, commandSystem, executionSummary, parseCommand } from '../commands';
import { CURRENT_EDITOR_GENERATION, emptyWorkspace, parseWorkspace } from '../workspace';
import { openKey } from './crypto';
import { AiError, generateResilient } from './providers';
import { requestBudget } from './budget';
import type { userSession } from '../supabase/server';

type Session = NonNullable<Awaited<ReturnType<typeof userSession>>>;
export async function runAssistantJob(session: Session, id: string) {
  const runId = crypto.randomUUID();
  const claimed = await session.client.rpc('claim_assistant_job', { job_id: id, run_id: runId });
  if (claimed.error || !claimed.data) return;
  try {
    const input = jobInputSchema.parse(claimed.data.input);
    const runtime = await session.client.rpc('ai_runtime', { task_id: 'assistente' });
    if (runtime.error || !runtime.data) throw new Error('A Conversa do assistente está desativada. O pedido continua guardado.');
    const limited = await requestBudget(session, 'ai');
    if (limited) throw new Error((await limited.json()).error);
    const load = async () => {
      const result = await session.client.from('personal_workspaces').select('data,revision').eq('owner_id', session.user.id).maybeSingle();
      if (result.error) throw new Error('Não consegui abrir seu espaço. Nenhuma alteração foi feita.');
      return { data: result.data ? parseWorkspace(JSON.stringify(result.data.data)) : emptyWorkspace(), revision: result.data?.revision ?? 0 };
    };
    let workspace = await load();
    const config = { ...runtime.data, key: openKey(runtime.data.key_ciphertext) };
    const result = await generateResilient(config, { system: `${commandSystem}\nContexto atual da pessoa:\n${commandContext(workspace.data, input.today, 20_000, input.message)}`,
      prompt: input.message, history: input.history, maxTokens: 2400, json: true, signal: AbortSignal.timeout(45_000) });
    const plan = parseCommand(result.text);
    // Apply the same validated plan on fresh data on a revision conflict, without generating a second plan.
    for (let attempt = 0; attempt < 2; attempt++) {
      const executed = applyCommands(workspace.data, plan.actions, { today: input.today, now: Date.now() });
      const next = executed.applied.length ? parseWorkspace(JSON.stringify({ ...executed.data, editorGeneration: CURRENT_EDITOR_GENERATION })) : null;
      const outcome: JobOutcome = { saved: true, reply: plan.actions.length ? executionSummary(executed) : plan.reply || 'Pode dar mais um detalhe do que deseja?',
        applied: executed.applied, pending: executed.pending, failed: executed.failed, model: result.model };
      const finished = await session.client.rpc('finish_assistant_job', { job_id: id, run_id: runId, next_data: next, expected_revision: workspace.revision, outcome });
      if (!finished.error) return;
      if (!['PT409', '40001'].includes(finished.error.code) || attempt === 1) throw new Error('O espaço mudou durante o pedido. Nenhuma alteração deste pedido foi confirmada; confira e retome quando estiver pronto.');
      workspace = await load();
    }
  } catch (cause) {
    const outcome: JobOutcome = { saved: false, reply: cause instanceof AiError || cause instanceof Error ? cause.message : 'Não consegui concluir o pedido agora.', applied: [], pending: [], failed: [] };
    await session.client.from('assistant_jobs').update({ status: 'failed', result: outcome, lease: null, lease_until: null, updated_at: new Date().toISOString() }).eq('user_id', session.user.id).eq('id', id).eq('lease', runId).eq('status', 'working');
    console.warn('[assistant-job]', { id, outcome: 'failed' });
  }
}
