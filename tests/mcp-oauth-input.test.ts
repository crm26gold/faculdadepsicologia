import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consentIdentity, oauthBody, oauthFields, OAuthInputError, registrationOriginHash, resourceAllowed } from '../src/lib/mcp/oauth-input';

const request = (body: string, type = 'application/x-www-form-urlencoded', headers: Record<string, string> = {}) => new Request('https://jornada.example/api/oauth/token', { method: 'POST', body, headers: { 'content-type': type, ...headers } });

test('OAuth: streamed body is bounded without trusting Content-Length', async () => {
  assert.equal(await oauthBody(request('á')), 'á');
  await assert.rejects(oauthBody(request('x'.repeat(9_000), 'application/json', { 'content-length': '1' })), error => error instanceof OAuthInputError && error.status === 413);
});
test('OAuth: token forms reject duplicate parameters, unsupported bodies and nested JSON', async () => {
  assert.equal((await oauthFields(request('grant_type=refresh_token&refresh_token=jpr_test'))).get('refresh_token'), 'jpr_test');
  assert.equal((await oauthFields(request('{"client_id":"client"}', 'application/json'))).get('client_id'), 'client');
  for (const body of [request('client_id=a&client_id=b'), request('{"client_id":{"value":"a"}}', 'application/json'), request('client_id=a', 'text/plain')]) await assert.rejects(oauthFields(body));
});
test('OAuth: consent uses the actual redirect origin even when client name impersonates a familiar app', () => {
  assert.deepEqual(consentIdentity('https://chatgpt.com.evil.example/callback'), { origin: 'https://chatgpt.com.evil.example', address: 'https://chatgpt.com.evil.example/callback' });
  assert.equal(consentIdentity('bad').origin, '');
});
test('OAuth: supplied resource is bound to this MCP server', () => {
  assert.ok(resourceAllowed('https://jornada.example/api/mcp', 'https://jornada.example'));
  assert.ok(resourceAllowed(undefined, 'https://jornada.example'));
  for (const value of ['https://other.example/api/mcp', 'https://jornada.example/api/mcp/', 'https://jornada.example/api/me']) assert.ok(!resourceAllowed(value, 'https://jornada.example'));
});
test('OAuth: rate-limit identity is keyed, contains no raw IP and ignores untrusted local headers', () => {
  const a = request('', undefined, { 'x-forwarded-for': '192.0.2.1' }), b = request('', undefined, { 'x-forwarded-for': '192.0.2.2' });
  assert.match(registrationOriginHash(a, 'secret', true), /^[a-f0-9]{64}$/);
  assert.notEqual(registrationOriginHash(a, 'secret', true), registrationOriginHash(b, 'secret', true));
  assert.equal(registrationOriginHash(a, 'secret', false), registrationOriginHash(b, 'secret', false));
  assert.notEqual(registrationOriginHash(a, 'secret', true), registrationOriginHash(a, 'another secret', true));
  const platform = request('', undefined, { 'x-vercel-forwarded-for': '192.0.2.1', 'x-forwarded-for': '198.51.100.99' });
  assert.equal(registrationOriginHash(platform, 'secret', true), registrationOriginHash(a, 'secret', true), 'the platform header takes precedence over proxy-modified XFF');
  assert.equal(registrationOriginHash(platform, 'secret', false), registrationOriginHash(a, 'secret', false));
});
