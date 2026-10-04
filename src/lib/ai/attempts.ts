export type AttemptError = Error & { status?: number; doNotRetry?: boolean };
/** A shared bound prevents retries multiplying across models and reserve keys. */
export async function runAiAttempts<T, C>(candidates: C[], run: (candidate: C) => Promise<T>, options: {
  signal?: AbortSignal; beforeRetry?: () => Promise<void>;
} = {}): Promise<T> {
  let last: unknown;
  for (const [index, candidate] of candidates.slice(0, 4).entries()) {
    options.signal?.throwIfAborted();
    // Outside the catch: a denied budget must end the entire operation.
    if (index) await options.beforeRetry?.();
    try { return await run(candidate); }
    catch (cause) {
      options.signal?.throwIfAborted();
      last = cause;
      const status = (cause as AttemptError)?.status;
      // Exhausted quota/billing and bad payloads are not solved by rotating keys.
      if ((cause as AttemptError)?.doNotRetry || status === 429 || status === 402 || status === 400 || typeof status !== 'number' ||
        !([0, 401, 403, 404].includes(status) || status >= 500)) throw cause;
    }
  }
  throw last ?? new Error('Nenhuma conexão disponível.');
}
