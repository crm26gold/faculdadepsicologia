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

test('robôs agem como a pessoa da conversa e guardam exclusões para confirmar no app', async () => {
  const { botHome, botShared, splitShared } = await import('../src/lib/bot/shared');
  const db = fakeDb();
  const split = splitShared([{ type: 'anotacao', text: 'x' }, { type: 'coletivo', area: 'salas', acao: { action: 'create_post', space: SPACE, kind: 'announcement', title: 'Prova' } },
    { type: 'coletivo', area: 'salas', acao: { action: 'delete_post', post: POST } }] as never);
  assert.equal(split.personal.length, 1);
  assert.equal(split.shared.length, 2);
  const out = await botShared(db, 'segredo', 'telegram', '555', split.shared);
  assert.deepEqual(db.calls.filter(call => call.fn === 'bot_act').map(call => [call.args.channel_id, call.args.chat, call.args.operation]),
    [['telegram', '555', 'create_post'], ['telegram', '555', 'describe']]);
  const stored = db.calls.find(call => call.fn === 'bot_store_confirmation')!;
  assert.equal(stored.args.outcome.pending[0].label, 'Excluir publicação: Aviso (Grupo 1)');
  assert.equal(stored.args.outcome.pending[0].action.type, 'excluir_coletivo');
  assert.equal(out.text, 'Feito: Publicado no mural: Prova. Guardei para você confirmar no aplicativo, em Meu dia: Excluir publicação: Aviso (Grupo 1).');
  assert.match(await botHome(db, 'segredo', 'whatsapp', '5511'), /Grupo 1 \(group, papel: leader, id 00000000-0000-4000-8000-0000000000b1\)/);
});

test('se o pedido não puder ser guardado, o robô diz que nada foi excluído', async () => {
  const { botShared } = await import('../src/lib/bot/shared');
  const out = await botShared(fakeDb({ storeFails: true }), 'segredo', 'whatsapp', '5511', [{ type: 'coletivo', area: 'salas', acao: { action: 'delete_post', post: POST } }]);
  assert.match(out.text, /^Não consegui: não consegui guardar o pedido de confirmação; nada foi excluído nem alterado\.$/);
  assert.doesNotMatch(out.text, /Guardei/);
});
