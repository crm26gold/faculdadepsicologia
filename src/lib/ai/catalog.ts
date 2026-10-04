import { z } from 'zod';

// Everything the panel can switch without code: which provider, which model, for which task.
export const aiProviderIds = ['gemini', 'vertex', 'google_cloud', 'openai', 'anthropic', 'deepseek', 'xai', 'mistral', 'groq', 'openrouter', 'compatible'] as const;
export type AiProviderId = typeof aiProviderIds[number];
export const aiTaskIds = ['assistente', 'organizar', 'voz'] as const;
export type AiTaskId = typeof aiTaskIds[number];

type ProviderInfo = { name: string; keyLabel: string; help: string; fields: ('base_url' | 'gcp_project' | 'gcp_location')[]; models: string[]; docs?: string; base?: string };
export const aiCatalog: Record<AiProviderId, ProviderInfo> = {
  vertex: { name: 'Google Agent Platform · conta de serviço', keyLabel: 'Credencial da conta de serviço (arquivo JSON)', fields: ['gcp_project', 'gcp_location'], models: [], docs: 'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start',
    help: 'Gemini Enterprise Agent Platform é a evolução do Vertex AI. Esta conexão usa OAuth da conta de serviço e roles/aiplatform.user. Projeto, região, acesso ao modelo e faturamento precisam estar liberados. ADC é recomendado pelo Google; o login local do computador não autentica a Vercel.' },
  google_cloud: { name: 'Google Agent Platform · chave de API', keyLabel: 'Chave da Agent Platform / modo Express', fields: ['gcp_project','gcp_location'], models: [], docs: 'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start',
    help: 'Chave do Google Cloud: informe projeto e região para a API padrão. Modo Express: deixe o projeto vazio para usar seu endpoint próprio. Não confunda com AI Studio. Informe um modelo autorizado no Model Garden. Texto, imagens de entrada e áudio gravado; Live do Google Cloud ainda não integrado.' },
  gemini: { name: 'Google Gemini (AI Studio)', keyLabel: 'Chave de API do Google AI Studio', fields: [], models: [],
    help: 'aistudio.google.com › Get API key. Tem cota gratuita; no plano gratuito o Google pode usar o conteúdo para melhorar os produtos dele.' },
  openai: { name: 'OpenAI (modelos do ChatGPT)', keyLabel: 'Chave de API da OpenAI', fields: [], models: [],
    help: 'platform.openai.com › API keys. Cobrada por uso, separada da assinatura do ChatGPT.' },
  anthropic: { name: 'Anthropic (Claude)', keyLabel: 'Chave de API da Anthropic', fields: [], models: [],
    help: 'console.anthropic.com › API Keys. Cobrada por uso, separada da assinatura do Claude.' },
  deepseek: { name: 'DeepSeek', keyLabel: 'Chave de API DeepSeek', fields: [], models: [], base: 'https://api.deepseek.com', docs: 'https://api-docs.deepseek.com/', help: 'API oficial DeepSeek. A lista de modelos vem da sua chave, sem depender de nomes antigos. Modelos de texto; imagens e voz exigem outra conexão.' },
  xai: { name: 'xAI · Grok', keyLabel: 'Chave de API xAI', fields: [], models: [], base: 'https://api.x.ai/v1', docs: 'https://docs.x.ai/developers/rest-api-reference/inference/responses', help: 'API oficial xAI com Responses. A assinatura do app Grok não ativa esta API. Consulte os modelos da sua conta e teste antes de usar.' },
  mistral: { name: 'Mistral AI', keyLabel: 'Chave de API Mistral', fields: [], models: [], base: 'https://api.mistral.ai/v1', docs: 'https://docs.mistral.ai/api/endpoint/models', help: 'Conversa e modelos multimodais da Mistral. OCR e geração de áudio são produtos com contratos próprios; esta conexão não os ativa automaticamente.' },
  groq: { name: 'Groq · inferência rápida', keyLabel: 'Chave de API Groq', fields: [], models: [], base: 'https://api.groq.com/openai/v1', docs: 'https://console.groq.com/docs/overview', help: 'Groq executa modelos de diferentes famílias. Consulte os modelos atuais da sua chave. Transcrição é uma API separada; não equivale a uma chamada ao vivo.' },
  openrouter: { name: 'OpenRouter · múltiplos modelos', keyLabel: 'Chave de API OpenRouter', fields: [], models: [], base: 'https://openrouter.ai/api/v1', docs: 'https://openrouter.ai/docs/quickstart', help: 'Acesso a modelos de várias empresas por um gateway. As solicitações passam pelo OpenRouter e pelo provedor escolhido; avalie privacidade e tarifa antes de autorizar.' },
  compatible: { name: 'Outro serviço · compatível com OpenAI', keyLabel: 'Chave de API do serviço', fields: ['base_url'], models: [],
    help: 'Para serviços que seguem o formato da OpenAI. Informe o endereço base, por exemplo https://api.groq.com/openai/v1 ou https://openrouter.ai/api/v1.' },
};
export const aiTaskLabels: Record<AiTaskId, { name: string; help: string }> = {
  voz: { name: 'Chamada ao vivo', help: 'A voz usa sua própria configuração. O raciocínio e as ações continuam na tarefa Conversa do assistente.' },
  assistente: { name: 'Conversa do assistente', help: 'Responde na bolinha e na aba Assistente.' },
  organizar: { name: 'Organizar registros', help: 'Vai sugerir área, matéria, data e tipo para o que cair em Para organizar.' },
};

