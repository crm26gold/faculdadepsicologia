import { demoRequested } from '@/lib/config';
import { botServerSecret } from '@/lib/bot/secrets';
import { botDatabase } from '@/lib/supabase/bot';
import { emptyWorkspace, parseWorkspace } from '@/lib/workspace';
import { readScreenLink } from '@/lib/screens/screen-link';
import { screenModel } from '@/lib/screens/screen-model';
import { renderScreen } from '@/lib/screens/render';

// The image ver_tela points to: inside ChatGPT or Claude (the app frame loads it) or opened by the person. It is drawn
// now from the account of the assistant key sealed in the link; an altered, expired or revoked link gets nothing.
export const dynamic = 'force-dynamic';
const headers = { 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' };
const day = (format: Intl.DateTimeFormatOptions, locale: string) => new Intl.DateTimeFormat(locale, { timeZone: 'America/Sao_Paulo', ...format }).format(new Date());

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (demoRequested(process.env)) return new Response(null, { status: 404, headers });
  const link = readScreenLink((await params).token, Date.now());
  if (!link) return new Response('Este link expirou ou não é válido. Peça a tela de novo ao assistente.', { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } });
  const db = botDatabase();
  if (!db) return new Response('Indisponível.', { status: 503, headers: { ...headers, 'Cache-Control': 'no-store' } });
  const { data, error } = await db.rpc('mcp_context', { server_secret: botServerSecret(), token: link.tokenHash });
  if (error || !data) return new Response('Este link não vale mais. Peça a tela de novo ao assistente.', { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } });
  const workspace = (data as { workspace?: { data?: unknown } }).workspace?.data;
  const model = screenModel(workspace ? parseWorkspace(JSON.stringify(workspace)) : emptyWorkspace(), link.screen,
    day({ year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA'), link.recent);
  const png = await renderScreen(model, day({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }, 'pt-BR'));
  // Kept by the viewer only while the link lives; never by a shared cache.
  return new Response(Buffer.from(png), { headers: { ...headers, 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=600' } });
}
