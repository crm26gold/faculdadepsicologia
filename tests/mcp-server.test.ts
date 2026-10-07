import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { demoWorkspace, dateKey } from '../src/lib/workspace';

const empty = pathToFileURL(`${process.cwd()}/node_modules/server-only/empty.js`).href;
registerHooks({ resolve: (specifier, context, next) => specifier === 'server-only' ? { url: empty, shortCircuit: true } : next(specifier, context) });
process.env.AI_KEYS_SECRET ??= randomBytes(32).toString('base64');

function fakeDatabase(options: { canWrite: boolean }) {
  const state = { workspace: { data: demoWorkspace(dateKey()) as unknown, revision: 3 }, saves: 0, calls: [] as string[], pending: [] as unknown[], receipts: new Map<string, { digest: unknown; outcome: any }>(),
    acts: [] as { operation: string; args: any }[], actReply: { data: '00000000-0000-4000-8000-0000000000aa' as unknown, error: null as null | { code: string } } };
  const db = { rpc: async (name: string, args: Record<string, unknown>) => {
    state.calls.push(name);
    assert.match(String(args.token), /^[a-f0-9]{64}$/, 'only the hash reaches the database');
    if (name === 'mcp_auth') return { data: { token_id: 'token-1', can_write: options.canWrite }, error: null };
    if (name === 'mcp_context') return { data: { can_write: options.canWrite, workspace: state.workspace }, error: null };
    if (name === 'mcp_request_result') {
      const prior = state.receipts.get(String(args.request_id));
      return prior && prior.digest !== args.payload_hash ? { data: null, error: { code: 'PT409' } } : { data: prior?.outcome ?? null, error: null };
    }
    if (name === 'mcp_commit') {
      const prior = state.receipts.get(String(args.request_id));
      if (prior) return prior.digest === args.payload_hash ? { data: prior.outcome, error: null } : { data: null, error: { code: 'PT409' } };
      if (args.expected_revision !== state.workspace.revision) return { data: null, error: { code: 'PT409' } };
      if (args.next_data) { state.workspace = { data: args.next_data, revision: state.workspace.revision + 1 }; state.saves++; }
      const outcome = args.outcome as any;
      state.pending.push(...outcome.pending);
      const receipt = { ...outcome, conversation_id: outcome.pending.length ? '00000000-0000-4000-8000-000000000001' : null };
      state.receipts.set(String(args.request_id), { digest: args.payload_hash, outcome: receipt });
      return { data: receipt, error: null };
    }
    if (name === 'mcp_act') { state.acts.push({ operation: String(args.operation), args: args.args }); return state.actReply; }
    if (name === 'mcp_save') {
      if (args.expected_revision !== state.workspace.revision) return { data: null, error: { code: 'PT409' } };
      state.workspace = { data: args.next_data, revision: state.workspace.revision + 1 }; state.saves++;
      return { data: state.workspace.revision, error: null };
    }
    return { data: null, error: { code: 'XX' } };
  } };
  return { db, state };
}
// 2025-era clients accept JSON or SSE; the stateless legacy leg answers with one SSE event.
async function body(response: Response) {
  const raw = await response.text();
  const json = raw.trimStart().startsWith('{') ? raw : raw.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
  return JSON.parse(json) as { result?: any; error?: any };
}
const legacy = (id: number, method: string, params: Record<string, unknown> = {}) => new Request('https://jornada.example/api/mcp', { method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25', Authorization: 'Bearer jp_teste_chave_pessoal_0123456789abcdef' },
  body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });

