/**
 * Why a provider call failed. Only the class is kept: provider text can echo prompts, keys or personal
 * data, so it never reaches a person or a log. runAiAttempts picks one action per class.
 */
export type AiFailureKind = 'network' | 'server' | 'rate_limit' | 'billing' | 'auth' | 'model' | 'invalid';

// Structured codes from error.code, error.type, error.status and Google's error.details[].reason, compared in lower case.
const billingCodes = new Set(['insufficient_quota', 'insufficient_credits', 'insufficient_balance', 'payment_required', 'billing_error', 'billing_disabled', 'billing_required', 'billing_not_active', 'billing_hard_limit_reached']);
const rateCodes = new Set(['rate_limit_exceeded', 'rate_limit_error']);
const authCodes = new Set(['invalid_api_key', 'api_key_invalid', 'api_key_expired', 'api_key_not_found', 'api_key_service_blocked', 'api_key_http_referrer_blocked', 'api_key_ip_address_blocked', 'service_disabled']);
const modelCodes = new Set(['model_not_found']);
// Last resort for bodies without a billing code (Anthropic answers 400, Gemini and xAI may answer 429 or 403).
// Whole phrases only: "quota" or "billing" alone also appear in ordinary rate-limit messages.
const billingText = /credit balance is too low|insufficient (?:balance|credits)|credits are depleted|used all available credits|monthly spending limit/i;

const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Codes and message of a JSON error body, read only to classify it. */
export function providerSignals(body: unknown) {
  const root = record(body), error = record(root.error);
  const reasons = Array.isArray(error.details) ? error.details.slice(0, 10).map(detail => record(detail).reason) : [];
  return { codes: [error.code, error.type, error.status, root.code, root.type, ...reasons], text: error.message ?? root.message ?? root.error };
}

/** HTTP status 0 means no answer. A known code wins over a misleading status (Gemini rejects bad keys with 400). */
export function failureKind(status: number, signals: { codes?: unknown[]; text?: unknown } = {}): AiFailureKind {
  if (!status) return 'network';
  if (status >= 500) return 'server';
  const codes = (signals.codes ?? []).filter((code): code is string => typeof code === 'string').map(code => code.toLowerCase());
  const has = (known: Set<string>) => codes.some(code => known.has(code));
  if (status === 402 || has(billingCodes) || (typeof signals.text === 'string' && billingText.test(signals.text.slice(0, 2000)))) return 'billing';
  if (status === 429 || has(rateCodes)) return 'rate_limit';
  if (status === 401 || status === 403 || has(authCodes)) return 'auth';
  if (status === 404 || has(modelCodes)) return 'model';
  return 'invalid';
}

const explanations: Record<AiFailureKind, [string, string]> = {
  network: ['sem resposta (rede ou tempo esgotado)', 'Tente de novo em instantes ou use outra conexão.'],
  server: ['serviço instável agora', 'Tente de novo em instantes ou use outra conexão.'],
  rate_limit: ['limite de pedidos da API atingido', 'Aguarde alguns minutos ou use outra conexão.'],
  billing: ['sem saldo na API', 'Recarregue ou ative o faturamento no painel do provedor, ou use outra conexão.'],
  auth: ['a chave foi recusada', 'Confira a chave e as permissões no painel do provedor.'],
  model: ['modelo não encontrado nesta conexão', 'Confira o modelo escolhido para a tarefa.'],
  invalid: ['o pedido foi recusado', 'Confira o modelo e a configuração desta tarefa.'],
};
/** Plain Portuguese for people; built from the class and status only. */
export function failureMessage(kind: AiFailureKind, provider: string, status: number) {
  const [what, next] = explanations[kind];
  return `${provider}: ${what}${status ? ` (${status})` : ''}. ${next}`;
}
