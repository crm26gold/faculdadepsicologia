import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applicationOrigin } from '../src/lib/auth-input';
import { authCookieOptions } from '../src/lib/auth-cookies';
import { demoAllowed, demoRequested, EXPECTED_SUPABASE_URL, EXPECTED_VERCEL_PROJECT_ID, isGoogleOwner, isOwnerIdentity, localPreviewAllowed, validConfiguration } from '../src/lib/config';

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const ownerEmail = 'owner@example.invalid';
const configured = {
  NEXT_PUBLIC_SUPABASE_URL: EXPECTED_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-test-key',
  APP_OWNER_USER_ID: ownerId, APP_OWNER_EMAIL: ownerEmail, GOOGLE_AUTH_ENABLED: 'true',
};
const googleIdentity = { provider: 'google', identity_data: { email: ownerEmail, email_verified: true } };
const owner = { id: ownerId, email: ownerEmail, identities: [googleIdentity] };

test('configuração privada exige Google explícito, e-mail, UUID, chave e projeto correto', () => {
  assert.equal(validConfiguration(configured), true);
  assert.equal(validConfiguration({ ...configured, VERCEL: '1', VERCEL_PROJECT_ID: EXPECTED_VERCEL_PROJECT_ID }), true);
  for (const key of Object.keys(configured)) {
    assert.equal(validConfiguration({ ...configured, [key]: '' }), false, key);
    assert.equal(validConfiguration({ ...configured, [key]: undefined }), false, key);
  }
  for (const override of [
    { GOOGLE_AUTH_ENABLED: 'false' }, { GOOGLE_AUTH_ENABLED: 'TRUE' },
    { APP_OWNER_USER_ID: 'unknown' }, { NEXT_PUBLIC_SUPABASE_URL: 'https://other.example.invalid' },
    { VERCEL: '1' }, { VERCEL: '1', VERCEL_PROJECT_ID: 'prj_unknown' }, { APP_MODE: 'demo' },
  ]) assert.equal(validConfiguration({ ...configured, ...override }), false, JSON.stringify(override));
});

test('somente o UUID configurado identifica o proprietário', () => {
  assert.equal(isOwnerIdentity(ownerId, configured), true);
  for (const id of [otherId, undefined, '', ownerEmail]) assert.equal(isOwnerIdentity(id, configured), false);
  assert.equal(isOwnerIdentity(ownerId, {}), false);
  assert.equal(isOwnerIdentity(ownerEmail, { APP_OWNER_USER_ID: ownerEmail }), false);
});

test('Google exige UUID, e-mail da conta e identidade Google verificada correspondentes', () => {
  assert.equal(isGoogleOwner(owner, configured), true);
  assert.equal(isGoogleOwner({ ...owner, email: ownerEmail.toUpperCase(), identities: [
    { ...googleIdentity, identity_data: { email: ownerEmail.toUpperCase(), email_verified: true } },
  ] }, { ...configured, APP_OWNER_EMAIL: ` ${ownerEmail.toUpperCase()} ` }), true);
  for (const user of [null, undefined, { ...owner, id: otherId }, { ...owner, email: undefined },
    { ...owner, email: 'other@example.invalid' }, { ...owner, identities: undefined },
    { ...owner, identities: [] }, { ...owner, identities: [{ ...googleIdentity, provider: 'email' }] },
    { ...owner, identities: [{ provider: 'google' }] },
  ]) assert.equal(isGoogleOwner(user, configured), false);
  for (const identity_data of [
    {}, { email: ownerEmail }, { email: ownerEmail, email_verified: false },
    { email: ownerEmail, email_verified: 'true' }, { email: ownerEmail, email_verified: 1 },
    { email_verified: true }, { email: 'other@example.invalid', email_verified: true },
  ]) assert.equal(isGoogleOwner({ ...owner, identities: [{ provider: 'google', identity_data }] }, configured), false);
  assert.equal(isGoogleOwner(owner, { ...configured, APP_OWNER_EMAIL: '' }), false);
  assert.equal(isGoogleOwner(owner, { ...configured, APP_OWNER_USER_ID: otherId }), false);
});

test('identidades diferentes não combinam provedor Google e verificação de outra conta', () => {
  assert.equal(isGoogleOwner({ ...owner, identities: [
    { provider: 'google', identity_data: { email: ownerEmail, email_verified: false } },
    { provider: 'email', identity_data: { email: ownerEmail, email_verified: true } },
    { provider: 'google', identity_data: { email: 'other@example.invalid', email_verified: true } },
  ] }, configured), false);
  assert.equal(isGoogleOwner({ ...owner, identities: [{ provider: 'email' }, googleIdentity] }, configured), true);
});

