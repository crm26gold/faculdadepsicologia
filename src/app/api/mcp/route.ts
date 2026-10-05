import { botDatabase } from '@/lib/supabase/bot';
import { jornadaMcpHandler, mcpAuthenticate, McpAccessError } from '@/lib/mcp/server';
import { resourceMetadataUrl } from '@/lib/mcp/oauth';
import { applicationOrigin } from '@/lib/auth-input';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const headers = { 'Cache-Control': 'no-store' };
// Every request carries the person's key. A refusal never reveals whether a key existed.
async function serve(request: Request) {
  const db = botDatabase();
  if (!db) return Response.json({ error: 'Servidor MCP indisponível.' }, { status: 503, headers });
  try {
    const access = await mcpAuthenticate(db, request.headers.get('authorization'));
    const response = await jornadaMcpHandler(db, access).fetch(request, { authInfo: { token: access.hash, clientId: access.tokenId, scopes: access.canWrite ? ['ler', 'registrar'] : ['ler'] } });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof McpAccessError) {
      // RFC 9728: clients that support OAuth (ChatGPT, Claude) discover the login from this header.
      const origin = applicationOrigin(process.env);
      const challenge = `Bearer realm="Jornada Plena"${origin ? `, resource_metadata="${resourceMetadataUrl(origin)}"` : ''}`;
      return Response.json({ error: error.message }, { status: error.status, headers: { ...headers, ...(error.status === 401 ? { 'WWW-Authenticate': challenge } : {}) } });
    }
    console.warn('[mcp]', { outcome: 'failed' });
    return Response.json({ error: 'Não consegui atender agora.' }, { status: 500, headers });
  }
}
export const POST = serve;
export const GET = serve;
export const DELETE = serve;
