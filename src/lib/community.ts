// Tipos e validação compartilhados entre as telas coletivas e as rotas do servidor.
// As permissões reais ficam no banco (RLS); aqui só se valida formato e tamanho.
import { z } from 'zod';
import { safeLink } from './note-media';

export const TERMS_VERSION = '2026-09-30';
export const spaceColors = ['sage', 'lavender', 'sand', 'blue', 'rose'] as const;
export type SpaceColor = typeof spaceColors[number];
export type SpaceKind = 'institution' | 'class' | 'group';
export type Role = 'owner' | 'teacher' | 'assistant' | 'leader' | 'student';
export type PartStatus = 'pending' | 'submitted' | 'needs_revision' | 'approved';

export const roleLabels: Record<Role | 'master', string> = {
  owner: 'Responsável', teacher: 'Professor(a)', assistant: 'Professor(a) auxiliar',
  leader: 'Líder', student: 'Aluno(a)', master: 'Administração',
};
export const kindLabels: Record<SpaceKind, string> = { institution: 'Instituição', class: 'Sala', group: 'Grupo' };
export const statusLabels: Record<PartStatus, string> = {
  pending: 'Em andamento', submitted: 'Entregue', needs_revision: 'Revisar', approved: 'Aprovada',
};
export const postKindLabels = { announcement: 'Aviso', material: 'Material', event: 'Data importante' } as const;
export const docFonts = ['Arial', 'Times New Roman', 'Calibri', 'Georgia'] as const;

export type Account = {
  user_id: string; email: string; display_name: string; is_master: boolean;
  plan: 'academic' | 'pro'; plan_source: 'free' | 'paid' | 'courtesy'; pro_until: string | null;
  ai_credits: number; features: string[]; created_at: string;
};
export type SpaceSummary = {
  id: string; kind: SpaceKind; name: string; description: string; color: SpaceColor;
  parent_id: string | null; archived_at: string | null; my_role: Role | null;
};
export type Home = {
  account: Account; settings: { open_access: boolean };
  consents: { document: 'terms' | 'privacy'; version: string }[];
  spaces: SpaceSummary[];
  my_parts: { id: string; title: string; status: PartStatus; assignment_id: string; assignment_title: string; due_date: string | null; space_id: string }[];
  to_review: { id: string; title: string; assignment_id: string; assignment_title: string; space_id: string; submitted_at: string }[];
};
export type Person = { user_id: string; display_name: string; email: string | null; role: Role | 'master'; is_direct: boolean; is_master: boolean };
export type PathItem = { id: string; kind: SpaceKind; name: string };
export type Post = { id: string; kind: keyof typeof postKindLabels; title: string; body: string; link_url: string | null; event_date: string | null; pinned: boolean; author_id: string | null; created_at: string };
export type Poll = { id: string; question: string; options: string[]; closes_at: string | null; author_id: string | null; created_at: string; my_vote: number | null; results: { option_index: number; votes: number }[] };
export type AssignmentSummary = {
  id: string; title: string; subject_name: string; due_date: string | null; status: 'open' | 'delivered' | 'archived';
  space_id: string; space_name: string; batch_id: string | null; parts_total: number; parts_submitted: number; parts_approved: number;
};
export type Invitation = { id: string; role: 'student' | 'leader'; max_uses: number; uses: number; expires_at: string; revoked_at: string | null; created_at: string };
export type SpaceOverview = {
  space: { id: string; kind: SpaceKind; name: string; description: string; color: SpaceColor; parent_id: string | null; archived_at: string | null; created_at: string };
  path: PathItem[]; access: { can_lead: boolean; can_manage: boolean; is_master: boolean }; my_role: Role | null;
  people: Person[]; groups: { id: string; name: string; description: string; color: SpaceColor; archived_at: string | null; members: number }[];
  posts: Post[]; polls: Poll[]; assignments: AssignmentSummary[]; invitations: Invitation[];
};
export type DocStyle = { font?: typeof docFonts[number]; size?: 11 | 12 | 14; spacing?: 1 | 1.15 | 1.5 | 2; align?: 'left' | 'justify' };
export type Assignment = {
  id: string; space_id: string; batch_id: string | null; title: string; subject_name: string; instructions: string;
  format_rules: string; doc_style: DocStyle; due_date: string | null; status: 'open' | 'delivered' | 'archived';
  created_by: string | null; created_at: string; updated_at: string;
};
export type Part = {
  id: string; assignment_id: string; position: number; title: string; assignee_id: string | null; assignee_label: string;
  content: unknown; status: PartStatus; submitted_by: string | null; submitted_at: string | null; updated_by: string | null; updated_at: string;
};
export type PartComment = { id: string; part_id: string; author_id: string | null; kind: 'comment' | 'revision_request'; body: string; created_at: string; resolved_at: string | null };
export type AssignmentDetail = {
  assignment: Assignment; space: { id: string; kind: SpaceKind; name: string; color: SpaceColor; parent_id: string | null };
  path: PathItem[]; access: { can_lead: boolean; can_manage: boolean }; people: Person[]; parts: Part[]; comments: PartComment[];
};
export type AdminOverview = {
  settings: { open_access: boolean; updated_at: string };
  accounts: (Account & { spaces: number })[];
  spaces: { id: string; kind: SpaceKind; name: string; parent_id: string | null; color: SpaceColor; archived_at: string | null; members: number }[];
  audit: { id: number; actor_id: string | null; target_user_id: string | null; target_space_id: string | null; action: string; details: Record<string, unknown>; created_at: string }[];
};
export type Contact = { id: string; name: string; email: string; phone: string; birthdate: string | null; notes: string; created_at: string };

