import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantAccess } from '../src/lib/assistant-access';

const secret = 'synthetic-assistant-secret-for-tests-only-123';
test('webhook stays disabled without a strong configured secret', () => {
  assert.equal(assistantAccess({}, null)?.status, 503);
  assert.equal(assistantAccess({ ASSISTANT_SECRET_TOKEN: 'short' }, 'Bearer short')?.status, 503);
});
test('webhook rejects missing, partial and incorrectly formatted credentials', () => {
  for (const value of [null, '', secret, `Bearer prefix${secret}`, `Bearer ${secret} suffix`, `Basic ${secret}`]) {
    assert.equal(assistantAccess({ ASSISTANT_SECRET_TOKEN: secret }, value)?.status, 401);
  }
  assert.equal(assistantAccess({ ASSISTANT_SECRET_TOKEN: secret }, `Bearer ${secret}`), null);
});
test('demo rejects even correctly authenticated webhook requests', () => {
  assert.equal(assistantAccess({ APP_MODE: 'demo', ASSISTANT_SECRET_TOKEN: secret }, `Bearer ${secret}`)?.status, 404);
});
