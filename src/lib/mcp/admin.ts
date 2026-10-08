import 'server-only';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { assistantAdminAction, readShared } from '../shared-actions';
import { failure, mcpShared, mcpTransport, readOutput, screenRead, type Access, type Database } from './collective';

// Administration for the general administrator through an MCP client. Reads answer only the administrator;
// changes are proposals confirmed in the app, applied by the panel's own route (rules in shared-actions.ts).
export function registerAdminTools(server: McpServer, db: Database, access: Access) {
  server.registerTool('consultar_administracao', {
    title: 'Consultar a administração',
    description: 'Só para o administrador geral: contas (pessoas, planos, créditos, recursos, salas e histórico administrativo), uso (consumo e limites da Jornada) e recursos (o que cada IA configurada realmente atende, sem chaves).',
    inputSchema: z.object({ o_que: z.enum(['contas', 'uso', 'recursos']) }),
    outputSchema: readOutput(['contas', 'uso', 'recursos']),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ o_que }) => {
    const result = await readShared(mcpTransport(db, access), o_que);
    return 'error' in result ? failure(result.error) : screenRead(o_que, result.data);
  });

  server.registerTool('administrar', {
    title: 'Propor mudança de administração',
    description: 'Só para o administrador geral. Propõe, para ele confirmar no aplicativo: acesso_livre (abrir ou fechar a entrada de novas contas) e usar_ia (qual empresa de IA atende uma tarefa, com a chave principal já cadastrada). Nada muda antes da confirmação. Dar ou tirar administrador, plano e créditos de contas, chaves de API e declarações de privacidade são feitos só na tela.',
    inputSchema: z.object({ acao: assistantAdminAction }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ acao }) => mcpShared(db, access, { area: 'administracao', acao }));
}