test('demo exige APP_MODE exato e nunca habilita configuração privada ou prévia local', () => {
  assert.equal(demoRequested({ APP_MODE: 'demo' }), true);
  assert.equal(demoAllowed({ APP_MODE: 'demo' }), true);
  for (const APP_MODE of [undefined, '', 'private', 'DEMO', 'demo ']) {
    assert.equal(demoRequested({ APP_MODE }), false);
    assert.equal(demoAllowed({ APP_MODE }), false);
  }
  assert.equal(validConfiguration({ ...configured, APP_MODE: 'demo' }), false);
  assert.equal(localPreviewAllowed({ APP_MODE: 'demo', NODE_ENV: 'development', FACULDADE_LOCAL_PREVIEW: 'true' }), false);
});

test('demo rejeita cada credencial privada, mesmo no projeto autorizado', () => {
  const hostedDemo = { APP_MODE: 'demo', VERCEL: '1', DEMO_VERCEL_PROJECT_ID: 'prj_synthetic_demo', VERCEL_PROJECT_ID: 'prj_synthetic_demo' };
  for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN', 'APP_OWNER_USER_ID', 'APP_OWNER_EMAIL',
    'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_CLIENT_SECRET']) {
    assert.equal(demoAllowed({ APP_MODE: 'demo', [name]: 'synthetic-forbidden-value' }), false, name);
    assert.equal(demoAllowed({ ...hostedDemo, [name]: 'synthetic-forbidden-value' }), false, name);
    assert.equal(demoAllowed({ ...hostedDemo, [name]: '' }), true, name);
  }
});

test('demo na Vercel exige projeto fixado e diferente do privado', () => {
  const env = { APP_MODE: 'demo', VERCEL: '1', DEMO_VERCEL_PROJECT_ID: 'prj_synthetic_demo', VERCEL_PROJECT_ID: 'prj_synthetic_demo' };
  assert.equal(demoAllowed(env), true);
  for (const override of [
    { DEMO_VERCEL_PROJECT_ID: undefined }, { DEMO_VERCEL_PROJECT_ID: '' },
    { VERCEL_PROJECT_ID: undefined }, { VERCEL_PROJECT_ID: '' }, { VERCEL_PROJECT_ID: 'prj_unknown' },
    { DEMO_VERCEL_PROJECT_ID: EXPECTED_VERCEL_PROJECT_ID, VERCEL_PROJECT_ID: EXPECTED_VERCEL_PROJECT_ID },
  ]) assert.equal(demoAllowed({ ...env, ...override }), false);
});

test('prévia local nunca abre Vercel nem produção sem flag explícita', () => {
  assert.equal(localPreviewAllowed({ NODE_ENV: 'development' }), true);
  assert.equal(localPreviewAllowed({ NODE_ENV: 'production' }), false);
  assert.equal(localPreviewAllowed({ NODE_ENV: 'production', FACULDADE_LOCAL_PREVIEW: 'true' }), true);
  for (const NODE_ENV of ['development', 'production']) {
    assert.equal(localPreviewAllowed({ NODE_ENV, FACULDADE_LOCAL_PREVIEW: 'true', VERCEL: '1' }), false);
  }
});

test('origem usa somente configuração explícita e deployment do projeto correto', () => {
  const env = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: EXPECTED_VERCEL_PROJECT_ID, VERCEL_URL: 'faculdadepsicologia-abc123-faculpsi.vercel.app' };
  assert.equal(applicationOrigin(env), 'https://faculdadepsicologia-abc123-faculpsi.vercel.app');
  for (const VERCEL_URL of ['attacker.example.invalid', 'faculdadepsicologia-abc123-faculpsi.vercel.app.attacker.invalid', 'faculdadepsicologia-abc123-faculpsi.vercel.app/path']) {
    assert.equal(applicationOrigin({ ...env, VERCEL_URL }), null);
  }
  assert.equal(applicationOrigin({ ...env, VERCEL_PROJECT_ID: 'prj_unknown' }), null);
  assert.equal(applicationOrigin({ APP_ORIGIN: 'http://127.0.0.1:3002' }), 'http://127.0.0.1:3002');
  assert.equal(applicationOrigin({ APP_ORIGIN: 'https://app.example.invalid/' }), 'https://app.example.invalid');
  assert.equal(applicationOrigin({ VERCEL: '1', APP_ORIGIN: 'http://localhost:3000' }), null);
  assert.equal(applicationOrigin({}), null);
  for (const APP_ORIGIN of ['https://a.example.invalid/path', 'https://a.example.invalid?redirect=x', 'https://a.example.invalid#fragment', 'https://user:pass@a.example.invalid', 'javascript:alert(1)', 'http://external.example.invalid', 'invalid']) {
    assert.equal(applicationOrigin({ APP_ORIGIN }), null);
  }
});

test('cookies de autenticação são HttpOnly, limitados e seguros na hospedagem', () => {
  assert.deepEqual(authCookieOptions({ VERCEL: '1' }), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 604800,
  });
  assert.equal(authCookieOptions({ APP_ORIGIN: 'https://app.example.invalid' }).secure, true);
  assert.equal(authCookieOptions({ APP_ORIGIN: 'http://localhost:3002' }).secure, false);
});
