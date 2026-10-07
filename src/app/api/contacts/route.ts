import { readSession, rpc, writeRequest } from '@/lib/api-route';
import { contactAction } from '@/lib/community';
import { contactCall } from '@/lib/community-calls';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  return rpc(session, 'list_contacts');
}

export async function POST(request: Request) {
  const input = await writeRequest(request, contactAction);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const call = contactCall(body);
  return rpc(session, call.fn, call.args);
}
