import { z } from 'zod';
import { readSession, reply, rpc, writeRequest } from '@/lib/api-route';
import { workAction } from '@/lib/community';
import { DOC_LIMIT, sanitizeDoc } from '@/lib/doc';

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
  const fields = (value: { title: string; subject: string; instructions: string; rules: string; style: object; due: string | null }) => ({
    work_title: value.title, work_subject: value.subject, work_instructions: value.instructions,
    work_rules: value.rules, work_style: value.style, work_due: value.due,
  });
  switch (body.action) {
    case 'create_assignments': return rpc(session, 'create_assignments', { targets: body.spaces, ...fields(body), part_titles: body.parts });
    case 'update_assignment': return rpc(session, 'update_assignment', { target: body.assignment, ...fields(body), work_status: body.status });
    case 'delete_assignment': return rpc(session, 'delete_assignment', { target: body.assignment });
    case 'add_part': return rpc(session, 'add_part', { target: body.assignment, part_title: body.title, part_assignee: body.assignee, part_label: body.label });
    case 'update_part': return rpc(session, 'update_part_meta', { target: body.part, part_title: body.title, part_assignee: body.assignee, part_label: body.label, part_position: body.position });
    case 'delete_part': return rpc(session, 'delete_part', { target: body.part });
    case 'save_part': {
      // O texto é reconstruído no servidor: só estrutura permitida chega ao grupo.
      const content = body.content === undefined ? null : sanitizeDoc(body.content);
      if (content && JSON.stringify(content).length > DOC_LIMIT) return reply({ error: 'Esta parte ficou grande demais. Divida o texto em outra parte.' }, 413);
      return rpc(session, 'save_part', { target: body.part, part_content: content, next_status: body.status });
    }
    case 'add_comment': return rpc(session, 'add_comment', { target: body.part, comment_kind: body.kind, comment_body: body.body });
    case 'resolve_comment': return rpc(session, 'resolve_comment', { target: body.comment });
  }
}
