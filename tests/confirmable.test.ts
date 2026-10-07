import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmPending, confirmRequest, confirmSummary, isConfirmable, type ConfirmablePending } from '../src/lib/confirmable';
import { waitingRequests } from '../src/lib/assistant-jobs';

const ID = '00000000-0000-4000-8000-0000000000c1';
const deletion = (fn: 'delete_post' | 'delete_poll' | 'delete_assignment' | 'delete_part' | 'delete_contact', label: string): ConfirmablePending =>
  ({ action: { type: 'excluir_coletivo', fn, target: ID }, fingerprint: '{}', label });
const admin = (request: unknown, label: string) => ({ action: { type: 'administrar', request }, fingerprint: '{}', label }) as ConfirmablePending;
const plan = { url: '/api/admin', body: { action: 'update_account', account: ID, plan: 'pro', source: 'courtesy', pro_until: '2026-12-31', credits: 100, features: ['ai'], master: false } };
const route = { url: '/api/ai/admin', body: { action: 'save_route', task: 'assistente', provider: 'groq', connection_id: null, model: 'auto:rapido', enabled: true, routing_mode: 'auto', fallbacks: [] } };

test('exclusões coletivas confirmadas usam a rota da tela de cada item', () => {
  assert.deepEqual(confirmRequest(deletion('delete_post', 'x').action), { url: '/api/spaces', body: { action: 'delete_post', post: ID } });
  assert.deepEqual(confirmRequest(deletion('delete_part', 'x').action), { url: '/api/work', body: { action: 'delete_part', part: ID } });
  assert.deepEqual(confirmRequest(deletion('delete_contact', 'x').action), { url: '/api/contacts', body: { action: 'delete', contact: ID } });
  assert.equal(isConfirmable(deletion('delete_poll', 'x')), true);
  assert.equal(isConfirmable({ action: { type: 'excluir' } }), false);
  assert.equal(isConfirmable({ action: { type: 'excluir_coletivo', fn: 'remove_member' } as never }), false, 'tirar pessoa nunca vira pedido confirmável');
});

test('administração: só os formatos do painel na lista são reexecutados', () => {
  assert.equal(isConfirmable(admin(plan, 'x')), true);
  assert.equal(isConfirmable(admin(route, 'x')), true);
  assert.deepEqual(confirmRequest(admin(plan, 'x').action), plan);
  for (const forbidden of [
    { url: '/api/ai/admin', body: { action: 'save_provider', provider: 'groq', enabled: true, label: '', key: 'gsk_segredo' } },
    { url: '/api/ai/admin', body: { ...route.body, fallbacks: [{ connection_id: ID, model: 'x' }] } },
    { url: '/api/ai/admin', body: { ...route.body, connection_id: ID } },
    { url: '/api/spaces', body: { action: 'set_role', space: ID, member: ID, role: 'owner' } },
    { url: '/api/admin', body: { ...plan.body, plan: 'gratis' } },
    { url: 'https://example.invalid/api/admin', body: plan.body },
  ]) assert.equal(isConfirmable(admin(forbidden, 'x')), false, JSON.stringify(forbidden));
  assert.throws(() => confirmRequest(admin({ url: '/api/ai/admin', body: { action: 'remove_provider', provider: 'groq' } }, 'x').action));
});

test('a confirmação relata o que a tela aceitou e o motivo do que recusou', async () => {
  const calls: string[] = [];
  const outcome = await confirmPending([deletion('delete_post', 'Excluir publicação: Prova (Grupo 1)'), deletion('delete_assignment', 'Excluir trabalho: TCC (Turma A)'),
    admin(plan, 'Conta de Ana: plano Pro')], async (url, body) => { calls.push(`${url}:${body.action}`); return url === '/api/work' ? { ok: false, error: 'Você não tem permissão para isso.' } : { ok: true }; });
  assert.deepEqual(calls, ['/api/spaces:delete_post', '/api/work:delete_assignment', '/api/admin:update_account']);
  assert.equal(confirmSummary(outcome), 'Excluído: publicação: Prova (Grupo 1). Feito: Conta de Ana: plano Pro. Não consegui: trabalho: TCC (Turma A): Você não tem permissão para isso.');
  const offline = await confirmPending([deletion('delete_poll', 'Excluir enquete: Data (Grupo 2)')], async () => { throw new Error('rede'); });
  assert.deepEqual(offline.failed, ['enquete: Data (Grupo 2): sem conexão']);
});

test('Meu dia mostra o pedido com o texto do banco', () => {
  const waiting = waitingRequests([{ id: 'j1', conversation_id: 'c1', status: 'needs_confirmation', created_at: '2026-10-07T10:00:00Z',
    result: { saved: true, reply: '', applied: [], failed: [], pending: [deletion('delete_post', 'Excluir publicação: Prova (Grupo 1)')] } }]);
  assert.deepEqual(waiting, [{ id: 'j1', conversationId: 'c1', requestedAt: '2026-10-07T10:00:00Z', summary: 'Excluir publicação: Prova (Grupo 1)', more: 0 }]);
});
