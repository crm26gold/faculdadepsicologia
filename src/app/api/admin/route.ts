import { readSession, rpc, writeRequest } from '@/lib/api-route';
import { adminAction } from '@/lib/community';

export const dynamic = 'force-dynamic';

// Toda verificação de master acontece no banco; aqui só se repassa o pedido validado.
export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  return rpc(session, 'admin_overview');
}

export async function POST(request: Request) {
  const input = await writeRequest(request, adminAction);
  if (input instanceof Response) return input;
  const { session, body } = input;
  switch (body.action) {
    case 'update_account': return rpc(session, 'admin_update_account', {
      target: body.account, next_plan: body.plan, next_source: body.source, next_pro_until: body.pro_until,
      next_credits: body.credits, next_features: body.features, next_master: body.master,
    });
    case 'set_open_access': return rpc(session, 'admin_set_open_access', { value: body.value });
  }
}