export function hasPro(home: Pick<Home, 'account' | 'settings'>) {
  const account = home.account;
  return home.settings.open_access || account.is_master
    || (account.plan === 'pro' && (!account.pro_until || new Date(account.pro_until) > new Date()));
}
export const acceptedTerms = (home: Pick<Home, 'consents'>) =>
  home.consents.some(item => item.document === 'terms' && item.version === TERMS_VERSION)
  && home.consents.some(item => item.document === 'privacy' && item.version === TERMS_VERSION);

// ---------- Validação das ações ----------
const id = z.uuid();
const text = (max: number) => z.string().max(max).transform(value => value.trim());
const required = (max: number) => z.string().trim().min(1, 'Preencha este campo.').max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const link = z.string().trim().max(2000).refine(value => !value || (/^https?:\/\//.test(value) && safeLink(value)), 'Use um link completo começando com https://.');
export const docStyleSchema = z.object({
  font: z.enum(docFonts).optional(), size: z.union([z.literal(11), z.literal(12), z.literal(14)]).optional(),
  spacing: z.union([z.literal(1), z.literal(1.15), z.literal(1.5), z.literal(2)]).optional(),
  align: z.enum(['left', 'justify']).optional(),
}).strict();

export const meAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('accept_terms') }),
  z.object({ action: z.literal('rename'), name: required(120) }),
  z.object({ action: z.literal('delete_account'), confirm: z.literal('EXCLUIR') }),
]);

