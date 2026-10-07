import { z } from 'zod';
import type { Applied } from './commands';

export type AssistantMessage = { id: string; from: 'me' | 'assistant'; text: string; noteId?: string; applied?: Applied[]; retry?: string; saved?: boolean };
const messageSchema = z.object({
  id: z.string().min(1).max(180), from: z.enum(['me', 'assistant']), text: z.string().max(10_000),
  noteId: z.string().max(100).optional(), retry: z.string().max(2000).optional(), saved: z.boolean().optional(),
  // Undo data stays with the conversation; the domain executor rechecks the current records.
  applied: z.array(z.object({ label: z.string().max(1000), view: z.string().max(40), id: z.string().optional(), undo: z.record(z.string(), z.unknown()) })).max(100).optional(),
});
export const conversationSchema = z.object({
  id: z.uuid(), title: z.string().trim().min(1).max(100), updatedAt: z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString()),
  mode: z.enum(['text', 'voice', 'mixed']).default('text'), pinned: z.boolean().default(false), archived: z.boolean().default(false),
  // Device copies retain every message, even when they exceed a server upload limit.
  messages: z.array(messageSchema), revision: z.number().int().min(0).default(0), synced: z.boolean().default(false),
  dirty: z.boolean().default(false), conflict: z.boolean().default(false),
});
export type Conversation = Omit<z.infer<typeof conversationSchema>, 'messages'> & { messages: AssistantMessage[] };
export const LEGACY_CHAT_KEY = 'jornada-assistente-conversa';
export const LEGACY_ARCHIVE_KEY = 'jornada-assistente-historico';
export const conversationKey = (account?: string) => `jornada-conversas-v2:${account || 'local'}`;
export const conversationTitle = (messages: AssistantMessage[]) => (messages.find(item => item.from === 'me')?.text.trim() || 'Nova conversa').slice(0, 100);
export function newConversation(synced = false): Conversation {
  return { id: crypto.randomUUID(), title: 'Nova conversa', updatedAt: new Date().toISOString(), messages: [], mode: 'text', pinned: false, archived: false, revision: 0, synced, dirty: false, conflict: false };
}
export function parseConversation(value: unknown): Conversation | null {
  const result = conversationSchema.safeParse(value);
  return result.success ? result.data as Conversation : null;
}
export function parseMessages(value: unknown): AssistantMessage[] {
  return Array.isArray(value) ? value.flatMap(item => { const parsed = messageSchema.safeParse(item); return parsed.success ? [parsed.data as AssistantMessage] : []; }) : [];
}
export function legacyConversations(current: unknown, archives: unknown): Conversation[] {
  const saved = Array.isArray(archives) ? archives.flatMap(item => { const parsed = parseConversation(item); return parsed ? [parsed] : []; }) : [];
  const messages = parseMessages(current);
  return messages.length ? [{ ...newConversation(), title: conversationTitle(messages), messages }, ...saved] : saved;
}
export function sortConversations(list: Conversation[], search = '', filter: 'all' | 'pinned' | 'archived' = 'all') {
  const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
  const query = normalize(search.trim());
  return list.filter(item => (filter !== 'pinned' || item.pinned) && (filter !== 'archived' || item.archived) &&
    (!query || normalize(`${item.title} ${item.messages.map(message => message.text).join(' ')}`).includes(query)))
    .toSorted((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
}
export function conversationText(item: Conversation) {
  return `${item.title}\n${new Date(item.updatedAt).toLocaleString('pt-BR')}\n\n${item.messages.map(message => `${message.from === 'me' ? 'Você' : 'Jornada'}: ${message.text}`).join('\n\n')}`;
}
export const conversationFingerprint = (item: Conversation) => JSON.stringify([item.title, item.mode, item.pinned, item.archived, item.messages]);
export type ConversationLibrary = { activeId: string; items: Conversation[] };
/** Preserve offline edits as a separate device copy when the account has a newer revision. */
export function mergeConversations(library: ConversationLibrary, remote: Conversation[]) {
  let activeId = library.activeId, conflicts = 0;
  const matched = new Map(remote.map(item => [item.id, item]));
  const items = library.items.flatMap(local => {
    const saved = matched.get(local.id);
    if (!saved) return [local];
    matched.delete(local.id);
    if (local.revision > saved.revision) return [local];
    if (conversationFingerprint(local) === conversationFingerprint(saved) || !local.dirty) return [{ ...saved, dirty: false, conflict: false }];
    if (local.revision === saved.revision && !local.conflict) return [local];
    const copy = { ...local, id: crypto.randomUUID(), title: `${local.title.slice(0, 73)} · cópia deste aparelho`, revision: 0, synced: false, conflict: false };
    if (activeId === local.id) activeId = copy.id;
    conflicts++;
    return [copy, saved];
  });
  items.push(...matched.values());
  const active = items.find(item => item.id === activeId);
  if (active && !active.messages.length && !active.pinned && remote.length) activeId = remote[0].id;
  return { library: { activeId, items }, conflicts };
}
