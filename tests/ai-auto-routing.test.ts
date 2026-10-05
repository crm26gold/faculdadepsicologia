import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { runAiAttempts } from '../src/lib/ai/attempts';

const empty = pathToFileURL(`${process.cwd()}/node_modules/server-only/empty.js`).href;
registerHooks({ resolve: (specifier, context, next) => specifier === 'server-only' ? { url: empty, shortCircuit: true } : next(specifier, context) });
const failed = (status: number) => Object.assign(new Error(`falha ${status}`), { status });
const row = (provider: string, model: string, key: string) => ({ provider: provider as 'gemini', model, key, base_url: '', gcp_project: '', gcp_location: '' });

test('automático passa para a próxima conexão mesmo com cota esgotada, até seis tentativas', async () => {
  const seen: number[] = [];
  const result = await runAiAttempts([1, 2, 3], async item => { seen.push(item); if (item < 3) throw failed(item === 1 ? 429 : 400); return 'ok'; }, { persistent: true });
  assert.equal(result, 'ok'); assert.deepEqual(seen, [1, 2, 3]);
  let calls = 0, budgets = 0;
  await assert.rejects(runAiAttempts([1, 2, 3, 4, 5, 6, 7], async () => { calls++; throw failed(429); }, { persistent: true, beforeRetry: async () => { budgets++; } }), { status: 429 });
  assert.equal(calls, 6); assert.equal(budgets, 5);
  calls = 0;
  await assert.rejects(runAiAttempts([1, 2], async () => { calls++; throw failed(429); }), { status: 429 });
  assert.equal(calls, 1, 'rota fixa continua parando na cota');
});

test('voz automática: ElevenLabs recusado leva ao Gemini; rota fixa não troca de empresa', async () => {
  const { prepareLiveSession } = await import('../src/lib/voice/live-session');
  const { resetElevenLabsCache } = await import('../src/lib/voice/elevenlabs');
  const original = globalThis.fetch;
  const hosts: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input)); hosts.push(url.hostname);
    if (url.hostname === 'api.elevenlabs.io') return Response.json({ detail: { status: 'quota_exceeded' } }, { status: 401 });
    if (url.pathname.endsWith('/models')) return Response.json({ models: [{ name: 'models/gemini-3.8-flash-live', supportedGenerationMethods: ['bidiGenerateContent'] }] });
    if (url.pathname.endsWith('/auth_tokens')) return Response.json({ name: 'auth_tokens/teste' });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  try {
    resetElevenLabsCache();
    const auto = { ...row('elevenlabs', 'auto:rapido', 'sk_eleven'), routing: 'auto', alternatives: [row('gemini', 'auto:rapido', 'gemini-key'), row('openai', 'gpt-live-1', 'openai-key')] };
    let budgets = 0;
    const result = await prepareLiveSession(auto, 'contexto', [], { signal: AbortSignal.timeout(5000), beforeRetry: async () => { budgets++; } });
    assert.equal(result.credentials.provider, 'gemini');
    assert.equal(result.credentials.token, 'auth_tokens/teste');
    assert.equal(result.credentials.fallback, true, 'ainda há a OpenAI se o Gemini falhar no navegador');
    assert.deepEqual(result.failures.map(item => item.provider), ['elevenlabs']);
    assert.equal(budgets, 1);
    const skipped = await prepareLiveSession(auto, 'contexto', [], { signal: AbortSignal.timeout(5000), skip: ['elevenlabs', 'gemini'] });
    assert.equal(skipped.credentials.provider, 'openai');
    assert.equal(skipped.credentials.fallback, false);
    resetElevenLabsCache();
    const fixed = { ...auto, routing: 'fixed' };
    const before = hosts.length;
    await assert.rejects(prepareLiveSession(fixed, 'contexto', [], { signal: AbortSignal.timeout(5000) }), /créditos/);
    assert.ok(!hosts.slice(before).includes('generativelanguage.googleapis.com'), 'rota fixa não tenta outra empresa');
  } finally { globalThis.fetch = original; resetElevenLabsCache(); }
});
