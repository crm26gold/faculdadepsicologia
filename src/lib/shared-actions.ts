import 'server-only';
import { z } from 'zod';
import { contactAction, spaceAction, workAction } from './community';
import { contactCall, invitationSecret, spaceCall, workCall, type DbCall } from './community-calls';
import { adminRequest, collectiveDeletions, deletionNouns, type AdminRequest, type CollectiveDeletionFn, type ConfirmablePending } from './confirmable';
import { aiCatalog, aiProviderIds, aiTaskIds, liveModelAllowed, voiceOnlyProviders } from './ai/catalog';

// One core for what assistants do in the collective layer and in administration, on every channel: the MCP
// (through the person's actor) and the app's own assistant and voice (with the person's login). The
// transport only decides how a screen function is reached; the rules and the wording live here once.
// Deletions and administration are proposals the person confirms in the app. Removing or blocking people,
// changing roles, making someone master and API keys are not reachable here.
export type DeletionKind = typeof collectiveDeletions[CollectiveDeletionFn];
type Reply = { data: unknown; error: { code?: string } | null };
export type Transport = {
  call: (fn: string, args: Record<string, unknown>) => Promise<Reply>;
  describe: (kind: DeletionKind, target: string) => Promise<Reply>;
};
export type SharedOutcome = { done: string; data?: unknown } | { pending: ConfirmablePending } | { error: string };

const allowed = <T extends { shape: { action: { value: string } } }>(options: readonly T[], names: string[]) =>
  options.filter(option => names.includes(option.shape.action.value));
export const assistantSpaceAction = z.discriminatedUnion('action', [
  ...allowed(spaceAction.options, ['create_space', 'update_space', 'archive_space', 'create_invitation', 'revoke_invitation', 'accept_invitation', 'create_post', 'create_poll', 'vote', 'delete_post', 'delete_poll']),
  z.object({ action: z.literal('add_member'), space: z.uuid(), email: z.email().max(254), role: z.enum(['student', 'leader']) }),
] as never) as unknown as z.ZodType<z.infer<typeof spaceAction>>;
export const assistantWorkAction = z.discriminatedUnion('action',
  allowed(workAction.options, ['create_assignments', 'update_assignment', 'add_part', 'update_part', 'save_part', 'add_comment', 'resolve_comment', 'delete_assignment', 'delete_part']) as never) as unknown as z.ZodType<z.infer<typeof workAction>>;
export const assistantContactAction = z.discriminatedUnion('action', allowed(contactAction.options, ['save', 'delete']) as never) as unknown as z.ZodType<z.infer<typeof contactAction>>;
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const assistantAdminAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('atualizar_conta'), account: z.uuid(), plan: z.enum(['academic', 'pro']).optional(), source: z.enum(['free', 'paid', 'courtesy']).optional(),
    pro_until: day.nullable().optional(), credits: z.number().int().min(0).max(1_000_000).optional(), features: z.array(z.enum(['create_classes', 'ai'])).max(20).optional() }),
  z.object({ action: z.literal('acesso_livre'), value: z.boolean() }),
  z.object({ action: z.literal('usar_ia'), task: z.enum(aiTaskIds), provider: z.enum(aiProviderIds), model: z.string().trim().min(1).max(120).default('auto:rapido'),
    mode: z.enum(['auto', 'fixed']).default('auto'), enabled: z.boolean().default(true) }),
]);
export const sharedAction = z.discriminatedUnion('area', [
  z.object({ area: z.literal('salas'), acao: assistantSpaceAction }),
  z.object({ area: z.literal('trabalhos'), acao: assistantWorkAction }),
  z.object({ area: z.literal('contatos'), acao: assistantContactAction }),
  z.object({ area: z.literal('administracao'), acao: assistantAdminAction }),
]);
export type SharedAction = z.infer<typeof sharedAction>;

const messages: Record<string, string> = {
  '42501': 'Sem permissão para isso: a sua conta não pode fazer isso nesta sala, ou a conexão do assistente só consulta.',
  PT403: 'Isto só pode ser feito na tela do aplicativo, com confirmação.',
  PT429: 'Muitas chamadas com esta conexão. Aguarde alguns minutos.',
  P0002: 'Não encontrei esse item. Consulte de novo para pegar o ID certo.',
  '22023': 'Dados inválidos para essa ação. Confira os campos.',
  '23505': 'Isso já existe.',
  '40001': 'Outra pessoa alterou isto agora. Consulte de novo antes de repetir.',
};
export const ownerOnly = 'Só o administrador geral consulta e altera a administração.';
export function errorText(error: { code?: string } | null, denied = messages['42501']) {
  if (['PGRST202', '42883'].includes(error?.code ?? '')) return 'Esta função do assistente está aguardando a atualização do banco.';
  if (error?.code === '42501') return denied;
  return messages[error?.code ?? ''] ?? 'Não consegui concluir agora. Nada foi confirmado; consulte antes de repetir.';
}

