export const mcpVersions = ['2026-07-28', '2025-11-25'] as const;
export type McpVersion = typeof mcpVersions[number];
/** readOnly and inputSchema are what the remote server declares: shown to the owner, never trusted for permission. */
export type McpTool = { name: string; description: string; readOnly: boolean; inputSchema: string };
export const mcpToolName = /^[a-zA-Z0-9_.:/-]{1,100}$/;
export function mcpRequest(version: McpVersion, id: number, method: string, params: Record<string, unknown> = {}) {
  return { jsonrpc: '2.0', id, method, params: { ...params, ...(version === '2026-07-28' ? { _meta: {
    'io.modelcontextprotocol/protocolVersion': version,
    'io.modelcontextprotocol/clientInfo': { name: 'Jornada Plena', version: '1.0.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  } } : {}) } };
}
/** JSON or bounded SSE response. Remote descriptions are data, never instructions. */
export function mcpResult(raw: string, id: number) {
  if (raw.length > 2_000_000) throw new Error('Resposta MCP excede o limite.');
  const candidates = raw.trim().startsWith('{') ? [raw] : raw.split(/\r?\n\r?\n/).map(event => event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n'));
  for (const candidate of candidates) {
    let value: any; try { value = JSON.parse(candidate); } catch { continue; }
    if (value?.jsonrpc !== '2.0' || value.id !== id) continue;
    if (value.error) throw new Error('O servidor MCP recusou a solicitação. Confira protocolo e permissões.');
    if (!value.result || (value.result.resultType && value.result.resultType !== 'complete')) throw new Error('O servidor exige uma interação que a Jornada não realiza.');
    return value.result;
  }
  throw new Error('O endereço não respondeu com um resultado MCP válido.');
}
export function toolInventory(result: any): { tools: McpTool[]; hasMore: boolean } {
  if (!Array.isArray(result?.tools)) throw new Error('O servidor não retornou um catálogo de ferramentas.');
  const tools = result.tools.slice(0, 50).filter((tool: any) => typeof tool?.name === 'string' && mcpToolName.test(tool.name)).map((tool: any) => ({ name: tool.name, description: typeof tool.description === 'string' ? tool.description.slice(0, 250) : '',
    readOnly: tool.annotations?.readOnlyHint === true, inputSchema: bounded(tool.inputSchema, 4000) }));
  return { tools, hasMore: result.tools.length > 50 || !!result.nextCursor };
}
const bounded = (value: unknown, limit: number) => { const text = value === undefined ? '' : JSON.stringify(value, null, 2) ?? ''; return text.length > limit ? `${text.slice(0, limit)}\n… (cortado)` : text; };
/** What a tools/call returned, as plain text for the owner. Images, audio and resources are counted, not shown. */
export function toolCallResult(result: any) {
  const content: any[] = Array.isArray(result?.content) ? result.content : [];
  const text = content.filter(item => item?.type === 'text' && typeof item.text === 'string').map(item => item.text).join('\n\n');
  return { isError: result?.isError === true, text: text.length > 8000 ? `${text.slice(0, 8000)}\n… (cortado)` : text,
    structured: bounded(result?.structuredContent, 8000), omitted: content.filter(item => item?.type !== 'text').length };
}
