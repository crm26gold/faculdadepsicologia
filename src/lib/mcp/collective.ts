import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { applicationOrigin } from '../auth-input';
import { botServerSecret } from '../bot/secrets';
import type { botDatabase } from '../supabase/bot';
import type { ConfirmablePending } from '../confirmable';
import type { JobOutcome } from '../assistant-jobs';
import { assistantContactAction, assistantSpaceAction, assistantWorkAction, readShared, runShared, type SharedAction, type SharedOutcome, type Transport } from '../shared-actions';

// The collective layer for MCP clients. Every call goes through public.mcp_act, which runs the screen's
// function as the key's owner (the person's actor), so each role can do exactly what it could do on screen.
// The rules and wording are shared with the app's own assistant in shared-actions.ts.
export type Database = NonNullable<ReturnType<typeof botDatabase>>;
export type Access = { hash: string; canWrite: boolean };
export const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value) }] });
export const failure = (message: string) => ({ ...text(message), isError: true });
export const readOnlyConnection = 'Esta conexão só consulta. Conecte de novo marcando "Permitir registrar e editar".';

/** The person's actor in the database, reached with this MCP key. */
export function mcpTransport(db: Database, access: Access): Transport {
  const call: Transport['call'] = async (fn, args) => {
    const { data, error } = await db.rpc('mcp_act', { server_secret: botServerSecret(), token: access.hash, operation: fn, args });
    return { data, error };
  };
  return { call, describe: (kind, target) => call('describe', { kind, target }) };
}

/** Stores a proposal as a durable confirmation for the key's owner; nothing changes until they confirm. */
export async function storeConfirmation(db: Database, access: Access, pending: ConfirmablePending) {
  const context = await db.rpc('mcp_context', { server_secret: botServerSecret(), token: access.hash });
  if (context.error || !context.data) return failure('Não consegui guardar o pedido agora. Nada foi alterado.');
  const outcome: JobOutcome = { saved: true, reply: `Pedido guardado: ${pending.label}. Confirme no aplicativo.`, applied: [], pending: [pending], failed: [] };
  const saved = await db.rpc('mcp_commit', { server_secret: botServerSecret(), token: access.hash, request_id: crypto.randomUUID(),
    payload_hash: createHash('sha256').update(JSON.stringify(pending.action)).digest('hex'), next_data: null,
    expected_revision: (context.data as { workspace: { revision: number } | null }).workspace?.revision ?? 0, outcome });
  if (saved.error || !saved.data) return failure('Não consegui guardar o pedido agora. Nada foi alterado; tente de novo.');
  return text({ pendente_no_aplicativo: [pending.label], onde_confirmar: 'Meu dia › Pedidos aguardando você, ou Assistente › Conversas › Confirmação de assistente externo.' });
}

/** Runs one shared action for an MCP client and turns the outcome into a tool result. */
export async function mcpShared(db: Database, access: Access, action: SharedAction) {
  if (!access.canWrite) return failure(readOnlyConnection);
  const outcome: SharedOutcome = await runShared(mcpTransport(db, access), action, applicationOrigin(process.env));
  if ('error' in outcome) return failure(outcome.error);
  if ('pending' in outcome) return storeConfirmation(db, access, outcome.pending);
  return text({ feito: outcome.done, resultado: outcome.data ?? null });
}

export function registerCollectiveTools(server: McpServer, db: Database, access: Access) {
  server.registerTool('consultar_coletivo', {
    title: 'Consultar salas, grupos e contatos',
    description: 'Mostra o que a pessoa vê na tela da parte coletiva: inicio (suas instituições, salas e grupos), sala (mural, enquetes, pessoas, grupos e trabalhos de uma sala pelo ID), trabalho (partes, comentários e entregas de um trabalho pelo ID) e contatos. Use para obter IDs antes de agir.',
    inputSchema: z.object({ o_que: z.enum(['inicio', 'sala', 'trabalho', 'contatos']), id: z.uuid().optional().describe('ID da sala ou do trabalho') }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ o_que, id }) => {
    const result = await readShared(mcpTransport(db, access), o_que, id);
    return 'error' in result ? failure(result.error) : text(result.data);
  });

  server.registerTool('gerenciar_salas', {
    title: 'Gerenciar salas e grupos',
    description: 'Age nas instituições, salas e grupos com as permissões da própria pessoa: criar, editar ou arquivar sala e grupo, adicionar aluno ou líder por e-mail, criar e cancelar convite (devolve o link), aceitar convite, publicar no mural, criar enquete e votar. Excluir publicação ou enquete fica guardado para a pessoa confirmar no aplicativo. Tirar pessoas, mudar papéis e dar papel de professor ou dono são feitos só na tela.',
    inputSchema: z.object({ acao: assistantSpaceAction }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ acao }) => mcpShared(db, access, { area: 'salas', acao }));

  server.registerTool('gerenciar_trabalhos', {
    title: 'Gerenciar trabalhos em grupo',
    description: 'Age nos trabalhos em grupo com as permissões da própria pessoa: criar trabalhos para grupos, editar trabalho e status, criar e editar partes e responsáveis, escrever ou entregar a própria parte, comentar e pedir revisão, resolver comentário. Excluir trabalho ou parte fica guardado para a pessoa confirmar no aplicativo.',
    inputSchema: z.object({ acao: assistantWorkAction }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ acao }) => mcpShared(db, access, { area: 'trabalhos', acao }));

  server.registerTool('gerenciar_contatos', {
    title: 'Gerenciar contatos',
    description: 'Cria ou edita um contato privado da pessoa (nome, e-mail, telefone, aniversário e observações). Para editar, envie o ID do contato; para criar, contact null. Excluir contato fica guardado para a pessoa confirmar no aplicativo.',
    inputSchema: z.object({ acao: assistantContactAction }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ acao }) => mcpShared(db, access, { area: 'contatos', acao }));
}
