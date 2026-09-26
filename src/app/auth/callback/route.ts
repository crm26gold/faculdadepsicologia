import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase/server';
import { demoRequested, isGoogleOwner, isGoogleOwnerEmail, oauthConfiguration, validConfiguration } from '@/lib/config';
import { applicationOrigin } from '@/lib/auth-input';

export async function GET(request: Request) {
  if (demoRequested(process.env)) return new NextResponse(null, { status: 404 });
  const origin = applicationOrigin(process.env);
  if (!origin || !oauthConfiguration(process.env)) return new NextResponse('Acesso ainda não configurado.', { status: 503 });
  const params = new URL(request.url).searchParams;
  const code = params.get('code');
  const denied = () => NextResponse.redirect(`${origin}/login?error=access`, { status: 303, headers: { 'Cache-Control': 'no-store' } });
  if (!code || code.length > 2048 || params.has('error')) return denied();
  const client = await serverSupabase();
  // The SSR client verifies PKCE against its HttpOnly cookie.
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (!error && !validConfiguration(process.env) && isGoogleOwnerEmail(data.user, process.env)) {
    await client.auth.signOut({ scope: 'local' });
    return new NextResponse('Conta Google confirmada. Avise no chat que concluiu o primeiro login para finalizar a vinculação da sua conta Master. Seus dados continuam protegidos e nenhum acesso administrativo foi concedido automaticamente.', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  if (error || !isGoogleOwner(data.user, process.env)) {
    await client.auth.signOut({ scope: 'local' });
    return denied();
  }
  return NextResponse.redirect(origin, { status: 303, headers: { 'Cache-Control': 'no-store' } });
}
