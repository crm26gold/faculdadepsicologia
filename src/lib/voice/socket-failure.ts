import { liveProviderFailure } from './provider-error';

type ProviderDiagnostic = Awaited<ReturnType<typeof liveProviderFailure>>['diagnostic'];
export type SocketDiagnostic = Omit<ProviderDiagnostic, 'upstreamStatus'> & { upstreamStatus?: number };
type SocketFailure = { message: string; diagnostic?: SocketDiagnostic };
const statusCodes: Record<string, number> = {
  INVALID_ARGUMENT: 400, FAILED_PRECONDITION: 400, UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403, NOT_FOUND: 404, RESOURCE_EXHAUSTED: 429,
  INTERNAL: 500, UNAVAILABLE: 503, DEADLINE_EXCEEDED: 504,
};

/** Socket error payloads use the same sanitization as REST; never expose their raw text. */
export async function liveSocketFailure(value: unknown): Promise<SocketFailure> {
  const error = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const status = typeof error.code === 'number' && Number.isInteger(error.code) && error.code >= 400 && error.code <= 599
    ? error.code : typeof error.status === 'string' && Object.hasOwn(statusCodes, error.status) ? statusCodes[error.status] : undefined;
  const safe = await liveProviderFailure(Response.json({ error }, { status: status ?? 502 }));
  // 502 is only a local fallback for formatting. An unknown socket status stays unknown.
  return { message: safe.message, diagnostic: { ...safe.diagnostic, upstreamStatus: status } };
}

/** Close codes are WebSocket codes, not HTTP errors. Recognize only safe configuration prefixes. */
export async function liveCloseFailure(code: number, reason: string): Promise<SocketFailure> {
  const safe = await liveSocketFailure({ code: 400, status: 'INVALID_ARGUMENT', message: reason });
  if (safe.diagnostic?.configurationIssue) {
    return { message: safe.message, diagnostic: { ...safe.diagnostic, upstreamStatus: undefined, upstreamCode: undefined } };
  }
  return { message: code === 1008
    ? 'O Gemini recusou a sessão de voz sem informar um motivo reconhecido. Consulte o diagnóstico da Chamada ao vivo em Administração.'
    : 'A conexão da chamada caiu. As ações já salvas continuam guardadas. Inicie outra chamada para continuar.' };
}
