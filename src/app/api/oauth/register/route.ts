import { z } from 'zod';
import { botServerSecret } from '@/lib/bot/secrets';
import { botDatabase } from '@/lib/supabase/bot';
import { newClientId, oauthError, redirectAllowed } from '@/lib/mcp/oauth';
import { cors, preflight } from '@/lib/mcp/oauth-http';
import { oauthBody, OAuthInputError, registrationOriginHash } from '@/lib/mcp/oauth-input';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
const registration = z.object({
  client_name: z.string().trim().min(1).max(80).optional(),
  redirect_uris: z.array(z.string().max(500)).min(1).max(5),
  token_endpoint_auth_method: z.string().optional(),
});

// RFC 7591 dynamic registration for public clients. Only the name and the redirect targets are kept.
export async function POST(request: Request) {
  const db = botDatabase();
  if (!db) return withCors(oauthError('server_error', 'Servidor indisponível.', 503));
  let body: z.infer<typeof registration>;
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return withCors(oauthError('invalid_client_metadata', 'Use JSON para registrar o aplicativo.', 415));
  try { body = registration.parse(JSON.parse(await oauthBody(request))); }
  catch (error) { return withCors(oauthError('invalid_client_metadata', error instanceof OAuthInputError ? error.message : 'Informe client_name e redirect_uris.', error instanceof OAuthInputError ? error.status : 400)); }
  if (!body.redirect_uris.every(redirectAllowed)) return withCors(oauthError('invalid_redirect_uri', 'Use endereços HTTPS ou de loopback, sem fragmento.'));
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') return withCors(oauthError('invalid_client_metadata', 'Somente clientes públicos com PKCE.'));
  const clientId = newClientId();
  const name = body.client_name || 'Assistente MCP';
  const secret = botServerSecret();
  const saved = await db.rpc('mcp_oauth_register_limited', { server_secret: secret, next_client: clientId, next_name: name, next_uris: [...new Set(body.redirect_uris)],
    origin_hash: registrationOriginHash(request, secret, process.env.VERCEL === '1') });
  if (saved.error) {
    const response = saved.error.code === 'PT429' ? oauthError('temporarily_unavailable', 'Muitos registros agora. Tente mais tarde.', 429) : oauthError('server_error', 'Não consegui registrar o aplicativo.', 503);
    if (saved.error.code === 'PT429') response.headers.set('Retry-After', '3600');
    return withCors(response);
  }
  return Response.json({ client_id: clientId, client_name: name, redirect_uris: body.redirect_uris, token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], client_id_issued_at: Math.floor(Date.now() / 1000) }, { status: 201, headers: cors });
}
function withCors(response: Response) { for (const [key, value] of Object.entries(cors)) response.headers.set(key, value); return response; }
