import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { runAiAttempts } from '../src/lib/ai/attempts';
import { aiAdminAction } from '../src/lib/ai/catalog';
import { failureKind, failureMessage, providerSignals, type AiFailureKind } from '../src/lib/ai/provider-failure';

const empty = pathToFileURL(`${process.cwd()}/node_modules/server-only/empty.js`).href;
registerHooks({ resolve: (specifier, context, next) => specifier === 'server-only' ? { url: empty, shortCircuit: true } : next(specifier, context) });
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
test('automático respeita recusas definitivas e não chama outra chave', async () => {
  let calls = 0;
  await assert.rejects(runAiAttempts([1,2], async () => { calls++; throw Object.assign(failed(429), { doNotRetry: true }); }, { persistent: true }), { status: 429 });
  assert.equal(calls, 1);
});

// Every class × routing mode. The first key fails with that class; `charged` lists each attempt that reserved budget.
// Automatic and manual fallback reach another company (b); fixed and legacy routes only hold keys of one company (a).
const kinds: AiFailureKind[] = ['network', 'server', 'rate_limit', 'model', 'auth', 'billing', 'invalid'];
const routes = {
  auto: { persistent: true, rows: ['a1', 'a2', 'b1'], expected: { network: ['a1','a2'], server: ['a1','a2'], rate_limit: ['a1','a2'], model: ['a1','a2'], auth: ['a1','a2'], billing: ['a1','b1'], invalid: 'stop' } },
  fallback: { persistent: false, rows: ['a1', 'a2', 'b1'], expected: { network: ['a1','a2'], server: ['a1','a2'], rate_limit: 'stop', model: ['a1','a2'], auth: ['a1','a2'], billing: ['a1','b1'], invalid: 'stop' } },
  fixed: { persistent: false, rows: ['a1', 'a2'], expected: { network: ['a1','a2'], server: ['a1','a2'], rate_limit: 'stop', model: ['a1','a2'], auth: ['a1','a2'], billing: 'stop', invalid: 'stop' } },
} satisfies Record<string, { persistent: boolean; rows: string[]; expected: Record<AiFailureKind, string[] | 'stop'> }>;
test('uma ação por classe de falha em cada modo de rota', async () => {
  for (const [mode, route] of Object.entries(routes)) for (const kind of kinds) {
    const charged: string[] = [];
    const attempt = runAiAttempts(route.rows.map(key => ({ provider: key[0], key })), async row => {
      if (row.key === 'a1') throw Object.assign(new Error('synthetic'), { kind });
      return row.key;
    }, { persistent: route.persistent, beforeAttempt: async row => { charged.push(row.key); } });
    const expected = route.expected[kind];
    if (expected === 'stop') await assert.rejects(attempt, { kind }, `${mode} ${kind}`);
    else assert.equal(await attempt, expected.at(-1), `${mode} ${kind}`);
    assert.deepEqual(charged, expected === 'stop' ? ['a1'] : expected, `${mode} ${kind}`);
  }
});
test('chave recusada não volta na repetição da conexão; modelo ausente volta com o próximo modelo', async () => {
  const rows = [{ provider: 'a', key: 'a1' }, { provider: 'a', key: 'a2' }, { provider: 'a', key: 'a1' }];
  for (const [kind, expected] of [['auth', ['a1', 'a2']], ['model', ['a1', 'a2', 'a1']]] as const) {
    const charged: string[] = []; let first = true;
    const attempt = runAiAttempts(rows, async row => {
      if (row.key === 'a2') throw failed(503);
      if (first) { first = false; throw Object.assign(new Error('synthetic'), { kind }); }
      return 'second model';
    }, { beforeAttempt: async row => { charged.push(row.key); } });
    if (kind === 'auth') await assert.rejects(attempt, { status: 503 }); else assert.equal(await attempt, 'second model');
    assert.deepEqual(charged, expected, kind);
  }
});
test('recusa do orçamento da Jornada para tudo, antes ou depois de uma falha, em qualquer modo', async () => {
  for (const persistent of [true, false]) {
    let calls = 0;
    const refusal = Object.assign(new Error('Controle de uso da Jornada atingido.'), { status: 429, doNotRetry: true });
    await assert.rejects(runAiAttempts([{ provider: 'a', key: 'a1' }, { provider: 'b', key: 'b1' }], async () => { calls++; throw failed(503); },
      { persistent, beforeAttempt: async (_row, index) => { if (index) throw refusal; } }), refusal);
    assert.equal(calls, 1);
    calls = 0;
    await assert.rejects(runAiAttempts([{ provider: 'a', key: 'a1' }, { provider: 'b', key: 'b1' }], async () => { calls++; throw Object.assign(refusal, { kind: 'billing' }); }, { persistent }), refusal);
    assert.equal(calls, 1, 'doNotRetry vence a classe');
  }
});
test('falha inesperada sem status para em vez de gastar outra tentativa', async () => {
  let calls = 0;
  await assert.rejects(runAiAttempts([{ provider: 'a', key: 'a1' }, { provider: 'b', key: 'b1' }], async () => { calls++; throw new TypeError('bug'); }, { persistent: true }), TypeError);
  assert.equal(calls, 1);
});

