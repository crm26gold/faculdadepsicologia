import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { dbError, readSession, reply, rpc, writeRequest } from '@/lib/api-route';
import { applicationOrigin } from '@/lib/auth-input';
import { MCP_TOKEN_PREFIX, tokenHash } from '@/lib/mcp/server';

export const dynamic = 'force-dynamic';
const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), label: z.string().trim().min(1).max(60), can_write: z.boolean(), valid_days: z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable() }),
  z.object({ action: z.literal('revoke'), id: z.uuid() }),
]);

// GET: the person's active keys (never the key itself). The endpoint is shown so apps can be configured.
export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  const { data, error } = await session.client.rpc('mcp_token_list');
  if (error) return dbError(error);
  const origin = applicationOrigin(process.env);
  return reply({ ok: true, data: { tokens: data ?? [], endpoint: origin ? `${origin}/api/mcp` : null } });
}

export async function POST(request: Request) {
  const input = await writeRequest(request, action, 2_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  if (body.action === 'revoke') return rpc(session, 'mcp_token_revoke', { token_id: body.id });
  // Shown once. The database keeps only the SHA-256 hash and the last characters as a hint.
  const token = `${MCP_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
  const { data, error } = await session.client.rpc('mcp_token_create', { next_label: body.label, next_hash: tokenHash(token), next_hint: token.slice(-4),
    next_write: body.can_write, valid_days: body.valid_days });
  if (error) return dbError(error);
  const origin = applicationOrigin(process.env);
  return reply({ ok: true, data: { id: data, token, endpoint: origin ? `${origin}/api/mcp` : null } });
}
