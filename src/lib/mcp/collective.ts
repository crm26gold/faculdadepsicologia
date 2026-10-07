import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { contactAction, spaceAction, workAction } from '../community';
import { contactCall, invitationSecret, spaceCall, workCall, type DbCall } from '../community-calls';
import { applicationOrigin } from '../auth-input';
import { botServerSecret } from '../bot/secrets';
import type { botDatabase } from '../supabase/bot';
import { collectiveDeletions, deletionNouns, type CollectiveDeletionFn, type CollectivePending } from '../collective-deletions';
import type { JobOutcome } from '../assistant-jobs';

// The collective layer for assistants: the same screen actions, run in the database as the key's owner
// (public.mcp_act), so each role can do exactly what it could do on screen. Deletions are only proposed:
// the person confirms them in the app, where the screen's route runs them. Removing or blocking people,
// changing roles and administration are not offered here; they stay on the screen.
type Database = NonNullable<ReturnType<typeof botDatabase>>;
type Access = { hash: string; canWrite: boolean };
const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value) }] });
const failure = (message: string) => ({ ...text(message), isError: true });

const allowed = <T extends { shape: { action: { value: string } } }>(options: readonly T[], names: string[]) =>
  options.filter(option => names.includes(option.shape.action.value));
const memberRoles = z.enum(['student', 'leader']);
export const assistantSpaceAction = z.discriminatedUnion('action', [
  ...allowed(spaceAction.options, ['create_space', 'update_space', 'archive_space', 'create_invitation', 'revoke_invitation', 'accept_invitation', 'create_post', 'create_poll', 'vote', 'delete_post', 'delete_poll']),
  z.object({ action: z.literal('add_member'), space: z.uuid(), email: z.email().max(254), role: memberRoles }),
] as never) as unknown as z.ZodType<z.infer<typeof spaceAction>>;
export const assistantWorkAction = z.discriminatedUnion('action',
  allowed(workAction.options, ['create_assignments', 'update_assignment', 'add_part', 'update_part', 'save_part', 'add_comment', 'resolve_comment', 'delete_assignment', 'delete_part']) as never) as unknown as z.ZodType<z.infer<typeof workAction>>;
export const assistantContactAction = z.discriminatedUnion('action', allowed(contactAction.options, ['save', 'delete']) as never) as unknown as z.ZodType<z.infer<typeof contactAction>>;

const messages: Record<string, string> = {
  '42501': 'Sem permissão para isso: a sua conta não pode fazer isso nesta sala, ou a chave do assistente só consulta.',
  PT403: 'Isto só pode ser feito na tela do aplicativo, com confirmação.',
  PT429: 'Muitas chamadas com esta chave. Aguarde alguns minutos.',
  P0002: 'Não encontrei esse item. Consulte de novo para pegar o ID certo.',
  '22023': 'Dados inválidos para essa ação. Confira os campos.',
  '23505': 'Isso já existe.',
  '40001': 'Outra pessoa alterou isto agora. Consulte de novo antes de repetir.',
};

async function act(db: Database, access: Access, call: DbCall) {
  const { data, error } = await db.rpc('mcp_act', { server_secret: botServerSecret(), token: access.hash, operation: call.fn, args: call.args });
  if (['PGRST202', '42883'].includes(error?.code ?? '')) return { error: 'Esta função do assistente está aguardando a atualização do banco.' };
  if (error) return { error: messages[error.code ?? ''] ?? 'Não consegui concluir agora. Nada foi confirmado; consulte antes de repetir.' };
  return { data };
}

