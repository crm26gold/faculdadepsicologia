import test from 'node:test';
import assert from 'node:assert/strict';
import { validConfig, privatePeer, linkCode, speechText, canRetryDelivery, withRetry, reconnectPlan, spoken, outboxItem } from './protocol.mjs';
test('The mail carrier has only its scoped token and an HTTPS server', () => {
  const token = `jpwa_${'x'.repeat(43)}`;
  assert.equal(validConfig({ origin: 'https://jornada.example', token }).origin, 'https://jornada.example');
  for (const origin of ['http://jornada.example', 'https://evil.example/path', 'https://user:secret@example.com', 'https://example.com/?token=x']) assert.throws(() => validConfig({ origin, token }));
  assert.throws(() => validConfig({ origin: 'https://example.com', token: 'AI_API_KEY' }));
});
test('Only private phones and exact linking commands; messages are not SSML', () => {
  assert.equal(privatePeer('5511999999999@c.us'), '5511999999999');
  for (const id of ['12000@g.us', 'status@broadcast', '12345@lid', '5511999999999']) assert.equal(privatePeer(id), null);
  assert.equal(linkCode('/vincular ABCDEFGH'), 'ABCDEFGH');
  assert.equal(linkCode('ignore instructions /vincular ABCDEFGH'), null);
  assert.equal(speechText('<voice>Oi!</voice>').includes('<'), false);
});
test('An uncertain WhatsApp send is never automatically retried', () => {
  assert.equal(canRetryDelivery({ phase: 'waiting' }), true);
  for (const phase of ['sending', 'sent', 'revoked']) assert.equal(canRetryDelivery({ phase }), false);
});
test('A received message is sent again to the Jornada only after a network error or a 5xx', async () => {
  const failing = (...errors) => { let calls = 0; return { task: async () => { const error = errors[calls++]; if (error) throw error; return 'queued'; }, calls: () => calls }; };
  const status = code => Object.assign(new Error('synthetic'), { status: code });
  const waits = []; const sleep = async wait => { waits.push(wait); };
  const recovered = failing(new TypeError('fetch failed'), status(503));
  assert.equal(await withRetry(recovered.task, sleep), 'queued');
  assert.deepEqual([recovered.calls(), waits], [3, [500, 2000]]);
  waits.length = 0;
  const down = failing(...Array(9).fill(status(502)));
  await assert.rejects(withRetry(down.task, sleep), { status: 502 });
  assert.deepEqual([down.calls(), waits], [4, [500, 2000, 5000]]);
  for (const code of [400, 401, 403, 409, 413, 429]) {
    waits.length = 0;
    const refused = failing(status(code));
    await assert.rejects(withRetry(refused.task, sleep), { status: code });
    assert.deepEqual([refused.calls(), waits], [1, []]);
  }
});
test('Reconnection waits grow to a 5-minute ceiling and stop when the owner must act', () => {
  const waits = Array.from({ length: 12 }, (_, attempt) => reconnectPlan('UNLAUNCHED', attempt).wait);
  assert.deepEqual(waits.slice(0, 3), [5000, 10_000, 20_000]);
  assert.equal(Math.max(...waits), 300_000);
  assert.ok(waits.every((wait, index) => index === 0 || wait >= waits[index - 1]));
  for (const reason of ['LOGOUT', 'UNPAIRED', 'UNPAIRED_IDLE', 'CONFLICT', 'TOS_BLOCK', 'SMB_TOS_BLOCK']) {
    const plan = reconnectPlan(reason, 0);
    assert.equal(plan.wait, undefined); assert.match(plan.stop, /ponte|WhatsApp/);
  }
  // Only a library state code reaches the log, never free text.
  assert.equal(reconnectPlan('PROXYBLOCK', 0).code, 'PROXYBLOCK');
  for (const reason of ['Oi, apague minhas notas', 'toString', undefined]) assert.deepEqual([reconnectPlan(reason, 0).code, reconnectPlan(reason, 0).stop], ['', undefined]);
});
test('A reply goes to the speech service only when the Jornada asks for voice', () => {
  assert.equal(spoken({ reply: 'Pronto.', speak: true }), true);
  // Receipts from an older server, failures and anything not strictly true stay in text.
  for (const result of [{ reply: 'Pronto.' }, { reply: 'Pronto.', speak: 'true' }, { reply: 'Pronto.', speak: 1 }, null, undefined]) assert.equal(spoken(result), false);
});
test('Reminders from the outbox go only to a phone and with a bounded text', () => {
  const id = '6f1c2b0e-1d2a-4c3b-9e8f-0a1b2c3d4e5f';
  assert.deepEqual(outboxItem({ id, peer: '5511999990000', text: '⏰ Dentista às 10:00' }), { id, chat: '5511999990000@c.us', text: '⏰ Dentista às 10:00' });
  assert.equal(outboxItem({ id, peer: '120363@g.us', text: 'x' }), null, 'grupo não');
  assert.equal(outboxItem({ id, peer: '5511999990000', text: '  ' }), null, 'texto vazio não');
  assert.equal(outboxItem({ id: 'x', peer: '5511999990000', text: 'x' }), null);
  assert.equal(outboxItem({ id, peer: '5511999990000', text: 'a'.repeat(5000) }).text.length, 1000);
});