test('classificação lê status e códigos estruturados; frases só como último recurso', () => {
  const cases: [number, unknown, AiFailureKind][] = [
    [0, null, 'network'],
    [500, null, 'server'], [503, { error: { status: 'UNAVAILABLE' } }, 'server'], [529, { type: 'error', error: { type: 'overloaded_error' } }, 'server'],
    [402, { error: { message: 'Insufficient Balance', type: 'unknown_error' } }, 'billing'],
    [402, { error: { code: 402, message: 'Insufficient credits' } }, 'billing'],
    [429, { error: { code: 'insufficient_quota', type: 'insufficient_quota', message: 'You exceeded your current quota, please check your plan and billing details.' } }, 'billing'],
    [400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the API.' } }, 'billing'],
    [403, { error: { status: 'PERMISSION_DENIED', details: [{ reason: 'BILLING_DISABLED' }] } }, 'billing'],
    [429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'Your prepayment credits are depleted.' } }, 'billing'],
    [403, { code: 'permission_denied', error: 'Your team has used all available credits.' }, 'billing'],
    [429, { error: { code: 'rate_limit_exceeded', message: 'Rate limit reached for requests' } }, 'rate_limit'],
    // A free-tier rate limit mentions "quota" and "billing"; it must not look like an empty balance.
    [429, { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota, please check your plan and billing details.' } }, 'rate_limit'],
    [400, { error: { status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } }, 'auth'],
    [401, { error: { type: 'authentication_error' } }, 'auth'], [403, null, 'auth'],
    [404, { error: { code: 'model_not_found' } }, 'model'], [400, { error: { code: 'model_not_found' } }, 'model'],
    [400, { error: { status: 'INVALID_ARGUMENT', message: 'quota billing credit' } }, 'invalid'], [422, null, 'invalid'], [413, null, 'invalid'],
  ];
  for (const [status, body, kind] of cases) assert.equal(failureKind(status, providerSignals(body)), kind, `${status} ${JSON.stringify(body)}`);
  assert.equal(failureMessage('billing', 'DeepSeek', 402), 'DeepSeek: sem saldo na API (402). Recarregue ou ative o faturamento no painel do provedor, ou use outra conexão.');
  assert.equal(failureMessage('network', 'DeepSeek', 0), 'DeepSeek: sem resposta (rede ou tempo esgotado). Tente de novo em instantes ou use outra conexão.');
});

test('sem saldo: o automático pula as outras chaves da empresa, cobra só o que tentou e não repete o texto do provedor', async () => {
  const { generateResilient } = await import('../src/lib/ai/providers');
  const original = globalThis.fetch; const sent: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const key = new Headers(init?.headers).get('authorization') ?? ''; sent.push(`${new URL(String(input)).hostname} ${key}`);
    if (key.includes('deepseek')) return Response.json({ error: { message: 'Insufficient Balance: private prompt echo', type: 'unknown_error' } }, { status: 402 });
    return Response.json({ choices: [{ message: { content: 'resposta' } }] });
  }) as typeof fetch;
  const row = (provider: 'deepseek' | 'groq', key: string) => ({ provider, model: 'synthetic-model', key, base_url: '', gcp_project: '', gcp_location: '' });
  try {
    const charged: string[] = [];
    const result = await generateResilient({ ...row('deepseek', 'deepseek-1'), routing: 'auto', alternatives: [row('deepseek', 'deepseek-2'), row('groq', 'groq-1')] },
      { system: 'Responda.', prompt: 'Oi', beforeAttempt: async candidate => { charged.push(candidate.key); } });
    assert.equal(result.provider, 'groq');
    assert.deepEqual(charged, ['deepseek-1', 'groq-1']);
    assert.deepEqual(sent, ['api.deepseek.com Bearer deepseek-1', 'api.groq.com Bearer groq-1']);
    sent.length = 0;
    await assert.rejects(generateResilient({ ...row('deepseek', 'deepseek-1'), routing: 'fixed', alternatives: [row('deepseek', 'deepseek-2')] }, { system: 'Responda.', prompt: 'Oi' }), (error: Error & { kind?: string }) => {
      assert.equal(error.kind, 'billing');
      assert.equal(error.message, 'DeepSeek: sem saldo na API (402). Recarregue ou ative o faturamento no painel do provedor, ou use outra conexão.');
      assert.doesNotMatch(error.message, /private|Insufficient/);
      return true;
    });
    assert.equal(sent.length, 1, 'a reserva da mesma conta não é cobrada');
  } finally { globalThis.fetch = original; }
});

