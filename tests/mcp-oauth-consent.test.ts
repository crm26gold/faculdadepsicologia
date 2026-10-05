import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OAuthConsent } from '../src/components/oauth-consent';
import { consentIdentity } from '../src/lib/mcp/oauth-input';

test('OAuth consent: self-declared app name is shown with actual origin and an explicit identity warning', () => {
  const request = { client_id: 'jpc_test_01234567890123456789', redirect_uri: 'https://chatgpt.com.evil.example/callback?flow=mcp', code_challenge: 'A'.repeat(43), write: false };
  const html = renderToStaticMarkup(createElement(OAuthConsent, { problem: '', clientName: 'ChatGPT', identity: consentIdentity(request.redirect_uri), request }));
  assert.ok(html.includes('<strong>ChatGPT</strong>'));
  assert.ok(html.includes('https://chatgpt.com.evil.example'));
  assert.ok(html.includes(request.redirect_uri));
  assert.ok(html.includes('não comprova sua identidade'));
  assert.ok(html.includes('Verificando sua conta'));
  assert.ok(!html.includes('Permitir acesso'), 'authorization is unavailable until the signed-in account is checked');
});
test('OAuth consent: invalid registration has no app identity or authorization controls', () => {
  const html = renderToStaticMarkup(createElement(OAuthConsent, { problem: 'Aplicativo inválido.', clientName: 'ChatGPT', identity: { origin: 'https://evil.example', address: 'https://evil.example/cb' }, request: { client_id: '', redirect_uri: '', code_challenge: '', write: false } }));
  assert.ok(html.includes('role="alert"'));
  assert.ok(!html.includes('evil.example') && !html.includes('Permitir acesso'));
});
