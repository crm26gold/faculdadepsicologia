import { userSession } from '@/lib/supabase/server';
import { demoRequested } from '@/lib/config';
import { emptyWorkspace, parseWorkspace } from '@/lib/workspace';
import { screenModel, screens, type Screen } from '@/lib/screens/screen-model';
import { renderScreen } from '@/lib/screens/render';

// A screen's visual summary (not a capture), opened by the signed-in person. Assistants now hand over the
// short-lived link of /api/tela/ver instead; this one stays for links already sent. It renders the signed-in person's own screen now; nobody else's data.
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
// Opened inside a chat app's own browser, the Jornada login may be missing: say so and offer it.
const signIn = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resumo visual da Jornada</title><body style="font-family:system-ui,sans-serif;background:#0c1725;color:#e4edf6;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center"><main style="max-width:360px"><h1 style="font-size:20px">Entre para ver a imagem</h1><p style="color:#a4b7c9;line-height:1.5">A imagem tem seus dados pessoais, então só abre com o seu login. Se o link abriu dentro do app de IA, abra-o no navegador em que você usa a Jornada.</p><a href="/login" style="display:inline-block;margin-top:12px;padding:12px 18px;border-radius:12px;background:#123f61;color:#fff;text-decoration:none;font-weight:600">Entrar na Jornada</a></main></body></html>';
const day = (format: Intl.DateTimeFormatOptions, locale: string) => new Intl.DateTimeFormat(locale, { timeZone: 'America/Sao_Paulo', ...format }).format(new Date());

export async function GET(_request: Request, { params }: { params: Promise<{ screen: string }> }) {
  if (demoRequested(process.env)) return new Response(null, { status: 404, headers });
  const { screen } = await params;
  const tela = screen.replace(/\.png$/, '');
  if (!(screens as readonly string[]).includes(tela)) return new Response('Tela desconhecida.', { status: 404, headers });
  const session = await userSession();
  if (!session) return new Response(signIn, { status: 401, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
  const { data, error } = await session.client.from('personal_workspaces').select('data').eq('owner_id', session.user.id).maybeSingle();
  if (error) return new Response('Não consegui abrir seu espaço agora.', { status: 503, headers });
  const workspace = data?.data ? parseWorkspace(JSON.stringify(data.data)) : emptyWorkspace();
  const today = day({ year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA');
  const png = await renderScreen(screenModel(workspace, tela as Screen, today), day({ day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }, 'pt-BR'));
  return new Response(Buffer.from(png), { headers: { ...headers, 'Content-Type': 'image/png' } });
}
