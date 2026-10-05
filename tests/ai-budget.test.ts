import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('orçamento da Jornada explica a espera e interrompe a reserva sem culpar a API', () => {
  const budgetUrl = new URL('../src/lib/ai/budget.ts', import.meta.url).href;
  const attemptsUrl = new URL('../src/lib/ai/attempts.ts', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import * as budget from ${JSON.stringify(budgetUrl)};
    import { runAiAttempts } from ${JSON.stringify(attemptsUrl)};
    process.env.AI_KEYS_SECRET = Buffer.alloc(32, 7).toString('base64');
    globalThis.fetch = async () => { throw new Error('Unexpected external call'); };
    function session(data, scope = 'live') {
      const calls = [];
      return { calls, client: { rpc: async (name, params) => {
        calls.push({ name, params });
        assert.equal(name, 'app_consume_jornada_budget');
        assert.equal(params.budget_scope, scope);
        assert.equal(params.budget_units, 1);
        assert.equal(typeof params.server_secret, 'string');
        return { data, error: null };
      } } };
    }
    const shared = session({ allowed: false, limited_by: 'application', retry_after: 2130 });
    const response = await budget.requestBudget(shared, 'live');
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('Retry-After'), '2130');
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const body = await response.json();
    assert.match(body.error, /aproximadamente 36 minutos/);
    assert.equal(body.code, 'jornada_budget_exceeded');
    assert.equal(body.scope, 'live');
    assert.equal(body.limitedBy, 'application');
    assert.equal(body.retryAfter, 2130);
    assert.match(body.error, /limite de uso da Jornada/);
    assert.match(body.error, /testes de conexão e tentativas de chamada/);
    assert.doesNotMatch(body.error, /Gemini|OpenAI|Grok|Groq|créditos/);
    assert.equal(shared.calls.length, 1);

    const personal = await budget.requestBudget(session({ allowed: false, limited_by: 'account', retry_after: 13 }), 'live');
    const personalBody = await personal.json();
    assert.equal(personalBody.limitedBy, 'account');
    assert.match(personalBody.error, /aproximadamente 13 segundos/);
    assert.doesNotMatch(personalBody.error, /limite de uso da Jornada/);

    const textLimit = await budget.requestBudget(session({ allowed: false, limited_by: 'application', retry_after: 60 }, 'ai'), 'ai');
    const textBody = await textLimit.json();
    assert.equal(textBody.scope, 'ai');
    assert.match(textBody.error, /aproximadamente 1 minuto/);
    assert.doesNotMatch(textBody.error, /testes de conexão e tentativas de chamada/);

    const window = await budget.requestBudget(session({ allowed: false, limited_by: 'application', retry_after: 172800 }), 'live');
    assert.equal(window.headers.get('Retry-After'), '172800');
    const windowBody = await window.json();
    assert.equal(windowBody.retryAfter, 172800);
    assert.match(windowBody.error, /aproximadamente 2 dias/);
    const longWindow = await budget.requestBudget(session({ allowed: false, limited_by: 'application', retry_after: 90061 }), 'live');
    assert.equal(longWindow.headers.get('Retry-After'), '90061');assert.equal((await longWindow.json()).retryAfter,90061);
    for (const invalid of [undefined, 0, -1, 'invalid', Infinity]) {
      const denied = await budget.requestBudget(session({ allowed: false, limited_by: 'application', retry_after: invalid }), 'live');
      assert.equal(denied.headers.get('Retry-After'), '60');
      assert.equal((await denied.json()).retryAfter, 60);
    }
    assert.equal(await budget.requestBudget(session({ allowed: true }), 'live'), null);

    let attempts = 0;
    const retrySession = session({ allowed: false, limited_by: 'application', retry_after: 90 });
    await assert.rejects(runAiAttempts(['primary', 'reserve'], async () => {
      attempts++; throw Object.assign(new Error('Synthetic unavailable provider'), { status: 503 });
    }, { beforeRetry: budget.retryBudget(retrySession, 'live') }), asyncCause => {
      assert(asyncCause instanceof budget.BudgetLimitError);
      assert.equal(asyncCause.status, 429);
      assert.equal(asyncCause.retryAfter, 90);
      assert.match(asyncCause.message, /limite de uso da Jornada/);
      assert.doesNotMatch(asyncCause.message, /Gemini|OpenAI|cota da API/);
      assert.equal(asyncCause.response.status, 429);
      assert.equal(asyncCause.response.headers.get('Retry-After'), '90');
      assert.equal(asyncCause.response.bodyUsed, false);
      return true;
    });
    assert.equal(attempts, 1);
    assert.equal(retrySession.calls.length, 1);
    for (const limitedBy of ['application', 'account']) {
      try { await budget.retryBudget(session({ allowed: false, limited_by: limitedBy, retry_after: 90 }), 'live')(); assert.fail('Budget should deny retry'); }
      catch (error) {
        assert(error instanceof budget.BudgetLimitError);
        assert.equal((await error.response.json()).limitedBy, limitedBy);
      }
    }
    const sourceCalls = [];
    const sourceSession = { client: { rpc: async (name, params) => {
      assert.equal(name, 'app_consume_jornada_budget_source'); sourceCalls.push(params.credential_source);
      return {data:params.credential_source === 'personal' ? {allowed:true} : {allowed:false,limited_by:'application',retry_after:90},error:null};
    } } };
    let sourceAttempts = 0;
    await assert.rejects(runAiAttempts([{source:'personal'},{source:'base'}], async () => {sourceAttempts++; throw Object.assign(new Error('unavailable'),{status:503});},
      {persistent:true,beforeAttempt:budget.beforeAttemptBudget(sourceSession,'ai')}), error => error instanceof budget.BudgetLimitError && error.status === 429);
    assert.deepEqual(sourceCalls,['personal','base']);assert.equal(sourceAttempts,1);
    const noMigration = {client:{rpc:async(name)=>({data:null,error:{code:'PGRST202'}})}};
    assert.equal((await budget.requestBudget(noMigration,'ai',1,'personal')).status,503);
    delete process.env.AI_KEYS_SECRET;
    const unavailable = session({ allowed: true });
    assert.equal((await budget.requestBudget(unavailable, 'live')).status, 503);
    assert.equal(unavailable.calls.length, 0);
    await assert.rejects(budget.retryBudget(unavailable, 'live'), error => error.status === 503 && error instanceof budget.BudgetLimitError && error.doNotRetry);
  `;
  const child = spawnSync(process.execPath, ['--conditions=react-server', '--import', 'tsx', '--input-type=module', '-e', script],
    { encoding: 'utf8', timeout: 30_000 });
  assert.equal(child.status, 0, child.stderr || child.error?.message || child.stdout);
});
