import { aiCatalog, aiTaskLabels, personalProviderIds, type AiProviderId, type AiTaskId } from './catalog';

// What each adapter in providers.ts and src/lib/voice actually implements. These are code facts,
// not proof that a given key, plan or model has access or credits.
export const capabilityLabels = {
  text: 'Escrever e planejar', image: 'Ler imagens', audio: 'Ouvir áudio gravado',
  transcription: 'Transcrever áudio', live_voice: 'Voz ao vivo', models: 'Listar modelos',
} satisfies Record<string, string>;
export type CapabilityId = keyof typeof capabilityLabels;
export const providerCapabilities: Record<AiProviderId, readonly CapabilityId[]> = {
  gemini: ['text', 'image', 'audio', 'live_voice', 'models'],
  vertex: ['text', 'image', 'audio'],
  google_cloud: ['text', 'image', 'audio'],
  openai: ['text', 'image', 'transcription', 'live_voice', 'models'],
  anthropic: ['text', 'image', 'models'],
  deepseek: ['text', 'models'],
  xai: ['text', 'image', 'live_voice', 'models'],
  mistral: ['text', 'models'],
  groq: ['text', 'transcription', 'models'],
  openrouter: ['text', 'models'],
  compatible: ['text', 'models'],
  elevenlabs: ['live_voice', 'models'],
};
/** The adapter forwards images, but only some of the account's models read them. */
export const modelDependentCapabilities: Partial<Record<AiProviderId, readonly CapabilityId[]>> = {
  mistral: ['image'], groq: ['image'], openrouter: ['image'], compatible: ['image'],
};
/** Providers whose keys can carry a privacy declaration and, optionally, serve members. */
export const declarableProviders: readonly AiProviderId[] = personalProviderIds;

export type SourceState = 'active' | 'blocked' | 'unusable' | 'available' | 'incapable';
export type SourceReason = 'declaration_missing' | 'declaration_stale' | 'disabled' | 'no_key' | 'missing' | 'no_model'
  | 'task_disabled' | 'not_selected' | 'capability' | 'auto_unsupported' | 'owner_voice_uses_admin' | 'not_configured';
export type AiResource = {
  source_id: string; kind: 'api' | 'connection' | 'personal'; provider: AiProviderId; connection_id: string | null; label: string;
  configured: boolean; enabled: boolean; key_hint: string; updated_at: string; position?: number; personal_data_ok: boolean;
  declaration: { privacy_basis: 'paid' | 'no_training' | null; audience: 'owner' | 'members' | null; current: boolean };
};
export type ChainItem = { source_id: string; provider: AiProviderId; model: string; source: 'owner' | 'personal' | 'base' };
export type RouteSource = { source_id: string; state: SourceState; position?: number; role?: 'primary' | 'fallback' | 'reserve' | 'auto' | 'personal'; reason?: SourceReason };
export type AiRouteMap = {
  task: AiTaskId; enabled: boolean; mode: 'legacy' | 'fixed' | 'fallback' | 'auto'; provider: AiProviderId | null; model: string;
  routing_effective: string | null; chain: ChainItem[]; configured_chain: ChainItem[]; members_chain: string[];
  /** Organizar falls back to the assistant route when its own resolves to nothing. */
  served_by?: AiTaskId | null; members_served_by?: AiTaskId | null;
  members_note: 'base_off' | 'voice_not_shared' | null; sources: RouteSource[];
};
export type AiResourceMap = {
  version: 1; generated_at: string; base_enabled: boolean; resources: AiResource[]; routes: AiRouteMap[];
  channels: { channel: 'telegram' | 'whatsapp'; enabled: boolean; bot: string; owner_linked: boolean; member_links: number }[];
  whatsapp: { enabled: boolean; state: string;
    stt: { source_id: string | null; provider: AiProviderId | null; model: string; state: 'active' | 'blocked'; reason: SourceReason | null } } | null;
  mcp_inbound: { owner_tokens: number; owner_oauth: number; members_with_access: number };
  mcp_outbound: { id: string; label: string; host: string | null; enabled: boolean; has_key: boolean }[];
  members: { accounts: number; with_personal_keys: number };
};

