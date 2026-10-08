import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { applicationOrigin } from '@/lib/auth-input';
import { openKey, sealKey } from '@/lib/ai/crypto';
import { agendaCookie, calendarReachable, createCalendar, exchangeCode, GoogleAgendaError, googleAgendaReady } from '@/lib/google-agenda-server';
import { userSession } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function GET(request: NextRequest) {
  const origin = applicationOrigin(process.env);
  if (!origin) return new NextResponse('Acesso ainda não configurado.', { status: 503 });
  const back = (outcome: string) => {
    const response = NextResponse.redirect(`${origin}/?google_agenda=${outcome}#agenda`, 303);
    response.cookies.set(agendaCookie, '', { path: '/api/google-agenda', maxAge: 0 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
  if (!googleAgendaReady(process.env)) return back('indisponivel');
  const params = request.nextUrl.searchParams;
  let saved: { state?: unknown; verifier?: unknown; user?: unknown } = {};
  try { saved = JSON.parse(Buffer.from(request.cookies.get(agendaCookie)?.value ?? '', 'base64url').toString('utf8')); } catch { /* Missing or altered: refused below. */ }
  const state = params.get('state') ?? '', code = params.get('code') ?? '';
  if (typeof saved.state !== 'string' || typeof saved.verifier !== 'string' || !same(saved.state, state)) return back('expirado');
  if (params.has('error')) return back('cancelado');
  const session = await userSession();
  if (!session || session.user.id !== saved.user) return back('expirado');
  if (!code || code.length > 2048) return back('falhou');
  const signal = AbortSignal.timeout(25_000);
  try {
    const { access, refresh } = await exchangeCode(code, saved.verifier, origin, signal);
    // Reconnecting keeps the same "Jornada Plena" calendar when the new grant still reaches it.
    const previous = await session.client.rpc('google_agenda_link');
    const reusable = previous.data?.calendar_id && await calendarReachable(access, previous.data.calendar_id, signal) ? previous.data.calendar_id as string : '';
    const calendar = reusable || await createCalendar(access, signal);
    const stored = await session.client.rpc('google_agenda_save', { next_ciphertext: sealKey(refresh), next_calendar: calendar });
    if (stored.error) return back('falhou');
    // An earlier grant for another calendar is no longer needed.
    if (previous.data?.refresh_ciphertext && !reusable) { try { await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(openKey(previous.data.refresh_ciphertext))}`, { method: 'POST', signal, redirect: 'error' }); } catch { /* Best effort. */ } }
    return back('conectada');
  } catch (cause) {
    console.warn('[google-agenda]', { stage: 'connect', problem: cause instanceof GoogleAgendaError ? cause.problem : 'failed' });
    return back(cause instanceof GoogleAgendaError && /permissão/.test(cause.message) ? 'sem-permissao' : 'falhou');
  }
}
