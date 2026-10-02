import 'server-only';
import { createHash, createSign } from 'node:crypto';
import { aiCatalog, type AiProviderId } from './catalog';
import { autoCapable, isAuto, pickModel, pickModels } from './models';
import { conversationTurns, type Turn } from './turns';

export type AiConfig = { provider: AiProviderId; model: string; base_url: string; gcp_project: string; gcp_location: string; key: string };
type Prompt = { system: string; prompt: string; maxTokens?: number; json?: boolean; history?: Turn[] };
export class AiError extends Error {
  constructor(message: string, readonly status = 0) { super(message); }
  /** Busy, rate-limited or briefly broken: worth another try, maybe on another model. */
  get transient() { return this.status === 0 || this.status === 429 || this.status >= 500; }
}

const TIMEOUT = 30_000;
async function call(provider: AiProviderId, url: string, init: RequestInit) {
  let response: Response;
  try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' }); }
  catch { throw new AiError(`${aiCatalog[provider].name}: sem resposta (rede ou tempo esgotado).`, 0); }
  const raw = await response.text();
  let body: any = null;
  try { body = JSON.parse(raw); } catch {}
  if (!response.ok) {
    const detail = String(body?.error?.message ?? body?.message ?? raw).replace(/\s+/g, ' ').slice(0, 220);
    throw new AiError(`${aiCatalog[provider].name} recusou (${response.status}): ${detail}`, response.status);
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
async function vertexToken(account: ServiceAccount) {
  const cached = tokens.get(account.client_email);
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  let signature: string;
  try { signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url'); }
  catch { throw new AiError('A chave privada da conta de serviço do Vertex AI é inválida.'); }
  const body = await call('vertex', 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

const geminiBody = ({ system, prompt, maxTokens = 800, json, history }: Prompt) => JSON.stringify({
  systemInstruction: { parts: [{ text: system }] }, contents: conversationTurns(history, prompt).map(turn => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.text }] })), generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
});
const geminiText = (body: any) => (body?.candidates?.[0]?.content?.parts ?? []).map((part: { text?: string }) => part.text ?? '').join('').trim();
const claudeText = (body: any) => (body?.content ?? []).map((part: { text?: string }) => part.text ?? '').join('').trim();
const chatText = (body: any) => String(body?.choices?.[0]?.message?.content ?? '').trim();

/** One prompt in, plain text out — the same contract for every provider. */
export async function generate(config: AiConfig, input: Prompt): Promise<string> {
  const { system, prompt, maxTokens = 800 } = input;
  const json = { 'Content-Type': 'application/json' };
  const turns = conversationTurns(input.history, prompt).map(turn => ({ role: turn.role, content: turn.text }));
  let text = '';
  switch (config.provider) {
    case 'gemini':
      text = geminiText(await call('gemini', `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, { method: 'POST', headers: { ...json, 'x-goog-api-key': config.key }, body: geminiBody(input) }));
      break;
    case 'vertex': {
      const account = serviceAccount(config.key);
      const headers = { ...json, Authorization: `Bearer ${await vertexToken(account)}` };
      const base = vertexBase(config, account);
      text = config.model.startsWith('claude')
        ? claudeText(await call('vertex', `${base}/publishers/anthropic/models/${encodeURIComponent(config.model)}:rawPredict`, { method: 'POST', headers,
            body: JSON.stringify({ anthropic_version: 'vertex-2023-10-16', system, max_tokens: maxTokens, messages: turns }) }))
        : geminiText(await call('vertex', `${base}/publishers/google/models/${encodeURIComponent(config.model)}:generateContent`, { method: 'POST', headers, body: geminiBody(input) }));
      break;
    }
    case 'openai':
      text = chatText(await call('openai', 'https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { ...json, Authorization: `Bearer ${config.key}` },
        body: JSON.stringify({ model: config.model, max_completion_tokens: maxTokens, ...(input.json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: system }, ...turns] }) }));
      break;
    case 'compatible':
      if (!config.base_url) throw new AiError('Informe o endereço base da API compatível.');
      text = chatText(await call('compatible', `${config.base_url.replace(/\/+$/, '')}/chat/completions`, { method: 'POST', headers: { ...json, Authorization: `Bearer ${config.key}` },
        body: JSON.stringify({ model: config.model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...turns] }) }));
      break;
    case 'anthropic':
      text = claudeText(await call('anthropic', 'https://api.anthropic.com/v1/messages', { method: 'POST', headers: { ...json, 'x-api-key': config.key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: config.model, max_tokens: maxTokens, system, messages: turns }) }));
      break;
  }
  if (!text) throw new AiError(`${aiCatalog[config.provider].name} respondeu sem texto. Confira o nome do modelo.`);
  return text;
}

/** Models the account can use, straight from the provider (Vertex has no simple listing: type the name). */
export async function listModels(config: AiConfig): Promise<string[]> {
  let ids: string[] = [];
  switch (config.provider) {
    case 'gemini': {
      const body = await call('gemini', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': config.key } });
      ids = (body?.models ?? []).filter((model: { supportedGenerationMethods?: string[] }) => model.supportedGenerationMethods?.includes('generateContent'))
        .map((model: { name: string }) => model.name.replace(/^models\//, ''));
      break;
    }
    case 'openai': ids = ((await call('openai', 'https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${config.key}` } }))?.data ?? []).map((model: { id: string }) => model.id); break;
    case 'anthropic': ids = ((await call('anthropic', 'https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': config.key, 'anthropic-version': '2023-06-01' } }))?.data ?? []).map((model: { id: string }) => model.id); break;
    case 'compatible':
      if (!config.base_url) throw new AiError('Informe o endereço base da API compatível.');
      ids = ((await call('compatible', `${config.base_url.replace(/\/+$/, '')}/models`, { headers: { Authorization: `Bearer ${config.key}` } }))?.data ?? []).map((model: { id: string }) => model.id);
      break;
    case 'vertex': ids = []; break;
  }
  return [...new Set(ids.filter(id => typeof id === 'string'))].sort().slice(0, 200);
}