export const stateLabels: Record<SourceState, string> = {
  active: 'Atuando', blocked: 'Configurada, mas fora', unusable: 'Indisponível', available: 'Disponível, sem uso nesta tarefa', incapable: 'Não faz esta tarefa',
};
export const reasonLabels: Record<SourceReason, string> = {
  declaration_missing: 'Falta declarar as condições de privacidade desta chave. Gemini só recebe dados pessoais com faturamento pago.',
  declaration_stale: 'A chave foi trocada depois da declaração. Confira as condições da chave nova e declare de novo.',
  disabled: 'A conexão está pausada.',
  no_key: 'Não há chave cadastrada.',
  missing: 'A conexão indicada não existe mais.',
  no_model: 'Nenhum modelo foi escolhido.',
  task_disabled: 'A tarefa está desligada.',
  not_selected: 'Ficou fora da sequência de tentativas desta tarefa.',
  capability: 'Este serviço não faz este tipo de tarefa.',
  auto_unsupported: 'O modo automático não escolhe este serviço. Use uma rota fixa ou uma reserva.',
  owner_voice_uses_admin: 'Sua voz ao vivo usa a configuração da Administração.',
  not_configured: 'Nenhuma fonte foi escolhida.',
};

export function resourceName(resource: Pick<AiResource, 'provider' | 'label' | 'kind'>) {
  const company = aiCatalog[resource.provider]?.name ?? resource.provider;
  if (resource.kind === 'personal') return `${company} · minha chave pessoal`;
  return resource.label && resource.kind === 'connection' ? `${resource.label} · ${company}` : company;
}
/** Names a source id from the map; an id with no resource behind it is a removed connection. */
export function sourceNamer(map: AiResourceMap) {
  const byId = new Map(map.resources.map(resource => [resource.source_id, resource]));
  return (id: string | null) => { const found = id ? byId.get(id) : undefined; return found ? resourceName(found) : 'Conexão removida'; };
}

export type Insight = { level: 'warning' | 'info'; task?: AiTaskId; text: string };
const afterColon = (text: string) => text.charAt(0).toLocaleLowerCase('pt-BR') + text.slice(1);
/** Plain-language findings derived only from the map; nothing here contacts a provider. */
export function resourceInsights(map: AiResourceMap): Insight[] {
  const name = sourceNamer(map);
  const insights: Insight[] = [];
  for (const route of map.routes) {
    const task = aiTaskLabels[route.task].name;
    if (!route.enabled) continue;
    if (!route.chain.length) insights.push({ level: 'warning', task: route.task, text: `${task}: nenhuma conexão está atuando agora.` });
    for (const source of route.sources.filter(item => item.state === 'blocked' && item.role && item.role !== 'auto'))
      insights.push({ level: 'warning', task: route.task, text: `${task}: ${name(source.source_id)} está configurada, mas fora. ${source.reason ? reasonLabels[source.reason] : ''}`.trim() });
    if (route.served_by) {
      insights.push({ level: 'info', task: route.task, text: `${task}: nenhuma conexão desta tarefa está atuando, e a Jornada usa a rota da ${aiTaskLabels[route.served_by].name}.` });
      continue;
    }
    const available = route.sources.filter(item => item.state === 'available').map(item => name(item.source_id));
    if (route.chain.length === 1 && route.task !== 'voz')
      insights.push({ level: 'info', task: route.task, text: `${task} depende de uma só conexão.${available.length ? ` Disponíveis como alternativa: ${available.join(', ')}.` : ''}` });
    if (route.routing_effective && route.routing_effective !== route.mode)
      insights.push({ level: 'info', task: route.task, text: `${task}: suas chaves pessoais entram primeiro e fazem a rota funcionar no modo automático, que tenta a próxima conexão em qualquer falha.` });
  }
  for (const resource of map.resources.filter(item => item.declaration.privacy_basis && !item.declaration.current))
    insights.push({ level: 'warning', text: `${resourceName(resource)}: ${afterColon(reasonLabels.declaration_stale)}` });
  if (map.whatsapp?.stt.state === 'blocked' && map.whatsapp.stt.reason)
    insights.push({ level: map.whatsapp.enabled ? 'warning' : 'info', text: `Transcrição do WhatsApp: ${afterColon(reasonLabels[map.whatsapp.stt.reason])}` });
  return insights;
}
