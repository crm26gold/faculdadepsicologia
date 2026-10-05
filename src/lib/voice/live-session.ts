import 'server-only';
import { aiCatalog, type AiProviderId } from '../ai/catalog';
import { AiError, type AiConfig } from '../ai/providers';
import { runAiAttempts } from '../ai/attempts';
import { MAX_CALL_SECONDS, type LiveCredentials } from './protocol';
import { prepareGeminiSession } from './gemini-session';
import { prepareElevenLabsSession } from './elevenlabs';
import { prepareXaiSession } from './xai-session';

type Options = { signal: AbortSignal; beforeRetry?: () => Promise<void>; beforeAttempt?: (candidate: AiConfig, index: number) => Promise<void>; skip?: string[] };
export type LiveFailure = { provider: AiProviderId; error: unknown };

/**
 * Prepares the first live transport that accepts the call. Fixed and fallback routes stay inside
 * one company; automatic routes try each company in the order the database returned.
 * OpenAI needs the browser's SDP offer, so reaching it only selects it for /api/ai/live/session.
 */
export async function prepareLiveSession(config: AiConfig, context: string, history: { role: string; text: string }[], options: Options): Promise<{ credentials: LiveCredentials; failures: LiveFailure[] }> {
  const skip = new Set(options.skip ?? []);
  const candidates = [config, ...(config.alternatives ?? [])].filter(row => !skip.has(row.provider) && (config.routing === 'auto' || row.provider === config.provider));
  const failures: LiveFailure[] = [];
  if (!candidates.length) throw new AiError('Nenhum provedor de voz disponível. Confira as chaves ligadas em Administração.', 409);
  return runAiAttempts(candidates, async first => {
    const index = candidates.indexOf(first);
    const fallback = config.routing === 'auto' && candidates.slice(index + 1).some(row => row.provider !== first.provider);
    try {
      if (first.provider === 'openai') {
        return { failures, credentials: { provider: 'openai', token: '', model: 'gpt-live-1', expiresAt: new Date(Date.now() + MAX_CALL_SECONDS * 1000).toISOString(), maxSeconds: MAX_CALL_SECONDS, fallback } };
      }
      // The outer loop owns the global attempt bound and budget. Provider preparation receives exactly one key.
      const single = { ...first, alternatives: [] };
      const prepared = first.provider === 'elevenlabs'
        ? { provider: 'elevenlabs' as const, ...await prepareElevenLabsSession(single, context, history, { signal: options.signal }) }
        : first.provider === 'gemini' ? { provider: 'gemini' as const, ...await prepareGeminiSession(single, context, history, { signal: options.signal }) }
        : first.provider === 'xai' ? { provider: 'xai' as const, ...await prepareXaiSession(single,{signal:options.signal}) } : null;
      if (!prepared) throw new AiError(`${aiCatalog[first.provider].name} não atende a Chamada ao vivo.`, 400);
      return { failures, credentials: { ...prepared, fallback } };
    } catch (error) {
      options.signal.throwIfAborted();
      failures.push({ provider: first.provider, error });
      throw error;
    }
  }, { signal: options.signal, persistent: config.routing === 'auto', beforeRetry: options.beforeRetry,
    beforeAttempt: options.beforeAttempt ? async (candidate, index) => { if (candidate.provider !== 'openai') await options.beforeAttempt!(candidate, index); } : undefined });
}
