import 'server-only';
import { executeAssistantJob } from '../assistant-execution';
import { commandContext, commandSystem, parseCommand } from '../commands';
import { emptyWorkspace, parseWorkspace } from '../workspace';
import { runtimeConfig, runtimeForSession } from './runtime';
import { generateResilient } from './providers';
import { beforeAttemptBudget } from './budget';
import type { userSession } from '../supabase/server';

type Session = NonNullable<Awaited<ReturnType<typeof userSession>>>;
export async function runAssistantJob(session: Session, id: string) {
  const runId = crypto.randomUUID();
  await executeAssistantJob({
    claim: async () => {
      const result = await session.client.rpc('claim_assistant_job', { job_id: id, run_id: runId });
      return result.error || !result.data ? null : result.data;
    },
    load: async () => {
      const result = await session.client.from('personal_workspaces').select('data,revision').eq('owner_id', session.user.id).maybeSingle();
      if (result.error) throw new Error('Não consegui abrir seu espaço. Nenhuma alteração foi feita.');
      return { data: result.data ? parseWorkspace(JSON.stringify(result.data.data)) : emptyWorkspace(), revision: result.data?.revision ?? 0 };
    },
    plan: async (input, workspace) => {
      const runtime = await runtimeForSession(session, 'assistente');
      if (runtime.error || !runtime.data) throw new Error('A Conversa do assistente está desativada. O pedido continua guardado.');
      const result = await generateResilient(runtimeConfig(runtime.data), {
        system: `${commandSystem}\nContexto atual da pessoa:\n${commandContext(workspace, input.today, 20_000, input.message)}`,
        prompt: input.message, history: input.history, maxTokens: 2400, json: true,
        signal: AbortSignal.timeout(45_000), beforeAttempt: beforeAttemptBudget(session, 'ai'),
      });
      return { ...parseCommand(result.text), model: result.model };
    },
    commit: async (next, revision, outcome) => {
      const result = await session.client.rpc('finish_assistant_job', { job_id: id, run_id: runId, next_data: next, expected_revision: revision, outcome });
      if (result.error && !['PT409', '40001'].includes(result.error.code)) throw new Error('Não consegui confirmar o salvamento. Confira o resultado nos pedidos antes de repetir.');
      return { conflict: Boolean(result.error) };
    },
    fail: async outcome => {
      await session.client.from('assistant_jobs').update({ status: 'failed', result: outcome, lease: null, lease_until: null, updated_at: new Date().toISOString() }).eq('user_id', session.user.id).eq('id', id).eq('lease', runId).eq('status', 'working');
      console.warn('[assistant-job]', { id, outcome: 'failed' });
    },
  });
}
