import { readSession } from '@/lib/api-route';
import { requestBudget } from '@/lib/ai/budget';
import { photoTypes } from '@/lib/network';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Foto da conversa do grupo: o banco confere se a pessoa está no grupo. A foto nunca muda, então o aparelho guarda
// por um ano sem perguntar de novo; assim ela continua à vista depois que o prazo do servidor a apaga.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const empty = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'private, no-store' } });
  const session = await readSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!uuid.test(id)) return empty(400);
  const { data, error } = await session.client.rpc('chat_photo', { target: id });
  if (error) return empty(503);
  if (!data || !(photoTypes as readonly string[]).includes(data.mime) || typeof data.data !== 'string') return empty(404);
  const bytes = Buffer.from(data.data, 'base64');
  const limited = await requestBudget(session, 'media', bytes.length);
  if (limited) return limited;
  return new Response(bytes, { headers: { 'Cache-Control': 'private, max-age=31536000, immutable', 'CDN-Cache-Control': 'no-store', 'Vary': 'Cookie',
    'Content-Type': data.mime, 'Content-Length': String(bytes.length), 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin', 'Referrer-Policy': 'no-referrer' } });
}
