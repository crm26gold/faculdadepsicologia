import { dbError, missingRpc, readSession, reply, writeRequest } from '@/lib/api-route';
import { aiResourceAction } from '@/lib/ai/catalog';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Owner only: the database refuses everyone else. The map never carries credentials or member details.
export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  const { data, error } = await session.client.rpc('ai_resource_map');
  if (missingRpc(error)) return reply({ ok: true, data: { available: false } });
  if (error) return dbError(error);
  // Recent failures that another connection covered (or not); an older database simply has none.
  const failures = await session.client.rpc('ai_recent_failures');
  return reply({ ok: true, data: { available: true, map: { ...data, failures: failures.error ? [] : failures.data ?? [] } } });
}

export async function POST(request: Request) {
  const input = await writeRequest(request, aiResourceAction, 4_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const result = body.action === 'set_base'
    ? await session.client.rpc('ai_set_member_base', { next_enabled: body.enabled })
    : await session.client.rpc('ai_set_source_policy', { provider_id: body.provider, connection_id: body.connection_id,
      next_privacy_basis: body.privacy_basis, next_audience: body.audience });
  if (missingRpc(result.error)) return reply({ error: 'O mapa de recursos aguarda a atualização do banco. Nada foi alterado.' }, 503);
  return result.error ? dbError(result.error) : reply({ ok: true, data: null });
}
