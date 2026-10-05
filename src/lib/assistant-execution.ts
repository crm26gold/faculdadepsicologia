import { jobInputSchema, type JobOutcome } from './assistant-jobs';
import { applyCommands, commandResult, executionSummary, type CommandResult } from './commands';
import { CURRENT_EDITOR_GENERATION, parseWorkspace, type Workspace } from './workspace';

type Snapshot = { data: Workspace; revision: number };
type Input = ReturnType<typeof jobInputSchema.parse>;
// The server adapter binds every operation to the authenticated account and lease.
// No account, permission or confirmation supplied by a model enters this interface.
export type ExecutionStore = {
  claim: () => Promise<{ input: unknown } | null>;
  load: () => Promise<Snapshot>;
  plan: (input: Input, workspace: Workspace) => Promise<CommandResult & { model?: string }>;
  commit: (next: Workspace | null, revision: number, outcome: JobOutcome) => Promise<{ conflict: boolean }>;
  fail: (outcome: JobOutcome) => Promise<void>;
};

/** A durable receipt is published only after the workspace and receipt commit together. */
export async function executeAssistantJob(store: ExecutionStore) {
  const claimed = await store.claim();
  if (!claimed) return;
  try {
    const input = jobInputSchema.parse(claimed.input);
    let workspace = await store.load();
    const planned = input.actions ? { actions: input.actions, reply: '' } : await store.plan(input, workspace.data);
    const plan = commandResult.parse(planned);
    const execution = input.actions ? 'structured' : 'planned';
    // A conflict retries the same validated proposal against fresh records, never the planner.
    for (let attempt = 0; attempt < 2; attempt++) {
      const executed = applyCommands(workspace.data, plan.actions, { today: input.today, now: Date.now() });
      const next = executed.applied.length ? parseWorkspace(JSON.stringify({ ...executed.data, editorGeneration: CURRENT_EDITOR_GENERATION })) : null;
      const outcome: JobOutcome = { saved: true,
        reply: plan.actions.length ? executionSummary(executed) : plan.reply || 'Pode dar mais um detalhe do que deseja?',
        applied: executed.applied, pending: executed.pending, failed: executed.failed, execution,
        ...('model' in planned && planned.model ? { model: planned.model } : {}) };
      const result = await store.commit(next, workspace.revision, outcome);
      if (!result.conflict) return;
      if (attempt === 0) workspace = await store.load();
    }
    throw new Error('O espaço mudou durante o pedido. Nenhuma alteração deste pedido foi confirmada; confira e retome quando estiver pronto.');
  } catch (cause) {
    await store.fail({ saved: false, reply: cause instanceof Error ? cause.message : 'Não consegui concluir o pedido agora.', applied: [], pending: [], failed: [] });
  }
}
