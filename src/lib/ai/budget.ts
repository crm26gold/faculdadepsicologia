import 'server-only';
import type { userSession } from '../supabase/server';
import { dbError } from '../api-route';

type Session = NonNullable<Awaited<ReturnType<typeof userSession>>>;
/** Database counters work across Vercel instances. Clients cannot select their own limits or another account. */
export async function requestBudget(session: Session, scope: 'ai' | 'live' | 'upload' | 'media', units = 1): Promise<Response | null> {
  const { data, error } = await session.client.rpc('consume_jornada_budget', { budget_scope: scope, budget_units: units });
  if (error) return dbError(error);
  if (data?.allowed === true) return null;
  const retry = Math.min(86_400, Math.max(1, Number(data?.retry_after) || 60));
  return Response.json({ error: 'Você chegou ao limite temporário de uso. Seus registros continuam guardados; tente novamente mais tarde.' },
    { status: 429, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(retry) } });
}
