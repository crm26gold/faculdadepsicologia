import 'server-only';
import { createHash } from 'node:crypto';
import type { userSession } from '../supabase/server';
import { dbError, reply } from '../api-route';
import { budgetPausedMessage } from '../usage';
import { botServerSecret } from '../bot/secrets';
import { AiError, type AiConfig, type AiCredentialSource } from './providers';

type Session = NonNullable<Awaited<ReturnType<typeof userSession>>>;
const unavailable = () => reply({ error: 'Não foi possível verificar o controle de uso agora.', code: 'jornada_budget_unavailable' }, 503, 'jornada_budget_unavailable');

/** Retains the application refusal when a provider fallback requires another reservation. */
export class BudgetLimitError extends AiError {
  readonly doNotRetry = true;
  readonly retryAfter: number;
  constructor(message: string, readonly response: Response) {
    super(message, response.status);
    this.retryAfter = Number(response.headers.get('Retry-After')) || 60;
  }
}

function waitingTime(seconds: number) {
  const [amount, unit] = seconds < 60 ? [seconds, 'segundo']
    : seconds < 3600 ? [Math.ceil(seconds / 60), 'minuto']
    : seconds < 86_400 ? [Math.ceil(seconds / 3600), 'hora']
    : [Math.ceil(seconds / 86_400), 'dia'];
  return `${amount} ${unit}${amount === 1 ? '' : 's'}`;
}

/** The database permits only the owner to initialize/rotate this application's server verifier. */
export async function configureBudgetGuard(session: Session) {
  const hash = createHash('sha256').update(botServerSecret()).digest('hex');
  return session.client.rpc('configure_jornada_budget_guard', { server_hash: hash });
}
/** Database counters work across Vercel instances. Clients cannot select their own limits or another account. */
export async function requestBudget(session: Session, scope: 'ai' | 'live' | 'upload' | 'media', units = 1, source?: AiCredentialSource): Promise<Response | null> {
  let proof: string;
  try { proof = botServerSecret(); }
  catch { return unavailable(); }
  const params = { server_secret: proof, budget_scope: scope, budget_units: units };
  const reserve = async () => {
    if (!source) return session.client.rpc('app_consume_jornada_budget', params);
    const result = await session.client.rpc('app_consume_jornada_budget_source', { ...params, credential_source: source });
    // Deploy the code before the additive migration. Only the old owner route has a safe legacy guard.
    if (source === 'owner' && ['PGRST202', '42883'].includes(result.error?.code ?? '')) return session.client.rpc('app_consume_jornada_budget', params);
    return result;
  };
  let { data, error } = await reserve();
  if (error?.code === '42501') {
    // One bounded owner-only bootstrap, including after key rotation; never fall back to an unchecked admission.
    const configured = await configureBudgetGuard(session);
    if (configured.error) return unavailable();
    ({ data, error } = await reserve());
  }
  if (error) {
    const failed = dbError(error);
    return Response.json({ ...await failed.json(), code: 'jornada_budget_unavailable' }, { status: failed.status, headers: failed.headers });
  }
  if (data?.allowed === true) return null;
  const reportedRetry = Number(data?.retry_after);
  const retryAfter = Number.isFinite(reportedRetry) && reportedRetry > 0
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(reportedRetry)) : 60;
  const limitedBy = data?.limited_by === 'application' ? 'application' : 'account';
  const message = limitedBy === 'application' ? budgetPausedMessage
    : 'Você chegou ao limite temporário de uso. Seus registros continuam guardados.';
  const voiceUsage = scope === 'live' ? ' Na voz, esse limite inclui testes de conexão e tentativas de chamada.' : '';
  return Response.json({ error: `${message}${voiceUsage} Tente novamente em aproximadamente ${waitingTime(retryAfter)}.`,
    code: 'jornada_budget_exceeded', scope, limitedBy, retryAfter },
    { status: 429, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(retryAfter) } });
}

export const retryBudget = (session: Session, scope: 'ai' | 'live') => async () => {
  const limited = await requestBudget(session, scope);
  if (limited) {
    const { error } = await limited.clone().json();
    throw new BudgetLimitError(error, limited);
  }
};

/** Each attempt reserves the selected source before contacting the provider. */
export const beforeAttemptBudget = (session: Session, scope: 'ai' | 'live') => async (candidate: AiConfig) => {
  const limited = await requestBudget(session, scope, 1, candidate.source ?? 'owner');
  if (limited) {
    const { error } = await limited.clone().json();
    throw new BudgetLimitError(error, limited);
  }
};
