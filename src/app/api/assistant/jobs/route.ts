import { after } from 'next/server';
import { z } from 'zod';
import { dbError, readSession, reply, writeRequest } from '@/lib/api-route';
import { jobInputSchema, waitingRequests, pendingKey } from '@/lib/assistant-jobs';
import { runAssistantJob } from '@/lib/ai/run-job';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), accountId: z.uuid(), conversationId: z.uuid(), key: z.string().min(1).max(180), input: jobInputSchema }),
  z.object({ action: z.literal('resume'), accountId: z.uuid(), id: z.uuid() }),
  z.object({ action: z.literal('settle'), accountId: z.uuid(), id: z.uuid() }),
]);
export async function GET(request: Request) {
  const session = await readSession();
  if (session instanceof Response) return session;
  const params = new URL(request.url).searchParams;
  const id = params.get('id'), conversation = params.get('conversation'), waiting = params.get('status') === 'needs_confirmation';
  let query = session.client.from('assistant_jobs').select('id,conversation_id,status,input,result,created_at,updated_at').eq('user_id', session.user.id);
  if (id) { if (!z.uuid().safeParse(id).success) return reply({ error: 'Pedido inválido.' }, 400); query = query.eq('id', id); }
  else if (conversation) { if (!z.uuid().safeParse(conversation).success) return reply({ error: 'Conversa inválida.' }, 400); query = query.eq('conversation_id', conversation); }
  else if (waiting) query = query.eq('status', 'needs_confirmation');
  else return reply({ error: 'Escolha uma conversa.' }, 400);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(id ? 1 : 30);
  if (error) return dbError(error);
  return reply({ ok: true, data: { accountId: session.user.id, ...(waiting ? { waiting: waitingRequests(data ?? []) } : { jobs: data ?? [] }) } });
}
export async function POST(request: Request) {
  const input = await writeRequest(request, actions, 224_000);
  if (input instanceof Response) return input;
  const { body, session } = input;
  if (process.env.FACULDADE_CLOUD_WORKSPACE !== 'true') return reply({ error: 'Ative a sincronização da Jornada para executar pedidos no servidor.' }, 503);
  if (body.accountId !== session.user.id) return reply({ error: 'Sua conta mudou. Abra o assistente novamente.' }, 409);
  let id: string;
  if (body.action === 'settle') {
    const existing = await session.client.from('assistant_jobs').select('result,status').eq('user_id', session.user.id).eq('id', body.id).single();
    if (existing.error) return dbError(existing.error);
    if (existing.data.status !== 'needs_confirmation') return reply({ ok: true, data: {} });
    const { error } = await session.client.from('assistant_jobs').update({ status: 'done', result: { ...existing.data.result, pending: [] }, updated_at: new Date().toISOString() }).eq('user_id', session.user.id).eq('id', body.id).eq('status', 'needs_confirmation');
    if (error) return dbError(error);
    // Identical copies of this request (the same actions, asked again by a retrying assistant) are settled with it.
    const key = pendingKey(existing.data.result);
    const others = await session.client.from('assistant_jobs').select('id,result').eq('user_id', session.user.id).eq('status', 'needs_confirmation').neq('id', body.id).limit(50);
    for (const row of others.data ?? []) if (pendingKey(row.result) === key)
      await session.client.from('assistant_jobs').update({ status: 'done', result: { ...row.result, pending: [] }, updated_at: new Date().toISOString() }).eq('user_id', session.user.id).eq('id', row.id).eq('status', 'needs_confirmation');
    return reply({ ok: true, data: {} });
  }
  if (body.action === 'resume') id = body.id;
  else {
    const inserted = await session.client.from('assistant_jobs').insert({ user_id: session.user.id, conversation_id: body.conversationId, request_key: body.key, input: body.input }).select('id').single();
    if (inserted.error?.code === '23505') {
      const existing = await session.client.from('assistant_jobs').select('id,input,conversation_id').eq('user_id', session.user.id).eq('request_key', body.key).single();
      if (existing.error || !existing.data) return dbError(existing.error);
      const same = jobInputSchema.safeParse(existing.data.input);
      if (!same.success || JSON.stringify(same.data) !== JSON.stringify(body.input) || existing.data.conversation_id !== body.conversationId) return reply({ error: 'Esse identificador já pertence a outro pedido. Nenhuma nova execução foi criada.' }, 409);
      id = existing.data.id;
    } else if (inserted.error || !inserted.data) return dbError(inserted.error);
    else id = inserted.data.id;
  }
  const found = await session.client.from('assistant_jobs').select('id,status').eq('user_id', session.user.id).eq('id', id).maybeSingle();
  if (found.error) return dbError(found.error);
  if (!found.data) return reply({ error: 'Pedido não encontrado na sua conta.' }, 404);
  if (!['done', 'needs_confirmation'].includes(found.data.status)) after(() => runAssistantJob(session, id));
  return reply({ ok: true, data: { id, status: found.data.status } }, 202);
}
