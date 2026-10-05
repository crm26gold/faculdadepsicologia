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
  const state = { workspace: { data: demoWorkspace(dateKey()) as unknown, revision: 3 }, saves: 0, calls: [] as string[], pending: [] as unknown[], receipts: new Map<string, { digest: unknown; outcome: any }>() };
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
  assert.deepEqual(list.result.tools.map((tool: { name: string }) => tool.name).sort(), ['consultar_jornada', 'registrar_na_jornada']);
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
  assert.deepEqual(toolInventory(mcpResult(await listed.text(), 1)).tools.map(tool => tool.name).sort(), ['consultar_jornada', 'registrar_na_jornada']);
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
