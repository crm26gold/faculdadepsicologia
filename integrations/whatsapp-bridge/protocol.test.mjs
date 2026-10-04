import test from 'node:test';
import assert from 'node:assert/strict';
import { validConfig, privatePeer, linkCode, speechText, canRetryDelivery } from './protocol.mjs';
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
