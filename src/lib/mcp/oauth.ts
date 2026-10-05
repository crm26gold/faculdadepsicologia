import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { MCP_TOKEN_PREFIX, tokenHash } from './server';

// OAuth 2.1 for MCP clients that cannot take a pasted key (ChatGPT, Claude app and site).
// Public clients only, PKCE S256 mandatory, short-lived access keys with rotating refresh tokens.
export const OAUTH_SCOPES = ['ler', 'registrar'] as const;
export const ACCESS_SECONDS = 3600;
export const newSecret = (prefix: string) => `${prefix}${randomBytes(32).toString('base64url')}`;
export const newAccessToken = () => newSecret(MCP_TOKEN_PREFIX);
export const newRefreshToken = () => newSecret('jpr_');
export const newClientId = () => `jpc_${randomBytes(18).toString('base64url')}`;
export const secretHash = tokenHash;
export const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

export function protectedResource(origin: string) {
  return { resource: `${origin}/api/mcp`, authorization_servers: [origin], scopes_supported: [...OAUTH_SCOPES], bearer_methods_supported: ['header'], resource_name: 'Jornada Plena' };
}
export function authorizationServer(origin: string) {
  return {
    issuer: origin, authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`, response_types_supported: ['code'], response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'], scopes_supported: [...OAUTH_SCOPES],
  };
}
export const resourceMetadataUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource/api/mcp`;

/** HTTPS redirect targets, or loopback HTTP for desktop and CLI apps; no fragments or credentials. */
export function redirectAllowed(value: unknown) {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const url = new URL(value);
    if (url.hash || url.username || url.password) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}
export const verifierValid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(value);
export const challengeValid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
/** "registrar" asks for write access; anything else stays read-only. */
export const wantsWrite = (scope: unknown) => typeof scope === 'string' && scope.split(/\s+/).includes('registrar');

export function oauthError(error: string, description: string, status = 400) {
  return Response.json({ error, error_description: description }, { status, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
}