test('servidor MCP: aperto de mão, catálogo, consulta e registro validado na vida pessoal', async () => {
  const { jornadaMcpHandler, mcpAuthenticate } = await import('../src/lib/mcp/server');
  const { db, state } = fakeDatabase({ canWrite: true });
  const access = await mcpAuthenticate(db as never, 'Bearer jp_teste_chave_pessoal_0123456789abcdef');
  const call = async (request: Request) => {
    const response = await jornadaMcpHandler(db as never, access).fetch(request);
    assert.equal(response.status, 200, await response.clone().text());
    return body(response);
  };
  const init = await call(legacy(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'teste', version: '1' } }));
  assert.equal(init.result.serverInfo.name, 'jornada-plena');
  assert.match(init.result.instructions, /Exclusões/);
  const list = await call(legacy(2, 'tools/list'));
  assert.deepEqual(list.result.tools.map((tool: { name: string }) => tool.name).sort(), ['administrar', 'consultar_administracao', 'consultar_coletivo', 'consultar_jornada', 'gerenciar_contatos', 'gerenciar_salas', 'gerenciar_trabalhos', 'registrar_na_jornada']);
  assert.equal(list.result.tools.find((tool: { name: string }) => tool.name === 'consultar_jornada').annotations.readOnlyHint, true);
  const query = await call(legacy(3, 'tools/call', { name: 'consultar_jornada', arguments: { section: 'agenda' } }));
  assert.match(query.result.content[0].text, /"items"/);
  const created = await call(legacy(4, 'tools/call', { name: 'registrar_na_jornada', arguments: { acoes: [{ type: 'compromisso', title: 'Dentista via MCP', date: dateKey(), time: '15:00' }] } }));
  assert.notEqual(created.result.isError, true);
  assert.deepEqual(JSON.parse(created.result.content[0].text).aplicado.length, 1);
  assert.equal(state.saves, 1);
  assert.ok(JSON.stringify(state.workspace.data).includes('Dentista via MCP'));
  const removal = await call(legacy(5, 'tools/call', { name: 'registrar_na_jornada', arguments: { acoes: [{ type: 'excluir', entity: 'compromisso', target: 'Dentista via MCP' }] } }));
  assert.equal(JSON.parse(removal.result.content[0].text).pendente_no_aplicativo.length, 1, 'exclusão fica para o aplicativo');
  assert.equal(state.pending.length, 1, 'o pedido e o fingerprint são guardados para confirmar no aplicativo');
  assert.ok((state.pending[0] as { fingerprint?: string }).fingerprint);
  assert.equal(state.saves, 1);
  const invalid = await call(legacy(6, 'tools/call', { name: 'registrar_na_jornada', arguments: { acoes: [{ type: 'financeiro', flow: 'expense', description: 'x', amount: -5, date: dateKey() }] } }));
  assert.equal(invalid.result?.isError ?? !!invalid.error, true);
  assert.equal(state.saves, 1);
});

test('servidor MCP: chave só de leitura não grava; chave ausente ou de outro formato é recusada', async () => {
  const { jornadaMcpHandler, mcpAuthenticate, McpAccessError } = await import('../src/lib/mcp/server');
  const { db, state } = fakeDatabase({ canWrite: false });
  const access = await mcpAuthenticate(db as never, 'Bearer jp_teste_chave_pessoal_0123456789abcdef');
  const response = await jornadaMcpHandler(db as never, access).fetch(legacy(1, 'tools/call', { name: 'registrar_na_jornada', arguments: { acoes: [{ type: 'anotacao', text: 'oi' }] } }));
  const reply = await body(response);
  assert.equal(reply.result.isError, true);
  assert.match(reply.result.content[0].text, /só consulta/);
  assert.equal(state.saves, 0);
  for (const header of [null, 'Bearer ', 'Bearer sk-outra-empresa-0123456789abcdefghij', 'Basic jp_teste']) {
    await assert.rejects(mcpAuthenticate(db as never, header), (error: unknown) => error instanceof McpAccessError && error.status === 401);
  }
});

test('MCP reapresenta o recibo após desconexão e rejeita reutilizar o ID para outro pedido', async () => {
  const { jornadaMcpHandler, mcpAuthenticate } = await import('../src/lib/mcp/server');
  const { db, state } = fakeDatabase({ canWrite: true });
  const access = await mcpAuthenticate(db as never, 'Bearer jp_teste_chave_pessoal_0123456789abcdef');
  const request_id = '00000000-0000-4000-8000-000000000011';
  const call = async (text: string) => body(await jornadaMcpHandler(db as never, access).fetch(legacy(1, 'tools/call', {
    name: 'registrar_na_jornada', arguments: { request_id, acoes: [{ type: 'anotacao', text }] },
  })));
  const first = await call('Registro único');
  const replay = await call('Registro único');
  assert.equal(state.saves, 1);
  assert.deepEqual(first.result, replay.result);
  assert.equal((await call('Outro registro')).result.isError, true);
  assert.equal(state.saves, 1);
});

