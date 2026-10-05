import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';
import { dbError, readSession, reply, writeRequest } from '@/lib/api-route';

export const dynamic = 'force-dynamic';
const actions = z.object({ action: z.enum(['code', 'unlink']) }).strict();
const missing = (code?: string) => ['PGRST202', '42883'].includes(code ?? '');

export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  const { data, error } = await session.client.rpc('whatsapp_my_link');
  if (missing(error?.code)) return reply({ ok: true, data: { ready: false, available: false, linked: false } });
  return error ? dbError(error) : reply({ ok: true, data: { ...data, ready: true } });
}

export async function POST(request: Request) {
  const input = await writeRequest(request, actions, 1000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = body.action === 'code' ? Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('') : '';
  const { data, error } = await session.client.rpc('whatsapp_my_link', { operation: body.action,
    payload: code ? { code_hash: createHash('sha256').update(code).digest('hex') } : {} });
  if (missing(error?.code)) return reply({ error: 'O vínculo pessoal está aguardando a atualização do banco.' }, 503);
  if (error) return dbError(error);
  return reply({ ok: true, data: code ? { code, link: `https://wa.me/${data.relay}?text=${encodeURIComponent(`/vincular ${code}`)}` } : data });
}
