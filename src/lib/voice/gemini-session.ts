import 'server-only';
import { createHash } from 'node:crypto';
import { AiError, type AiConfig } from '../ai/providers';
import { runAiAttempts } from '../ai/attempts';
import { chooseLiveModel, liveTokenRequest, MAX_CALL_SECONDS } from './protocol';
import { liveProviderFailure } from './provider-error';

const modelCache = new Map<string, { items: { name?: string; supportedGenerationMethods?: string[] }[]; expires: number }>();
export class LiveSessionError extends AiError {
  get doNotRetry() { return ['BILLING_DISABLED', 'BILLING_REQUIRED', 'INSUFFICIENT_CREDITS', 'RATE_LIMIT_EXCEEDED'].includes(this.diagnostic.reason ?? ''); }
  constructor(readonly stage: string, readonly diagnostic: Awaited<ReturnType<typeof liveProviderFailure>>['diagnostic'], message: string, status: number) { super(message, status); }
}
async function checked(response: Response, stage: string) {
  if (response.ok) return response;
  const failure = await liveProviderFailure(response);
  throw new LiveSessionError(stage, failure.diagnostic, failure.message, response.status);
}
export async function prepareGeminiSession(config: AiConfig, context: string, history: { role: string; text: string }[], options: { signal?: AbortSignal; beforeRetry?: () => Promise<void> } = {}) {
  return runAiAttempts([config, ...(config.alternatives ?? []).filter(row => row.provider === 'gemini').slice(0, 2)], async connection => { try {
    const cacheKey = createHash('sha256').update(connection.key).digest('hex');
    let cached = modelCache.get(cacheKey);
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
    if (!cached || cached.expires <= Date.now()) {
      const response = await checked(await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
        headers: { 'x-goog-api-key': connection.key }, cache: 'no-store', signal,
      }), 'models');
      const body = await response.json();
      cached = { items: Array.isArray(body.models) ? body.models : [], expires: Date.now() + 300_000 };
      if (modelCache.size >= 50) modelCache.delete(modelCache.keys().next().value!);
      modelCache.set(cacheKey, cached);
    }
    const model = chooseLiveModel(cached.items, process.env.GEMINI_LIVE_MODEL || (connection.model.startsWith('auto:') ? undefined : connection.model));
    if (!model) throw new AiError('Esta conexão não tem o modelo Live escolhido. Confira os modelos no Google AI Studio.', 404);
    const now = Date.now();
    const response = await checked(await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
      method: 'POST', headers: { 'x-goog-api-key': connection.key, 'Content-Type': 'application/json' }, cache: 'no-store', signal,
      body: JSON.stringify(liveTokenRequest(model, context, history, now)),
    }), 'token');
    const token = await response.json();
    if (typeof token.name !== 'string' || !token.name) throw new AiError('O Gemini retornou uma autorização inválida.', 502);
    return { token: token.name, model, expiresAt: new Date(now + (MAX_CALL_SECONDS + 120) * 1000).toISOString(), maxSeconds: MAX_CALL_SECONDS };
  } catch (cause) { options.signal?.throwIfAborted(); if (cause instanceof AiError) throw cause; throw new AiError('O Gemini não respondeu à preparação da chamada.', 0); }
  }, options);
}
