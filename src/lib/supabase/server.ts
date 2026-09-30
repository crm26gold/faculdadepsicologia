import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isVerifiedGoogleUser, oauthConfiguration, validConfiguration } from '@/lib/config';
import { authCookieOptions } from '@/lib/auth-cookies';

export async function serverSupabase() {
  if (!oauthConfiguration(process.env)) throw new Error('Configuração de acesso incompleta.');
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: authCookieOptions(process.env),
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try { items.forEach(({ name, value, options }) => jar.set(name, value, options)); }
        catch { /* Server components cannot set cookies; proxy refreshes sessions. */ }
      },
    },
  });
}
// Session of any Google account with a verified e-mail. Each person reaches only
// their own data and the spaces they were invited to, enforced by RLS.
export async function userSession() {
  if (!validConfiguration(process.env)) return null;
  const client = await serverSupabase();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || !isVerifiedGoogleUser(user)) return null;
  return { client, user };
}
