import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
const empty = pathToFileURL(`${process.cwd()}/node_modules/server-only/empty.js`).href;
registerHooks({ resolve: (specifier, context, next) => specifier === 'server-only' ? { url: empty, shortCircuit: true } : next(specifier, context) });
import { aiProviderIds, aiResourceAction, liveProviders, voiceOnlyProviders, type AiProviderId } from '../src/lib/ai/catalog';
import { providerCapabilities, resourceInsights, taskNeeds, type AiResourceMap } from '../src/lib/ai/resources';

const has = (provider: AiProviderId, capability: Parameters<typeof providerCapabilities[AiProviderId]['includes']>[0]) => providerCapabilities[provider].includes(capability);
const config = (provider: AiProviderId) => ({ provider, model: 'modelo-teste', key: 'synthetic', base_url: 'https://compat.example.invalid/v1', gcp_project: '', gcp_location: '' });

test('capacidades declaradas seguem o catálogo de voz e de texto', () => {
  assert.deepEqual(aiProviderIds.filter(id => has(id, 'live_voice')).sort(), [...liveProviders].sort());
  for (const id of aiProviderIds) assert.equal(has(id, 'text'), !voiceOnlyProviders.includes(id), `${id}: texto`);
  assert.equal(taskNeeds.voz, 'live_voice');
  assert.equal(taskNeeds.assistente, 'text');
});

test('capacidades de áudio, transcrição e imagem refletem o comportamento real do adaptador', async () => {
  const { generate, generateResilient } = await import('../src/lib/ai/providers');
  const original = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input)); paths.push(url.pathname);
    return Response.json(url.pathname.endsWith('/audio/transcriptions') ? { text: 'transcrito' }
      : { candidates: [{ content: { parts: [{ text: 'ok' }] } }], choices: [{ message: { content: 'ok' } }], content: [{ text: 'ok' }], output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }] });
  }) as typeof fetch;
  const audio = { mimeType: 'audio/ogg', base64: Buffer.from('audio sintético').toString('base64') };
  try {
    for (const id of aiProviderIds.filter(id => id !== 'vertex' && id !== 'elevenlabs')) {
      const recorded = await generate(config(id), { system: 's', prompt: 'p', audio }).then(() => true, () => false);
      assert.equal(recorded, has(id, 'audio'), `${id}: áudio gravado`);
      paths.length = 0;
      const heard = await generateResilient(config(id), { system: 's', prompt: 'p', audio, audioTask: 'transcribe' }).then(() => true, () => false);
      assert.equal(heard && paths.some(path => path.endsWith('/audio/transcriptions')), has(id, 'transcription'), `${id}: transcrição`);
    }
    const image = { mimeType: 'image/png' as const, base64: 'iVBORw0KGgo=' };
    assert.equal(await generate(config('deepseek'), { system: 's', prompt: 'p', image }).then(() => true, () => false), has('deepseek', 'image'));
    await assert.rejects(generate(config('elevenlabs'), { system: 's', prompt: 'p' }), /somente a Chamada ao vivo/);
  } finally { globalThis.fetch = original; }
});

test('a ação do mapa só aceita declarações e públicos válidos', () => {
  const base = { action: 'set_source_policy', connection_id: null, audience: 'owner' } as const;
  assert(aiResourceAction.safeParse({ ...base, provider: 'gemini', privacy_basis: 'paid' }).success);
  assert(!aiResourceAction.safeParse({ ...base, provider: 'gemini', privacy_basis: 'no_training' }).success);
  assert(aiResourceAction.safeParse({ ...base, provider: 'groq', privacy_basis: 'no_training', audience: 'members' }).success);
  assert(!aiResourceAction.safeParse({ ...base, provider: 'groq', privacy_basis: 'paid', audience: 'everyone' }).success);
  assert(!aiResourceAction.safeParse({ ...base, provider: 'elevenlabs', privacy_basis: 'paid' }).success);
  assert(aiResourceAction.safeParse({ ...base, provider: 'deepseek', privacy_basis: null }).success);
  assert(aiResourceAction.safeParse({ action: 'set_base', enabled: false }).success);
});

