import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectiveSummary, confirmCollective, deletionRequest, isCollectivePending, type CollectivePending } from '../src/lib/collective-deletions';
import { waitingRequests } from '../src/lib/assistant-jobs';

const item = (fn: CollectivePending['action']['fn'], label: string): CollectivePending => ({ action: { type: 'excluir_coletivo', fn, target: '00000000-0000-4000-8000-0000000000c1' }, fingerprint: '{}', label });

test('exclusões coletivas confirmadas usam a rota da tela de cada item', () => {
  assert.deepEqual(deletionRequest(item('delete_post', 'x').action), { url: '/api/spaces', body: { action: 'delete_post', post: '00000000-0000-4000-8000-0000000000c1' } });
  assert.deepEqual(deletionRequest(item('delete_part', 'x').action), { url: '/api/work', body: { action: 'delete_part', part: '00000000-0000-4000-8000-0000000000c1' } });
  assert.deepEqual(deletionRequest(item('delete_contact', 'x').action), { url: '/api/contacts', body: { action: 'delete', contact: '00000000-0000-4000-8000-0000000000c1' } });
  assert.equal(isCollectivePending(item('delete_poll', 'x')), true);
  assert.equal(isCollectivePending({ action: { type: 'excluir' } }), false);
  assert.equal(isCollectivePending({ action: { type: 'excluir_coletivo', fn: 'remove_member' } as never }), false, 'tirar pessoa nunca vira exclusão confirmável');
});

test('a confirmação relata o que a tela aceitou e o motivo do que recusou', async () => {
  const calls: string[] = [];
  const outcome = await confirmCollective([item('delete_post', 'Excluir publicação: Prova (Grupo 1)'), item('delete_assignment', 'Excluir trabalho: TCC (Turma A)')],
    async (url, body) => { calls.push(`${url}:${body.action}`); return url === '/api/work' ? { ok: false, error: 'Você não tem permissão para isso.' } : { ok: true }; });
  assert.deepEqual(calls, ['/api/spaces:delete_post', '/api/work:delete_assignment']);
  assert.equal(collectiveSummary(outcome), 'Excluído: publicação: Prova (Grupo 1). Não consegui excluir: trabalho: TCC (Turma A): Você não tem permissão para isso.');
  const offline = await confirmCollective([item('delete_poll', 'Excluir enquete: Data (Grupo 2)')], async () => { throw new Error('rede'); });
  assert.deepEqual(offline.failed, ['enquete: Data (Grupo 2): sem conexão']);
});

test('Meu dia mostra o pedido de exclusão coletiva com o texto do banco', () => {
  const waiting = waitingRequests([{ id: 'j1', conversation_id: 'c1', status: 'needs_confirmation', created_at: '2026-10-07T10:00:00Z',
    result: { saved: true, reply: '', applied: [], failed: [], pending: [item('delete_post', 'Excluir publicação: Prova (Grupo 1)')] } }]);
  assert.deepEqual(waiting, [{ id: 'j1', conversationId: 'c1', requestedAt: '2026-10-07T10:00:00Z', summary: 'Excluir publicação: Prova (Grupo 1)', more: 0 }]);
});
