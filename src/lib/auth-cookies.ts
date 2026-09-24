export function authCookieOptions(env: Record<string, string | undefined>) {
  return {
    httpOnly: true,
    secure: env.VERCEL === '1' || env.APP_ORIGIN?.startsWith('https:') === true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  };
}
