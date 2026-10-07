import 'server-only';
import { applicationOrigin } from '../auth-input';
import type { CommandAction } from '../commands';
import { botTransport, homeContext, runSharedCommands } from '../shared-actions';

// Rooms, group work, contacts and administration from Telegram and WhatsApp. The bot acts as the person
// linked to the chat (public.bot_act), with the same rules as the screens. Deletions and administration
// are stored as a confirmation the person approves in the app, in Meu dia.
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

/** Runs the shared part of a request once and returns the sentence the person reads. */
export async function botShared(db: Database, serverSecret: string, channel: Channel, chat: string, actions: SharedCommand[]) {
  const result = await runSharedCommands(botTransport(db, serverSecret, channel, chat), actions, applicationOrigin(process.env));
  let stored = false;
  if (result.pending.length) {
    const reply = `Para confirmar no aplicativo: ${result.pending.map(item => item.label).join('; ')}.`;
    const saved = await db.rpc('bot_store_confirmation', { server_secret: serverSecret, channel_id: channel, chat, request_id: crypto.randomUUID(),
      outcome: { saved: true, reply, applied: [], failed: [], pending: result.pending } });
    stored = !saved.error;
    if (!stored) result.failed.push('não consegui guardar o pedido de confirmação; nada foi excluído nem alterado');
  }
  const text = [result.done.length ? `Feito: ${result.done.join('; ')}.` : '',
    stored ? `Guardei para você confirmar no aplicativo, em Meu dia: ${result.pending.map(item => item.label).join('; ')}.` : '',
    result.failed.length ? `Não consegui: ${result.failed.join('; ')}.` : ''].filter(Boolean).join(' ');
  return { text, done: result.done };
}
