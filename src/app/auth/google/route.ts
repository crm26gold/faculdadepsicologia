import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase/server';
import { demoRequested, oauthConfiguration as validConfiguration } from '@/lib/config';
import { applicationOrigin } from '@/lib/auth-input';

export async function POST(request: Request) {
  if (demoRequested(process.env)) return new NextResponse(null, { status: 404 });
  const origin = applicationOrigin(process.env);
  if (!origin || request.headers.get('origin') !== origin) return new NextResponse('Origem não autorizada.', { status: 403 });
  if (!validConfiguration(process.env)) return new NextResponse('Google ainda não configurado.', { status: 503 });
  const client = await serverSupabase();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback`, skipBrowserRedirect: true, scopes: 'openid email profile', queryParams: { prompt: 'select_account' } },
  });
  const response = NextResponse.redirect(error || !data.url ? `${origin}/login?error=oauth` : data.url, 303);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
