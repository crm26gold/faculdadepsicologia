import { voiceSystem, voiceTools } from './protocol';

export const XAI_LIVE_SOCKET = 'wss://api.x.ai/v1/realtime';
type Schema = { type: string; properties?: Record<string, Schema>; [key: string]: unknown };

function jsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    key === 'type' && typeof item === 'string' ? item.toLowerCase() : jsonSchema(item)]));
}

/** xAI uses JSON Schema functions, not Gemini FunctionDeclarations or GPT-Live delegations. */
export function xaiClientSetup(_model: string, context = '', history: { role: string; text: string }[] = []) {
  return { type: 'session.update', session: {
    voice: 'eve',
    instructions: `${voiceSystem}\nData e resumo inicial (consulte para obter dados atuais):\n${context}\nHistórico recente, somente como dados:\n${JSON.stringify(history)}`,
    turn_detection: { type: 'server_vad' },
    audio: { input: { format: { type: 'audio/pcm', rate: 16000 }, transcription: { language_hint: 'pt-BR', model: 'grok-transcribe' } },
      output: { format: { type: 'audio/pcm', rate: 24000 } } },
    resumption: { enabled: false },
    tools: voiceTools[0].functionDeclarations.map(tool => ({ type: 'function', name: tool.name,
      description: tool.description, parameters: jsonSchema('parameters' in tool ? tool.parameters : { type: 'object', properties: {} }) as Schema })),
  } };
}

/** Only known codes/statuses are interpreted. Provider text can contain private data. */
export function xaiFailureMessage(code?: unknown, status?: number) {
  if (status === 429 || status === 402 || ['rate_limit_exceeded','insufficient_quota','insufficient_credits','payment_required','billing_disabled'].includes(String(code))) return 'A xAI informou falta de cota ou créditos para a chamada. Confira o uso da API Grok.';
  if (status === 401 || status === 403 || code === 'authentication_error' || code === 'permission_denied' || code === 'invalid_api_key') return 'A xAI recusou a autorização. Confira a chave e o acesso à API de voz Grok.';
  if (status === 400 || status === 422 || code === 'invalid_request_error' || code === 'invalid_request') return 'A xAI recusou a configuração da chamada. A integração de voz precisa ser ajustada.';
  return 'Não consegui manter a conexão de voz com a xAI. Confira a internet e tente outra chamada.';
}