const reads = { inicio: 'app_home', contatos: 'list_contacts', contas: 'admin_overview', uso: 'jornada_budget_status', recursos: 'ai_resource_map' } as const;
export type SharedRead = keyof typeof reads | 'sala' | 'trabalho';
/** What the person sees on the corresponding screen; administration answers only the general administrator. */
export async function readShared(transport: Transport, what: SharedRead, id?: string): Promise<{ data: unknown } | { error: string }> {
  if ((what === 'sala' || what === 'trabalho') && !id) return { error: 'Informe o ID. Consulte "inicio" para ver as salas e os trabalhos.' };
  const fn = what === 'sala' ? 'space_overview' : what === 'trabalho' ? 'assignment_detail' : reads[what];
  const result = await transport.call(fn, id ? { target: id } : {});
  return result.error ? { error: errorText(result.error, ['contas', 'uso', 'recursos'].includes(what) ? ownerOnly : undefined) } : { data: result.data };
}

const kinds = { institution: 'instituição', class: 'sala', group: 'grupo' } as const;
const roles = { student: 'aluno', leader: 'líder' } as const;
const taskNames = { assistente: 'Assistente', organizar: 'Organizar', voz: 'Chamada ao vivo' } as const;
const plans = { academic: 'Acadêmico', pro: 'Pro' } as const;
const sources = { free: 'gratuito', paid: 'pago', courtesy: 'cortesia' } as const;
const featureNames = { create_classes: 'criar salas', ai: 'IA' } as const;
const brDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
type Account = { user_id: string; email: string; display_name: string; is_master: boolean; plan: 'academic' | 'pro'; plan_source: 'free' | 'paid' | 'courtesy'; pro_until: string | null; ai_credits: number; features: ('create_classes' | 'ai')[] };

async function run(transport: Transport, call: DbCall | null, label: string, extra?: (data: unknown) => unknown): Promise<SharedOutcome> {
  if (!call) return { error: 'Esta parte ficou grande demais. Divida o texto em outra parte.' };
  const result = await transport.call(call.fn, call.args);
  return result.error ? { error: errorText(result.error) } : { done: label, data: extra ? extra(result.data) : result.data ?? null };
}
async function proposeDeletion(transport: Transport, fn: CollectiveDeletionFn, target: string): Promise<SharedOutcome> {
  const kind = collectiveDeletions[fn];
  const found = await transport.describe(kind, target);
  if (found.error) return { error: errorText(found.error) };
  if (!found.data) return { error: 'Não encontrei esse item, ou a sua conta não tem acesso a ele. Consulte de novo para pegar o ID certo.' };
  const item = found.data as { title: string; where: string };
  return { pending: { action: { type: 'excluir_coletivo', fn, target }, fingerprint: JSON.stringify(item), label: `Excluir ${deletionNouns[kind]}: ${item.title} (${item.where})` } };
}
function proposeAdmin(request: AdminRequest, label: string, before: unknown): SharedOutcome {
  const valid = adminRequest.safeParse(request);
  if (!valid.success) return { error: 'Esse pedido de administração não tem um formato aceito pelo painel.' };
  return { pending: { action: { type: 'administrar', request: valid.data }, fingerprint: JSON.stringify(before), label } };
}

