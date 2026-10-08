import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { applicationOrigin } from '@/lib/auth-input';
import { authCookieOptions } from '@/lib/auth-cookies';
import { GOOGLE_AGENDA_SCOPE } from '@/lib/google-agenda';
import { agendaCookie, googleAgendaReady, googleAgendaRedirect } from '@/lib/google-agenda-server';
import { userSession } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Form POST from the Agenda: same origin, signed-in person, then the Google consent screen with PKCE.
export async function POST(request: Request) {
  const origin = applicationOrigin(process.env);
  if (!origin || request.headers.get('origin') !== origin) return new NextResponse('Origem não autorizada.', { status: 403 });
  if (!googleAgendaReady(process.env)) return NextResponse.redirect(`${origin}/?google_agenda=indisponivel#agenda`, 303);
  const session = await userSession();
  if (!session) return NextResponse.redirect(`${origin}/login`, 303);
  const state = randomBytes(24).toString('base64url'), verifier = randomBytes(48).toString('base64url');
  const consent = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  consent.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: googleAgendaRedirect(origin), response_type: 'code', scope: GOOGLE_AGENDA_SCOPE,
    access_type: 'offline', prompt: 'consent', state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    ...(session.user.email ? { login_hint: session.user.email } : {}) }).toString();
  const response = NextResponse.redirect(consent.toString(), 303);
  // Ties the answer to this browser and this account for ten minutes.
  response.cookies.set(agendaCookie, Buffer.from(JSON.stringify({ state, verifier, user: session.user.id })).toString('base64url'), { ...authCookieOptions(process.env), path: '/api/google-agenda', maxAge: 600 });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
