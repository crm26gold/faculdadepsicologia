import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGeminiSession } from '../src/lib/voice/check-session';
test('diagnóstico fecha após setup sem enviar texto, áudio ou executar ferramenta', async () => {
  const NativeSocket = globalThis.WebSocket;
  const messages: unknown[] = []; let closed = false;
  class FakeSocket {
    onopen: (() => void) | null = null; onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null; onclose: (() => void) | null = null;
    constructor() { queueMicrotask(() => this.onopen?.()); }
    send(value: string) { messages.push(JSON.parse(value)); queueMicrotask(() => this.onmessage?.({ data: '{"setupComplete":{}}' })); }
    close() { closed = true; }
  }
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  try {
    const result = await checkGeminiSession({ token: 'auth_tokens/synthetic', model: 'gemini-3.8-live' });
    assert.deepEqual(result, { connected: true, stage: 'setup' }); assert.equal(closed, true);
    assert.equal(messages.length, 1); assert.deepEqual(Object.keys(messages[0] as object), ['setup']);
    assert.deepEqual(messages[0], { setup: { model: 'models/gemini-3.8-live', sessionResumption: {} } });
    assert.doesNotMatch(JSON.stringify(messages), /clientContent|realtimeInput.*audio/);
  } finally { globalThis.WebSocket = NativeSocket; }
});
test('diagnóstico nunca expõe razão bruta de fechamento ou token', async () => {
  const NativeSocket = globalThis.WebSocket;
  class FakeSocket {
    onopen: (() => void) | null = null; onmessage: unknown; onerror: unknown;
    onclose: ((event: { code: number; reason: string }) => void) | null = null;
    constructor() { queueMicrotask(() => this.onclose?.({ code: 1008, reason: 'Invalid field mask: private-secret-transcript' })); }
    close() {} send() {}
  }
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  try {
    const result = await checkGeminiSession({ token: 'auth_tokens/private-secret', model: 'gemini-3.8-live' });
    assert.equal(result.connected, false); assert.equal(result.diagnostic?.configurationIssue, 'INVALID_FIELD_MASK');
    assert.doesNotMatch(JSON.stringify(result), /private-secret|transcript|auth_tokens/);
  } finally { globalThis.WebSocket = NativeSocket; }
});
