import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { dbError, readSession, reply, rpc, writeRequest } from '@/lib/api-route';
import { spaceAction } from '@/lib/community';
import { applicationOrigin } from '@/lib/auth-input';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await readSession();
  if (session instanceof Response) return session;
  const id = z.uuid().safeParse(new URL(request.url).searchParams.get('id'));
  if (!id.success) return reply({ error: 'Sala inválida.' }, 400);
  return rpc(session, 'space_overview', { target: id.data });
}

export async function POST(request: Request) {
  const input = await writeRequest(request, spaceAction);
  if (input instanceof Response) return input;
  const { session, body } = input;
  switch (body.action) {
    case 'create_space': return rpc(session, 'create_space', { space_kind: body.kind, space_name: body.name, parent: body.parent, space_description: body.description, space_color: body.color });
    case 'update_space': return rpc(session, 'update_space', { target: body.space, space_name: body.name, space_description: body.description, space_color: body.color });
    case 'archive_space': return rpc(session, 'archive_space', { target: body.space, archived: body.archived });
    case 'add_member': return rpc(session, 'add_member_by_email', { target: body.space, member_email: body.email, member_role: body.role });
    case 'set_role': return rpc(session, 'set_member_role', { target: body.space, member: body.member, member_role: body.role });
    case 'remove_member': return rpc(session, 'remove_member', { target: body.space, member: body.member });
    case 'create_invitation': {
      // O link carrega o segredo; o banco guarda apenas o hash.
      const token = randomBytes(24).toString('base64url');
      const hashed = createHash('sha256').update(token).digest('hex');
      const { error } = await session.client.rpc('create_invitation', { target: body.space, invite_role: body.role, hashed_token: hashed, valid_days: body.days, uses_limit: body.uses });
      if (error) return dbError(error);
      return reply({ ok: true, data: { link: `${applicationOrigin(process.env)}/convite/${token}` } });
    }
    case 'revoke_invitation': return rpc(session, 'revoke_invitation', { target: body.invitation });
    case 'accept_invitation': {
      const { data, error } = await session.client.rpc('accept_invitation', { token: body.token });
      if (error) return error.code === '22023' ? reply({ error: 'Este convite não é válido: pode ter expirado, sido cancelado ou atingido o limite.' }, 400) : dbError(error);
      return reply({ ok: true, data });
    }
    case 'create_post': return rpc(session, 'create_post', { target: body.space, post_kind: body.kind, post_title: body.title, post_body: body.body, post_link: body.link, post_date: body.date, post_pinned: body.pinned });
    case 'delete_post': return rpc(session, 'delete_post', { target: body.post });
    case 'create_poll': return rpc(session, 'create_poll', { target: body.space, poll_question: body.question, poll_options: body.options, poll_closes: null });
    case 'delete_poll': return rpc(session, 'delete_poll', { target: body.poll });
    case 'vote': return rpc(session, 'vote', { target: body.poll, choice: body.choice });
  }
}
