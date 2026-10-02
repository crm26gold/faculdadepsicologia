import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAuto, modelNote, pickModel, sortModels } from '../src/lib/ai/models';
import { conversationTurns } from '../src/lib/ai/turns';

const gemini = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.8-flash-001',
  'gemini-3.9-flash-preview', 'gemini-3.8-flash-tts', 'gemini-3.8-live', 'gemini-embedding-002', 'gemma-4-27b-it', 'nano-banana-2-lite', 'gemini-omni-1.1-flash'];

test('automático escolhe o mais novo estável da linha pedida', () => {
  assert.equal(pickModel('gemini', gemini, 'auto:rapido'), 'gemini-3.8-flash');
  assert.equal(pickModel('gemini', gemini, 'auto:economico'), 'gemini-3.5-flash-lite');
  assert.equal(pickModel('gemini', gemini, 'auto:melhor'), 'gemini-3.1-pro-preview');
  assert.equal(pickModel('gemini', [...gemini, 'gemini-3.6-pro'], 'auto:melhor'), 'gemini-3.6-pro');
  assert.equal(pickModel('openai', ['gpt-5.4', 'gpt-5.5', 'gpt-5.5-mini', 'gpt-5.5-nano', 'gpt-5.5-2026-08-01', 'gpt-realtime', 'whisper-1'], 'auto:melhor'), 'gpt-5.5');
  assert.equal(pickModel('openai', ['gpt-5.4-mini', 'gpt-5.5-mini'], 'auto:rapido'), 'gpt-5.5-mini');
  assert.equal(pickModel('anthropic', ['claude-haiku-4-5-20251001', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-4-1-20250805'], 'auto:melhor'), 'claude-opus-5-5');
  assert.equal(pickModel('anthropic', ['claude-haiku-4-5-20251001', 'claude-sonnet-5-5'], 'auto:economico'), 'claude-haiku-4-5-20251001');
  assert.equal(pickModel('gemini', ['gemini-embedding-002'], 'auto:rapido'), null);
});

test('lista mostra os modelos de texto primeiro, do mais novo ao mais antigo, sem voz, imagem e embeddings', () => {
  const sorted = sortModels('gemini', gemini);
  assert.deepEqual(sorted.slice(0, 4), ['gemini-3.9-flash-preview', 'gemini-3.8-flash', 'gemini-3.8-flash-001', 'gemini-3.5-flash']);
  assert.equal(sorted.includes('gemini-3.8-flash-tts'), false);
  assert.equal(sorted.includes('gemini-embedding-002'), false);
  assert.equal(modelNote('gemini', 'gemini-3.1-pro-preview'), 'mais forte · prévia');
  assert.equal(isAuto('auto:rapido'), true);
  assert.equal(isAuto('gemini-3.8-flash'), false);
});

test('histórico da conversa alterna pessoa e assistente, começando pela pessoa', () => {
  assert.deepEqual(conversationTurns([
    { role: 'assistant', text: 'Olá! Como posso ajudar?' },
    { role: 'user', text: 'Gastei 50 no lanche' },
    { role: 'assistant', text: 'Anotei R$ 50 em Alimentação.' },
    { role: 'assistant', text: '' },
  ], 'E quanto gastei hoje?'), [
    { role: 'user', text: 'Gastei 50 no lanche' },
    { role: 'assistant', text: 'Anotei R$ 50 em Alimentação.' },
    { role: 'user', text: 'E quanto gastei hoje?' },
  ]);
  assert.deepEqual(conversationTurns([{ role: 'user', text: 'oi' }], 'tudo bem?'), [{ role: 'user', text: 'oi\ntudo bem?' }]);
});