export type AiAdminState = {
  connectors?: { id: string; label: string; url: string; protocol: '2026-07-28' | '2025-11-25'; enabled: boolean; has_key: boolean; key_hint: string; updated_at: string }[];
  connections?: { id: string; provider: AiProviderId; label: string; enabled: boolean; position: number; key_hint: string; updated_at: string; base_url?: string; gcp_project?: string; gcp_location?: string }[];
  providers: { id: AiProviderId; enabled: boolean; label: string; base_url: string; gcp_project: string; gcp_location: string; has_key: boolean; key_hint: string; updated_at: string }[];
  tasks: { id: AiTaskId; provider: AiProviderId | null; model: string; enabled: boolean; updated_at: string; connection_id?: string | null; routing_mode?: 'legacy' | 'fixed' | 'fallback'; fallbacks?: { connection_id: string; model: string }[] }[];
  secretReady: boolean;
};

const text = (max: number) => z.string().trim().max(max);
const endpoint = text(300).refine(value => { if (!value) return true; try { const url = new URL(value); return url.protocol === 'https:' && (!url.port || url.port === '443') && !url.username && !url.password && !url.search && !url.hash && !/\s/.test(value); } catch { return false; } }, 'Use uma URL HTTPS na porta 443, sem senha, parâmetros ou fragmento.');
const region = text(40).refine(value => !value || /^(?:global|[a-z]+(?:-[a-z]+)+[0-9])$/.test(value), 'Informe uma região válida ou global.');
export const aiAdminAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save_connector'), id: z.uuid().nullable(), label: text(60).min(1), url: endpoint.refine(value => !!value), protocol: z.enum(['2026-07-28','2025-11-25']), enabled: z.boolean(), key: z.string().trim().max(12_000).nullable() }),
  z.object({ action: z.literal('remove_connector'), id: z.uuid() }),
  z.object({ action: z.literal('test_connector'), id: z.uuid() }),
  z.object({ action: z.literal('save_connection'), id: z.uuid().nullable(), provider: z.enum(aiProviderIds), label: text(60).min(1), enabled: z.boolean(), position: z.number().int().min(1).max(5), key: z.string().max(12_000).nullable(), base_url: endpoint.optional(), gcp_project: text(100).optional(), gcp_location: region.optional() }),
  z.object({ action: z.literal('save_route'), task: z.enum(aiTaskIds), provider: z.enum(aiProviderIds), connection_id: z.uuid().nullable(), model: text(120).min(1), enabled: z.boolean(), routing_mode: z.enum(['fixed', 'fallback']), fallbacks: z.array(z.object({ connection_id: z.uuid(), model: text(120).min(1) })).max(2) }),
  z.object({ action: z.literal('remove_connection'), id: z.uuid() }),
  z.object({ action: z.literal('test_live') }),
  z.object({ action: z.literal('test_task'), task: z.enum(['assistente','organizar']) }),
  z.object({ action: z.literal('save_provider'), provider: z.enum(aiProviderIds), enabled: z.boolean(), label: text(60), base_url: endpoint,
    gcp_project: text(100), gcp_location: region, key: z.string().max(12_000).nullable() }),
  z.object({ action: z.literal('save_task'), task: z.enum(aiTaskIds), provider: z.union([z.literal(''), z.enum(aiProviderIds)]), model: text(120), enabled: z.boolean() }),
  z.object({ action: z.literal('test'), provider: z.enum(aiProviderIds), model: text(120).min(1, 'Informe o modelo para testar.'), connection_id: z.uuid().optional() }),
  z.object({ action: z.literal('models'), provider: z.enum(aiProviderIds), connection_id: z.uuid().optional() }),
]);
export const assistantRequest = z.object({ message: z.string().trim().min(1).max(2000) });
