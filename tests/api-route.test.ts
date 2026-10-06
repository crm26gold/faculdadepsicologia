import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const empty = pathToFileURL(`${process.cwd()}/node_modules/server-only/empty.js`).href;
registerHooks({ resolve: (specifier, context, next) => specifier === 'server-only' ? { url: empty, shortCircuit: true } : next(specifier, context) });

test('toda resposta 503 leva um código de referência; o log guarda só a referência e o código do erro', async () => {
  const { dbError, reply } = await import('../src/lib/api-route');
  const original = console.warn; const logs: unknown[][] = [];
  console.warn = (...args: unknown[]) => { logs.push(args); };
  try {
    const failure = { code: 'PGRST000', message: 'private row content', details: 'private detail' };
    const response = dbError(failure);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const body = await response.json();
    assert.match(body.reference, /^[0-9a-f]{8}$/);
    assert.equal(body.error, `Não foi possível concluir agora. Tente novamente. Código de referência: ${body.reference}.`);
    assert.deepEqual(logs, [['[api]', { reference: body.reference, status: 503, code: 'PGRST000' }]]);
    assert.doesNotMatch(JSON.stringify([body, logs]), /private/);

    const other = await dbError(null).json();
    assert.notEqual(other.reference, body.reference);
    const generic = await reply({ error: 'O cofre de chaves não está disponível no servidor.' }, 503).json();
    assert.equal(generic.error, `O cofre de chaves não está disponível no servidor. Código de referência: ${generic.reference}.`);
    // A code with an unexpected shape could carry content: it is not logged.
    await dbError({ code: 'text with personal data' }).json();
    assert.deepEqual(logs.slice(1).map(entry => (entry[1] as { code: string }).code), ['none', 'none', 'none']);

    logs.length = 0;
    const known = await dbError({ code: '40001' }).json();
    assert.equal(known.reference, undefined);
    assert.equal((await reply({ ok: true }).json()).reference, undefined);
    assert.equal(logs.length, 0, 'só o 503 gera referência e log');
  } finally { console.warn = original; }
});
