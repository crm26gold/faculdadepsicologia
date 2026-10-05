export type AttemptError = Error & { status?: number; doNotRetry?: boolean; retryableCredential?: boolean; retryOnProviderChange?: boolean };
/** A shared bound prevents retries multiplying across models and reserve keys. */
export async function runAiAttempts<T, C>(candidates: C[], run: (candidate: C) => Promise<T>, options: {
  signal?: AbortSignal; beforeRetry?: () => Promise<void>;
  /** Charged before each candidate, including the first, using its own credential source. */
  beforeAttempt?: (candidate: C, index: number) => Promise<void>;
  /** Automatic routing: any provider failure moves to the next authorized connection. */
  persistent?: boolean;
} = {}): Promise<T> {
  let last: unknown;
  const exhaustedProviders = new Set<string>();
  for (const [index, candidate] of candidates.slice(0, options.persistent ? 8 : 4).entries()) {
    const provider = candidate && typeof candidate === 'object' && 'provider' in candidate && typeof candidate.provider === 'string' ? candidate.provider : undefined;
    if (provider && exhaustedProviders.has(provider)) continue;
    options.signal?.throwIfAborted();
    // Outside the catch: a denied budget must end the entire operation.
    if (options.beforeAttempt) await options.beforeAttempt(candidate, index);
    else if (index) await options.beforeRetry?.();
    options.signal?.throwIfAborted();
    try { return await run(candidate); }
    catch (cause) {
      options.signal?.throwIfAborted();
      last = cause;
      const status = (cause as AttemptError)?.status;
      if ((cause as AttemptError)?.doNotRetry) {
        // A provider's exhausted billing cannot be fixed by rotating its keys; an explicitly
        // automatic route may still use another company. Application refusals always stop.
        if (options.persistent && provider && (cause as AttemptError)?.retryOnProviderChange) { exhaustedProviders.add(provider); continue; }
        throw cause;
      }
      if (options.persistent) continue;
      if (status === 400 && (cause as AttemptError)?.retryableCredential) continue;
      // Exhausted quota/billing and bad payloads are not solved by rotating keys.
      if (status === 429 || status === 402 || (status === 400 && !(cause as AttemptError)?.retryableCredential) || typeof status !== 'number' ||
        !([0, 401, 403, 404].includes(status) || status >= 500)) throw cause;
    }
  }
  throw last ?? new Error('Nenhuma conexão disponível.');
}
