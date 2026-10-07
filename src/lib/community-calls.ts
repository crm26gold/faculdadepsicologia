import { createHash, randomBytes } from 'node:crypto';
import type { z } from 'zod';
import type { contactAction, spaceAction, workAction } from './community';
import { DOC_LIMIT, sanitizeDoc } from './doc';

// One map from a screen action to the database function it runs, shared by the API routes and by the
// assistants (MCP). With a single map, an assistant can never call a function differently from the screen.
export type DbCall = { fn: string; args: Record<string, unknown> };
type SpaceAction = z.infer<typeof spaceAction>;
type WorkAction = z.infer<typeof workAction>;
type ContactAction = z.infer<typeof contactAction>;

/** The invitation link carries the secret; the database keeps only its hash. */
export function invitationSecret() {
  const token = randomBytes(24).toString('base64url');
  return { token, hashed: createHash('sha256').update(token).digest('hex') };
}

export function spaceCall(body: SpaceAction, hashedToken = ''): DbCall {
  switch (body.action) {
    case 'create_space': return { fn: 'create_space', args: { space_kind: body.kind, space_name: body.name, parent: body.parent, space_description: body.description, space_color: body.color } };
    case 'update_space': return { fn: 'update_space', args: { target: body.space, space_name: body.name, space_description: body.description, space_color: body.color } };
    case 'archive_space': return { fn: 'archive_space', args: { target: body.space, archived: body.archived } };
    case 'add_member': return { fn: 'add_member_by_email', args: { target: body.space, member_email: body.email, member_role: body.role } };
    case 'set_role': return { fn: 'set_member_role', args: { target: body.space, member: body.member, member_role: body.role } };
    case 'remove_member': return { fn: 'remove_member', args: { target: body.space, member: body.member } };
    case 'create_invitation': return { fn: 'create_invitation', args: { target: body.space, invite_role: body.role, hashed_token: hashedToken, valid_days: body.days, uses_limit: body.uses } };
    case 'revoke_invitation': return { fn: 'revoke_invitation', args: { target: body.invitation } };
    case 'accept_invitation': return { fn: 'accept_invitation', args: { token: body.token } };
    case 'create_post': return { fn: 'create_post', args: { target: body.space, post_kind: body.kind, post_title: body.title, post_body: body.body, post_link: body.link, post_date: body.date, post_pinned: body.pinned } };
    case 'delete_post': return { fn: 'delete_post', args: { target: body.post } };
    case 'create_poll': return { fn: 'create_poll', args: { target: body.space, poll_question: body.question, poll_options: body.options, poll_closes: null } };
    case 'delete_poll': return { fn: 'delete_poll', args: { target: body.poll } };
    case 'vote': return { fn: 'vote', args: { target: body.poll, choice: body.choice } };
  }
}

/** Null when a part's text is too large to save; the text is rebuilt so only allowed structure reaches the group. */
export function workCall(body: WorkAction): DbCall | null {
  const fields = (value: { title: string; subject: string; instructions: string; rules: string; style: object; due: string | null }) => ({
    work_title: value.title, work_subject: value.subject, work_instructions: value.instructions,
    work_rules: value.rules, work_style: value.style, work_due: value.due,
  });
  switch (body.action) {
    case 'create_assignments': return { fn: 'create_assignments', args: { targets: body.spaces, ...fields(body), part_titles: body.parts } };
    case 'update_assignment': return { fn: 'update_assignment', args: { target: body.assignment, ...fields(body), work_status: body.status } };
    case 'delete_assignment': return { fn: 'delete_assignment', args: { target: body.assignment } };
    case 'add_part': return { fn: 'add_part', args: { target: body.assignment, part_title: body.title, part_assignee: body.assignee, part_label: body.label } };
    case 'update_part': return { fn: 'update_part_meta', args: { target: body.part, part_title: body.title, part_assignee: body.assignee, part_label: body.label, part_position: body.position } };
    case 'delete_part': return { fn: 'delete_part', args: { target: body.part } };
    case 'save_part': {
      const content = body.content === undefined ? null : sanitizeDoc(body.content);
      if (content && JSON.stringify(content).length > DOC_LIMIT) return null;
      return { fn: 'save_part', args: { target: body.part, part_content: content, next_status: body.status } };
    }
    case 'add_comment': return { fn: 'add_comment', args: { target: body.part, comment_kind: body.kind, comment_body: body.body } };
    case 'resolve_comment': return { fn: 'resolve_comment', args: { target: body.comment } };
  }
}

export function contactCall(body: ContactAction): DbCall {
  if (body.action === 'delete') return { fn: 'delete_contact', args: { target: body.contact } };
  return { fn: 'save_contact', args: { target: body.contact, contact_name: body.name, contact_email: body.email, contact_phone: body.phone, contact_birthdate: body.birthdate, contact_notes: body.notes } };
}
