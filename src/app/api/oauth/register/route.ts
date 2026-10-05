import { z } from 'zod';
import { botServerSecret } from '@/lib/bot/secrets';
import { botDatabase } from '@/lib/supabase/bot';
import { newClientId, oauthError, redirectAllowed } from '@/lib/mcp/oauth';
import { cors, preflight } from '@/lib/mcp/oauth-http';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
const registration = z.object({
  client_name: z.string().trim().min(1).max(80).optional(),
  redirect_uris: z.array(z.string()).min(1).max(5),
  token_endpoint_auth_method: z.string().optional(),
});

// RFC 7591 dynamic registration for public clients. Only the name and the redirect targets are kept.
export async function POST(request: Request) {
  const db = botDatabase();
  if (!db) return oauthError('server_error', 'Servidor indisponível.', 503);
  let body: z.infer<typeof registration>;
  try { body = registration.parse(await request.json()); } catch { return withCors(oauthError('invalid_client_metadata', 'Informe client_name e redirect_uris.')); }
  if (!body.redirect_uris.every(redirectAllowed)) return withCors(oauthError('invalid_redirect_uri', 'Use endereços HTTPS ou de loopback, sem fragmento.'));
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') return withCors(oauthError('invalid_client_metadata', 'Somente clientes públicos com PKCE.'));
  const clientId = newClientId();
  const name = body.client_name || 'Assistente MCP';
  const saved = await db.rpc('mcp_oauth_register', { server_secret: botServerSecret(), next_client: clientId, next_name: name, next_uris: body.redirect_uris });
  if (saved.error) return withCors(saved.error.code === 'PT429' ? oauthError('temporarily_unavailable', 'Muitos registros agora. Tente mais tarde.', 429) : oauthError('server_error', 'Não consegui registrar o aplicativo.', 503));
  return Response.json({ client_id: clientId, client_name: name, redirect_uris: body.redirect_uris, token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], client_id_issued_at: Math.floor(Date.now() / 1000) }, { status: 201, headers: cors });
}
function withCors(response: Response) { for (const [key, value] of Object.entries(cors)) response.headers.set(key, value); return response; }