const resource = (source_id: string, provider: AiProviderId, extra: Partial<AiResourceMap['resources'][number]> = {}): AiResourceMap['resources'][number] => ({
  source_id, provider, kind: source_id.startsWith('connection:') ? 'connection' : 'api', connection_id: source_id.startsWith('connection:') ? source_id.slice(11) : null,
  label: source_id.startsWith('connection:') ? 'Reserva Gemini' : '', configured: true, enabled: true, key_hint: 'abcd', updated_at: '2026-10-05T12:00:00Z',
  personal_data_ok: provider !== 'gemini', declaration: { privacy_basis: null, audience: null, current: false }, ...extra,
});
// The production shape audited on 05/10/2026.
const productionMap = (): AiResourceMap => ({
  version: 1, generated_at: '2026-10-05T16:00:00Z', base_enabled: false,
  resources: [resource('provider:deepseek', 'deepseek'), resource('provider:gemini', 'gemini'), resource('provider:groq', 'groq'), resource('provider:elevenlabs', 'elevenlabs'), resource('connection:extra', 'gemini')],
  routes: [{ task: 'assistente', enabled: true, mode: 'fallback', provider: 'deepseek', model: 'auto:rapido', routing_effective: 'fallback',
    chain: [{ source_id: 'provider:deepseek', provider: 'deepseek', model: 'auto:rapido', source: 'owner' }], configured_chain: [], members_chain: [], members_note: 'base_off',
    sources: [{ source_id: 'provider:deepseek', state: 'active', position: 1, role: 'primary' }, { source_id: 'connection:extra', state: 'blocked', role: 'fallback', reason: 'declaration_missing' },
      { source_id: 'provider:groq', state: 'available' }, { source_id: 'provider:gemini', state: 'unusable', reason: 'declaration_missing' }, { source_id: 'provider:elevenlabs', state: 'incapable', reason: 'capability' }] },
  { task: 'voz', enabled: true, mode: 'fixed', provider: 'elevenlabs', model: 'qwen36-35b-a3b', routing_effective: 'fixed',
    chain: [{ source_id: 'provider:elevenlabs', provider: 'elevenlabs', model: 'qwen36-35b-a3b', source: 'owner' }], configured_chain: [], members_chain: [], members_note: 'voice_not_shared', sources: [] }],
  channels: [], whatsapp: { enabled: false, configured: true, state: 'offline', heartbeat: null, stt: { source_id: 'connection:extra', provider: 'gemini', model: 'auto:rapido', state: 'blocked', reason: 'declaration_missing' } },
  mcp_inbound: { owner_tokens: 0, owner_oauth: 0, owner_can_write: 0, owner_last_used: null, members_with_access: 0 }, mcp_outbound: [], members: { accounts: 3, with_personal_keys: 0 },
});

test('o mapa explica a reserva inerte e sugere conexões disponíveis sem gastar créditos', () => {
  const insights = resourceInsights(productionMap());
  assert(insights.some(item => item.level === 'warning' && /Reserva Gemini · Google Gemini \(AI Studio\) está configurada, mas fora/.test(item.text)));
  assert(insights.some(item => item.level === 'info' && /depende de uma só conexão. Disponíveis para reserva: Groq/.test(item.text)));
  assert(insights.some(item => item.level === 'info' && /Transcrição do WhatsApp/.test(item.text)), 'disabled channel is informational');
  assert(!insights.some(item => item.task === 'voz'), 'single fixed voice route is a choice, not a warning');
});

test('o mapa avisa quando chaves pessoais mudam o modo efetivo e quando a declaração venceu', () => {
  const map = productionMap();
  map.routes[0].routing_effective = 'auto';
  map.resources[4].declaration = { privacy_basis: 'paid', audience: 'owner', current: false };
  const insights = resourceInsights(map);
  assert(insights.some(item => /funcionar no modo automático/.test(item.text)));
  assert(insights.some(item => item.level === 'warning' && /A chave foi trocada depois da declaração/.test(item.text)));
});