async function administer(transport: Transport, acao: z.infer<typeof assistantAdminAction>): Promise<SharedOutcome> {
  if (acao.action === 'usar_ia') {
    if (acao.task !== 'voz' && voiceOnlyProviders.includes(acao.provider)) return { error: `${aiCatalog[acao.provider].name} atende somente a Chamada ao vivo.` };
    if (acao.task === 'voz' && !liveModelAllowed(acao.provider, acao.model)) return { error: 'Para a Chamada ao vivo, escolha Gemini com modelo Live, OpenAI com gpt-live-1, xAI com grok-voice-latest ou ElevenLabs com um modelo do agente.' };
    const map = await transport.call('ai_resource_map', {});
    if (map.error) return { error: errorText(map.error, ownerOnly) };
    const label = `Usar ${aiCatalog[acao.provider].name} (${acao.model}) em ${taskNames[acao.task]}, modo ${acao.mode === 'auto' ? 'automático' : 'fixo'}${acao.enabled ? '' : ', desligada'}`;
    return proposeAdmin({ url: '/api/ai/admin', body: { action: 'save_route', task: acao.task, provider: acao.provider, connection_id: null, model: acao.model,
      enabled: acao.enabled, routing_mode: acao.mode, fallbacks: [] } }, label, (map.data as { routes?: unknown[] } | null)?.routes ?? null);
  }
  const current = await transport.call('admin_overview', {});
  if (current.error) return { error: errorText(current.error, ownerOnly) };
  const overview = current.data as { accounts: Account[]; settings: { open_access: boolean } };
  if (acao.action === 'acesso_livre') {
    const now = overview.settings.open_access;
    return proposeAdmin({ url: '/api/admin', body: { action: 'set_open_access', value: acao.value } },
      `${acao.value ? 'Abrir' : 'Fechar'} o acesso livre para novas contas (hoje está ${now ? 'aberto' : 'fechado'})`, { open_access: now });
  }
  const account = overview.accounts.find(item => item.user_id === acao.account);
  if (!account) return { error: 'Não encontrei essa conta. Consulte "contas" para pegar o ID certo.' };
  const next = { plan: acao.plan ?? account.plan, source: acao.source ?? account.plan_source, pro_until: acao.pro_until !== undefined ? acao.pro_until : account.pro_until,
    credits: acao.credits ?? account.ai_credits, features: acao.features ?? account.features };
  const who = account.display_name ? `${account.display_name} (${account.email})` : account.email;
  const label = `Conta de ${who}: plano ${plans[next.plan]}${next.pro_until ? ` até ${brDate(next.pro_until)}` : ''}, ${sources[next.source]}, ${next.credits} créditos, recursos: ${next.features.map(item => featureNames[item]).join(', ') || 'nenhum'}`;
  // The master flag is copied from the account as it is now: an assistant can never grant or remove it.
  return proposeAdmin({ url: '/api/admin', body: { action: 'update_account', account: account.user_id, ...next, master: account.is_master } }, label,
    { plan: account.plan, source: account.plan_source, pro_until: account.pro_until, credits: account.ai_credits, features: account.features });
}

/** Runs or proposes one assistant action; `origin` builds invitation links. */
export async function runShared(transport: Transport, action: SharedAction, origin: string | null): Promise<SharedOutcome> {
  if (action.area === 'administracao') return administer(transport, action.acao);
  if (action.area === 'contatos') {
    const acao = action.acao;
    return acao.action === 'delete' ? proposeDeletion(transport, 'delete_contact', acao.contact) : run(transport, contactCall(acao), `Contato salvo: ${acao.name}`);
  }
  if (action.area === 'trabalhos') {
    const acao = action.acao;
    switch (acao.action) {
      case 'delete_assignment': return proposeDeletion(transport, 'delete_assignment', acao.assignment);
      case 'delete_part': return proposeDeletion(transport, 'delete_part', acao.part);
      case 'create_assignments': return run(transport, workCall(acao), `Trabalho criado: ${acao.title} (${acao.spaces.length} ${acao.spaces.length === 1 ? 'grupo' : 'grupos'})`);
      case 'update_assignment': return run(transport, workCall(acao), `Trabalho atualizado: ${acao.title}`);
      case 'add_part': return run(transport, workCall(acao), `Parte criada: ${acao.title}`);
      case 'update_part': return run(transport, workCall(acao), `Parte atualizada: ${acao.title}`);
      case 'save_part': return run(transport, workCall(acao), acao.status === 'submitted' ? 'Parte entregue' : acao.status === 'approved' ? 'Parte aprovada' : acao.status === 'needs_revision' ? 'Revisão pedida na parte' : 'Parte salva');
      case 'add_comment': return run(transport, workCall(acao), acao.kind === 'revision_request' ? 'Revisão pedida' : 'Comentário adicionado');
      case 'resolve_comment': return run(transport, workCall(acao), 'Comentário resolvido');
    }
  }
  const acao = action.acao;
  switch (acao.action) {
    case 'delete_post': return proposeDeletion(transport, 'delete_post', acao.post);
    case 'delete_poll': return proposeDeletion(transport, 'delete_poll', acao.poll);
    case 'create_invitation': {
      const secret = invitationSecret();
      const link = origin ? `${origin}/convite/${secret.token}` : null;
      return run(transport, spaceCall(acao, secret.hashed), `Convite criado (${roles[acao.role]}, ${acao.days} dias, até ${acao.uses} usos)${link ? `: ${link}` : ''}`, () => ({ link }));
    }
    case 'create_space': return run(transport, spaceCall(acao), `Criado: ${kinds[acao.kind]} ${acao.name}`);
    case 'update_space': return run(transport, spaceCall(acao), `Atualizado: ${acao.name}`);
    case 'archive_space': return run(transport, spaceCall(acao), acao.archived ? 'Sala arquivada' : 'Sala reaberta');
    case 'add_member': return run(transport, spaceCall(acao), `Adicionado como ${roles[acao.role as 'student' | 'leader']}: ${acao.email}`);
    case 'revoke_invitation': return run(transport, spaceCall(acao), 'Convite cancelado');
    case 'accept_invitation': return run(transport, spaceCall(acao), 'Convite aceito');
    case 'create_post': return run(transport, spaceCall(acao), `Publicado no mural: ${acao.title}`);
    case 'create_poll': return run(transport, spaceCall(acao), `Enquete criada: ${acao.question}`);
    case 'vote': return run(transport, spaceCall(acao), 'Voto registrado');
    default: return { error: 'Isto só pode ser feito na tela do aplicativo, com confirmação.' };
  }
}