// "auto:*" models resolve against the account's live list, cached per key for an hour.
const listed = new Map<string, { ids: string[]; until: number }>();
async function cachedModels(config: AiConfig) {
  const cacheKey = `${config.provider}:${createHash('sha256').update(config.key).digest('hex').slice(0, 16)}`;
  const hit = listed.get(cacheKey);
  if (hit && hit.until > Date.now()) return hit.ids;
  const ids = await listModels(config);
  listed.set(cacheKey, { ids, until: Date.now() + 3_600_000 });
  return ids;
}
export async function resolveModel(config: AiConfig): Promise<AiConfig> {
  if (!isAuto(config.model)) return config;
  if (!autoCapable.includes(config.provider)) throw new AiError(`${aiCatalog[config.provider].name} não lista modelos: escolha um modelo pelo nome.`);
  const model = pickModel(config.provider, await cachedModels(config), config.model);
  if (!model) throw new AiError(`Nenhum modelo de texto encontrado em ${aiCatalog[config.provider].name} para o modo automático.`);
  return { ...config, model };
}

// When a model is overloaded (503) or rate-limited (429), wait a moment and retry, then fall back to the next
// candidate of the same kind (e.g. the previous Flash, then Flash-Lite) instead of failing the person.
export async function generateResilient(config: AiConfig, input: Prompt): Promise<{ text: string; model: string }> {
  let candidates: string[] = [config.model];
  if (autoCapable.includes(config.provider)) {
    try {
      const ids = await cachedModels(config);
      const mode = isAuto(config.model) ? config.model : 'auto:rapido';
      candidates = isAuto(config.model) ? pickModels(config.provider, ids, mode, 3) : [config.model, ...pickModels(config.provider, ids, 'auto:rapido', 2)];
      if (isAuto(config.model) && !candidates.length) throw new AiError(`Nenhum modelo de texto encontrado em ${aiCatalog[config.provider].name} para o modo automático.`, 404);
    } catch (error) { if (isAuto(config.model)) throw error; }
  } else if (isAuto(config.model)) throw new AiError(`${aiCatalog[config.provider].name} não lista modelos: escolha um modelo pelo nome.`, 400);
  let last: unknown = null;
  for (const model of [...new Set(candidates)]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { return { text: await generate({ ...config, model }, input), model }; }
      catch (error) {
        last = error;
        if (!(error instanceof AiError) || !(error.transient || error.status === 404)) throw error;
        if (error.status === 404) break;
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 900));
      }
    }
  }
  throw last instanceof AiError ? new AiError(`${last.message} Tentei outros modelos e também não deu agora.`, last.status) : last;
}
