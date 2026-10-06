import { failureKind, type AiFailureKind } from './provider-failure';

/** kind comes from AiError; a plain error is classified by its status. doNotRetry: a Jornada budget refusal
 * or a blocked account, which ends the whole operation in every routing mode. */
export type AttemptError = Error & { status?: number; kind?: AiFailureKind; doNotRetry?: boolean };
const field = (candidate: unknown, name: 'provider' | 'key') => {
  const value = candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>)[name] : undefined;
  return typeof value === 'string' ? value : undefined;
};

/** A shared bound prevents retries multiplying across models and reserve keys. One action per failure class
 * (table in docs/ARCHITECTURE.md). */
export async function runAiAttempts<T, C>(candidates: C[], run: (candidate: C) => Promise<T>, options: {
  signal?: AbortSignal; beforeRetry?: () => Promise<void>;
  /** Charged before each candidate, including the first, using its own credential source. */
  beforeAttempt?: (candidate: C, index: number) => Promise<void>;
  /** Automatic routing: a rate limit also moves to the next authorized connection. */
  persistent?: boolean;
} = {}): Promise<T> {
  let last: unknown;
  // Billing belongs to the account, so no other key of that company runs in this operation. A refused key is not retried.
  const exhaustedProviders = new Set<string>(), refusedKeys = new Set<string>();
  for (const [index, candidate] of candidates.slice(0, options.persistent ? 8 : 4).entries()) {
    const provider = field(candidate, 'provider'), key = field(candidate, 'key');
    const credential = provider && key ? `${provider}:${key}` : undefined;
    if ((provider && exhaustedProviders.has(provider)) || (credential && refusedKeys.has(credential))) continue;
    options.signal?.throwIfAborted();
    // Outside the catch: a denied budget must end the entire operation.
    if (options.beforeAttempt) await options.beforeAttempt(candidate, index);
    else if (index) await options.beforeRetry?.();
    options.signal?.throwIfAborted();
    try { return await run(candidate); }
    catch (cause) {
      options.signal?.throwIfAborted();
      last = cause;
      const error = cause as AttemptError | undefined;
      if (error?.doNotRetry) throw cause;
      // A failure without status is unexpected (likely ours): stop rather than charge another attempt.
      const kind = error?.kind ?? (typeof error?.status === 'number' ? failureKind(error.status) : 'invalid');
      if (kind === 'billing') { if (!provider) throw cause; exhaustedProviders.add(provider); continue; }
      if (kind === 'auth') { if (credential) refusedKeys.add(credential); continue; }
      // Fixed, legacy and manual fallback routes keep stopping at a rate limit, as before.
      if (kind === 'invalid' || (kind === 'rate_limit' && !options.persistent)) throw cause;
      // network, server and model failures (and rate limits in automatic routing) try the next connection.
    }
  }
  throw last ?? new Error('Nenhuma conexão disponível.');
}
