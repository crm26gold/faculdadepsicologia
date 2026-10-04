import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeInput, confirmationIntent, freshMessage, validatedMedia, WA_MEDIA_LIMIT } from '../src/lib/whatsapp/protocol';
test('WhatsApp: only private peers, explicit formats and bounded inputs', () => {
  assert.equal(bridgeInput.safeParse({ action: 'check', peer: '12000@g.us' }).success, false);
  assert.equal(bridgeInput.safeParse({ action: 'message', peer: '5511999999999', message_id: '1', timestamp: 1, text: 'x', url: 'http://localhost/secret' }).success, false);
  assert.equal(bridgeInput.safeParse({ action: 'link', peer: '5511999999999', code: 'ABCDEFGH' }).success, true);
  assert.equal(bridgeInput.safeParse({ action: 'link', peer: '5511999999999', code: 'OOOO1111' }).success, false);
});
test('WhatsApp: file bytes must match allowed MIME; never run attachments', () => {
  const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)]).toString('base64');
  assert.equal(validatedMedia({ mimeType: 'audio/ogg; codecs=opus', base64: ogg })?.kind, 'audio');
  assert.throws(() => validatedMedia({ mimeType: 'image/png', base64: ogg }));
  assert.throws(() => validatedMedia({ mimeType: 'audio/ogg', base64: '%bad' }));
  assert.throws(() => validatedMedia({ mimeType: 'audio/ogg', base64: Buffer.alloc(WA_MEDIA_LIMIT + 1).toString('base64') }));
  assert.throws(() => validatedMedia({ mimeType: 'image/png', base64: Buffer.from('MZ malicious script or document').toString('base64') }));
});
test('WhatsApp: confirmation is an entire explicit command, not a model interpretation', () => {
  assert.equal(confirmationIntent('Confirmar 123 456.', '123456'), true);
  for (const input of ['não confirmar 123456', 'talvez confirmar 123456', 'confirmar 123456 e apagar tudo', 'confirmar 654321']) assert.equal(confirmationIntent(input, '123456'), false);
  const now = 1_000_000_000;
  assert.equal(freshMessage(now / 1000, now), true);
  assert.equal(freshMessage((now - 86_401_000) / 1000, now), false);
  assert.equal(freshMessage((now + 61_000) / 1000, now), false);
});
