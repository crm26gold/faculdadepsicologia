import { botServerSecret } from '@/lib/bot/secrets';
import { botDatabase } from '@/lib/supabase/bot';
import { ACCESS_SECONDS, newAccessToken, newRefreshToken, oauthError, s256, secretHash, verifierValid } from '@/lib/mcp/oauth';
import { cors, preflight } from '@/lib/mcp/oauth-http';
import { applicationOrigin } from '@/lib/auth-input';
import { oauthFields, OAuthInputError, resourceAllowed } from '@/lib/mcp/oauth-input';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

function withCors(response: Response) { for (const [key, value] of Object.entries(cors)) response.headers.set(key, value); return response; }

// Authorization code (with PKCE) and refresh token grants. Codes and tokens reach the database only as hashes.
export async function POST(request: Request) {
  const db = botDatabase();
  if (!db) return withCors(oauthError('server_error', 'Servidor indisponível.', 503));
  let form: URLSearchParams;
  try { form = await oauthFields(request); }
  catch (error) { return withCors(oauthError('invalid_request', error instanceof OAuthInputError ? error.message : 'Pedido OAuth inválido.', error instanceof OAuthInputError ? error.status : 400)); }
  const origin = applicationOrigin(process.env);
  if (!origin) return withCors(oauthError('server_error', 'Endereço do aplicativo não configurado.', 503));
  if (!resourceAllowed(form.get('resource'), origin)) return withCors(oauthError('invalid_target', 'O acesso deve ser destinado ao MCP da Jornada.'));
  const clientId = form.get('client_id') ?? '';
  if (!/^jpc_[A-Za-z0-9_-]{20,60}$/.test(clientId)) return withCors(oauthError('invalid_client', 'client_id ausente ou desconhecido.', 401));
  const access = newAccessToken(), refresh = newRefreshToken();
  const grant = form.get('grant_type');
  let result;
  if (grant === 'authorization_code') {
    const code = form.get('code') ?? '', verifier = form.get('code_verifier'), redirect = form.get('redirect_uri') ?? '';
    if (!/^jpo_[A-Za-z0-9_-]{43}$/.test(code) || !verifierValid(verifier) || redirect.length > 500) return withCors(oauthError('invalid_request', 'Informe code e code_verifier (PKCE).'));
    result = await db.rpc('mcp_oauth_exchange', { server_secret: botServerSecret(), code: secretHash(code), wanted: clientId, redirect,
      verifier_challenge: s256(verifier), next_access: secretHash(access), next_refresh: secretHash(refresh) });
  } else if (grant === 'refresh_token') {
    const token = form.get('refresh_token') ?? '';
    if (!/^jpr_[A-Za-z0-9_-]{43}$/.test(token)) return withCors(oauthError('invalid_request', 'Informe refresh_token válido.'));
    result = await db.rpc('mcp_oauth_refresh', { server_secret: botServerSecret(), refresh: secretHash(token), wanted: clientId, next_access: secretHash(access), next_refresh: secretHash(refresh) });
  } else return withCors(oauthError('unsupported_grant_type', 'Use authorization_code ou refresh_token.'));
  if (result.error) return withCors(result.error.code === '22023' ? oauthError('invalid_grant', 'Código ou token inválido, expirado ou já usado.') : oauthError('server_error', 'Não consegui emitir o acesso agora.', 503));
  // The refresh RPC returns invalid_grant instead of raising after replay, so family revocation commits.
  if (!result.data || result.data.error === 'invalid_grant') return withCors(oauthError('invalid_grant', 'Código ou token inválido, expirado ou já usado. Conecte o aplicativo novamente.'));
  return Response.json({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_SECONDS, refresh_token: refresh,
    scope: result.data?.can_write ? 'ler registrar' : 'ler' }, { headers: { ...cors, Pragma: 'no-cache' } });
}
