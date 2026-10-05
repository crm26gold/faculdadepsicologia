import type { Metadata } from 'next';
import { botServerSecret } from '@/lib/bot/secrets';
import { botDatabase } from '@/lib/supabase/bot';
import { challengeValid } from '@/lib/mcp/oauth';
import { OAuthConsent } from '@/components/oauth-consent';
import { applicationOrigin } from '@/lib/auth-input';
import { consentIdentity, resourceAllowed } from '@/lib/mcp/oauth-input';

export const metadata: Metadata = { title: 'Conectar assistente · Jornada Plena' };
export const dynamic = 'force-dynamic';
type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => typeof value === 'string' ? value : '';

// Validates the request before showing anything; an unknown client or redirect never gets redirected to.
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const clientId = one(params.client_id), redirect = one(params.redirect_uri), challenge = one(params.code_challenge);
  let problem = '';
  let clientName = '';
  const origin = applicationOrigin(process.env), resource = one(params.resource);
  if (!origin || Array.isArray(params.resource) || !resourceAllowed(resource, origin)) problem = 'O aplicativo pediu acesso a um endereço diferente do MCP da Jornada.';
  else if (one(params.state).length > 500 || one(params.response_type) !== 'code' || one(params.code_challenge_method) !== 'S256' || !challengeValid(challenge)) problem = 'O aplicativo pediu acesso sem a proteção PKCE exigida pela Jornada.';
  else {
    const db = botDatabase();
    const client = db && /^jpc_[A-Za-z0-9_-]{20,60}$/.test(clientId) ? await db.rpc('mcp_oauth_client', { server_secret: botServerSecret(), wanted: clientId }) : null;
    if (!client || client.error || !client.data) problem = 'Este aplicativo não está registrado na Jornada. Comece a conexão de novo pelo aplicativo.';
    else if (!client.data.redirect_uris.includes(redirect)) problem = 'O endereço de retorno não corresponde ao aplicativo registrado.';
    else clientName = String(client.data.client_name);
  }
  return <OAuthConsent problem={problem} clientName={clientName} identity={consentIdentity(redirect)} request={{ client_id: clientId, redirect_uri: redirect, code_challenge: challenge, state: one(params.state) || undefined, resource: resource || undefined,
    write: one(params.scope).split(/\s+/).includes('registrar') }} />;
}
