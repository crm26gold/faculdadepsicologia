import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureLink, readCaptureLink } from '../src/lib/capture-link';

const now = Date.parse('2026-10-07T15:00:00Z');

test('link de envio leva só o destino e a validade; vence em 10 minutos', () => {
  const url = new URL(captureLink('https://jornada.example', { kind: 'subject', id: 'ppb' }, now));
  assert.deepEqual([...url.searchParams.keys()], ['capturar', 'ate']);
  assert.deepEqual(readCaptureLink(url.search, now + 9 * 60_000), { place: { kind: 'subject', id: 'ppb' } });
  assert.deepEqual(readCaptureLink(url.search, now + 11 * 60_000), { expired: true });
  assert.deepEqual(readCaptureLink('?capturar=notebook:x&ate=99999999999999', now), { expired: true }, 'validade muito longa não vale');
  assert.deepEqual(readCaptureLink('?capturar=qualquer', now), { expired: true });
  assert.deepEqual(readCaptureLink('?capturar=lixo:&ate=' + (now + 60_000), now), { place: { kind: 'inbox' } }, 'destino estranho vira Para organizar');
  assert.equal(readCaptureLink('?outra=1', now), null);
});
