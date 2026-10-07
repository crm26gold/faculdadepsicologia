import { z } from 'zod';
import { readSession, reply, rpc, writeRequest } from '@/lib/api-route';
import { workAction } from '@/lib/community';
import { workCall } from '@/lib/community-calls';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await readSession();
  if (session instanceof Response) return session;
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get('id'));
  if (!id.success) return reply({ error: 'Trabalho inválido.' }, 400);
  return rpc(session, 'assignment_detail', { target: id.data });
}

export async function POST(request: Request) {
  const input = await writeRequest(request, workAction, 400_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const call = workCall(body);
  if (!call) return reply({ error: 'Esta parte ficou grande demais. Divida o texto em outra parte.' }, 413);
  return rpc(session, call.fn, call.args);
}
