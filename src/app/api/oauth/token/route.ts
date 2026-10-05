import { botServerSecret } from '@/lib/bot/secrets';
import { botDatabase } from '@/lib/supabase/bot';
import { ACCESS_SECONDS, newAccessToken, newRefreshToken, oauthError, s256, secretHash, verifierValid } from '@/lib/mcp/oauth';
import { cors, preflight } from '@/lib/mcp/oauth-http';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

async function fields(request: Request) {
  const type = request.headers.get('content-type') ?? '';
  if (type.includes('application/json')) { const value = await request.json().catch(() => ({})); return new URLSearchParams(Object.entries(value ?? {}).map(([key, item]) => [key, String(item)])); }
  return new URLSearchParams(await request.text());
}
function withCors(response: Response) { for (const [key, value] of Object.entries(cors)) response.headers.set(key, value); return response; }

// Authorization code (with PKCE) and refresh token grants. Codes and tokens reach the database only as hashes.
export async function POST(request: Request) {
  const db = botDatabase();
  if (!db) return withCors(oauthError('server_error', 'Servidor indisponível.', 503));
  const form = await fields(request);
  const clientId = form.get('client_id') ?? '';
  if (!/^jpc_[A-Za-z0-9_-]{20,60}$/.test(clientId)) return withCors(oauthError('invalid_client', 'client_id ausente ou desconhecido.', 401));
  const access = newAccessToken(), refresh = newRefreshToken();
  const grant = form.get('grant_type');
  let result;
  if (grant === 'authorization_code') {
    const code = form.get('code') ?? '', verifier = form.get('code_verifier'), redirect = form.get('redirect_uri') ?? '';
    if (!code || !verifierValid(verifier)) return withCors(oauthError('invalid_request', 'Informe code e code_verifier (PKCE).'));
    result = await db.rpc('mcp_oauth_exchange', { server_secret: botServerSecret(), code: secretHash(code), wanted: clientId, redirect,
      verifier_challenge: s256(verifier), next_access: secretHash(access), next_refresh: secretHash(refresh) });
  } else if (grant === 'refresh_token') {
    const token = form.get('refresh_token') ?? '';
    if (!token) return withCors(oauthError('invalid_request', 'Informe refresh_token.'));
    result = await db.rpc('mcp_oauth_refresh', { server_secret: botServerSecret(), refresh: secretHash(token), wanted: clientId, next_access: secretHash(access), next_refresh: secretHash(refresh) });
  } else return withCors(oauthError('unsupported_grant_type', 'Use authorization_code ou refresh_token.'));
  if (result.error) return withCors(result.error.code === '22023' ? oauthError('invalid_grant', 'Código ou token inválido, expirado ou já usado.') : oauthError('server_error', 'Não consegui emitir o acesso agora.', 503));
  return Response.json({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_SECONDS, refresh_token: refresh,
    scope: result.data?.can_write ? 'ler registrar' : 'ler' }, { headers: { ...cors, Pragma: 'no-cache' } });
}
