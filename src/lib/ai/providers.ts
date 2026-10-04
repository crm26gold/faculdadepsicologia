import 'server-only';
import { createHash, createSign } from 'node:crypto';
import { aiCatalog, type AiProviderId } from './catalog';
import { autoCapable, isAuto, pickModel, pickModels } from './models';
import { conversationTurns, type Turn } from './turns';
import { chatImageContent, claudeImageContent, type AiImage } from './media';
import { runAiAttempts } from './attempts';

export type AiConfig = { provider: AiProviderId; model: string; base_url: string; gcp_project: string; gcp_location: string; key: string; alternatives?: AiConfig[] };
/** audio: a voice note sent along with the last message (Gemini and Vertex Gemini only). */
export type Prompt = { system: string; prompt: string; maxTokens?: number; json?: boolean; history?: Turn[]; audio?: { mimeType: string; base64: string }; image?: AiImage; signal?: AbortSignal; beforeRetry?: () => Promise<void> };
export class AiError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
  /** Busy, rate-limited or briefly broken: worth another try, maybe on another model. */
  get transient() { return this.status === 0 || this.status === 429 || this.status >= 500; }
}

const TIMEOUT = 30_000;
async function call(provider: AiProviderId, url: string, init: RequestInit) {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(TIMEOUT)]) : AbortSignal.timeout(TIMEOUT), cache: 'no-store' }); }
  catch { throw new AiError(`${aiCatalog[provider].name}: sem resposta (rede ou tempo esgotado).`, 0); }
  const raw = await response.text();
  let body: any = null;
  try { body = JSON.parse(raw); } catch {}
  if (!response.ok) {
    const reason = response.status === 401 || response.status === 403 ? 'Confira a chave e as permissões da API.'
      : response.status === 429 ? 'O provedor atingiu a cota ou está sem créditos. Aguarde ou confira o painel da API.'
      : response.status === 402 ? 'Confira os créditos e o faturamento da API.'
      : response.status === 400 || response.status === 404 ? 'Confira o modelo e a configuração desta tarefa.' : 'O serviço está indisponível agora.';
    throw new AiError(`${aiCatalog[provider].name} recusou (${response.status}). ${reason}`, response.status);
  }
  return body;
}

