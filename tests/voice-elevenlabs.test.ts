import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { liveModelAllowed } from '../src/lib/ai/catalog';
import {
  ELEVENLABS_AGENT_TAG, elevenLabsAgentConfig, elevenLabsCloseMessage, elevenLabsSocket, elevenLabsToolResult, elevenLabsTools, elevenLabsVariables, pcmRate, pickElevenLabsLlm,
} from '../src/lib/voice/elevenlabs-protocol';

// The server module is guarded by server-only; tests load it with the package's own empty entry.
const empty = pathToFileURL(`${process.cwd()}/node_modules/server-only/empty.js`).href;
registerHooks({ resolve: (specifier, context, next) => specifier === 'server-only' ? { url: empty, shortCircuit: true } : next(specifier, context) });
const server = () => import('../src/lib/voice/elevenlabs');
const KEY = 'sk_test_secret_value';

type Call = { method: string; path: string; body?: Record<string, any>; key: string | null };
function fakeElevenLabs(options: { agents?: Record<string, unknown>[]; tools?: Record<string, unknown>[]; fail?: (call: Call) => Response | undefined } = {}) {
  const calls: Call[] = [];
  let tools = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.elevenlabs.io');
    const call: Call = { method: init?.method ?? 'GET', path: `${url.pathname}${url.search}`, body: init?.body ? JSON.parse(String(init.body)) : undefined, key: new Headers(init?.headers).get('xi-api-key') };
    calls.push(call);
    const failed = options.fail?.(call);
    if (failed) return failed;
    if (url.pathname === '/v1/convai/llm/list') return Response.json({ llms: [{ llm: 'gemini-2.5-flash', is_checkpoint: false }, { llm: 'gemini-2.0-flash', is_checkpoint: false, deprecation_info: { is_deprecated: true } }, { llm: 'custom-llm', is_checkpoint: false }] });
    if (url.pathname === '/v1/convai/agents') return Response.json({ agents: options.agents ?? [], has_more: false });
    if (url.pathname === '/v1/convai/tools' && call.method === 'GET') return Response.json({ tools: options.tools ?? [], has_more: false });
    if (url.pathname === '/v1/convai/tools' && call.method === 'POST') return Response.json({ id: `tool_${++tools}`, tool_config: call.body?.tool_config });
    if (url.pathname.startsWith('/v1/convai/tools/')) return Response.json({ id: url.pathname.split('/').pop() });
    if (url.pathname === '/v1/convai/agents/create') return Response.json({ agent_id: 'agent_new' });
    if (url.pathname.startsWith('/v1/convai/agents/')) return Response.json({ agent_id: url.pathname.split('/').pop() });
    if (url.pathname === '/v1/convai/conversation/get-signed-url') return Response.json({ signed_url: `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${url.searchParams.get('agent_id')}&conversation_signature=sig` });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}
const config = (model = 'auto:rapido') => ({ provider: 'elevenlabs' as const, model, key: KEY, base_url: '', gcp_project: '', gcp_location: '' });

test('ferramentas do agente seguem o formato do ElevenLabs e as mesmas regras da voz', () => {
  const tools = elevenLabsTools();
  assert.deepEqual(tools.map(tool => tool.name), ['consultar_jornada', 'organizar_jornada', 'confirmar_alteracao', 'cancelar_alteracao', 'desfazer_ultima_acao']);
  for (const tool of tools) {
    assert.equal(tool.type, 'client');
    assert.equal(tool.expects_response, true);
    for (const property of Object.values(tool.parameters?.properties ?? {})) {
      assert.match(property.type, /^(string|boolean)$/);
      assert.ok(property.description.length > 3, 'cada parâmetro precisa de descrição para o modelo preenchê-lo');
    }
  }
  assert.deepEqual(tools[0].parameters?.required, ['section']);
  assert.ok(tools[0].parameters?.properties.section.enum?.includes('agenda'));
  assert.equal(tools[2].parameters, undefined);
  const agent = elevenLabsAgentConfig('gemini-2.5-flash', ['tool_1']);
  assert.equal(agent.platform_settings.auth.enable_auth, true, 'o agente só abre conversas com URL assinada');
  assert.equal(agent.platform_settings.privacy.record_voice, false);
  assert.equal(agent.platform_settings.privacy.retention_days, 0);
  assert.equal(agent.platform_settings.privacy.delete_transcript_and_pii, true);
  assert.equal(agent.platform_settings.privacy.apply_to_existing_conversations, false);
  assert.match(agent.conversation_config.agent.prompt.prompt, /\{\{contexto\}\}[\s\S]*\{\{historico\}\}/);
  assert.equal('voice_id' in agent.conversation_config.tts, false, 'sem voz definida, mantém a escolhida no ElevenLabs');
});

