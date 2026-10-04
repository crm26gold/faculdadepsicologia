import 'server-only';
import { createHash } from 'node:crypto';
import type { userSession } from '../supabase/server';
import { dbError } from '../api-route';
import { budgetPausedMessage } from '../usage';
import { botServerSecret } from '../bot/secrets';
import { AiError } from './providers';

type Session = NonNullable<Awaited<ReturnType<typeof userSession>>>;
const unavailable = () => Response.json({ error: 'Não foi possível verificar o controle de uso agora.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });

/** The database permits only the owner to initialize/rotate this application's server verifier. */
export async function configureBudgetGuard(session: Session) {
  const hash = createHash('sha256').update(botServerSecret()).digest('hex');
  return session.client.rpc('configure_jornada_budget_guard', { server_hash: hash });
}
/** Database counters work across Vercel instances. Clients cannot select their own limits or another account. */
export async function requestBudget(session: Session, scope: 'ai' | 'live' | 'upload' | 'media', units = 1): Promise<Response | null> {
  let proof: string;
  try { proof = botServerSecret(); }
  catch { return unavailable(); }
  const params = { server_secret: proof, budget_scope: scope, budget_units: units };
  let { data, error } = await session.client.rpc('app_consume_jornada_budget', params);
  if (error?.code === '42501') {
    // One bounded owner-only bootstrap, including after key rotation; never fall back to an unchecked admission.
    const configured = await configureBudgetGuard(session);
    if (configured.error) return unavailable();
    ({ data, error } = await session.client.rpc('app_consume_jornada_budget', params));
  }
  if (error) return dbError(error);
  if (data?.allowed === true) return null;
  const retry = Math.min(86_400, Math.max(1, Number(data?.retry_after) || 60));
  return Response.json({ error: data?.limited_by === 'application' ? budgetPausedMessage : 'Você chegou ao limite temporário de uso. Seus registros continuam guardados; tente novamente mais tarde.' },
    { status: 429, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(retry) } });
}

export const retryBudget = (session: Session, scope: 'ai' | 'live') => async () => {
  const limited = await requestBudget(session, scope);
  if (limited) throw new AiError((await limited.json()).error, limited.status);
};
