import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const empty = pathToFileURL(`${process.cwd()}/node_modules/server-only/empty.js`).href;
registerHooks({ resolve: (specifier, context, next) => specifier === 'server-only' ? { url: empty, shortCircuit: true } : next(specifier, context) });

const SPACE = '00000000-0000-4000-8000-0000000000b1', POST = '00000000-0000-4000-8000-0000000000c1', ANA = '00000000-0000-4000-8000-0000000000d1';
function client(replies: Record<string, { data: unknown; error: { code?: string } | null }> = {}) {
  const calls: { fn: string; args?: Record<string, unknown> }[] = [];
  return { calls, rpc: async (fn: string, args?: Record<string, unknown>) => { calls.push({ fn, args }); return replies[fn] ?? { data: null, error: null }; } };
}

test('com o login da pessoa, cada pedido vira a mesma função da tela; exclusão e administração viram pedidos', async () => {
  const { runSharedCommands, sessionTransport } = await import('../src/lib/shared-actions');
  const fake = client({
    create_post: { data: POST, error: null },
    assistant_describe: { data: { title: 'Aviso', where: 'Grupo 1' }, error: null },
    admin_overview: { data: { settings: { open_access: true }, accounts: [{ user_id: ANA, email: 'ana@example.invalid', display_name: 'Ana', is_master: true,
      plan: 'academic', plan_source: 'free', pro_until: null, ai_credits: 0, features: [] }] }, error: null },
  });
  const result = await runSharedCommands(sessionTransport(fake), [
    { area: 'salas', acao: { action: 'create_post', space: SPACE, kind: 'announcement', title: 'Prova sexta' } },
    { area: 'salas', acao: { action: 'delete_post', post: POST } },
    { area: 'salas', acao: { action: 'set_role', space: SPACE, member: ANA, role: 'owner' } },
    { area: 'salas', acao: { action: 'add_member', space: SPACE, email: 'x@example.invalid', role: 'teacher' } },
    { area: 'administracao', acao: { action: 'atualizar_conta', account: ANA, credits: 50 } },
  ], 'https://jornada.example');
  assert.deepEqual(fake.calls.map(call => call.fn), ['create_post', 'assistant_describe', 'admin_overview'], 'só funções permitidas chegam ao banco');
  assert.deepEqual(fake.calls[0].args, { target: SPACE, post_kind: 'announcement', post_title: 'Prova sexta', post_body: '', post_link: '', post_date: null, post_pinned: false });
  assert.deepEqual(fake.calls[1].args, { kind: 'post', target: POST });
  assert.deepEqual(result.done, ['Publicado no mural: Prova sexta']);
  assert.deepEqual(result.pending.map(item => item.label), ['Excluir publicação: Aviso (Grupo 1)', 'Conta de Ana (ana@example.invalid): plano Acadêmico, gratuito, 50 créditos, recursos: nenhum']);
  const admin = result.pending[1].action as { request: { body: { master: boolean } } };
  assert.equal(admin.request.body.master, true, 'master permanece como está na conta');
  assert.equal(result.failed.length, 2, 'mudar papel e dar papel de professor são recusados');
});

test('negativas do banco viram mensagens claras, e a administração fala só com o administrador', async () => {
  const { runSharedCommands, readShared, sessionTransport } = await import('../src/lib/shared-actions');
  const denied = client({ create_poll: { data: null, error: { code: '42501' } }, admin_overview: { data: null, error: { code: '42501' } } });
  const result = await runSharedCommands(sessionTransport(denied), [
    { area: 'salas', acao: { action: 'create_poll', space: SPACE, question: 'Quando?', options: ['Seg', 'Ter'] } },
    { area: 'administracao', acao: { action: 'acesso_livre', value: false } },
  ], null);
  assert.match(result.failed[0], /^Sem permissão/);
  assert.match(result.failed[1], /^Só o administrador geral/);
  const read = await readShared(sessionTransport(denied), 'contas');
  assert.deepEqual(read, { error: 'Só o administrador geral consulta e altera a administração.' });
  const renamed = client();
  const account = await runSharedCommands(sessionTransport(renamed), [{ area: 'conta', acao: { action: 'rename', name: '  Ana Souza ' } },
    { area: 'conta', acao: { action: 'delete_account' } }], null);
  assert.deepEqual(renamed.calls, [{ fn: 'update_my_name', args: { new_name: 'Ana Souza' } }], 'excluir a conta nunca passa pelo assistente');
  assert.deepEqual([account.done, account.failed.length], [['Nome exibido: Ana Souza'], 1]);
  const invite = client({ create_invitation: { data: 'inv-1', error: null } });
  const created = await runSharedCommands(sessionTransport(invite), [{ area: 'salas', acao: { action: 'create_invitation', space: SPACE, role: 'student', days: 7, uses: 30 } }], 'https://jornada.example');
  assert.match(created.done[0], /^Convite criado \(aluno, 7 dias, até 30 usos\): https:\/\/jornada\.example\/convite\/[A-Za-z0-9_-]{32}$/);
  assert.match(String(invite.calls[0].args?.hashed_token), /^[a-f0-9]{64}$/, 'o banco recebe só o hash do link');
});
