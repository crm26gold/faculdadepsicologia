import { dbError, readSession, reply } from '@/lib/api-route';
import { configureBudgetGuard } from '@/lib/ai/budget';

export const dynamic = 'force-dynamic';
export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  // Owner-only bootstrap lets the core work before any external messenger is linked.
  try {
    const configured = await configureBudgetGuard(session);
    if (configured.error) return dbError(configured.error);
  } catch { return reply({ error: 'Não foi possível verificar o controle de uso agora.' }, 503); }
  // The database checks app_owner before returning any aggregate usage.
  const { data, error } = await session.client.rpc('jornada_budget_status');
  return error ? dbError(error) : reply({ ok: true, data });
}
