import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAiAttempts } from '../src/lib/ai/attempts';
import { aiAdminAction } from '../src/lib/ai/catalog';

const failed = (status: number) => Object.assign(new Error('synthetic provider failure'), { status });
test('reserva autorizada sucede a chave recusada e contabiliza a tentativa', async () => {
  const visited: number[] = []; let reservations = 0;
  const result = await runAiAttempts([1,2,3], async key => { visited.push(key); if (key === 1) throw failed(401); return 'ok'; }, { beforeRetry: async () => { reservations++; } });
  assert.equal(result, 'ok'); assert.deepEqual(visited, [1,2]); assert.equal(reservations, 1);
});
test('limite compartilhado negado termina antes de chamar outra API', async () => {
  let calls = 0;
  await assert.rejects(runAiAttempts([1,2,3], async () => { calls++; throw failed(503); }, { beforeRetry: async () => { throw failed(429); } }), { status: 429 });
  assert.equal(calls, 1);
});
test('quatro tentativas totais impedem multiplicação de modelos e chaves', async () => {
  let calls = 0, budgets = 0;
  await assert.rejects(runAiAttempts([1,2,3,4,5,6], async () => { calls++; throw failed(503); }, { beforeRetry: async () => { budgets++; } }), { status: 503 });
  assert.equal(calls, 4); assert.equal(budgets, 3);
});
test('cota, faturamento e configuração inválida não provocam rotação de chaves', async () => {
  for (const status of [400,402,429]) {
    let calls = 0;
    await assert.rejects(runAiAttempts([1,2], async () => { calls++; throw failed(status); }), { status });
    assert.equal(calls, 1);
  }
});
test('cancelamento interrompe as alternativas sem executar a próxima', async () => {
  const abort = new AbortController(); let calls = 0;
  await assert.rejects(runAiAttempts([1,2], async () => { calls++; abort.abort(); throw failed(503); }, { signal: abort.signal }), { name: 'AbortError' });
  assert.equal(calls, 1);
});
test('faturamento desativado identificado em uma recusa de acesso encerra a operação', async () => {
  let calls = 0;
  await assert.rejects(runAiAttempts([1,2], async () => { calls++; throw Object.assign(failed(403), { doNotRetry: true }); }), { status: 403 });
  assert.equal(calls, 1);
});
test('painel valida chave de reserva, prioridade, exclusão e diagnóstico sem dados da pessoa', () => {
  const base = { action: 'save_connection', id: null, provider: 'gemini', label: 'Reserva', enabled: false, position: 1, key: 'synthetic' };
  assert.equal(aiAdminAction.safeParse(base).success, true);
  for (const value of [{ position: 0 },{ position: 6 },{ label: '' },{ provider: 'unknown' },{ id: 'another-owner' }]) assert.equal(aiAdminAction.safeParse({ ...base, ...value }).success, false);
  assert.equal(aiAdminAction.safeParse({ action: 'test_live' }).success, true);
  assert.equal(aiAdminAction.safeParse({ action: 'models', provider: 'gemini', connection_id: '00000000-0000-4000-8000-000000000001' }).success, true);
  assert.equal(aiAdminAction.safeParse({ action: 'models', provider: 'gemini', connection_id: 'not-a-uuid' }).success, false);
});