test('servidor MCP: clientes da versão 2026-07-28 listam e consultam sem aperto de mão', async () => {
  const { jornadaMcpHandler, mcpAuthenticate } = await import('../src/lib/mcp/server');
  const { mcpRequest, mcpResult, toolInventory } = await import('../src/lib/integrations/mcp-wire');
  const { db } = fakeDatabase({ canWrite: false });
  const access = await mcpAuthenticate(db as never, 'Bearer jp_teste_chave_pessoal_0123456789abcdef');
  const modern = (id: number, method: string, params: Record<string, unknown> = {}) => new Request('https://jornada.example/api/mcp', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': method,
      ...(typeof params.name === 'string' ? { 'Mcp-Name': params.name } : {}) },
    body: JSON.stringify(mcpRequest('2026-07-28', id, method, params)) });
  const listed = await jornadaMcpHandler(db as never, access).fetch(modern(1, 'tools/list'));
  assert.equal(listed.status, 200);
  assert.deepEqual(toolInventory(mcpResult(await listed.text(), 1)).tools.map(tool => tool.name).sort(), ['administrar', 'consultar_administracao', 'consultar_coletivo', 'consultar_jornada', 'gerenciar_contatos', 'gerenciar_salas', 'gerenciar_trabalhos', 'registrar_na_jornada']);
  const asked = await jornadaMcpHandler(db as never, access).fetch(modern(2, 'tools/call', { name: 'consultar_jornada', arguments: { section: 'resumo' } }));
  assert.match(JSON.stringify(mcpResult(await asked.text(), 2)), /summary/);
});

test('OAuth do MCP: PKCE S256, retornos permitidos e metadados de descoberta', async () => {
  const { s256, redirectAllowed, verifierValid, challengeValid, wantsWrite, authorizationServer, protectedResource, resourceMetadataUrl } = await import('../src/lib/mcp/oauth');
  // RFC 7636, apêndice B.
  assert.equal(s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.ok(verifierValid('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk') && !verifierValid('curto'));
  assert.ok(challengeValid('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM') && !challengeValid('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-c='));
  for (const ok of ['https://chatgpt.com/connector_platform_oauth_redirect', 'https://claude.ai/api/mcp/auth_callback', 'http://localhost:6274/oauth/callback', 'http://127.0.0.1:33418/cb']) assert.ok(redirectAllowed(ok), ok);
  for (const bad of ['http://evil.example/cb', 'https://x.example/cb#frag', 'https://user:pass@x.example/cb', 'javascript:alert(1)', 42]) assert.ok(!redirectAllowed(bad), String(bad));
  assert.ok(wantsWrite('ler registrar') && !wantsWrite('ler') && !wantsWrite(undefined));
  const origin = 'https://jornada.example';
  assert.deepEqual(protectedResource(origin).authorization_servers, [origin]);
  assert.equal(protectedResource(origin).resource, `${origin}/api/mcp`);
  const server = authorizationServer(origin);
  assert.deepEqual(server.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(server.token_endpoint_auth_methods_supported, ['none']);
  assert.equal(server.registration_endpoint, `${origin}/api/oauth/register`);
  assert.equal(resourceMetadataUrl(origin), `${origin}/.well-known/oauth-protected-resource/api/mcp`);
});

test('servidor MCP: saldo inicial e semestre registrados pelo assistente voltam na consulta de configurações, sem a foto do perfil', async () => {
  const { jornadaMcpHandler, mcpAuthenticate } = await import('../src/lib/mcp/server');
  const { db, state } = fakeDatabase({ canWrite: true });
  const access = await mcpAuthenticate(db as never, 'Bearer jp_teste_chave_pessoal_0123456789abcdef');
  const call = async (request: Request) => body(await jornadaMcpHandler(db as never, access).fetch(request));
  await call(legacy(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'teste', version: '1' } }));
  const saved = await call(legacy(2, 'tools/call', { name: 'registrar_na_jornada', arguments: { acoes: [
    { type: 'saldo_inicial', amount: 2300, date: '2026-10-01' }, { type: 'semestre', start: '2026-08-03', end: '2026-12-18' }, { type: 'perfil', fields: { institution: 'Anhanguera' } }] } }));
  assert.notEqual(saved.result.isError, true, saved.result.content[0].text);
  assert.equal(JSON.parse(saved.result.content[0].text).aplicado.length, 3);
  assert.equal(state.saves, 1);
  const read = await call(legacy(3, 'tools/call', { name: 'consultar_jornada', arguments: { section: 'configuracoes' } }));
  const settings = JSON.parse(read.result.content[0].text);
  assert.deepEqual(settings.saldoInicial, { emReais: 2300, data: '2026-10-01' });
  assert.deepEqual(settings.semestre, { start: '2026-08-03', end: '2026-12-18' });
  assert.equal(settings.perfil.institution, 'Anhanguera');
  assert.equal('photoUrl' in settings.perfil, false);
});

