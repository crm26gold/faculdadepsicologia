import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationKey, legacyConversations, mergeConversations, newConversation, parseConversation, sortConversations } from '../src/lib/conversations';

test('histórico longo e cópias antigas permanecem completos; contas têm chaves distintas', () => {
  const messages = Array.from({ length: 1250 }, (_, i) => ({ id: `msg-${i}`, from: 'me', text: `Mensagem ${i}` }));
  const recovered = legacyConversations(messages, []);
  assert.equal(recovered[0].messages.length, 1250);
  assert.equal(parseConversation(recovered[0])?.messages.at(-1)?.text, 'Mensagem 1249');
  assert.notEqual(conversationKey('conta-a'), conversationKey('conta-b'));
  assert.notEqual(conversationKey(), conversationKey('conta-a'));
});
test('alterações offline divergentes ficam em cópia própria sem apagar a versão da conta', () => {
  const local = { ...newConversation(true), revision: 3, dirty: true, title: 'Relato original', messages: [{ id: '1', from: 'me' as const, text: 'Pão sem preço individual' }] };
  const remote = { ...local, revision: 4, dirty: false, title: 'Nota conferida', messages: [{ id: '1', from: 'me' as const, text: 'Outro dado da conta' }] };
  const result = mergeConversations({ activeId: local.id, items: [local] }, [remote]);
  assert.equal(result.conflicts, 1); assert.equal(result.library.items.length, 2);
  const copy = result.library.items.find(item => !item.synced)!;
  assert.equal(copy.messages[0].text, 'Pão sem preço individual'); assert.equal(copy.id, result.library.activeId);
  assert.equal(result.library.items.find(item => item.synced)?.title, 'Nota conferida');
});
test('sincronização não troca edição local por resposta antiga ou edição da mesma revisão', () => {
  const local = { ...newConversation(true), revision: 5, dirty: true, title: 'Edição offline' };
  const old = { ...local, revision: 4, title: 'Antigo', dirty: false };
  for (const remote of [old, { ...old, revision: 5 }]) {
    const result = mergeConversations({ activeId: local.id, items: [local] }, [remote]);
    assert.equal(result.library.items[0].title, 'Edição offline'); assert.equal(result.conflicts, 0);
  }
});
test('busca encontra mensagens sem exigir acentos e fixadas vêm primeiro', () => {
  const a = { ...newConversation(), title: 'Mercado', messages: [{ id: 'a', from: 'me' as const, text: 'Pão e iogurte' }] };
  const b = { ...newConversation(), title: 'Reunião', pinned: true };
  assert.equal(sortConversations([a, b], 'pao')[0].id, a.id);
  assert.equal(sortConversations([a, b])[0].id, b.id);
});
