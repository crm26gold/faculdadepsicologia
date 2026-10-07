// Deletions in the collective layer that an assistant may propose. They are stored as a confirmation for
// the person and, once confirmed in the app, run through the screen's own route with the person's login,
// so the screen's permission checks decide. Runs in the browser and on the server.
export const collectiveDeletions = { delete_post: 'post', delete_poll: 'poll', delete_assignment: 'assignment', delete_part: 'part', delete_contact: 'contact' } as const;
export type CollectiveDeletionFn = keyof typeof collectiveDeletions;
export type CollectiveDeletion = { type: 'excluir_coletivo'; fn: CollectiveDeletionFn; target: string };
export type CollectivePending = { action: CollectiveDeletion; fingerprint: string; label: string };
export const deletionNouns = { post: 'publicação', poll: 'enquete', assignment: 'trabalho', part: 'parte do trabalho', contact: 'contato' } as const;

export const isCollectivePending = (item: { action: { type: string } }): item is CollectivePending =>
  item.action.type === 'excluir_coletivo' && (item.action as CollectiveDeletion).fn in collectiveDeletions;

/** The screen request that performs a confirmed deletion. */
export function deletionRequest(action: CollectiveDeletion): { url: string; body: Record<string, string> } {
  switch (action.fn) {
    case 'delete_post': return { url: '/api/spaces', body: { action: 'delete_post', post: action.target } };
    case 'delete_poll': return { url: '/api/spaces', body: { action: 'delete_poll', poll: action.target } };
    case 'delete_assignment': return { url: '/api/work', body: { action: 'delete_assignment', assignment: action.target } };
    case 'delete_part': return { url: '/api/work', body: { action: 'delete_part', part: action.target } };
    case 'delete_contact': return { url: '/api/contacts', body: { action: 'delete', contact: action.target } };
  }
}

type Post = (url: string, body: Record<string, string>) => Promise<{ ok: boolean; error?: string }>;
/** Runs confirmed deletions one by one; each one the screen refuses is reported with the screen's reason. */
export async function confirmCollective(items: CollectivePending[], post: Post) {
  const removed: string[] = [], failed: string[] = [];
  for (const item of items) {
    const request = deletionRequest(item.action);
    const outcome = await post(request.url, request.body).catch(() => ({ ok: false, error: 'sem conexão' }));
    if (outcome.ok) removed.push(item.label.replace(/^Excluir /, ''));
    else failed.push(`${item.label.replace(/^Excluir /, '')}: ${(outcome.error ?? 'não foi possível').replace(/[.\s]+$/, '')}`);
  }
  return { removed, failed };
}

export const collectiveSummary = ({ removed, failed }: { removed: string[]; failed: string[] }) =>
  [removed.length ? `Excluído: ${removed.join('; ')}.` : '', failed.length ? `Não consegui excluir: ${failed.join('; ')}.` : ''].filter(Boolean).join(' ');