test('servidor MCP: parte coletiva usa as ações da tela pelo ator da pessoa e recusa o que é só da tela', async () => {
  const { jornadaMcpHandler, mcpAuthenticate } = await import('../src/lib/mcp/server');
  const { createHash } = await import('node:crypto');
  const { db, state } = fakeDatabase({ canWrite: true });
  const access = await mcpAuthenticate(db as never, 'Bearer jp_teste_chave_pessoal_0123456789abcdef');
  const call = async (id: number, name: string, args: unknown) => body(await jornadaMcpHandler(db as never, access).fetch(legacy(id, 'tools/call', { name, arguments: args })));
  const tools = (await body(await jornadaMcpHandler(db as never, access).fetch(legacy(1, 'tools/list')))).result.tools as { name: string; annotations: any }[];
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['administrar', 'consultar_administracao', 'consultar_coletivo', 'consultar_jornada', 'gerenciar_contatos', 'gerenciar_salas', 'gerenciar_trabalhos', 'registrar_na_jornada']);
  assert.equal(tools.find(tool => tool.name === 'consultar_coletivo')!.annotations.readOnlyHint, true);

  const space = '00000000-0000-4000-8000-0000000000b1';
  const posted = await call(2, 'gerenciar_salas', { acao: { action: 'create_post', space, kind: 'announcement', title: 'Prova sexta' } });
  assert.notEqual(posted.result.isError, true, posted.result.content[0].text);
  assert.deepEqual(state.acts.at(-1), { operation: 'create_post', args: { target: space, post_kind: 'announcement', post_title: 'Prova sexta', post_body: '', post_link: '', post_date: null, post_pinned: false } });

  const invite = await call(3, 'gerenciar_salas', { acao: { action: 'create_invitation', space, role: 'student', days: 7, uses: 30 } });
  const link = JSON.parse(invite.result.content[0].text).link as string;
  assert.equal(state.acts.at(-1)!.args.hashed_token, createHash('sha256').update(link.split('/convite/')[1]).digest('hex'), 'o banco recebe só o hash do link');

  const before = state.acts.length;
  for (const acao of [{ action: 'set_role', space, member: space, role: 'teacher' }, { action: 'remove_member', space, member: space },
    { action: 'add_member', space, email: 'x@example.invalid', role: 'teacher' }]) {
    const refused = await call(4, 'gerenciar_salas', { acao });
    assert.equal(refused.result?.isError ?? !!refused.error, true, `só na tela: ${acao.action}`);
  }
  assert.equal(state.acts.length, before, 'nada que é só da tela chega ao banco');

  // Excluir vira pedido guardado, com as palavras do banco; a exclusão não roda pelo assistente.
  state.actReply = { data: { title: 'Prova sexta', where: 'Grupo 1' }, error: null };
  const savesBefore = state.saves;
  const proposal = await call(5, 'gerenciar_salas', { acao: { action: 'delete_post', post: space } });
  assert.notEqual(proposal.result.isError, true, proposal.result.content[0].text);
  assert.deepEqual(state.acts.at(-1), { operation: 'describe', args: { kind: 'post', target: space } });
  assert.deepEqual(state.pending.at(-1), { action: { type: 'excluir_coletivo', fn: 'delete_post', target: space }, fingerprint: JSON.stringify({ title: 'Prova sexta', where: 'Grupo 1' }), label: 'Excluir publicação: Prova sexta (Grupo 1)' });
  assert.deepEqual(JSON.parse(proposal.result.content[0].text).pendente_no_aplicativo, ['Excluir publicação: Prova sexta (Grupo 1)']);
  assert.equal(state.saves, savesBefore, 'propor exclusão não grava a vida pessoal');
  assert.equal(state.acts.some(act => act.operation.startsWith('delete_')), false, 'nenhuma exclusão roda pelo assistente');
  state.actReply = { data: null, error: null };
  const unknown = await call(5, 'gerenciar_trabalhos', { acao: { action: 'delete_assignment', assignment: space } });
  assert.equal(unknown.result.isError, true, 'item que a pessoa não vê não vira pedido');

  state.actReply = { data: null, error: { code: '42501' } };
  const denied = await call(6, 'gerenciar_trabalhos', { acao: { action: 'add_comment', part: space, kind: 'comment', body: 'Revisei' } });
  assert.equal(denied.result.isError, true);
  assert.match(denied.result.content[0].text, /Sem permissão/);
  state.actReply = { data: { spaces: [] }, error: null };
  const home = await call(7, 'consultar_coletivo', { o_que: 'inicio' });
  assert.equal(state.acts.at(-1)!.operation, 'app_home');
  assert.match(home.result.content[0].text, /spaces/);

  const reader = fakeDatabase({ canWrite: false });
  const readAccess = await mcpAuthenticate(reader.db as never, 'Bearer jp_teste_chave_pessoal_0123456789abcdef');
  const blocked = await body(await jornadaMcpHandler(reader.db as never, readAccess).fetch(legacy(8, 'tools/call', { name: 'gerenciar_contatos', arguments: { acao: { action: 'save', contact: null, name: 'Bia' } } })));
  assert.equal(blocked.result.isError, true);
  assert.equal(reader.state.acts.length, 0, 'chave só de consulta não grava');
});

