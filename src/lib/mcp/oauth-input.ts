import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export class OAuthInputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** Bound the stream itself: Content-Length is optional and can be forged. */
export async function oauthBody(request: Request, limit = 8_192): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new OAuthInputError('Pedido vazio.');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0, raw = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new OAuthInputError('Pedido grande demais.', 413); }
      raw += decoder.decode(value, { stream: true });
    }
    return raw + decoder.decode();
  } finally { reader.releaseLock(); }
}

export async function oauthFields(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const raw = await oauthBody(request);
  let fields: URLSearchParams;
  if (type === 'application/json') {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.values(value).some(item => typeof item !== 'string')) throw new OAuthInputError('Campos OAuth inválidos.');
    fields = new URLSearchParams(value as Record<string, string>);
  } else if (type === 'application/x-www-form-urlencoded') fields = new URLSearchParams(raw);
  else throw new OAuthInputError('Use JSON ou formulário OAuth.', 415);
  if ([...fields.keys()].some(key => fields.getAll(key).length !== 1)) throw new OAuthInputError('Campos OAuth repetidos.');
  return fields;
}

/** This server issues MCP-only tokens. Older clients may omit resource; other audiences are rejected. */
export const resourceAllowed = (resource: string | null | undefined, origin: string) => !resource || resource === `${origin}/api/mcp`;

/** Prefer Vercel's immutable forwarding header. Never trust forwarding headers on a local host. */
export function registrationOriginHash(request: Request, secret: string, vercel: boolean): string {
  const supplied = vercel ? (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for'))?.trim() ?? '' : '';
  const address = isIP(supplied) ? supplied : 'unavailable';
  return createHmac('sha256', secret).update(`jornada-oauth-registration-v1:${address}`).digest('hex');
}

export function consentIdentity(redirect: string) {
  try { const url = new URL(redirect); return { origin: url.origin, address: url.href }; }
  catch { return { origin: '', address: '' }; }
}
