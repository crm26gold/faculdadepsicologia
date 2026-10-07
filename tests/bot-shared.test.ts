import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const empty = pathToFileURL(`${process.cwd()}/node_modules/server-only/empty.js`).href;
registerHooks({ resolve: (specifier, context, next) => specifier === 'server-only' ? { url: empty, shortCircuit: true } : next(specifier, context) });

const SPACE = '00000000-0000-4000-8000-0000000000b1', POST = '00000000-0000-4000-8000-0000000000c1';
function fakeDb(options: { storeFails?: boolean } = {}) {
  const calls: { fn: string; args: Record<string, any> }[] = [];
  const rpc = async (fn: string, args: Record<string, any> = {}) => {
    calls.push({ fn, args });
    if (fn === 'bot_store_confirmation') return options.storeFails ? { data: null, error: { code: '22023' } } : { data: 'job-1', error: null };
    if (args.operation === 'describe') return { data: { title: 'Aviso', where: 'Grupo 1' }, error: null };
    if (args.operation === 'app_home') return { data: { spaces: [{ id: SPACE, kind: 'group', name: 'Grupo 1', my_role: 'leader', archived_at: null }] }, error: null };
    return { data: POST, error: null };
  };
  return { calls, rpc };
}
const personalDeletion = { action: { type: 'excluir', entity: 'compromisso', target: 'task-1' }, fingerprint: '{}', label: 'Excluir compromisso: Dentista (2026-10-08)' } as const;

test('robôs agem como a pessoa da conversa e guardam o que precisa de confirmação num só pedido', async () => {
  const { botHome, botShared, botSummary, splitShared, storeBotConfirmation } = await import('../src/lib/bot/shared');
  const db = fakeDb();
  const split = splitShared([{ type: 'anotacao', text: 'x' }, { type: 'coletivo', area: 'salas', acao: { action: 'create_post', space: SPACE, kind: 'announcement', title: 'Prova' } },
    { type: 'coletivo', area: 'salas', acao: { action: 'delete_post', post: POST } }] as never);
  assert.deepEqual([split.personal.length, split.shared.length], [1, 2]);
  const shared = await botShared(db, 'segredo', 'telegram', '555', split.shared);
  assert.deepEqual(db.calls.filter(call => call.fn === 'bot_act').map(call => [call.args.channel_id, call.args.chat, call.args.operation]),
    [['telegram', '555', 'create_post'], ['telegram', '555', 'describe']]);
  assert.equal(db.calls.some(call => call.fn === 'bot_store_confirmation'), false, 'executar nunca guarda sozinho');
  const waiting = [personalDeletion, ...shared.pending];
  assert.equal(await storeBotConfirmation(db, 'segredo', 'telegram', '555', waiting), true);
  const stored = db.calls.filter(call => call.fn === 'bot_store_confirmation');
  assert.equal(stored.length, 1, 'um pedido só no Meu dia');
  assert.deepEqual(stored[0].args.outcome.pending.map((item: { label: string }) => item.label), ['Excluir compromisso: Dentista (2026-10-08)', 'Excluir publicação: Aviso (Grupo 1)']);
  assert.equal(botSummary(shared, waiting, true),
    'Feito: Publicado no mural: Prova. Guardei para você confirmar no aplicativo, em Meu dia: Excluir compromisso: Dentista (2026-10-08); Excluir publicação: Aviso (Grupo 1).');
  assert.match(await botHome(db, 'segredo', 'whatsapp', '5511'), /Grupo 1 \(group, papel: leader, id 00000000-0000-4000-8000-0000000000b1\)/);
  assert.equal(await storeBotConfirmation(db, 'segredo', 'telegram', '555', []), true, 'nada a guardar não chama o banco');
  assert.equal(db.calls.filter(call => call.fn === 'bot_store_confirmation').length, 1);
});

test('se o pedido não puder ser guardado, o robô diz que nada foi excluído', async () => {
  const { botSummary, storeBotConfirmation } = await import('../src/lib/bot/shared');
  const stored = await storeBotConfirmation(fakeDb({ storeFails: true }), 'segredo', 'whatsapp', '5511', [personalDeletion]);
  assert.equal(stored, false);
  assert.equal(botSummary(null, [personalDeletion], stored), 'Não consegui guardar o pedido de confirmação; nada foi excluído nem alterado. Tente de novo.');
});