// Vertex AI: a service-account JSON becomes a short-lived OAuth token (signed JWT), cached per instance.
const tokens = new Map<string, { token: string; until: number }>();
type ServiceAccount = { client_email: string; private_key: string; project_id?: string };
function serviceAccount(key: string): ServiceAccount {
  try {
    const value = JSON.parse(key);
    if (typeof value.client_email === 'string' && typeof value.private_key === 'string') return value;
  } catch {}
  throw new AiError('A credencial do Vertex AI precisa ser o arquivo JSON da conta de serviço.');
}
async function vertexToken(account: ServiceAccount, signal?: AbortSignal) {
  const cached = tokens.get(account.client_email);
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  let signature: string;
  try { signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url'); }
  catch { throw new AiError('A chave privada da conta de serviço do Vertex AI é inválida.'); }
  const body = await call('vertex', 'https://oauth2.googleapis.com/token', { method: 'POST', signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) });
  tokens.set(account.client_email, { token: body.access_token, until: Date.now() + (Number(body.expires_in) || 3600) * 1000 });
  return body.access_token as string;
}
function vertexBase(config: AiConfig, account: ServiceAccount) {
  const project = config.gcp_project || account.project_id;
  if (!project) throw new AiError('Informe o projeto do Google Cloud.');
  const location = config.gcp_location || 'us-central1';
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}`;
}

const geminiBody = ({ system, prompt, maxTokens = 800, json, history, audio, image }: Prompt) => JSON.stringify({
  systemInstruction: { parts: [{ text: system }] }, contents: conversationTurns(history, prompt).map((turn, index, all) => ({ role: turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: turn.text }, ...([audio, image].flatMap(media => media && index === all.length - 1 ? [{ inlineData: { mimeType: media.mimeType, data: media.base64 } }] : []))] })), generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
});
const geminiText = (body: any) => (body?.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? '').join('').trim();
const claudeText = (body: any) => (body?.content ?? []).map((part: { text?: string }) => part.text ?? '').join('').trim();
const chatText = (body: any) => String(body?.choices?.[0]?.message?.content ?? '').trim();

/** One prompt in, plain text out — the same contract for every provider. */
export async function generate(config: AiConfig, input: Prompt): Promise<string> {
  input.signal?.throwIfAborted();
  const { system, prompt, maxTokens = 800 } = input;
  const json = { 'Content-Type': 'application/json' };
  if (input.audio && !(config.provider === 'gemini' || (config.provider === 'vertex' && !config.model.startsWith('claude')))) throw new AiError('Mensagens de voz funcionam com o Google Gemini. Escolha o Gemini na tarefa do assistente ou mande por texto.', 400);
  const turns = conversationTurns(input.history, prompt).map((turn, index, all) => ({ role: turn.role, content: chatImageContent(turn.text, index === all.length - 1 ? input.image : undefined) }));
  const claudeTurns = conversationTurns(input.history, prompt).map((turn, index, all) => ({ role: turn.role, content: claudeImageContent(turn.text, index === all.length - 1 ? input.image : undefined) }));
  let text = '';
  switch (config.provider) {
    case 'gemini':
      text = geminiText(await call('gemini', `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, { method: 'POST', signal: input.signal, headers: { ...json, 'x-goog-api-key': config.key }, body: geminiBody(input) }));
      break;
    case 'vertex': {
      const account = serviceAccount(config.key);
      const headers = { ...json, Authorization: `Bearer ${await vertexToken(account, input.signal)}` };
      const base = vertexBase(config, account);
      text = config.model.startsWith('claude')
        ? claudeText(await call('vertex', `${base}/publishers/anthropic/models/${encodeURIComponent(config.model)}:rawPredict`, { method: 'POST', signal: input.signal, headers,
            body: JSON.stringify({ anthropic_version: 'vertex-2023-10-16', system, max_tokens: maxTokens, messages: claudeTurns }) }))
        : geminiText(await call('vertex', `${base}/publishers/google/models/${encodeURIComponent(config.model)}:generateContent`, { method: 'POST', signal: input.signal, headers, body: geminiBody(input) }));
      break;
    }
    case 'openai':
      text = chatText(await call('openai', 'https://api.openai.com/v1/chat/completions', { method: 'POST', signal: input.signal, headers: { ...json, Authorization: `Bearer ${config.key}` },
        body: JSON.stringify({ model: config.model, max_completion_tokens: maxTokens, ...(input.json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: system }, ...turns] }) }));
      break;
    case 'compatible':
      if (!config.base_url) throw new AiError('Informe o endereço base da API compatível.');
      text = chatText(await call('compatible', `${config.base_url.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', signal: input.signal, headers: { ...json, Authorization: `Bearer ${config.key}` },
        body: JSON.stringify({ model: config.model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...turns] }) }));
      break;
    case 'anthropic':
      text = claudeText(await call('anthropic', 'https://api.anthropic.com/v1/messages', { method: 'POST', signal: input.signal, headers: { ...json, 'x-api-key': config.key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: config.model, max_tokens: maxTokens, system, messages: claudeTurns }) }));
      break;
  }
  if (!text) throw new AiError(`${aiCatalog[config.provider].name} respondeu sem texto. Confira o nome do modelo.`);
  return text;
}

/** Models the account can use, straight from the provider (Vertex has no simple listing: type the name). */
export async function listModelInventory(config: AiConfig, signal?: AbortSignal): Promise<{ ids: string[]; liveIds: string[] }> {
  let ids: string[] = [];
  let liveIds: string[] = [];
  switch (config.provider) {
    case 'gemini': {
      const body = await call('gemini', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { signal, headers: { 'x-goog-api-key': config.key } });
      liveIds = (body?.models ?? []).filter((model: { supportedGenerationMethods?: string[] }) => model.supportedGenerationMethods?.some(method => /bidiGenerateContent/i.test(method)))
        .map((model: { name: string }) => model.name.replace(/^models\//, ''));
      ids = (body?.models ?? []).filter((model: { supportedGenerationMethods?: string[] }) => model.supportedGenerationMethods?.includes('generateContent'))
        .map((model: { name: string }) => model.name.replace(/^models\//, ''));
      break;
    }
    case 'openai': ids = ((await call('openai', 'https://api.openai.com/v1/models', { signal, headers: { Authorization: `Bearer ${config.key}` } }))?.data ?? []).map((model: { id: string }) => model.id); break;
    case 'anthropic': ids = ((await call('anthropic', 'https://api.anthropic.com/v1/models?limit=100', { signal, headers: { 'x-api-key': config.key, 'anthropic-version': '2023-06-01' } }))?.data ?? []).map((model: { id: string }) => model.id); break;
    case 'compatible':
      if (!config.base_url) throw new AiError('Informe o endereço base da API compatível.');
      ids = ((await call('compatible', `${config.base_url.replace(/\/+$/, '')}/models`, { signal, headers: { Authorization: `Bearer ${config.key}` } }))?.data ?? []).map((model: { id: string }) => model.id);
      break;
    case 'vertex': ids = []; break;
  }
  const clean = (items: string[]) => [...new Set(items.filter(id => typeof id === 'string'))].sort().slice(0, 200);
  return { ids: clean(ids), liveIds: clean(liveIds) };
}

export async function listModels(config: AiConfig, signal?: AbortSignal) { return (await listModelInventory(config, signal)).ids; }

// "auto:*" models resolve against the account's live list, cached per key for an hour.
const listed = new Map<string, { ids: string[]; until: number }>();
const modelCacheKey = (config: AiConfig) => `${config.provider}:${createHash('sha256').update(`${config.key}:${config.base_url}:${config.gcp_project}:${config.gcp_location}`).digest('hex')}`;
export async function refreshModels(config: AiConfig, signal?: AbortSignal) {
  const inventory = await listModelInventory(config, signal);
  if (listed.size >= 100) listed.delete(listed.keys().next().value!);
  listed.set(modelCacheKey(config), { ids: inventory.ids, until: Date.now() + 3_600_000 });
  return inventory;
}
async function cachedModels(config: AiConfig, signal?: AbortSignal) {
  const cacheKey = modelCacheKey(config);
  const hit = listed.get(cacheKey);
  if (hit && hit.until > Date.now()) return hit.ids;
  return (await refreshModels(config, signal)).ids;
}
export async function resolveModel(config: AiConfig): Promise<AiConfig> {
  if (!isAuto(config.model)) return config;
  if (!autoCapable.includes(config.provider)) throw new AiError(`${aiCatalog[config.provider].name} não lista modelos: escolha um modelo pelo nome.`);
  const model = pickModel(config.provider, await cachedModels(config), config.model);
  if (!model) throw new AiError(`Nenhum modelo de texto encontrado em ${aiCatalog[config.provider].name} para o modo automático.`);
  return { ...config, model };
}

// Reserves belong to the selected provider; switching company is a separate owner choice.
// A single four-attempt bound applies across all keys and models, with a budget reservation per retry.
export async function generateResilient(config: AiConfig, input: Prompt): Promise<{ text: string; model: string }> {
  const seen = new Set<string>();
  const connections = [config, ...(config.alternatives ?? []).slice(0, 2)].filter(candidate => {
    const id = createHash('sha256').update(`${candidate.provider}:${candidate.key}:${candidate.base_url}`).digest('hex');
    if (candidate.provider !== config.provider || seen.has(id)) return false;
    seen.add(id); return true;
  });
  const attempts = new Map<AiConfig, number>();
  return runAiAttempts(connections.length ? [...connections, connections[0]] : [], async candidate => {
    const attempt = attempts.get(candidate) ?? 0;
    attempts.set(candidate, attempt + 1);
    let model = candidate.model;
    if (isAuto(model)) {
      if (!autoCapable.includes(candidate.provider)) throw new AiError('Escolha um modelo pelo nome para este provedor.', 400);
      const ids = await cachedModels(candidate, input.signal);
      const choices = pickModels(candidate.provider, ids, model, 2);
      model = choices[Math.min(attempt, choices.length - 1)] ?? '';
      if (!model) throw new AiError('Nenhum modelo compatível encontrado para esta conexão.', 404);
    }
    return { text: await generate({ ...candidate, model }, input), model };
  }, input);
}
