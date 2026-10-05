import 'server-only';
import { aiCatalog, type AiProviderId } from '../ai/catalog';
import { AiError, type AiConfig } from '../ai/providers';
import { MAX_CALL_SECONDS, type LiveCredentials } from './protocol';
import { prepareGeminiSession } from './gemini-session';
import { prepareElevenLabsSession } from './elevenlabs';

type Options = { signal: AbortSignal; beforeRetry?: () => Promise<void>; skip?: string[] };
export type LiveFailure = { provider: AiProviderId; error: unknown };

/**
 * Prepares the first live transport that accepts the call. Fixed and fallback routes stay inside
 * one company; automatic routes try each company in the order the database returned.
 * OpenAI needs the browser's SDP offer, so reaching it only selects it for /api/ai/live/session.
 */
export async function prepareLiveSession(config: AiConfig, context: string, history: { role: string; text: string }[], options: Options): Promise<{ credentials: LiveCredentials; failures: LiveFailure[] }> {
  const skip = new Set(options.skip ?? []);
  const all = [config, ...(config.alternatives ?? [])].filter(row => !skip.has(row.provider));
  const groups: AiConfig[][] = [];
  for (const row of all) {
    if (config.routing !== 'auto' && row.provider !== config.provider) continue;
    const group = groups.find(items => items[0].provider === row.provider);
    if (group) group.push(row); else groups.push([row]);
  }
  const failures: LiveFailure[] = [];
  for (const [index, group] of groups.entries()) {
    options.signal.throwIfAborted();
    if (index) await options.beforeRetry?.();
    const [first, ...rest] = group;
    const fallback = config.routing === 'auto' && index < groups.length - 1;
    try {
      if (first.provider === 'openai') {
        return { failures, credentials: { provider: 'openai', token: '', model: 'gpt-live-1', expiresAt: new Date(Date.now() + MAX_CALL_SECONDS * 1000).toISOString(), maxSeconds: MAX_CALL_SECONDS, fallback } };
      }
      const prepared = first.provider === 'elevenlabs'
        ? { provider: 'elevenlabs' as const, ...await prepareElevenLabsSession({ ...first, alternatives: rest }, context, history, options) }
        : first.provider === 'gemini' ? { provider: 'gemini' as const, ...await prepareGeminiSession({ ...first, alternatives: rest }, context, history, options) } : null;
      if (!prepared) throw new AiError(`${aiCatalog[first.provider].name} não atende a Chamada ao vivo.`, 400);
      return { failures, credentials: { ...prepared, fallback } };
    } catch (error) {
      options.signal.throwIfAborted();
      failures.push({ provider: first.provider, error });
      if (config.routing !== 'auto') throw error;
    }
  }
  const last = failures.at(-1)?.error;
  if (last) throw last;
  throw new AiError('Nenhum provedor de voz disponível. Confira as chaves ligadas em Administração.', 409);
}
