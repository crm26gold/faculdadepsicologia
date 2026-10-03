import { z } from 'zod';

// Everything the panel can switch without code: which provider, which model, for which task.
export const aiProviderIds = ['gemini', 'vertex', 'openai', 'anthropic', 'compatible'] as const;
export type AiProviderId = typeof aiProviderIds[number];
export const aiTaskIds = ['assistente', 'organizar', 'voz'] as const;
export type AiTaskId = typeof aiTaskIds[number];

type ProviderInfo = { name: string; keyLabel: string; help: string; fields: ('base_url' | 'gcp_project' | 'gcp_location')[]; models: string[] };
export const aiCatalog: Record<AiProviderId, ProviderInfo> = {
  vertex: { name: 'Google Vertex AI', keyLabel: 'Credencial da conta de serviço (arquivo JSON)', fields: ['gcp_project', 'gcp_location'], models: [],
    help: 'Usa os créditos do Google Cloud e os dados não treinam modelos. Google Cloud › IAM › Contas de serviço › Chaves › Adicionar chave (JSON), com o papel "Vertex AI User". Aceita modelos Gemini e, onde liberados, Claude.' },
  gemini: { name: 'Google Gemini (AI Studio)', keyLabel: 'Chave de API do Google AI Studio', fields: [], models: [],
    help: 'aistudio.google.com › Get API key. Tem cota gratuita; no plano gratuito o Google pode usar o conteúdo para melhorar os produtos dele.' },
  openai: { name: 'OpenAI (modelos do ChatGPT)', keyLabel: 'Chave de API da OpenAI', fields: [], models: [],
    help: 'platform.openai.com › API keys. Cobrada por uso, separada da assinatura do ChatGPT.' },
  anthropic: { name: 'Anthropic (Claude)', keyLabel: 'Chave de API da Anthropic', fields: [], models: ['claude-haiku-4-5-20251001', 'claude-sonnet-5-5', 'claude-opus-5-5'],
    help: 'console.anthropic.com › API Keys. Cobrada por uso, separada da assinatura do Claude.' },
  compatible: { name: 'Compatível com OpenAI (Groq, OpenRouter e outros)', keyLabel: 'Chave de API do serviço', fields: ['base_url'], models: [],
    help: 'Para serviços que seguem o formato da OpenAI. Informe o endereço base, por exemplo https://api.groq.com/openai/v1 ou https://openrouter.ai/api/v1.' },
};
export const aiTaskLabels: Record<AiTaskId, { name: string; help: string }> = {
  voz: { name: 'Chamada ao vivo', help: 'A voz usa sua própria configuração. O raciocínio e as ações continuam na tarefa Conversa do assistente.' },
  assistente: { name: 'Conversa do assistente', help: 'Responde na bolinha e na aba Assistente.' },
  organizar: { name: 'Organizar registros', help: 'Vai sugerir área, matéria, data e tipo para o que cair em Para organizar.' },
};

export type AiAdminState = {
  providers: { id: AiProviderId; enabled: boolean; label: string; base_url: string; gcp_project: string; gcp_location: string; has_key: boolean; key_hint: string; updated_at: string }[];
  tasks: { id: AiTaskId; provider: AiProviderId | null; model: string; enabled: boolean; updated_at: string }[];
  secretReady: boolean;
};

const text = (max: number) => z.string().trim().max(max);
export const aiAdminAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save_provider'), provider: z.enum(aiProviderIds), enabled: z.boolean(), label: text(60), base_url: text(300).refine(value => value === '' || /^https:\/\/\S+$/.test(value), 'Use um endereço https://'),
    gcp_project: text(100), gcp_location: text(40), key: z.string().max(12_000).nullable() }),
  z.object({ action: z.literal('save_task'), task: z.enum(aiTaskIds), provider: z.union([z.literal(''), z.enum(aiProviderIds)]), model: text(120), enabled: z.boolean() }),
  z.object({ action: z.literal('test'), provider: z.enum(aiProviderIds), model: text(120).min(1, 'Informe o modelo para testar.') }),
  z.object({ action: z.literal('models'), provider: z.enum(aiProviderIds) }),
]);
export const assistantRequest = z.object({ message: z.string().trim().min(1).max(2000) });