test('cota de uma empresa permite outra empresa em automático, sem repetir suas chaves', async () => {
  const seen: string[] = [];
  const result = await runAiAttempts([{provider:'a',key:'1'},{provider:'a',key:'2'},{provider:'b',key:'3'}], async candidate => {
    seen.push(candidate.key);
    if (candidate.provider === 'a') throw Object.assign(failed(429), {kind:'billing'});
    return 'ok';
  }, {persistent:true});
  assert.equal(result,'ok');assert.deepEqual(seen,['1','3']);
});
test('recusa conhecida de uma chave Gemini permite a reserva mesmo com HTTP 400', async () => {
  let calls = 0;
  const result = await runAiAttempts([1,2], async key => { calls++; if (key === 1) throw Object.assign(failed(400), { kind: failureKind(400, { codes: ['API_KEY_INVALID'] }) }); return 'ok'; });
  assert.equal(result, 'ok'); assert.equal(calls, 2);
});
test('painel valida chave de reserva, prioridade, exclusão e diagnóstico sem dados da pessoa', () => {
  const base = { action: 'save_connection', id: null, provider: 'gemini', label: 'Reserva', enabled: false, position: 1, key: 'synthetic' };
  assert.equal(aiAdminAction.safeParse(base).success, true);
  for (const value of [{ position: 0 },{ position: 6 },{ label: '' },{ provider: 'unknown' },{ id: 'another-owner' }]) assert.equal(aiAdminAction.safeParse({ ...base, ...value }).success, false);
  assert.equal(aiAdminAction.safeParse({ action: 'test_live' }).success, true);
  assert.equal(aiAdminAction.safeParse({ action: 'models', provider: 'gemini', connection_id: '00000000-0000-4000-8000-000000000001' }).success, true);
  assert.equal(aiAdminAction.safeParse({ action: 'models', provider: 'gemini', connection_id: 'not-a-uuid' }).success, false);
});
