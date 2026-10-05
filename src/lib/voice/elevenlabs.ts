import 'server-only';
import { createHash } from 'node:crypto';
import { AiError, type AiConfig } from '../ai/providers';
import { runAiAttempts } from '../ai/attempts';
import { MAX_CALL_SECONDS } from './protocol';
import {
  ELEVENLABS_AGENT_NAME, ELEVENLABS_AGENT_TAG, ELEVENLABS_API, ELEVENLABS_PROTOCOL, elevenLabsAgentConfig, elevenLabsSocket, elevenLabsTools, elevenLabsVariables, pickElevenLabsLlm,
} from './elevenlabs-protocol';

type Stage = 'models' | 'agents' | 'tools' | 'agent' | 'signed_url';
const stages: Record<Stage, string> = { models: 'consultar os modelos do agente', agents: 'localizar o agente', tools: 'preparar as ferramentas', agent: 'criar ou atualizar o agente', signed_url: 'autorizar a conversa' };
const statusPattern = /^[a-z][a-z0-9_]{1,59}$/;
export type ElevenLabsDiagnostic = { upstreamStatus: number; detail?: string; fields?: string[] };

export class ElevenLabsError extends AiError {
  constructor(readonly stage: Stage, readonly diagnostic: ElevenLabsDiagnostic, message: string, status: number) { super(message, status); }
  get doNotRetry() { return ['quota_exceeded', 'payment_required', 'detected_unusual_activity'].includes(this.diagnostic.detail ?? ''); }
}

// ElevenLabs errors may echo request content. Keep only a status token and validation field paths.
export async function elevenLabsFailure(response: Response, stage: Stage) {
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  const detail = (body as { detail?: unknown } | null)?.detail;
  const status = typeof (detail as { status?: unknown })?.status === 'string' && statusPattern.test((detail as { status: string }).status) ? (detail as { status: string }).status : undefined;
  const fields = Array.isArray(detail) ? [...new Set(detail.slice(0, 10).map(item => Array.isArray(item?.loc) ? item.loc.filter((part: unknown) => typeof part === 'string' && /^[a-z_]{1,60}$/.test(part)).join('.') : '').filter(Boolean))] : [];
  const where = stages[stage];
  let message: string;
  if (status === 'quota_exceeded' || response.status === 402) message = 'O ElevenLabs informou que os créditos do plano acabaram ou não bastam para a chamada. Confira o consumo em elevenlabs.io.';
  else if (status === 'detected_unusual_activity') message = 'O ElevenLabs bloqueou o uso gratuito desta conta por atividade incomum. Confira o aviso no painel do ElevenLabs; pode ser preciso um plano pago.';
  else if (response.status === 401) message = 'O ElevenLabs recusou a chave. Confira se ela está ativa em elevenlabs.io › Developers › API Keys e salve a chave novamente.';
  else if (response.status === 403) message = `A chave do ElevenLabs não tem permissão para ${where}. Ative o acesso a Agents (ElevenAgents) na chave.`;
  else if (response.status === 429) message = 'O ElevenLabs está limitando as solicitações agora. Aguarde alguns instantes e tente novamente.';
  else if (response.status === 404) message = 'O agente de voz não foi encontrado no ElevenLabs. Teste a conexão de voz em Administração para recriá-lo.';
  else if (response.status === 400 || response.status === 422) message = `O ElevenLabs recusou a configuração ao ${where}. A integração precisa ser ajustada.`;
  else message = 'O ElevenLabs não respondeu como esperado agora. Tente novamente em alguns instantes.';
  return new ElevenLabsError(stage, { upstreamStatus: response.status, detail: status, fields }, message, response.status);
}

