import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { aiAdminAction, aiCatalog, aiProviderIds } from '../src/lib/ai/catalog';

test('o cofre cifra, abre e recusa segredo errado ou ausente', async () => {
  process.env.AI_KEYS_SECRET = randomBytes(32).toString('base64');
  const { aiSecretReady, keyHint, openKey, sealKey } = await import('../src/lib/ai/vault');
  assert.equal(aiSecretReady(), true);
  const sealed = sealKey('sk-teste-1234');
  assert.match(sealed, /^v1\.[^.]+\.[^.]+\.[^.]+$/);
  assert.ok(!sealed.includes('sk-teste'));
  assert.notEqual(sealKey('sk-teste-1234'), sealed);
  assert.equal(openKey(sealed), 'sk-teste-1234');
  assert.equal(keyHint('sk-teste-1234'), '1234');
  assert.equal(keyHint('{"client_email":"x"}'), 'JSON');
  const tampered = sealed.slice(0, -4) + (sealed.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.throws(() => openKey(tampered));
  process.env.AI_KEYS_SECRET = randomBytes(32).toString('base64');
  assert.throws(() => openKey(sealed));
  process.env.AI_KEYS_SECRET = 'curto';
  assert.equal(aiSecretReady(), false);
  assert.throws(() => sealKey('x'), /Segredo/);
});

test('o painel só aceita provedores, tarefas e endereços seguros', () => {
  assert.deepEqual(Object.keys(aiCatalog).sort(), [...aiProviderIds].sort());
  const save = { action: 'save_provider', provider: 'compatible', enabled: true, label: '', gcp_project: '', gcp_location: '', key: null };
  assert.equal(aiAdminAction.safeParse({ ...save, base_url: 'https://api.groq.com/openai/v1' }).success, true);
  assert.equal(aiAdminAction.safeParse({ ...save, base_url: '' }).success, true);
  for (const base_url of ['http://api.exemplo.com', 'javascript:alert(1)', 'https://com espaço']) assert.equal(aiAdminAction.safeParse({ ...save, base_url }).success, false);
  assert.equal(aiAdminAction.safeParse({ ...save, base_url: '', provider: 'desconhecido' }).success, false);
  assert.equal(aiAdminAction.safeParse({ action: 'save_task', task: 'assistente', provider: '', model: '', enabled: false }).success, true);
  assert.equal(aiAdminAction.safeParse({ action: 'save_task', task: 'outra', provider: 'gemini', model: 'x', enabled: true }).success, false);
  assert.equal(aiAdminAction.safeParse({ action: 'test', provider: 'gemini', model: '' }).success, false);
});
