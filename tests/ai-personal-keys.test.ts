import test from 'node:test';
import assert from 'node:assert/strict';
import { aiMyKeyAction, aiAdminAction, personalProviderIds } from '../src/lib/ai/catalog';

test('chaves pessoais usam empresas explícitas e não permitem selecionar outra pessoa', () => {
  for (const provider of personalProviderIds) assert(aiMyKeyAction.safeParse({ action: 'save', provider, key: 'synthetic-key', enabled: true, privacy_basis: 'paid' }).success);
  for (const provider of ['elevenlabs', 'compatible', 'vertex', 'google_cloud']) assert(!aiMyKeyAction.safeParse({ action: 'save', provider, key: 'synthetic-key', enabled: true }).success);
  const action = aiMyKeyAction.parse({ action: 'remove', provider: 'groq', user_id: 'another-account' });
  assert.equal('user_id' in action, false);
  assert(!aiMyKeyAction.safeParse({ action: 'save', provider: 'openai', key: ' ', enabled: true }).success);
});

test('Gemini pessoal só liga com declaração de faturamento pago e uma chave desconhecida pode ser guardada pausada', () => {
  const key = { action:'save',provider:'gemini',key:'synthetic-key' };
  assert(!aiMyKeyAction.safeParse({...key,enabled:true,privacy_basis:'no_training'}).success);
  assert(!aiMyKeyAction.safeParse({...key,enabled:true,privacy_basis:null}).success);
  assert(aiMyKeyAction.safeParse({...key,enabled:false,privacy_basis:null}).success);
  assert(aiMyKeyAction.safeParse({...key,enabled:true,privacy_basis:'paid'}).success);
  assert(aiMyKeyAction.safeParse({...key,provider:'groq',enabled:true,privacy_basis:'no_training'}).success);
});

test('remoção principal é explícita e aprovação de compartilhamento distingue privacidade', () => {
  assert(aiAdminAction.safeParse({ action: 'remove_provider', provider: 'groq' }).success);
  assert(!aiAdminAction.safeParse({ action: 'remove_provider', provider: 'unknown' }).success);
  assert(aiMyKeyAction.safeParse({ action: 'set_base_source', provider: 'gemini', connection_id: null, privacy_basis: 'paid' }).success);
  assert(!aiMyKeyAction.safeParse({ action: 'set_base_source', provider: 'gemini', connection_id: null, privacy_basis: 'free' }).success);
});