test('modelo do agente: automático escolhe um rápido disponível; nome indisponível é recusado', () => {
  assert.equal(pickElevenLabsLlm(['gpt-4o-mini', 'gemini-2.5-flash'], 'auto:rapido'), 'gemini-2.5-flash');
  assert.equal(pickElevenLabsLlm(['claude-haiku-4-5'], 'auto:rapido'), 'claude-haiku-4-5');
  assert.equal(pickElevenLabsLlm(['gpt-4o-mini'], 'gemini-2.5-flash'), null);
  assert.equal(pickElevenLabsLlm([], 'gemini-2.5-flash'), 'gemini-2.5-flash');
  assert.equal(liveModelAllowed('elevenlabs', 'gemini-2.5-flash'), true);
  assert.equal(liveModelAllowed('elevenlabs', 'custom-llm'), false);
  assert.equal(liveModelAllowed('elevenlabs', 'Gemini Flash'), false);
  assert.equal(liveModelAllowed('gemini', 'gemini-2.5-flash'), false);
  assert.equal(liveModelAllowed('openai', 'gpt-live-1'), true);
});

test('URL assinada só vale para o ElevenLabs por WSS; variáveis ficam limitadas', () => {
  assert.ok(elevenLabsSocket('wss://api.elevenlabs.io/v1/convai/conversation?agent_id=a&conversation_signature=s'));
  assert.ok(elevenLabsSocket('wss://api.us.elevenlabs.io/v1/convai/conversation?agent_id=a'));
  for (const bad of ['ws://api.elevenlabs.io/x', 'https://api.elevenlabs.io/x', 'wss://elevenlabs.io.evil.example/x', 'wss://evil.example/?h=.elevenlabs.io', 'wss://api.elevenlabs.io:8443/x', 'wss://user:pass@api.elevenlabs.io/x', 42]) assert.equal(elevenLabsSocket(bad), null, String(bad));
  const history = Array.from({ length: 12 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', text: `mensagem ${index} ${'x'.repeat(2000)}` }));
  const variables = elevenLabsVariables('c'.repeat(9000), history);
  assert.equal(variables.contexto.length, 6000);
  assert.ok(variables.historico.length <= 4000);
  assert.match(JSON.parse(variables.historico).at(-1).text, /^mensagem 11/);
  assert.equal(pcmRate('pcm_16000'), 16000);
  assert.equal(pcmRate('ulaw_8000'), null);
  const long = elevenLabsToolResult({ items: 'x'.repeat(40_000) });
  assert.ok(long.length <= 30_000);
  assert.equal(JSON.parse(long).partial, true);
  assert.doesNotMatch(elevenLabsCloseMessage(1008, 'secret transcript', true), /secret/);
  assert.match(elevenLabsCloseMessage(1008, 'Quota exceeded', true), /créditos/);
});

test('primeira chamada cria ferramentas e agente; a seguinte reutiliza sem recriar', async () => {
  const { ensureElevenLabsAgent, prepareElevenLabsSession, resetElevenLabsCache } = await server();
  resetElevenLabsCache();
  const fake = fakeElevenLabs();
  try {
    const session = await prepareElevenLabsSession(config(), 'Hoje: 2026-10-05', [{ role: 'user', text: 'oi' }], { signal: AbortSignal.timeout(5000) });
    assert.match(fake.calls.find(call => call.path.startsWith('/v1/convai/conversation/get-signed-url'))!.path, /include_conversation_id=true/);
    assert.match(session.token, /^wss:\/\/api\.elevenlabs\.io\/.*agent_id=agent_new/);
    assert.equal(session.model, 'gemini-2.5-flash');
    assert.equal(session.variables.contexto, 'Hoje: 2026-10-05');
    assert.doesNotMatch(JSON.stringify(session), new RegExp(KEY));
    assert.ok(fake.calls.every(call => call.key === KEY));
    const created = fake.calls.find(call => call.path === '/v1/convai/agents/create')!;
    assert.deepEqual(created.body!.conversation_config.agent.prompt.tool_ids, ['tool_1', 'tool_2', 'tool_3', 'tool_4', 'tool_5']);
    assert.equal(created.body!.tags[0], ELEVENLABS_AGENT_TAG);
    assert.match(created.body!.tags[1], /^jp-[0-9a-f]{12}$/);
    assert.equal(fake.calls.filter(call => call.method === 'POST' && call.path === '/v1/convai/tools').length, 5);
    const before = fake.calls.length;
    await ensureElevenLabsAgent(KEY, 'auto:rapido', AbortSignal.timeout(5000));
    assert.equal(fake.calls.length, before, 'o agente preparado fica em cache');
  } finally { fake.restore(); resetElevenLabsCache(); }
});

test('agente existente é atualizado só quando a configuração mudou, preservando a voz escolhida', async () => {
  const { ensureElevenLabsAgent, resetElevenLabsCache } = await server();
  resetElevenLabsCache();
  const tools = elevenLabsTools().map((tool, index) => ({ id: `old_${index}`, tool_config: { name: tool.name, type: 'client' } }));
  let fake = fakeElevenLabs({ agents: [{ agent_id: 'agent_newer', tags: [ELEVENLABS_AGENT_TAG], created_at_unix_secs: 20 }, { agent_id: 'agent_old', tags: [ELEVENLABS_AGENT_TAG, 'jp-000000000000'], voice_id: 'voz_escolhida', created_at_unix_secs: 10 }], tools });
  let version = '';
  try {
    const agent = await ensureElevenLabsAgent(KEY, 'auto:rapido', AbortSignal.timeout(5000));
    assert.equal(agent.agentId, 'agent_old');
    const patch = fake.calls.find(call => call.method === 'PATCH' && call.path === '/v1/convai/agents/agent_old')!;
    assert.equal(patch.body!.conversation_config.tts.voice_id, 'voz_escolhida');
    assert.deepEqual(patch.body!.conversation_config.agent.prompt.tool_ids, ['old_0', 'old_1', 'old_2', 'old_3', 'old_4']);
    assert.equal(fake.calls.some(call => call.method === 'POST'), false, 'ferramentas e agente não são duplicados');
    version = patch.body!.tags[1];
  } finally { fake.restore(); resetElevenLabsCache(); }
  fake = fakeElevenLabs({ agents: [{ agent_id: 'agent_old', tags: [ELEVENLABS_AGENT_TAG, version], created_at_unix_secs: 10 }] });
  try {
    await ensureElevenLabsAgent(KEY, 'auto:rapido', AbortSignal.timeout(5000));
    assert.equal(fake.calls.some(call => call.method !== 'GET'), false, 'versão atual: nada a atualizar');
  } finally { fake.restore(); resetElevenLabsCache(); }
});

test('falhas do ElevenLabs viram mensagens claras sem repetir o conteúdo da resposta', async () => {
  const { prepareElevenLabsSession, resetElevenLabsCache, ElevenLabsError } = await server();
  for (const [status, detail, expected] of [
    [401, { status: 'invalid_api_key', message: 'secret transcript' }, /recusou a chave/],
    [403, { status: 'missing_permissions', message: 'secret transcript' }, /permissão para localizar o agente/],
    [401, { status: 'quota_exceeded', message: 'secret transcript' }, /créditos/],
    [422, [{ loc: ['body', 'conversation_config', 'agent'], msg: 'secret transcript' }], /configuração/],
  ] as const) {
    resetElevenLabsCache();
    const fake = fakeElevenLabs({ fail: call => call.path.startsWith('/v1/convai/agents?') ? Response.json({ detail }, { status }) : undefined });
    try {
      await assert.rejects(prepareElevenLabsSession(config(), '', [], { signal: AbortSignal.timeout(5000) }), (error: InstanceType<typeof ElevenLabsError>) => {
        assert.match(error.message, expected);
        assert.doesNotMatch(JSON.stringify({ message: error.message, diagnostic: error.diagnostic }), /secret transcript/);
        if (status === 422) assert.deepEqual(error.diagnostic.fields, ['body.conversation_config.agent']);
        return true;
      });
    } finally { fake.restore(); }
  }
  resetElevenLabsCache();
  const forged = fakeElevenLabs({ fail: call => call.path.startsWith('/v1/convai/conversation/get-signed-url') ? Response.json({ signed_url: 'wss://evil.example/socket' }) : undefined });
  try { await assert.rejects(prepareElevenLabsSession(config(), '', [], { signal: AbortSignal.timeout(5000) }), /endereço de conversa inesperado/); }
  finally { forged.restore(); resetElevenLabsCache(); }
});
