const statuses = new Set(['INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'UNAUTHENTICATED', 'PERMISSION_DENIED', 'NOT_FOUND', 'RESOURCE_EXHAUSTED', 'INTERNAL', 'UNAVAILABLE', 'DEADLINE_EXCEEDED']);
const reasons = new Set(['API_KEY_INVALID', 'API_KEY_EXPIRED', 'API_KEY_NOT_FOUND', 'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED', 'SERVICE_DISABLED', 'BILLING_DISABLED', 'BILLING_REQUIRED', 'INSUFFICIENT_CREDITS', 'RATE_LIMIT_EXCEEDED']);
const fields = new Set(['model', 'generationConfig', 'systemInstruction', 'tools', 'realtimeInputConfig', 'inputAudioTranscription', 'outputAudioTranscription', 'contextWindowCompression', 'sessionResumption', 'fieldMask', 'expireTime', 'newSessionExpireTime', 'uses', 'bidiGenerateContentSetup', 'liveConnectConstraints']);
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
type ConfigurationIssue = 'INVALID_FIELD_MASK' | 'EMPTY_OBJECT_PARAMETERS' | 'UNKNOWN_FIELD';

function knownFieldRoot(path: unknown) {
  if (typeof path !== 'string') return null;
  const root = path.replace(/^GenerateContentRequest\./, '').replace(/^(?:bidiGenerateContentSetup|bidi_generate_content_setup|liveConnectConstraints|live_connect_constraints)(?:\.config)?\./, '').split(/[.\[]/, 1)[0];
  const canonical = root.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
  return fields.has(canonical) ? canonical : null;
}

// Match complete provider validation prefixes, not words appearing in echoed
// instructions. Captured identifiers are reduced to known roots and discarded.
function messageConfiguration(message: unknown): { configurationIssue?: ConfigurationIssue; invalidFields: string[] } {
  if (typeof message !== 'string') return { invalidFields: [] };
  const text = message.slice(0, 8192).trimStart();
  if (/^(?:Invalid (?:field mask|field_mask|fieldMask)(?: path)?|(?:field_mask|fieldMask) (?:is )?invalid)(?=[:.\s]|$)/i.test(text)) {
    return { configurationIssue: 'INVALID_FIELD_MASK', invalidFields: ['fieldMask'] };
  }
  if (/^(?:\*\s*)?(?:(?:GenerateContentRequest|BidiGenerateContentSetup)\.)?(?:(?:bidiGenerateContentSetup|bidi_generate_content_setup)\.)?(?:tools\[\d+\]\.(?:functionDeclarations|function_declarations)\[\d+\]\.)?parameters\.properties:?\s+should be non-empty for OBJECT type(?=[.;\s]|$)/.test(text)) {
    return { configurationIssue: 'EMPTY_OBJECT_PARAMETERS', invalidFields: ['tools'] };
  }
  const unknownName = /^(?:Invalid JSON payload received\.\s*)?Unknown name (["'])([A-Za-z_][A-Za-z0-9_]{0,127})\1(?: at (["'])([A-Za-z_][A-Za-z0-9_.\[\]]{0,255})\3)?:\s*Cannot find field(?=[.\s]|$)/.exec(text);
  const unknownPath = /^Unknown (?:field|FieldMask) path:\s*(["'])([A-Za-z_][A-Za-z0-9_.\[\]]{0,255})\1(?=[.\s]|$)/.exec(text);
  if (unknownName || unknownPath) {
    const root = unknownName ? knownFieldRoot(unknownName[2]) ?? knownFieldRoot(unknownName[4]) : knownFieldRoot(unknownPath?.[2]);
    return { configurationIssue: 'UNKNOWN_FIELD', invalidFields: root ? [root] : [] };
  }
  return { invalidFields: [] };
}

// Provider messages can echo keys, instructions and user data. Extract only known
// enums and field names, never the raw message, description, metadata or headers.
export async function liveProviderFailure(response: Response) {
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  const error = record(record(body).error);
  const details = Array.isArray(error.details) ? error.details.slice(0, 10).map(record) : [];
  const upstreamCode = typeof error.status === 'string' && statuses.has(error.status) ? error.status : undefined;
  const reason = details.map(detail => detail.reason).find(value => typeof value === 'string' && reasons.has(value)) as string | undefined;
  const configuration = !reason && upstreamCode === 'INVALID_ARGUMENT' && (response.status === 400 || response.status === 422) ? messageConfiguration(error.message) : { invalidFields: [] };
  const invalidFields = [...new Set([...details.flatMap(detail => Array.isArray(detail.fieldViolations) ? detail.fieldViolations.slice(0, 10) : []).map(value => knownFieldRoot(record(value).field)).filter((value): value is string => value !== null), ...configuration.invalidFields])];
  let message: string;
  if (response.status === 402 || reason === 'BILLING_DISABLED' || reason === 'BILLING_REQUIRED' || reason === 'INSUFFICIENT_CREDITS') {
    message = 'O Gemini informou um problema de faturamento ou créditos da API. Confira o projeto da chave no Google AI Studio.';
  } else if (reason?.startsWith('API_KEY_')) {
    message = 'A chave do Gemini está inválida ou bloqueada para esta chamada. Confira suas permissões e restrições no Google AI Studio.';
  } else if (response.status === 429 || reason === 'RATE_LIMIT_EXCEEDED') {
    message = 'O limite de voz do Gemini foi atingido. Aguarde ou confira a cota no Google AI Studio.';
  } else if (reason === 'SERVICE_DISABLED') {
    message = 'A Generative Language API está desativada no projeto desta chave. Ative-a no Google Cloud ou gere uma chave pelo Google AI Studio.';
  } else if (response.status === 401 || response.status === 403) {
    // Without a reason, Google usually revoked the key (e.g. flagged as leaked); the free tier is not the cause.
    message = 'O Google bloqueou esta chave sem informar o motivo, o que costuma indicar chave revogada. Gere uma nova chave no Google AI Studio e substitua nas configurações de IA.';
  } else if (response.status === 400 || response.status === 422) {
    message = 'O Gemini recusou a configuração da chamada. A integração de voz precisa ser ajustada.';
  } else if (response.status === 404) {
    message = 'O endereço ou modelo de voz solicitado não está disponível no Gemini. A integração precisa ser atualizada.';
  } else {
    message = 'Não consegui preparar a chamada no Gemini agora. Tente novamente em alguns instantes.';
  }
  return {
    message, status: response.status === 429 ? 429 : 502,
    diagnostic: { upstreamStatus: response.status, upstreamCode, reason, invalidFields, configurationIssue: 'configurationIssue' in configuration ? configuration.configurationIssue : undefined },
  };
}
