import { NextResponse } from 'next/server';
import { serverSupabase } from '@/lib/supabase/server';
import { demoRequested, validConfiguration } from '@/lib/config';
import { applicationOrigin } from '@/lib/auth-input';
export async function POST(request: Request) {
  if (demoRequested(process.env)) return new NextResponse(null, { status: 404 });
  const origin = applicationOrigin(process.env);
  if (!origin || request.headers.get('origin') !== origin) return new NextResponse('Origem não autorizada.', { status: 403 });
  if (validConfiguration(process.env)) {
    const { error } = await (await serverSupabase()).auth.signOut({ scope: 'local' });
    if (error) return new NextResponse('Não foi possível encerrar a sessão. Tente novamente.', { status: 503 });
  }
  return NextResponse.redirect(origin, 303);
}
