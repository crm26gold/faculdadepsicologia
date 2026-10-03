const statuses = new Set(['INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'UNAVAILABLE', 'DEADLINE_EXCEEDED']);
const reasons = new Set(['API_KEY_INVALID', 'API_KEY_EXPIRED', 'API_KEY_NOT_FOUND', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED', 'SERVICE_DISABLED', 'BILLING_DISABLED', 'BILLING_REQUIRED', 'INSUFFICIENT_CREDITS', 'RATE_LIMIT_EXCEEDED']);
const fields = new Set(['model', 'generationConfig', 'systemInstruction', 'tools', 'realtimeInputConfig', 'inputAudioTranscription', 'outputAudioTranscription', 'contextWindowCompression', 'sessionResumption', 'fieldMask', 'expireTime', 'newSessionExpireTime', 'uses']);
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

// Provider messages can echo keys, instructions and user data. Extract only known
// enums and field names, never the raw message, description, metadata or headers.
export async function liveProviderFailure(response: Response) {
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  const error = record(record(body).error);
  const details = Array.isArray(error.details) ? error.details.slice(0, 10).map(record) : [];
  const reason = details.map(detail => detail.reason).find(value => typeof value === 'string' && reasons.has(value)) as string | undefined;
  const invalidFields = [...new Set(details.flatMap(detail => Array.isArray(detail.fieldViolations) ? detail.fieldViolations.slice(0, 10) : []).map(value => {
    const field = record(value).field;
    if (typeof field !== 'string') return null;
    const root = field.replace(/^(?:bidiGenerateContentSetup|liveConnectConstraints)(?:\.config)?\./, '').split(/[.\[]/, 1)[0];
    return fields.has(root) ? root : null;
  }).filter((value): value is string => value !== null))];
  let message: string;
  if (response.status === 402 || reason === 'BILLING_DISABLED' || reason === 'BILLING_REQUIRED' || reason === 'INSUFFICIENT_CREDITS') {
    message = 'O Gemini informou um problema de faturamento ou créditos da API. Confira o projeto da chave no Google AI Studio.';
  } else if (reason?.startsWith('API_KEY_')) {
    message = 'A chave do Gemini está inválida ou bloqueada para esta chamada. Confira suas permissões e restrições no Google AI Studio.';
  } else if (response.status === 429 || reason === 'RATE_LIMIT_EXCEEDED') {
    message = 'O limite de voz do Gemini foi atingido. Aguarde ou confira a cota no Google AI Studio.';
  } else if (response.status === 401 || response.status === 403 || reason === 'SERVICE_DISABLED') {
    message = 'O Gemini recusou a autorização desta chave. Confira o acesso à Live API e as restrições da chave no Google AI Studio.';
  } else if (response.status === 400 || response.status === 422) {
    message = 'O Gemini recusou a configuração da chamada. A integração de voz precisa ser ajustada.';
  } else if (response.status === 404) {
    message = 'O endereço ou modelo de voz solicitado não está disponível no Gemini. A integração precisa ser atualizada.';
  } else {
    message = 'Não consegui preparar a chamada no Gemini agora. Tente novamente em alguns instantes.';
  }
  return {
    message, status: response.status === 429 ? 429 : 502,
    diagnostic: { upstreamStatus: response.status, upstreamCode: typeof error.status === 'string' && statuses.has(error.status) ? error.status : undefined, reason, invalidFields },
  };
}