export const spaceAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_space'), kind: z.enum(['institution', 'class', 'group']), name: required(160), parent: id.nullable(), description: text(2000).default(''), color: z.enum(spaceColors).default('sage') }),
  z.object({ action: z.literal('update_space'), space: id, name: required(160), description: text(2000), color: z.enum(spaceColors) }),
  z.object({ action: z.literal('archive_space'), space: id, archived: z.boolean() }),
  z.object({ action: z.literal('add_member'), space: id, email: z.email().max(254), role: z.enum(['owner', 'teacher', 'assistant', 'leader', 'student']) }),
  z.object({ action: z.literal('set_role'), space: id, member: id, role: z.enum(['owner', 'teacher', 'assistant', 'leader', 'student']) }),
  z.object({ action: z.literal('remove_member'), space: id, member: id }),
  z.object({ action: z.literal('create_invitation'), space: id, role: z.enum(['student', 'leader']), days: z.number().int().min(1).max(60), uses: z.number().int().min(1).max(500) }),
  z.object({ action: z.literal('revoke_invitation'), invitation: id }),
  z.object({ action: z.literal('accept_invitation'), token: z.string().min(20).max(200).regex(/^[A-Za-z0-9_-]+$/) }),
  z.object({ action: z.literal('create_post'), space: id, kind: z.enum(['announcement', 'material', 'event']), title: required(160), body: text(10000).default(''), link: link.default(''), date: day.default(null), pinned: z.boolean().default(false) }),
  z.object({ action: z.literal('delete_post'), post: id }),
  z.object({ action: z.literal('create_poll'), space: id, question: required(300), options: z.array(required(120)).min(2).max(10) }),
  z.object({ action: z.literal('delete_poll'), poll: id }),
  z.object({ action: z.literal('vote'), poll: id, choice: z.number().int().min(0).max(9) }),
]);

const workFields = {
  title: required(160), subject: text(160).default(''), instructions: text(20000).default(''),
  rules: text(5000).default(''), style: docStyleSchema.default({}), due: day.default(null),
};
export const workAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_assignments'), spaces: z.array(id).min(1).max(30), ...workFields, parts: z.array(required(160)).max(40).default([]) }),
  z.object({ action: z.literal('update_assignment'), assignment: id, ...workFields, status: z.enum(['open', 'delivered', 'archived']) }),
  z.object({ action: z.literal('delete_assignment'), assignment: id }),
  z.object({ action: z.literal('add_part'), assignment: id, title: required(160), assignee: id.nullable().default(null), label: text(120).default('') }),
  z.object({ action: z.literal('update_part'), part: id, title: required(160), assignee: id.nullable(), label: text(120), position: z.number().int().min(0).max(1000) }),
  z.object({ action: z.literal('delete_part'), part: id }),
  z.object({ action: z.literal('save_part'), part: id, content: z.unknown().optional(), status: z.enum(['pending', 'submitted', 'needs_revision', 'approved']).nullable().default(null) }),
  z.object({ action: z.literal('add_comment'), part: id, kind: z.enum(['comment', 'revision_request']), body: required(4000) }),
  z.object({ action: z.literal('resolve_comment'), comment: id }),
]);

export const adminAction = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update_account'), account: id, plan: z.enum(['academic', 'pro']), source: z.enum(['free', 'paid', 'courtesy']),
    pro_until: day.default(null), credits: z.number().int().min(0).max(1_000_000), features: z.array(z.enum(['create_classes', 'ai'])).max(20), master: z.boolean(),
  }),
  z.object({ action: z.literal('set_open_access'), value: z.boolean() }),
]);

export const contactAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), contact: id.nullable(), name: required(160), email: z.union([z.literal(''), z.email().max(254)]).default(''), phone: text(40).default(''), birthdate: day.default(null), notes: text(2000).default('') }),
  z.object({ action: z.literal('delete'), contact: id }),
]);

export function upcomingBirthdays(contacts: Contact[], today: string, days = 14) {
  const base = new Date(`${today}T12:00:00`);
  return contacts.flatMap(contact => {
    if (!contact.birthdate) return [];
    const [, month, day] = contact.birthdate.split('-').map(Number);
    let next = new Date(base.getFullYear(), month - 1, day, 12);
    if (next < new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0)) next = new Date(base.getFullYear() + 1, month - 1, day, 12);
    const inDays = Math.round((next.getTime() - base.getTime()) / 86_400_000);
    return inDays >= 0 && inDays <= days ? [{ contact, inDays, date: next }] : [];
  }).sort((a, b) => a.inDays - b.inDays);
}
