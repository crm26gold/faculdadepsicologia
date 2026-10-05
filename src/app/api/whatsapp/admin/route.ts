import { createHash, randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import { dbError, readSession, reply, rpc, writeRequest } from '@/lib/api-route';
import { applicationOrigin } from '@/lib/auth-input';
import { whatsappServerSecret } from '@/lib/bot/secrets';

export const dynamic = 'force-dynamic';
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('rotate') }).strict(),
  z.object({ action: z.literal('code') }).strict(),
  z.object({ action: z.literal('unlink') }).strict(),
  z.object({ action: z.literal('save'), enabled: z.boolean(), stt_connection: z.string().max(80), stt_model: z.string().trim().min(1).max(160), voice: z.enum(['pt-BR-AntonioNeural', 'pt-BR-FranciscaNeural']) }).strict(),
]);
export async function GET() {
  const session = await readSession();
  return session instanceof Response ? session : rpc(session, 'whatsapp_admin');
}
export async function POST(request: Request) {
  const input = await writeRequest(request, action, 4000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  if (body.action === 'rotate') {
    const origin = applicationOrigin(process.env);
    if (!origin) return reply({ error: 'Endereço da Jornada não configurado.' }, 503);
    try {
      const token = `jpwa_${randomBytes(32).toString('base64url')}`;
      const hash = (value: string) => createHash('sha256').update(value).digest('hex');
      const saved = await session.client.rpc('whatsapp_admin', { operation: 'rotate', payload: { token_hash: hash(token), server_hash: hash(whatsappServerSecret()) } });
      if (saved.error) return dbError(saved.error);
      return reply({ ok: true, data: { config: { origin, token }, state: saved.data } });
    } catch { return reply({ error: 'Configure o cofre de chaves da Jornada antes de criar a ponte.' }, 503); }
  }
  if (body.action === 'code') {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
    const saved = await session.client.rpc('whatsapp_admin', { operation: 'code', payload: { code_hash: createHash('sha256').update(code).digest('hex') } });
    if (saved.error) return dbError(saved.error);
    return reply({ ok: true, data: { code, link: `https://wa.me/${saved.data.relay}?text=${encodeURIComponent(`/vincular ${code}`)}` } });
  }
  if (body.action === 'save') {
    const current = await session.client.rpc('whatsapp_admin');
    if (current.error) return dbError(current.error);
    const connection = current.data.connections.find((item: { id: string; provider: string }) => item.id === body.stt_connection);
    if (!connection || body.stt_model.startsWith('auto:') && !['gemini', 'groq', 'openai'].includes(connection.provider)) return reply({ error: 'Nesta conexão Google Cloud, informe um modelo habilitado no seu projeto. Gemini permite escolha automática; Groq e OpenAI usam transcrição própria para áudio.' }, 400);
  }
  return rpc(session, 'whatsapp_admin', { operation: body.action, payload: body });
}