export function registerCollectiveTools(server: McpServer, db: Database, access: Access) {
  const write = async (call: DbCall | null, done: (data: unknown) => unknown) => {
    if (!access.canWrite) return failure('Esta conexão só consulta. Conecte de novo marcando "Permitir registrar e editar".');
    if (!call) return failure('Esta parte ficou grande demais. Divida o texto em outra parte.');
    const result = await act(db, access, call);
    return 'error' in result ? failure(result.error!) : text(done(result.data));
  };

  // A deletion becomes a stored confirmation worded by the database, never by the model.
  const propose = async (fn: CollectiveDeletionFn, target: string) => {
    if (!access.canWrite) return failure('Esta conexão só consulta. Conecte de novo marcando "Permitir registrar e editar".');
    const kind = collectiveDeletions[fn];
    const found = await act(db, access, { fn: 'describe', args: { kind, target } });
    if ('error' in found) return failure(found.error!);
    if (!found.data) return failure('Não encontrei esse item, ou a sua conta não tem acesso a ele. Consulte de novo para pegar o ID certo.');
    const item = found.data as { title: string; where: string };
    const pending: CollectivePending = { action: { type: 'excluir_coletivo', fn, target }, fingerprint: JSON.stringify(item), label: `Excluir ${deletionNouns[kind]}: ${item.title} (${item.where})` };
    const context = await db.rpc('mcp_context', { server_secret: botServerSecret(), token: access.hash });
    if (context.error || !context.data) return failure('Não consegui guardar o pedido agora. Nada foi excluído.');
    const outcome: JobOutcome = { saved: true, reply: `Pedido guardado: ${pending.label}. Confirme no aplicativo.`, applied: [], pending: [pending], failed: [] };
    const saved = await db.rpc('mcp_commit', { server_secret: botServerSecret(), token: access.hash, request_id: crypto.randomUUID(),
      payload_hash: createHash('sha256').update(JSON.stringify(pending.action)).digest('hex'), next_data: null,
      expected_revision: (context.data as { workspace: { revision: number } | null }).workspace?.revision ?? 0, outcome });
    if (saved.error || !saved.data) return failure('Não consegui guardar o pedido agora. Nada foi excluído; tente de novo.');
    return text({ pendente_no_aplicativo: [pending.label], onde_confirmar: 'Meu dia › Pedidos aguardando você, ou Assistente › Conversas › Confirmação de assistente externo.' });
  };

  server.registerTool('consultar_coletivo', {
    title: 'Consultar salas, grupos e contatos',
    description: 'Mostra o que a pessoa vê na tela da parte coletiva: inicio (suas instituições, salas e grupos), sala (mural, enquetes, pessoas, grupos e trabalhos de uma sala pelo ID), trabalho (partes, comentários e entregas de um trabalho pelo ID) e contatos. Use para obter IDs antes de agir.',
    inputSchema: z.object({ o_que: z.enum(['inicio', 'sala', 'trabalho', 'contatos']), id: z.uuid().optional().describe('ID da sala ou do trabalho') }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ o_que, id }) => {
    if ((o_que === 'sala' || o_que === 'trabalho') && !id) return failure('Informe o ID. Consulte "inicio" para ver as salas e os trabalhos.');
    const call: DbCall = o_que === 'inicio' ? { fn: 'app_home', args: {} } : o_que === 'contatos' ? { fn: 'list_contacts', args: {} }
      : { fn: o_que === 'sala' ? 'space_overview' : 'assignment_detail', args: { target: id } };
    const result = await act(db, access, call);
    return 'error' in result ? failure(result.error!) : text(result.data);
  });

  server.registerTool('gerenciar_salas', {
    title: 'Gerenciar salas e grupos',
    description: 'Age nas instituições, salas e grupos com as permissões da própria pessoa: criar, editar ou arquivar sala e grupo, adicionar aluno ou líder por e-mail, criar e cancelar convite (devolve o link), aceitar convite, publicar no mural, criar enquete e votar. Excluir publicação ou enquete fica guardado para a pessoa confirmar no aplicativo. Tirar pessoas, mudar papéis e dar papel de professor ou dono são feitos só na tela.',
    inputSchema: z.object({ acao: assistantSpaceAction }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ acao }) => {
    if (acao.action === 'delete_post') return propose('delete_post', acao.post);
    if (acao.action === 'delete_poll') return propose('delete_poll', acao.poll);
    if (acao.action === 'create_invitation') {
      const secret = invitationSecret();
      return write(spaceCall(acao, secret.hashed), () => ({ feito: 'Convite criado', link: `${applicationOrigin(process.env)}/convite/${secret.token}` }));
    }
    return write(spaceCall(acao), data => ({ feito: acao.action, resultado: data ?? null }));
  });

  server.registerTool('gerenciar_trabalhos', {
    title: 'Gerenciar trabalhos em grupo',
    description: 'Age nos trabalhos em grupo com as permissões da própria pessoa: criar trabalhos para grupos, editar trabalho e status, criar e editar partes e responsáveis, escrever ou entregar a própria parte, comentar e pedir revisão, resolver comentário. Excluir trabalho ou parte fica guardado para a pessoa confirmar no aplicativo.',
    inputSchema: z.object({ acao: assistantWorkAction }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ acao }) => acao.action === 'delete_assignment' ? propose('delete_assignment', acao.assignment)
    : acao.action === 'delete_part' ? propose('delete_part', acao.part)
    : write(workCall(acao), data => ({ feito: acao.action, resultado: data ?? null })));

  server.registerTool('gerenciar_contatos', {
    title: 'Gerenciar contatos',
    description: 'Cria ou edita um contato privado da pessoa (nome, e-mail, telefone, aniversário e observações). Para editar, envie o ID do contato; para criar, contact null. Excluir contato fica guardado para a pessoa confirmar no aplicativo.',
    inputSchema: z.object({ acao: assistantContactAction }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ acao }) => acao.action === 'delete' ? propose('delete_contact', acao.contact)
    : write(contactCall(acao), data => ({ feito: 'Contato salvo', id: data ?? null })));
}