async function request<T>(key: string, path: string, stage: Stage, signal: AbortSignal, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ELEVENLABS_API}${path}`, { method: init.method ?? 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
      headers: { 'xi-api-key': key, ...(init.body ? { 'Content-Type': 'application/json' } : {}) }, body: init.body ? JSON.stringify(init.body) : undefined });
  } catch { signal.throwIfAborted(); throw new ElevenLabsError(stage, { upstreamStatus: 0 }, 'O ElevenLabs não respondeu (rede ou tempo esgotado).', 0); }
  if (!response.ok) throw await elevenLabsFailure(response, stage);
  return await response.json().catch(() => ({})) as T;
}

type ToolRow = { id?: string; tool_config?: { name?: string; type?: string } };
type AgentRow = { agent_id?: string; tags?: string[]; voice_id?: string; created_at_unix_secs?: number; archived?: boolean };
const agents = new Map<string, { agentId: string; hash: string; llm: string; until: number }>();
const pending = new Map<string, Promise<{ agentId: string; llm: string }>>();
const keyId = (key: string) => createHash('sha256').update(key).digest('hex');
export function resetElevenLabsCache() { agents.clear(); pending.clear(); }

async function availableLlms(key: string, signal: AbortSignal) {
  const body = await request<{ llms?: { llm?: unknown; is_checkpoint?: boolean; deprecation_info?: { is_deprecated?: boolean } | null }[] }>(key, '/v1/convai/llm/list', 'models', signal);
  return (body.llms ?? []).filter(item => typeof item.llm === 'string' && item.llm !== 'custom-llm' && !item.is_checkpoint && item.deprecation_info?.is_deprecated !== true).map(item => item.llm as string);
}

/** Reuse tools by name, so a new deployment updates them instead of piling up copies. */
async function syncTools(key: string, signal: AbortSignal) {
  const existing: ToolRow[] = [];
  let cursor = '';
  for (let page = 0; page < 5; page++) {
    const body = await request<{ tools?: ToolRow[]; has_more?: boolean; next_cursor?: string }>(key, `/v1/convai/tools?types=client&page_size=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 'tools', signal);
    existing.push(...(body.tools ?? []));
    if (!body.has_more || !body.next_cursor) break;
    cursor = body.next_cursor;
  }
  const ids: string[] = [];
  for (const tool of elevenLabsTools()) {
    const found = existing.find(row => row.tool_config?.name === tool.name && row.tool_config?.type === 'client' && typeof row.id === 'string');
    if (found) { await request(key, `/v1/convai/tools/${encodeURIComponent(found.id!)}`, 'tools', signal, { method: 'PATCH', body: { tool_config: tool } }); ids.push(found.id!); }
    else {
      const created = await request<{ id?: string }>(key, '/v1/convai/tools', 'tools', signal, { method: 'POST', body: { tool_config: tool } });
      if (typeof created.id !== 'string') throw new ElevenLabsError('tools', { upstreamStatus: 200 }, 'O ElevenLabs não devolveu a ferramenta criada.', 502);
      ids.push(created.id);
    }
  }
  return ids;
}

/** Finds the Jornada agent by tag; creates or updates it only when this code's configuration changed. */
export async function ensureElevenLabsAgent(key: string, model: string, signal: AbortSignal): Promise<{ agentId: string; llm: string }> {
  const id = keyId(key);
  const cached = agents.get(id);
  if (cached && cached.until > Date.now() && (model === 'auto:rapido' || cached.llm === model)) return cached;
  const running = pending.get(id);
  if (running) return running;
  const work = (async () => {
    let llms: string[] = [];
    try { llms = await availableLlms(key, signal); }
    catch (cause) { if (!(cause instanceof ElevenLabsError) || cause.diagnostic.upstreamStatus === 401) throw cause; }
    const llm = pickElevenLabsLlm(llms, model);
    if (!llm) throw new ElevenLabsError('models', { upstreamStatus: 200 }, `O modelo ${model} não está disponível para agentes nesta conta ElevenLabs. Atualize a lista e escolha outro.`, 404);
    const hash = createHash('sha256').update(JSON.stringify({ tools: elevenLabsTools(), config: elevenLabsAgentConfig(llm, []) })).digest('hex').slice(0, 12);
    const version = `jp-${hash}`;
    const list = await request<{ agents?: AgentRow[] }>(key, `/v1/convai/agents?tags=${ELEVENLABS_AGENT_TAG}&page_size=30`, 'agents', signal);
    // The oldest tagged agent wins, so instances that raced to create one converge on the same agent.
    const current = (list.agents ?? []).filter(row => typeof row.agent_id === 'string' && row.tags?.includes(ELEVENLABS_AGENT_TAG) && !row.archived)
      .toSorted((a, b) => (a.created_at_unix_secs ?? 0) - (b.created_at_unix_secs ?? 0))[0];
    let agentId = current?.agent_id ?? '';
    if (!current || !current.tags?.includes(version)) {
      const toolIds = await syncTools(key, signal);
      const body = { name: ELEVENLABS_AGENT_NAME, tags: [ELEVENLABS_AGENT_TAG, version], ...elevenLabsAgentConfig(llm, toolIds, current?.voice_id || process.env.ELEVENLABS_VOICE_ID || undefined) };
      if (current) await request(key, `/v1/convai/agents/${encodeURIComponent(agentId)}`, 'agent', signal, { method: 'PATCH', body });
      else {
        const created = await request<{ agent_id?: string }>(key, '/v1/convai/agents/create', 'agent', signal, { method: 'POST', body });
        if (typeof created.agent_id !== 'string') throw new ElevenLabsError('agent', { upstreamStatus: 200 }, 'O ElevenLabs não devolveu o agente criado.', 502);
        agentId = created.agent_id;
      }
    }
    if (agents.size >= 20) agents.delete(agents.keys().next().value!);
    agents.set(id, { agentId, hash, llm, until: Date.now() + 10 * 60_000 });
    return { agentId, llm };
  })().finally(() => pending.delete(id));
  pending.set(id, work);
  return work;
}