/** The person's own login (the app's assistant and voice): screen functions under the person's RLS. */
export function sessionTransport(client: { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }> }): Transport {
  return {
    call: async (fn, args) => { const { data, error } = await client.rpc(fn, args); return { data, error }; },
    describe: async (kind, target) => { const { data, error } = await client.rpc('assistant_describe', { kind, target }); return { data, error }; },
  };
}

/** Runs a batch of assistant commands in order; invalid shapes are reported, never guessed. */
export async function runSharedCommands(transport: Transport, actions: { area: string; acao: unknown }[], origin: string | null) {
  const result: { done: string[]; pending: ConfirmablePending[]; failed: string[] } = { done: [], pending: [], failed: [] };
  for (const item of actions) {
    const parsed = sharedAction.safeParse({ area: item.area, acao: item.acao });
    if (!parsed.success) { result.failed.push('pedido de sala, trabalho, contato ou administração em formato não aceito'); continue; }
    const outcome = await runShared(transport, parsed.data, origin);
    if ('error' in outcome) result.failed.push(outcome.error.replace(/[.\s]+$/, ''));
    else if ('pending' in outcome) result.pending.push(outcome.pending);
    else result.done.push(outcome.done);
  }
  return result;
}

/** A linked Telegram or WhatsApp chat: the bot reaches the person's actor through public.bot_act. */
export function botTransport(db: { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }> },
  serverSecret: string, channel: 'telegram' | 'whatsapp', chat: string): Transport {
  const call: Transport['call'] = async (fn, args) => {
    const { data, error } = await db.rpc('bot_act', { server_secret: serverSecret, channel_id: channel, chat, operation: fn, args });
    return { data, error };
  };
  return { call, describe: (kind, target) => call('describe', { kind, target }) };
}

type Home = { account?: { is_master?: boolean }; spaces?: { id: string; kind: string; name: string; my_role: string | null; archived_at: string | null }[];
  my_parts?: { id: string; title: string; status: string; assignment_id: string; assignment_title: string }[] };
/** The person's rooms and own group-work parts, as the start screen shows them, so a model can act by ID. */
export function homeContext(data: unknown) {
  if (!data || typeof data !== 'object') return '';
  const home = data as Home;
  const spaces = (home.spaces ?? []).filter(space => !space.archived_at).slice(0, 40)
    .map(space => `${space.name} (${space.kind}, papel: ${space.my_role ?? 'sem papel direto'}, id ${space.id})`);
  const parts = (home.my_parts ?? []).slice(0, 20).map(part => `${part.title} em ${part.assignment_title} (${part.status}, parte ${part.id}, trabalho ${part.assignment_id})`);
  return [`\nSalas e grupos da pessoa: ${spaces.join('; ') || 'nenhum'}.`, parts.length ? `Partes de trabalho da pessoa: ${parts.join('; ')}.` : '',
    home.account?.is_master ? 'A pessoa é o administrador geral: pode propor mudanças de administração.' : ''].filter(Boolean).join('\n');
}
