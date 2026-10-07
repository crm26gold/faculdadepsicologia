import 'server-only';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { aiCatalog, aiProviderIds, aiTaskIds, liveModelAllowed, voiceOnlyProviders } from '../ai/catalog';
import { adminRequest, type AdminRequest } from '../confirmable';
import { act, failure, readOnlyConnection, storeConfirmation, text, type Access, type Database } from './collective';

// Administration for the general administrator through an assistant. Reading goes through the person's
// actor, so only the administrator gets answers. Changes are proposals: the administrator confirms them in
// the app and the panel's route applies them. Making someone master, API keys, privacy declarations,
// WhatsApp pairing and bot tokens stay on the screen.
const ownerOnly = 'Só o administrador geral consulta e altera a administração.';
type Account = { user_id: string; email: string; display_name: string; is_master: boolean; plan: 'academic' | 'pro'; plan_source: 'free' | 'paid' | 'courtesy'; pro_until: string | null; ai_credits: number; features: ('create_classes' | 'ai')[] };
type Overview = { accounts: Account[]; settings: { open_access: boolean } };
const taskNames = { assistente: 'Assistente', organizar: 'Organizar', voz: 'Chamada ao vivo' } as const;
const plans = { academic: 'Acadêmico', pro: 'Pro' } as const;
const sources = { free: 'gratuito', paid: 'pago', courtesy: 'cortesia' } as const;
const featureNames = { create_classes: 'criar salas', ai: 'IA' } as const;
const brDate = (day: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const assistantAdminAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('atualizar_conta'), account: z.uuid(), plan: z.enum(['academic', 'pro']).optional(), source: z.enum(['free', 'paid', 'courtesy']).optional(),
    pro_until: day.nullable().optional(), credits: z.number().int().min(0).max(1_000_000).optional(), features: z.array(z.enum(['create_classes', 'ai'])).max(20).optional() }),
  z.object({ action: z.literal('acesso_livre'), value: z.boolean() }),
  z.object({ action: z.literal('usar_ia'), task: z.enum(aiTaskIds), provider: z.enum(aiProviderIds), model: z.string().trim().min(1).max(120).default('auto:rapido'),
    mode: z.enum(['auto', 'fixed']).default('auto'), enabled: z.boolean().default(true) }),
]);

export function registerAdminTools(server: McpServer, db: Database, access: Access) {
  const overview = async () => {
    const result = await act(db, access, { fn: 'admin_overview', args: {} }, ownerOnly);
    return 'error' in result ? { error: result.error! } : { data: result.data as Overview };
  };
  const propose = (request: AdminRequest, label: string, before: unknown) => {
    const valid = adminRequest.safeParse(request);
    if (!valid.success) return failure('Esse pedido de administração não tem um formato aceito pelo painel.');
    return storeConfirmation(db, access, { action: { type: 'administrar', request: valid.data }, fingerprint: JSON.stringify(before), label });
  };

  server.registerTool('consultar_administracao', {
    title: 'Consultar a administração',
    description: 'Só para o administrador geral: contas (pessoas, planos, créditos, recursos, salas e histórico administrativo), uso (consumo e limites da Jornada) e recursos (o que cada IA configurada realmente atende, sem chaves).',
    inputSchema: z.object({ o_que: z.enum(['contas', 'uso', 'recursos']) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ o_que }) => {
    const fn = o_que === 'contas' ? 'admin_overview' : o_que === 'uso' ? 'jornada_budget_status' : 'ai_resource_map';
    const result = await act(db, access, { fn, args: {} }, ownerOnly);
    return 'error' in result ? failure(result.error!) : text(result.data);
  });

  server.registerTool('administrar', {
    title: 'Propor mudança de administração',
    description: 'Só para o administrador geral. Propõe, para ele confirmar no aplicativo: atualizar_conta (plano, origem, validade do Pro, créditos e recursos de uma pessoa, pelo ID da conta em consultar_administracao), acesso_livre (abrir ou fechar a entrada de novas contas) e usar_ia (qual empresa de IA atende uma tarefa, com a chave principal já cadastrada). Nada muda antes da confirmação. Dar ou tirar administrador, chaves de API e declarações de privacidade são feitos só na tela.',
    inputSchema: z.object({ acao: assistantAdminAction }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ acao }) => {
    if (!access.canWrite) return failure(readOnlyConnection);
    if (acao.action === 'usar_ia') {
      if (acao.task !== 'voz' && voiceOnlyProviders.includes(acao.provider)) return failure(`${aiCatalog[acao.provider].name} atende somente a Chamada ao vivo.`);
      if (acao.task === 'voz' && !liveModelAllowed(acao.provider, acao.model)) return failure('Para a Chamada ao vivo, escolha Gemini com modelo Live, OpenAI com gpt-live-1, xAI com grok-voice-latest ou ElevenLabs com um modelo do agente.');
      const map = await act(db, access, { fn: 'ai_resource_map', args: {} }, ownerOnly);
      if ('error' in map) return failure(map.error!);
      const label = `Usar ${aiCatalog[acao.provider].name} (${acao.model}) em ${taskNames[acao.task]}, modo ${acao.mode === 'auto' ? 'automático' : 'fixo'}${acao.enabled ? '' : ', desligada'}`;
      return propose({ url: '/api/ai/admin', body: { action: 'save_route', task: acao.task, provider: acao.provider, connection_id: null, model: acao.model,
        enabled: acao.enabled, routing_mode: acao.mode, fallbacks: [] } }, label, (map.data as { routes?: unknown[] }).routes ?? null);
    }
    const current = await overview();
    if ('error' in current) return failure(current.error ?? ownerOnly);
    if (acao.action === 'acesso_livre') {
      const now = current.data.settings.open_access;
      return propose({ url: '/api/admin', body: { action: 'set_open_access', value: acao.value } },
        `${acao.value ? 'Abrir' : 'Fechar'} o acesso livre para novas contas (hoje está ${now ? 'aberto' : 'fechado'})`, { open_access: now });
    }
    const account = current.data.accounts.find(item => item.user_id === acao.account);
    if (!account) return failure('Não encontrei essa conta. Consulte "contas" para pegar o ID certo.');
    const next = { plan: acao.plan ?? account.plan, source: acao.source ?? account.plan_source, pro_until: acao.pro_until !== undefined ? acao.pro_until : account.pro_until,
      credits: acao.credits ?? account.ai_credits, features: acao.features ?? account.features };
    const who = account.display_name ? `${account.display_name} (${account.email})` : account.email;
    const label = `Conta de ${who}: plano ${plans[next.plan]}${next.pro_until ? ` até ${brDate(next.pro_until)}` : ''}, ${sources[next.source]}, ${next.credits} créditos, recursos: ${next.features.map(item => featureNames[item]).join(', ') || 'nenhum'}`;
    // The master flag is copied from the account as it is now: an assistant can never grant or remove it.
    return propose({ url: '/api/admin', body: { action: 'update_account', account: account.user_id, ...next, master: account.is_master } }, label,
      { plan: account.plan, source: account.plan_source, pro_until: account.pro_until, credits: account.ai_credits, features: account.features });
  });
}
