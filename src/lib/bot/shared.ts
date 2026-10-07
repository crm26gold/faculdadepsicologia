import 'server-only';
import { applicationOrigin } from '../auth-input';
import type { CommandAction, TrashEntry } from '../commands';
import type { PendingItem } from '../assistant-jobs';
import { botTransport, homeContext, runSharedCommands } from '../shared-actions';

// Rooms, group work, contacts and administration from Telegram and WhatsApp. The bot acts as the person
// linked to the chat (public.bot_act), with the same rules as the screens. What needs a confirmation is
// stored for the person and approved in the app, in Meu dia.
type Database = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }> };
type Channel = 'telegram' | 'whatsapp';
export type SharedCommand = Extract<CommandAction, { type: 'coletivo' }>;

export const splitShared = <T extends { type: string }>(actions: T[]) => ({
  personal: actions.filter(action => action.type !== 'coletivo'),
  shared: actions.filter(action => action.type === 'coletivo') as unknown as SharedCommand[],
});

/** The linked person's rooms for the model's context; empty when the bot cannot read them. */
export async function botHome(db: Database, serverSecret: string, channel: Channel, chat: string) {
  const { data, error } = await db.rpc('bot_act', { server_secret: serverSecret, channel_id: channel, chat, operation: 'app_home', args: {} });
  return error ? '' : homeContext(data);
}

/** Runs the shared part of a request once; nothing that needs a confirmation runs here. */
export async function botShared(db: Database, serverSecret: string, channel: Channel, chat: string, actions: SharedCommand[]) {
  return runSharedCommands(botTransport(db, serverSecret, channel, chat), actions, applicationOrigin(process.env));
}

/** Stores what needs a confirmation as one request in the person's Meu dia; false when it could not be kept. */
export async function storeBotConfirmation(db: Database, serverSecret: string, channel: Channel, chat: string, pending: PendingItem[]) {
  if (!pending.length) return true;
  const reply = `Para confirmar no aplicativo: ${pending.map(item => item.label).join('; ')}.`;
  const saved = await db.rpc('bot_store_confirmation', { server_secret: serverSecret, channel_id: channel, chat, request_id: crypto.randomUUID(),
    outcome: { saved: true, reply, applied: [], failed: [], pending: pending.slice(0, 8) } });
  return !saved.error;
}

/** The sentence the person reads about the shared part and about what waits in Meu dia. */
export function botSummary(shared: { done: string[]; failed: string[] } | null, waiting: PendingItem[], stored: boolean) {
  return [shared?.done.length ? `Feito: ${shared.done.join('; ')}.` : '',
    waiting.length && stored ? `Guardei para você confirmar no aplicativo, em Meu dia: ${waiting.map(item => item.label).join('; ')}.` : '',
    waiting.length && !stored ? 'Não consegui guardar o pedido de confirmação; nada foi excluído nem alterado. Tente de novo.' : '',
    shared?.failed.length ? `Não consegui: ${shared.failed.join('; ')}.` : ''].filter(Boolean).join(' ');
}

/** The linked person's trash; null when this database does not have it yet (deletions then wait for confirmation). */
export async function botTrash(db: Database, serverSecret: string, channel: Channel, chat: string, actions: { type: string }[]) {
  if (!actions.some(action => action.type === 'excluir' || action.type === 'restaurar')) return null;
  const { data, error } = await db.rpc('bot_act', { server_secret: serverSecret, channel_id: channel, chat, operation: 'trash_list', args: {} });
  return error ? null : (data as TrashEntry[]);
}