test('servidor MCP: administração só por proposta, com os dados reais da conta e sem nunca mexer em master', async () => {
  const { jornadaMcpHandler, mcpAuthenticate } = await import('../src/lib/mcp/server');
  const { db, state } = fakeDatabase({ canWrite: true });
  const access = await mcpAuthenticate(db as never, 'Bearer jp_teste_chave_pessoal_0123456789abcdef');
  const call = async (id: number, name: string, args: unknown) => body(await jornadaMcpHandler(db as never, access).fetch(legacy(id, 'tools/call', { name, arguments: args })));
  const ANA = '00000000-0000-4000-8000-0000000000d1';
  state.actReply = { data: { settings: { open_access: true }, accounts: [{ user_id: ANA, email: 'ana@example.invalid', display_name: 'Ana', is_master: false,
    plan: 'academic', plan_source: 'free', pro_until: null, ai_credits: 0, features: [] }] }, error: null };

  const read = await call(1, 'consultar_administracao', { o_que: 'contas' });
  assert.equal(state.acts.at(-1)!.operation, 'admin_overview');
  assert.match(read.result.content[0].text, /ana@example\.invalid/);

  const saves = state.saves;
  const plan = await call(2, 'administrar', { acao: { action: 'atualizar_conta', account: ANA, plan: 'pro', source: 'courtesy', pro_until: '2026-12-31' } });
  assert.notEqual(plan.result.isError, true, plan.result.content[0].text);
  const proposal = state.pending.at(-1) as { action: { type: string; request: { url: string; body: Record<string, unknown> } }; label: string };
  assert.deepEqual(proposal.action, { type: 'administrar', request: { url: '/api/admin', body: { action: 'update_account', account: ANA, plan: 'pro', source: 'courtesy',
    pro_until: '2026-12-31', credits: 0, features: [], master: false } } });
  assert.equal(proposal.label, 'Conta de Ana (ana@example.invalid): plano Pro até 31 de dez. de 2026, cortesia, 0 créditos, recursos: nenhum');
  assert.equal(state.saves, saves, 'nada muda antes da confirmação');
  assert.equal(state.acts.some(act => act.operation.startsWith('admin_') && act.operation !== 'admin_overview'), false, 'mudança de administração nunca roda pelo assistente');

  const smuggled = await call(3, 'administrar', { acao: { action: 'atualizar_conta', account: ANA, master: true } });
  assert.equal((state.pending.at(-1) as typeof proposal).action.request.body.master, false, 'master vem sempre da conta como está');
  assert.notEqual(smuggled.result?.isError, true);

  const open = await call(4, 'administrar', { acao: { action: 'acesso_livre', value: false } });
  assert.notEqual(open.result.isError, true);
  assert.equal((state.pending.at(-1) as typeof proposal).label, 'Fechar o acesso livre para novas contas (hoje está aberto)');

  state.actReply = { data: { routes: [] }, error: null };
  const route = await call(5, 'administrar', { acao: { action: 'usar_ia', task: 'assistente', provider: 'groq' } });
  assert.notEqual(route.result.isError, true, route.result.content[0].text);
  assert.deepEqual((state.pending.at(-1) as typeof proposal).action.request, { url: '/api/ai/admin', body: { action: 'save_route', task: 'assistente', provider: 'groq',
    connection_id: null, model: 'auto:rapido', enabled: true, routing_mode: 'auto', fallbacks: [] } });
  const voiceOnly = await call(6, 'administrar', { acao: { action: 'usar_ia', task: 'assistente', provider: 'elevenlabs' } });
  assert.equal(voiceOnly.result.isError, true);

  state.actReply = { data: null, error: { code: '42501' } };
  const student = await call(7, 'consultar_administracao', { o_que: 'uso' });
  assert.equal(student.result.isError, true);
  assert.match(student.result.content[0].text, /Só o administrador geral/);
});
