export const EXPECTED_SUPABASE_URL = 'https://uccoaebzmvocqwqljmul.supabase.co';
export const EXPECTED_VERCEL_PROJECT_ID = 'prj_NX7DcoSWkdMgUdsSHsazXEy2skM3';
type Environment = Record<string, string | undefined>;
export const demoRequested = (env: Environment) => env.APP_MODE === 'demo';
export function demoAllowed(env: Environment) {
  if (!demoRequested(env)) return false;
  const forbidden = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN', 'APP_OWNER_USER_ID', 'APP_OWNER_EMAIL', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_CLIENT_SECRET'];
  if (forbidden.some((name) => !!env[name])) return false;
  if (!env.VERCEL) return true;
  return !!env.DEMO_VERCEL_PROJECT_ID && env.VERCEL_PROJECT_ID === env.DEMO_VERCEL_PROJECT_ID && env.VERCEL_PROJECT_ID !== EXPECTED_VERCEL_PROJECT_ID;
}

export function validConfiguration(env: Record<string, string | undefined>) {
  return !demoRequested(env) && (!env.VERCEL || env.VERCEL_PROJECT_ID === EXPECTED_VERCEL_PROJECT_ID) &&
    env.GOOGLE_AUTH_ENABLED === 'true' && !!env.APP_OWNER_EMAIL &&
    env.NEXT_PUBLIC_SUPABASE_URL === EXPECTED_SUPABASE_URL &&
    !!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.APP_OWNER_USER_ID ?? '');
}
export function localPreviewAllowed(env: Record<string, string | undefined>) {
  return !demoRequested(env) && !env.VERCEL && (env.NODE_ENV === 'development' || env.FACULDADE_LOCAL_PREVIEW === 'true');
}

// Check only the server-verified identity, never client-supplied profile roles.
export function isGoogleOwner(user: { id: string; email?: string; identities?: Array<{ provider: string; identity_data?: Record<string, unknown> }> } | null | undefined, env: Environment) {
  const email = env.APP_OWNER_EMAIL?.trim().toLowerCase();
  return !!user && !!email && isOwnerIdentity(user.id, env) && user.email?.toLowerCase() === email &&
    !!user.identities?.some((identity) => identity.provider === 'google' && identity.identity_data?.email_verified === true &&
      String(identity.identity_data.email ?? '').toLowerCase() === email);
}

// Only the explicitly pinned Auth UUID can own this workspace.
export function isOwnerIdentity(userId: string | undefined, env: Record<string, string | undefined>) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.APP_OWNER_USER_ID ?? '') &&
    userId === env.APP_OWNER_USER_ID;
}
