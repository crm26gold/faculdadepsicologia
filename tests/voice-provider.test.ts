import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveProviderFailure } from '../src/lib/voice/provider-error';

test('erro de configuração do Gemini não atribui a falha a faturamento e não expõe dados do provedor', async () => {
  const response = Response.json({ error: { status: 'INVALID_ARGUMENT', message: 'secret-key and private transcript', details: [
    { fieldViolations: [{ field: 'bidiGenerateContentSetup.generationConfig.responseModalities', description: 'private transcript' }, { field: 'secret-key' }] },
    { reason: 'UNKNOWN_SECRET_REASON', metadata: { key: 'secret-key' } },
  ] } }, { status: 400 });
  const failure = await liveProviderFailure(response);
  assert.match(failure.message, /configuração/);
  assert.doesNotMatch(failure.message, /faturamento/);
  assert.deepEqual(failure.diagnostic, { upstreamStatus: 400, upstreamCode: 'INVALID_ARGUMENT', reason: undefined, invalidFields: ['generationConfig'] });
  assert.doesNotMatch(JSON.stringify(failure), /secret-key|private transcript|UNKNOWN_SECRET_REASON/);
});

test('permissão negada só recomenda faturamento quando o Gemini informa essa causa explicitamente', async () => {
  const denied = await liveProviderFailure(Response.json({ error: { status: 'PERMISSION_DENIED' } }, { status: 403 }));
  assert.match(denied.message, /autorização/);
  assert.doesNotMatch(denied.message, /faturamento/);
  const billing = await liveProviderFailure(Response.json({ error: { status: 'PERMISSION_DENIED', details: [{ reason: 'BILLING_DISABLED' }] } }, { status: 403 }));
  assert.match(billing.message, /faturamento/);
  assert.equal(billing.diagnostic.reason, 'BILLING_DISABLED');
  const key = await liveProviderFailure(Response.json({ error: { details: [{ reason: 'API_KEY_INVALID' }] } }, { status: 400 }));
  assert.match(key.message, /chave.*inválida/i);
});

test('cota e falha sem JSON preservam o status adequado sem divulgar resposta bruta', async () => {
  const quota = await liveProviderFailure(Response.json({ error: { status: 'RESOURCE_EXHAUSTED' } }, { status: 429 }));
  assert.equal(quota.status, 429);
  assert.match(quota.message, /limite/);
  const unavailable = await liveProviderFailure(new Response('private raw error', { status: 503 }));
  assert.equal(unavailable.status, 502);
  assert.doesNotMatch(JSON.stringify(unavailable), /private raw error/);
});
