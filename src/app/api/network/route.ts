import { readSession, reply, rpc, writeRequest } from '@/lib/api-route';
import { networkAction, networkCall, networkRead } from '@/lib/network';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await readSession();
  if (session instanceof Response) return session;
  const call = networkRead(new URL(request.url).searchParams);
  if (!call) return reply({ error: 'Pedido inválido.' }, 400);
  return rpc(session, call.fn, call.args);
}

export async function POST(request: Request) {
  const input = await writeRequest(request, networkAction, 8_000);
  if (input instanceof Response) return input;
  const call = networkCall(input.body);
  return rpc(input.session, call.fn, call.args);
}
