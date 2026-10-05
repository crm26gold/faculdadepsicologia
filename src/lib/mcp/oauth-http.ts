import 'server-only';
import { applicationOrigin } from '../auth-input';

// Metadata, registration and token endpoints are public and cookieless: any MCP client may call them.
export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version', 'Cache-Control': 'no-store' };
export const preflight = () => new Response(null, { status: 204, headers: cors });
export function withOrigin(build: (origin: string) => unknown) {
  const origin = applicationOrigin(process.env);
  if (!origin) return Response.json({ error: 'server_error', error_description: 'Endereço do aplicativo não configurado.' }, { status: 503, headers: cors });
  return Response.json(build(origin), { headers: cors });
}
