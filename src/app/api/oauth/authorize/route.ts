import { z } from 'zod';
import { reply, writeRequest } from '@/lib/api-route';
import { applicationOrigin } from '@/lib/auth-input';
import { botServerSecret } from '@/lib/bot/secrets';
import { botDatabase } from '@/lib/supabase/bot';
import { challengeValid, newSecret, secretHash } from '@/lib/mcp/oauth';
import { resourceAllowed } from '@/lib/mcp/oauth-input';

export const dynamic = 'force-dynamic';
const decision = z.object({
  client_id: z.string().regex(/^jpc_[A-Za-z0-9_-]{20,60}$/), redirect_uri: z.string().max(500), code_challenge: z.string().refine(challengeValid),
  state: z.string().max(500).optional(), write: z.boolean(), allow: z.boolean(),
  resource: z.string().max(500).optional(),
});

// The signed-in person decides. Only a redirect registered by this client ever receives the answer.
export async function POST(request: Request) {
  const input = await writeRequest(request, decision, 4_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const db = botDatabase(), origin = applicationOrigin(process.env);
  if (!db || !origin) return reply({ error: 'Servidor indisponível.' }, 503);
  if (!resourceAllowed(body.resource, origin)) return reply({ error: 'O acesso deve ser destinado ao MCP da Jornada.' }, 400);
  const client = await db.rpc('mcp_oauth_client', { server_secret: botServerSecret(), wanted: body.client_id });
  if (client.error || !client.data?.redirect_uris?.includes(body.redirect_uri)) return reply({ error: 'Aplicativo ou endereço de retorno não reconhecido.' }, 400);
  const target = new URL(body.redirect_uri);
  if (body.state) target.searchParams.set('state', body.state);
  target.searchParams.set('iss', origin);
  if (!body.allow) { target.searchParams.set('error', 'access_denied'); return reply({ ok: true, data: { redirect: target.toString() } }); }
  const code = newSecret('jpo_');
  const saved = await session.client.rpc('mcp_oauth_approve', { wanted: body.client_id, next_code_hash: secretHash(code), next_redirect: body.redirect_uri,
    next_challenge: body.code_challenge, next_write: body.write });
  if (saved.error) return reply({ error: 'Não consegui autorizar agora. Tente novamente.' }, 503);
  target.searchParams.set('code', code);
  return reply({ ok: true, data: { redirect: target.toString() } });
}
