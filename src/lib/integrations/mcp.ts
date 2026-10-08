import 'server-only';
import { publicHttps } from '@/lib/ai/public-http';
import { mcpRequest, mcpResult, toolCallResult, toolInventory, type McpVersion } from './mcp-wire';

/** One exchange with an external server, opened by the owner. Nothing here sends conversations or personal data:
 * a tool only receives the arguments the owner typed and confirmed in Administração. */
async function mcpSession(url: string, token: string, version: McpVersion, signal: AbortSignal, transport: typeof publicHttps) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const send = async (id: number, method: string, params: Record<string, unknown> = {}) => {
    const name: Record<string, string> = method === 'tools/call' ? { 'Mcp-Name': String(params.name) } : {};
    const response = await transport(url, { method: 'POST', signal, headers: { ...headers, ...(method !== 'initialize' ? { 'MCP-Protocol-Version': version, 'Mcp-Method': method, ...name } : {}) }, body: JSON.stringify(mcpRequest(version,id,method,params)) });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'MCP: confira a autorização deste servidor.' : 'MCP: confira o endpoint, o protocolo e a disponibilidade.');
    return { result: mcpResult(await response.text(),id), session: response.headers.get('Mcp-Session-Id') };
  };
  if (version === '2025-11-25') {
    const initialized = await send(1,'initialize',{ protocolVersion: version, capabilities: {}, clientInfo: { name: 'Jornada Plena', version: '1.0.0' } });
    if (initialized.result.protocolVersion !== version) throw new Error('O servidor negociou outra versão. Escolha um protocolo suportado.');
    if (initialized.session) {
      if (initialized.session.length > 300 || /[\r\n]/.test(initialized.session)) throw new Error('Sessão MCP inválida.');
      headers['Mcp-Session-Id'] = initialized.session;
    }
    const notice = await transport(url,{ method:'POST', signal, headers: { ...headers,'MCP-Protocol-Version':version }, body: JSON.stringify({ jsonrpc:'2.0',method:'notifications/initialized' }) });
    if (!notice.ok) throw new Error('O servidor não aceitou a inicialização MCP.');
  }
  return send;
}

export async function discoverMcp(url: string, token: string, version: McpVersion, signal: AbortSignal, transport: typeof publicHttps = publicHttps) {
  return toolInventory((await (await mcpSession(url, token, version, signal, transport))(2,'tools/list')).result);
}

/** Runs one tool the owner allowed and confirmed. The caller checks the allowlist in the database first. */
export async function callMcpTool(url: string, token: string, version: McpVersion, name: string, args: Record<string, unknown>, signal: AbortSignal, transport: typeof publicHttps = publicHttps) {
  return toolCallResult((await (await mcpSession(url, token, version, signal, transport))(2,'tools/call',{ name, arguments: args })).result);
}
