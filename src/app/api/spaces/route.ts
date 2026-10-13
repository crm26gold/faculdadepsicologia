import { z } from 'zod';
import { dbError, readSession, reply, rpc, writeRequest } from '@/lib/api-route';
import { spaceAction } from '@/lib/community';
import { applicationOrigin } from '@/lib/auth-input';
import { invitationSecret, spaceCall } from '@/lib/community-calls';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await readSession();
  if (session instanceof Response) return session;
  const params = new URL(request.url).searchParams;
  const search = params.get('discover');
  if (search !== null) {
    if (search.length > 60) return reply({ error: 'Busca longa demais.' }, 400);
    return rpc(session, 'discover_groups', { search });
  }
  const id = z.uuid().safeParse(params.get('id'));
  if (!id.success) return reply({ error: 'Sala inválida.' }, 400);
  return rpc(session, 'space_overview', { target: id.data });
}

export async function POST(request: Request) {
  const input = await writeRequest(request, spaceAction);
  if (input instanceof Response) return input;
  const { session, body } = input;
  // Invitation and acceptance keep their own replies; everything else is the shared screen map.
  if (body.action === 'create_invitation') {
    const secret = invitationSecret();
    const call = spaceCall(body, secret.hashed);
    const { error } = await session.client.rpc(call.fn, call.args);
    if (error) return dbError(error);
    return reply({ ok: true, data: { link: `${applicationOrigin(process.env)}/convite/${secret.token}` } });
  }
  if (body.action === 'accept_invitation') {
    const call = spaceCall(body);
    const { data, error } = await session.client.rpc(call.fn, call.args);
    if (error) return error.code === '22023' ? reply({ error: 'Este convite não é válido: pode ter expirado, sido cancelado ou atingido o limite.' }, 400) : dbError(error);
    return reply({ ok: true, data });
  }
  const call = spaceCall(body);
  return rpc(session, call.fn, call.args);
}
