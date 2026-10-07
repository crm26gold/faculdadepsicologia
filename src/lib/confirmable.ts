import { z } from 'zod';
import { adminAction } from './community';
import { aiProviderIds, aiTaskIds } from './ai/catalog';

// What an assistant may propose but never run: collective deletions and, for the general administrator,
// account plans, open access and which AI serves a task. The server stores the proposal worded by the
// database; once the person confirms in the app, the screen's own route runs it with the person's login,
// so the screen's permission checks decide. Runs in the browser and on the server.
export const collectiveDeletions = { delete_post: 'post', delete_poll: 'poll', delete_assignment: 'assignment', delete_part: 'part', delete_contact: 'contact' } as const;
export type CollectiveDeletionFn = keyof typeof collectiveDeletions;
export type CollectiveDeletion = { type: 'excluir_coletivo'; fn: CollectiveDeletionFn; target: string };
export const deletionNouns = { post: 'publicação', poll: 'enquete', assignment: 'trabalho', part: 'parte do trabalho', contact: 'contato' } as const;

// The only administrative requests a confirmation may replay. Making someone master is not one of them:
// the server copies the account's current master flag into the proposal.
const routeChange = z.object({ action: z.literal('save_route'), task: z.enum(aiTaskIds), provider: z.enum(aiProviderIds), connection_id: z.null(),
  model: z.string().trim().min(1).max(120), enabled: z.boolean(), routing_mode: z.enum(['fixed', 'auto']), fallbacks: z.array(z.never()).max(0) });
export const adminRequest = z.union([
  z.object({ url: z.literal('/api/admin'), body: adminAction }),
  z.object({ url: z.literal('/api/ai/admin'), body: routeChange }),
]);
export type AdminRequest = z.infer<typeof adminRequest>;
export type AdminChange = { type: 'administrar'; request: AdminRequest };

export type ConfirmableAction = CollectiveDeletion | AdminChange;
export type ConfirmablePending = { action: ConfirmableAction; fingerprint: string; label: string };

export const isConfirmable = (item: { action: { type: string } }): item is ConfirmablePending =>
  (item.action.type === 'excluir_coletivo' && (item.action as CollectiveDeletion).fn in collectiveDeletions)
  || (item.action.type === 'administrar' && adminRequest.safeParse((item.action as AdminChange).request).success);

/** The screen request that performs a confirmed item. */
export function confirmRequest(action: ConfirmableAction): { url: string; body: Record<string, unknown> } {
  if (action.type === 'administrar') return adminRequest.parse(action.request);
  switch (action.fn) {
    case 'delete_post': return { url: '/api/spaces', body: { action: 'delete_post', post: action.target } };
    case 'delete_poll': return { url: '/api/spaces', body: { action: 'delete_poll', poll: action.target } };
    case 'delete_assignment': return { url: '/api/work', body: { action: 'delete_assignment', assignment: action.target } };
    case 'delete_part': return { url: '/api/work', body: { action: 'delete_part', part: action.target } };
    case 'delete_contact': return { url: '/api/contacts', body: { action: 'delete', contact: action.target } };
  }
}

type Post = (url: string, body: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
const shown = (label: string) => label.replace(/^Excluir /, '');
/** Runs confirmed items one by one; each one the screen refuses is reported with the screen's reason. */
export async function confirmPending(items: ConfirmablePending[], post: Post) {
  const deleted: string[] = [], changed: string[] = [], failed: string[] = [];
  for (const item of items) {
    const request = confirmRequest(item.action);
    const outcome = await post(request.url, request.body).catch(() => ({ ok: false, error: 'sem conexão' }));
    if (outcome.ok) (item.action.type === 'excluir_coletivo' ? deleted : changed).push(shown(item.label));
    else failed.push(`${shown(item.label)}: ${(outcome.error ?? 'não foi possível').replace(/[.\s]+$/, '')}`);
  }
  return { deleted, changed, failed };
}

export const confirmSummary = ({ deleted, changed, failed }: { deleted: string[]; changed: string[]; failed: string[] }) =>
  [deleted.length ? `Excluído: ${deleted.join('; ')}.` : '', changed.length ? `Feito: ${changed.join('; ')}.` : '',
    failed.length ? `Não consegui: ${failed.join('; ')}.` : ''].filter(Boolean).join(' ');
