import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { demoRequested, validConfiguration } from '@/lib/config';
import { authCookieOptions } from '@/lib/auth-cookies';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set('Cache-Control', 'private, no-store');
  if (demoRequested(process.env) && (request.nextUrl.pathname.startsWith('/api/') || request.nextUrl.pathname.startsWith('/auth/'))) {
    return new NextResponse('Indisponível na demonstração.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!validConfiguration(process.env)) return response;
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: authCookieOptions(process.env),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/', '/login', '/api/:path*', '/auth/:path*'] };
