import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('preparação xAI usa somente token efêmero, reserva autorizada e limites', () => {
  const moduleUrl = new URL('../src/lib/voice/xai-session.ts', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import { prepareXaiSession, XaiSessionError } from ${JSON.stringify(moduleUrl)};
    const config = { provider: 'xai', model: 'grok-voice-latest', key: 'synthetic-primary', base_url: '', gcp_project: '', gcp_location: '' };
    const reserve = { ...config, model: 'grok-voice-think-fast-2.0', key: 'synthetic-reserve' };
    let status = 401, reason = 'invalid_api_key', requests = [], retries = 0;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.x.ai/v1/realtime/client_secrets');
      assert.equal(options.method, 'POST'); assert.equal(options.cache, 'no-store');
      assert.deepEqual(JSON.parse(options.body), { expires_after: { seconds: 300 } });
      const key = options.headers.Authorization; requests.push(key);
      if (key === 'Bearer synthetic-primary' && status) return Response.json({ error: { code: reason, message: 'secret private message must not escape' } }, { status });
      return Response.json({ value: 'synthetic-short-lived-secret', expires_at: Math.floor(Date.now() / 1000) + 300 });
    };
    const settings = { beforeRetry: async () => { retries++; } };
    const result = await prepareXaiSession({ ...config, alternatives: [reserve, { ...reserve, provider: 'groq' }] }, settings);
    assert.equal(result.token, 'synthetic-short-lived-secret'); assert.equal(result.model, reserve.model);
    assert.equal(result.maxSeconds, 1200); assert.equal(retries, 1); assert.equal(requests.length, 2);
    assert.equal(JSON.stringify(result).includes('synthetic-primary'), false);
    for (const [upstream, code] of [[429, 'rate_limit_exceeded'], [402, 'unknown'], [400, 'invalid_request_error'], [403, 'insufficient_credits']]) {
      status = upstream; reason = code; requests = []; retries = 0;
      await assert.rejects(prepareXaiSession({ ...config, alternatives: [reserve] }, settings), error => {
        assert.equal(error instanceof XaiSessionError, true); assert.equal(error.status, upstream);
        assert.equal(error.stage, 'token'); assert.equal(error.message.includes('secret private'), false);
        assert.equal(JSON.stringify(error.diagnostic).includes('secret private'), false); return true;
      });
      assert.equal(requests.length, 1); assert.equal(retries, 0);
    }
    status = 401; reason = 'invalid_api_key'; requests = [];
    await assert.rejects(prepareXaiSession({ ...config, alternatives: [reserve] }, { beforeRetry: async () => { throw Object.assign(new Error('Synthetic budget denied'), { status: 429 }); } }), { status: 429 });
    assert.equal(requests.length, 1);
    const aborted = new AbortController(); aborted.abort(); requests = [];
    await assert.rejects(prepareXaiSession(config, { signal: aborted.signal }), { name: 'AbortError' }); assert.equal(requests.length, 0);
    requests = [];
    await assert.rejects(prepareXaiSession({ ...config, model: 'grok-4.7' }), { status: 400 }); assert.equal(requests.length, 0);
    status = 0;
    globalThis.fetch = async () => Response.json({ value: 'synthetic-token', expires_at: 0 });
    await assert.rejects(prepareXaiSession(config), { status: 502 });
    console.log('Synthetic xAI token contract passed without network or real credentials.');
  `;
  const child = spawnSync(process.execPath, ['--conditions=react-server', '--import', 'tsx', '--input-type=module', '-e', script],
    { encoding: 'utf8', timeout: 30_000 });
  assert.equal(child.status, 0, child.stderr || child.error?.message || child.stdout);
});
