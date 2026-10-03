import { z } from 'zod';
import { conversationSchema } from '@/lib/conversations';
import { dbError, readSession, reply, writeRequest } from '@/lib/api-route';

export const dynamic = 'force-dynamic';
const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), accountId: z.uuid(), conversation: conversationSchema.extend({ messages: conversationSchema.shape.messages.max(1000) }) }),
  z.object({ action: z.literal('delete'), accountId: z.uuid(), id: z.uuid(), revision: z.number().int().min(0) }),
]);
export async function GET(request: Request) {
  const session = await readSession();
  if (session instanceof Response) return session;
  const page = Math.min(1000, Math.max(0, Number(new URL(request.url).searchParams.get('page')) || 0));
  const { data, error } = await session.client.from('assistant_conversations').select('*').eq('user_id', session.user.id)
    .order('updated_at', { ascending: false }).order('id').range(Math.floor(page) * 50, Math.floor(page) * 50 + 50);
  if (error) return dbError(error);
  const items = (data ?? []).slice(0, 50).map(row => ({ id: row.id, title: row.title, mode: row.mode, pinned: row.pinned, archived: row.archived,
    messages: row.messages, updatedAt: row.updated_at, revision: row.revision, synced: true }));
  return reply({ ok: true, data: { accountId: session.user.id, items, hasMore: (data?.length ?? 0) > 50 } });
}
export async function POST(request: Request) {
  const input = await writeRequest(request, actions, 4_000_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  if (body.accountId !== session.user.id) return reply({ error: 'A conta mudou. Abra o assistente novamente antes de guardar esta conversa.' }, 409);
  if (body.action === 'delete') {
    const { error } = await session.client.rpc('delete_assistant_conversation', { conversation_id: body.id, expected_revision: body.revision });
    return error ? dbError(error) : reply({ ok: true, data: null });
  }
  const item = body.conversation;
  const row = { id: item.id, user_id: session.user.id, title: item.title, mode: item.mode, pinned: item.pinned, archived: item.archived,
    messages: item.messages, updated_at: new Date().toISOString(), revision: item.revision + 1 };
  // Compare revisions rather than overwriting a conversation edited on another device.
  const result = item.revision === 0
    ? await session.client.from('assistant_conversations').insert(row).select('revision, updated_at').single()
    : await session.client.from('assistant_conversations').update(row).eq('user_id', session.user.id).eq('id', item.id).eq('revision', item.revision).select('revision, updated_at').maybeSingle();
  if (result.error?.code === '23505') return reply({ error: 'Esta conversa já foi guardada por outra aba. Recarregue o histórico; sua cópia está preservada.' }, 409);
  if (result.error) return dbError(result.error);
  if (!result.data) return reply({ error: 'Esta conversa mudou em outro aparelho. Sua cópia está preservada aqui. Exporte-a e reabra a conversa para comparar.' }, 409);
  return reply({ ok: true, data: { revision: result.data.revision, updatedAt: result.data.updated_at } });
}
