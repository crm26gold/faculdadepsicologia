import { readSession } from '@/lib/api-route';
import { requestBudget } from '@/lib/ai/budget';
import { photoTypes } from '@/lib/network';

export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Foto de publicação ou story: o banco confere a cada pedido se a pessoa pode ver a publicação. A foto nunca muda,
// então o navegador guarda por 10 minutos e depois só confirma o acesso, sem baixar de novo.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const empty = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'private, no-store' } });
  const session = await readSession();
  if (session instanceof Response) return session;
  const { id } = await params;
  if (!uuid.test(id)) return empty(400);
  const etag = `"${id.toLowerCase()}"`;
  const cached = request.headers.get('if-none-match')?.split(',').some(value => value.trim().replace(/^W\//, '') === etag) ?? false;
  const { data, error } = await session.client.rpc('network_photo', { target: id, with_data: !cached });
  if (error) return empty(503);
  if (!data || !(photoTypes as readonly string[]).includes(data.mime)) return empty(404);
  const headers = { 'Cache-Control': 'private, max-age=600', 'CDN-Cache-Control': 'no-store', 'Vary': 'Cookie', 'ETag': etag,
    'Content-Type': data.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin', 'Referrer-Policy': 'no-referrer' };
  if (cached) return new Response(null, { status: 304, headers });
  if (typeof data.data !== 'string') return empty(503);
  const bytes = Buffer.from(data.data, 'base64');
  const limited = await requestBudget(session, 'media', bytes.length);
  if (limited) return limited;
  return new Response(bytes, { headers: { ...headers, 'Content-Length': String(bytes.length) } });
}
