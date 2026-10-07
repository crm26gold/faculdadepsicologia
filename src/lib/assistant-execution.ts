import { jobInputSchema, type JobOutcome } from './assistant-jobs';
import { applyCommands, commandResult, executionSummary, type CommandAction, type CommandResult } from './commands';
import type { ConfirmablePending } from './confirmable';
import { screenNames, screenViews } from './screens/names';
import { CURRENT_EDITOR_GENERATION, parseWorkspace, type Workspace } from './workspace';

type Snapshot = { data: Workspace; revision: number };
type Input = ReturnType<typeof jobInputSchema.parse>;
export type SharedCommand = Extract<CommandAction, { type: 'coletivo' }>;
export type SharedResult = { done: string[]; pending: ConfirmablePending[]; failed: string[] };
// The server adapter binds every operation to the authenticated account and lease.
// No account, permission or confirmation supplied by a model enters this interface.
export type ExecutionStore = {
  claim: () => Promise<{ input: unknown } | null>;
  load: () => Promise<Snapshot>;
  plan: (input: Input, workspace: Workspace) => Promise<CommandResult & { model?: string }>;
  commit: (next: Workspace | null, revision: number, outcome: JobOutcome) => Promise<{ conflict: boolean }>;
  fail: (outcome: JobOutcome) => Promise<void>;
  /** Rooms, group work, contacts and administration, run with the person's own permissions. */
  shared?: (actions: SharedCommand[]) => Promise<SharedResult>;
};

const unavailable = 'Pedidos de salas, trabalhos, contatos e administração não estão disponíveis neste canal.';
function sharedSummary(result: SharedResult) {
  return [result.done.length ? `Feito: ${result.done.join('; ')}.` : '',
    result.pending.length ? `Guardei para você confirmar no aplicativo: ${result.pending.map(item => item.label).join('; ')}.` : '',
    result.failed.length ? `Não consegui: ${result.failed.join('; ')}.` : ''].filter(Boolean).join(' ');
}

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
    const personal = plan.actions.filter(action => action.type !== 'coletivo' && action.type !== 'mostrar_tela');
    const collective = plan.actions.filter((action): action is SharedCommand => action.type === 'coletivo');
    // "Show me" opens that screen in the app once the rest is saved; the live view points at the change.
    const shown = plan.actions.findLast(action => action.type === 'mostrar_tela');
    const show = shown?.type === 'mostrar_tela' ? screenViews[shown.tela] : undefined;
    const showText = shown?.type === 'mostrar_tela' ? `Abri ${screenNames[shown.tela]} para você ver.` : '';
    // Shared actions have effects outside this workspace, so they run once, before the commit loop.
    const shared = !collective.length ? null : store.shared ? await store.shared(collective) : { done: [], pending: [], failed: collective.map(() => unavailable) };
    // A conflict retries the same validated proposal against fresh records, never the planner.
    for (let attempt = 0; attempt < 2; attempt++) {
      const executed = applyCommands(workspace.data, personal, { today: input.today, now: Date.now() });
      const next = executed.applied.length ? parseWorkspace(JSON.stringify({ ...executed.data, editorGeneration: CURRENT_EDITOR_GENERATION })) : null;
      const reply = !plan.actions.length ? plan.reply || 'Pode dar mais um detalhe do que deseja?'
        : [shared ? sharedSummary(shared) : '', personal.length ? executionSummary(executed) : '', showText].filter(Boolean).join(' ');
      const outcome: JobOutcome = { saved: true, reply,
        applied: executed.applied, pending: [...executed.pending, ...(shared?.pending ?? [])], failed: [...(shared?.failed ?? []), ...executed.failed], execution,
        ...(shared?.done.length ? { shared: shared.done } : {}), ...(show ? { show } : {}),
        ...('model' in planned && planned.model ? { model: planned.model } : {}) };
      const result = await store.commit(next, workspace.revision, outcome);
      if (!result.conflict) return;
      if (attempt === 0) workspace = await store.load();
    }
    throw new Error(shared?.done.length
      ? `O espaço mudou durante o pedido. Já feito na parte coletiva: ${shared.done.join('; ')}. O resto não foi confirmado; confira antes de retomar.`
      : 'O espaço mudou durante o pedido. Nenhuma alteração deste pedido foi confirmada; confira e retome quando estiver pronto.');
  } catch (cause) {
    await store.fail({ saved: false, reply: cause instanceof Error ? cause.message : 'Não consegui concluir o pedido agora.', applied: [], pending: [], failed: [] });
  }
}