async function signedUrl(key: string, agentId: string, signal: AbortSignal) {
  const body = await request<{ signed_url?: unknown }>(key, `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`, 'signed_url', signal);
  const url = elevenLabsSocket(body.signed_url);
  if (!url) throw new ElevenLabsError('signed_url', { upstreamStatus: 200 }, 'O ElevenLabs devolveu um endereço de conversa inesperado.', 502);
  return url;
}

/** The browser receives a single-use signed URL and prompt variables, never the API key. */
export async function prepareElevenLabsSession(config: AiConfig, context: string, history: { role: string; text: string }[], options: { signal: AbortSignal; beforeRetry?: () => Promise<void> }) {
  const candidates = [config, ...(config.alternatives ?? []).filter(row => row.provider === 'elevenlabs').slice(0, 2)];
  return runAiAttempts(candidates, async connection => {
    let agent = await ensureElevenLabsAgent(connection.key, connection.model, options.signal);
    let token: string;
    try { token = await signedUrl(connection.key, agent.agentId, options.signal); }
    catch (cause) {
      // Deleted in the ElevenLabs dashboard: forget it and prepare a new agent once.
      if (!(cause instanceof ElevenLabsError) || cause.status !== 404) throw cause;
      agents.delete(keyId(connection.key));
      agent = await ensureElevenLabsAgent(connection.key, connection.model, options.signal);
      token = await signedUrl(connection.key, agent.agentId, options.signal);
    }
    const now = Date.now();
    return { token, model: agent.llm, expiresAt: new Date(now + (MAX_CALL_SECONDS + 120) * 1000).toISOString(), maxSeconds: MAX_CALL_SECONDS, variables: elevenLabsVariables(context, history) };
  }, options);
}

export type ElevenLabsCheck = { connected: boolean; stage: 'setup' | 'transport' | 'timeout'; code?: number; inputFormat?: string; outputFormat?: string };
/** Admin diagnostic: open the conversation, wait for its metadata and close before any speech is needed. */
export async function checkElevenLabsSession(credentials: { token: string; variables: Record<string, string> }, signal?: AbortSignal): Promise<ElevenLabsCheck> {
  signal?.throwIfAborted();
  return new Promise(resolve => {
    const socket = new WebSocket(credentials.token, [ELEVENLABS_PROTOCOL]);
    let settled = false;
    const finish = (result: ElevenLabsCheck) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted);
      socket.onopen = null; socket.onmessage = null; socket.onclose = null;
      try { socket.close(1000); } catch {}
      resolve(result);
    };
    const aborted = () => finish({ connected: false, stage: 'timeout' });
    const timer = setTimeout(aborted, 15_000);
    signal?.addEventListener('abort', aborted, { once: true });
    socket.onopen = () => socket.send(JSON.stringify({ type: 'conversation_initiation_client_data', dynamic_variables: credentials.variables }));
    socket.onmessage = async event => {
      try {
        const value = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(await (event.data as Blob).arrayBuffer()).toString());
        const metadata = value?.type === 'conversation_initiation_metadata' ? value.conversation_initiation_metadata_event : null;
        if (metadata) finish({ connected: true, stage: 'setup', inputFormat: String(metadata.user_input_audio_format ?? ''), outputFormat: String(metadata.agent_output_audio_format ?? '') });
      } catch { finish({ connected: false, stage: 'transport' }); }
    };
    socket.onerror = () => finish({ connected: false, stage: 'transport' });
    socket.onclose = event => finish({ connected: false, stage: 'setup', code: event.code });
  });
}
