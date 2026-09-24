// Trust deployment configuration, never request Host or forwarded headers.
export function applicationOrigin(env: Record<string, string | undefined>) {
  if (env.VERCEL === '1' && env.VERCEL_ENV === 'preview' && env.VERCEL_PROJECT_ID === 'prj_NX7DcoSWkdMgUdsSHsazXEy2skM3') {
    const host = env.VERCEL_URL;
    if (host && /^faculdadepsicologia-[a-z0-9]+-faculpsi\.vercel\.app$/.test(host)) return `https://${host}`;
  }
  try {
    if (!env.APP_ORIGIN) return null;
    const url = new URL(env.APP_ORIGIN);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol === 'https:' || (!env.VERCEL && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return url.origin;
  } catch { /* Fail closed. */ }
  return null;
}
