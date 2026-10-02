import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botIntent, botReply, todayIn } from '../src/lib/bot/core';

test('comandos do robô: vincular, ajuda, desfazer, sair e texto livre', () => {
  assert.deepEqual(botIntent('/start ab12cd34'), { kind: 'link', code: 'AB12CD34' });
  assert.deepEqual(botIntent('/start'), { kind: 'start' });
  assert.deepEqual(botIntent('/start@JornadaBot'), { kind: 'start' });
  assert.deepEqual(botIntent('Desfazer!'), { kind: 'undo' });
  assert.deepEqual(botIntent('desfaça'), { kind: 'undo' });
  assert.deepEqual(botIntent('/ajuda'), { kind: 'help' });
  assert.deepEqual(botIntent('/sair'), { kind: 'unlink' });
  assert.deepEqual(botIntent('  gastei 50 de lanche  '), { kind: 'text', text: 'gastei 50 de lanche' });
});

test('o dia é o do Brasil, não o do servidor', () => {
  assert.equal(todayIn('America/Sao_Paulo', new Date('2026-10-03T02:30:00Z')), '2026-10-02');
  assert.equal(todayIn('America/Sao_Paulo', new Date('2026-10-03T03:30:00Z')), '2026-10-03');
});

test('a resposta lista o que foi feito e lembra do desfazer', () => {
  const text = botReply('Anotei!', [{ label: 'Saída: Lanche · R$ 50,00 (Imediata)', view: 'finances', undo: { kind: 'transactions', id: 'x' } }], []);
  assert.equal(text, 'Anotei!\n\n✅ Saída: Lanche · R$ 50,00 (Imediata)\n\nEscreva "desfazer" para voltar.');
  assert.equal(botReply('Seu saldo é R$ 10,00.', [], []), 'Seu saldo é R$ 10,00.');
  assert.match(botReply('Feito.', [], ['valor ausente']), /⚠️ Não consegui: valor ausente\./);
});
