'use client';
import { useState, type FormEvent } from 'react';
import { Play, Plug, ShieldCheck } from 'lucide-react';
import type { AiAdminState } from '@/lib/ai/catalog';
import type { McpTool } from '@/lib/integrations/mcp-wire';
import { api } from './client';

type Connector = NonNullable<AiAdminState['connectors']>[number];
type Inventory = { tools: McpTool[]; hasMore: boolean; checkedAt: string };
type CallResult = { isError: boolean; text: string; structured: string; omitted: number; ms: number };
export function McpSettings({ connectors, safe, onReload }: { connectors: Connector[]; safe: boolean; onReload: () => Promise<void> }) {
  const [busy,setBusy] = useState(''); const [message,setMessage] = useState('');
  const [inventories,setInventories] = useState<Record<string,Inventory | undefined>>({});
  async function run(id:string, action: () => Promise<void>) { setBusy(id);setMessage('');try { await action(); } catch(error) { setMessage(error instanceof Error ? error.message : 'Não consegui concluir.'); } finally { setBusy(''); } }
  function save(event:FormEvent<HTMLFormElement>, id:string | null) {
    event.preventDefault(); const form=event.currentTarget; const fields=new FormData(form);
    void run(id ?? 'new',async () => {
      await api('/api/ai/admin',{ action:'save_connector', id,label:String(fields.get('label')),url:String(fields.get('url')),protocol:String(fields.get('protocol')),enabled:fields.get('enabled')==='on',key:String(fields.get('key') ?? '') || null });
      form.reset(); if(id) setInventories(previous=>({...previous,[id]:undefined})); await onReload();setMessage('Conector salvo. Consulte o catálogo para testar o acesso.');
    });
  }
  return <div className="ai-mcp-settings"><div className="section-heading"><h3><Plug size={18} aria-hidden="true" /> Servidores MCP</h3><span className="ai-badge">Ferramentas liberadas por você</span></div>
    <p className="muted">Cadastre um endpoint HTTPS e uma autorização específica para a Jornada. Consulte o catálogo, libere as ferramentas que quer usar e execute cada uma aqui, com confirmação. O servidor recebe só os argumentos que você digitar; suas conversas e seus registros não são enviados. OAuth interativo precisa de um adaptador próprio.</p>
    {message && <p className="cm-message" role="status">{message}</p>}
    {connectors.map(connector => <details className="ai-provider" key={connector.id}><summary><span className="ai-provider-symbol"><Plug size={18} aria-hidden="true" /></span><span className="ai-provider-name"><strong>{connector.label}</strong><small>{connector.enabled ? 'Ligado' : 'Pausado'} · {connector.has_key ? `token …${connector.key_hint}` : 'sem token'} · {(connector.allowed_tools ?? []).length} ferramentas liberadas</small></span></summary>
      <form className="ai-card ai-provider-form" key={connector.updated_at} onSubmit={event=>save(event,connector.id)}><Fields connector={connector} /><div className="button-row"><button className="button primary" disabled={!!busy}>Salvar conector</button><button type="button" className="button outline" disabled={!!busy || !connector.enabled} onClick={()=>void run(connector.id,async()=>{const result=await api<Inventory>('/api/ai/admin',{action:'test_connector',id:connector.id});setInventories(previous=>({...previous,[connector.id]:result}));setMessage('Catálogo consultado. Nenhuma ferramenta foi executada.');})}>Consultar ferramentas</button><button type="button" className="text-button cm-danger" disabled={!!busy} onClick={()=>{if(window.confirm(`Remover o conector ${connector.label}?`)) void run(connector.id,async()=>{await api('/api/ai/admin',{action:'remove_connector',id:connector.id});await onReload();setMessage('Conector removido da Jornada.');});}}>Remover</button></div>{connector.has_key && <button type="button" className="text-button cm-danger" disabled={!!busy} onClick={()=>{if(window.confirm('Remover o token salvo e pausar este conector?')) void run(connector.id,async()=>{await api('/api/ai/admin',{action:'save_connector',...connector,enabled:false,key:''});await onReload();setMessage('Token removido e conector pausado.');});}}>Remover token e pausar</button>}<p className="muted small">Trocar o endpoint desfaz as ferramentas liberadas, porque passa a ser outro servidor.</p></form>
      <Tools connector={connector} inventory={inventories[connector.id]} busy={!!busy} run={run} onReload={onReload} setMessage={setMessage} />
    </details>)}
    <form className="ai-card" onSubmit={event=>save(event,null)}><strong>Adicionar servidor MCP</strong><Fields /><button className="button primary" disabled={!!busy || !safe || connectors.length>=20}>Cadastrar conector</button></form>
    <div className="ai-explainer"><ShieldCheck size={20} aria-hidden="true" /><p>Os tokens ficam cifrados. A Jornada bloqueia destinos internos e redirecionamentos. Só ferramentas liberadas rodam, sempre por você e com confirmação, e cada chamada fica no histórico da Administração (sem os argumentos). O assistente da Jornada ainda não chama esses servidores.</p></div>
  </div>;
}
function Tools({ connector, inventory, busy, run, onReload, setMessage }: { connector: Connector; inventory?: Inventory; busy: boolean; run: (id: string, action: () => Promise<void>) => Promise<void>; onReload: () => Promise<void>; setMessage: (text: string) => void }) {
  const allowed = connector.allowed_tools ?? [];
  // Before a catalog query, the allowed tools still show, just without the server's description.
  const tools = inventory?.tools ?? allowed.map(name => ({ name, description: '', readOnly: false, inputSchema: '' }));
  const [picked,setPicked] = useState<string[] | null>(null);
  const [results,setResults] = useState<Record<string, CallResult | undefined>>({});
  if (!tools.length) return null;
  const chosen = picked ?? allowed;
  function call(event: FormEvent<HTMLFormElement>, tool: McpTool) {
    event.preventDefault();
    let args: unknown;
    try { args = JSON.parse(String(new FormData(event.currentTarget).get('arguments') || '{}')); } catch { setMessage('Os argumentos precisam ser um JSON válido, por exemplo {}.'); return; }
    if (!args || typeof args !== 'object' || Array.isArray(args)) { setMessage('Os argumentos precisam ser um objeto JSON, por exemplo {}.'); return; }
    const effect = tool.readOnly ? 'O servidor declara que esta ferramenta só consulta, mas a Jornada não tem como garantir.' : 'Esta ferramenta pode alterar dados no serviço externo.';
    if (!window.confirm(`Executar ${tool.name} em ${connector.label}?\n\n${effect}\n\nArgumentos enviados:\n${JSON.stringify(args, null, 2).slice(0, 600)}`)) return;
    void run(connector.id, async () => {
      const result = await api<CallResult>('/api/ai/admin', { action: 'call_connector_tool', id: connector.id, tool: tool.name, arguments: args });
      setResults(previous => ({ ...previous, [tool.name]: result }));
      setMessage(result.isError ? `${tool.name} respondeu com erro.` : `${tool.name} executada em ${(result.ms / 1000).toFixed(1)} s.`);
    });
  }
  return <div className="ai-card"><strong>{inventory ? `${inventory.tools.length} ferramentas recebidas` : 'Ferramentas liberadas'}</strong><span className="muted small">{inventory ? `Consulta: ${new Date(inventory.checkedAt).toLocaleString('pt-BR')}${inventory.hasMore ? ' · catálogo parcial' : ''}` : 'Consulte o catálogo para ver descrições e liberar outras.'} Descrições e o selo “só consulta” vêm do próprio servidor.</span>
    <ul className="ai-tool-list">{tools.map((tool,index)=><li key={`${tool.name}-${index}`}>
      {inventory ? <label className="cm-check"><input type="checkbox" checked={chosen.includes(tool.name)} onChange={event=>setPicked(event.target.checked ? [...chosen, tool.name] : chosen.filter(name => name !== tool.name))} /> <strong>{tool.name}</strong></label> : <strong>{tool.name}</strong>}
      {tool.readOnly && <span className="ai-badge">só consulta (declarado)</span>}<span className="muted small">{tool.description}</span>
      {allowed.includes(tool.name) && <details><summary><Play size={14} aria-hidden="true" /> Executar</summary><form onSubmit={event=>call(event,tool)}>
        {tool.inputSchema && <details><summary className="small">Argumentos que o servidor espera</summary><pre className="small">{tool.inputSchema}</pre></details>}
        <label>Argumentos (JSON)<textarea name="arguments" rows={4} defaultValue="{}" spellCheck={false} maxLength={15000} /></label>
        <button className="button outline" disabled={busy || !connector.enabled}>Executar {tool.name}</button>
      </form>{results[tool.name] && <Result result={results[tool.name]!} />}</details>}
    </li>)}</ul>
    {inventory && <div className="button-row"><button type="button" className="button primary" disabled={busy || picked === null} onClick={()=>void run(connector.id,async()=>{await api('/api/ai/admin',{action:'allow_connector_tools',id:connector.id,tools:chosen.slice(0,50)});await onReload();setPicked(null);setMessage(`${chosen.length} ferramentas liberadas em ${connector.label}.`);})}>Salvar ferramentas liberadas</button></div>}
  </div>;
}
function Result({ result }: { result: CallResult }) {
  return <div role="status"><strong>{result.isError ? 'O servidor respondeu com erro' : 'Resposta do servidor'}</strong>
    {result.text && <pre className="small">{result.text}</pre>}
    {result.structured && <details><summary className="small">Dados estruturados</summary><pre className="small">{result.structured}</pre></details>}
    {result.omitted > 0 && <p className="muted small">{result.omitted} anexos (imagem, áudio ou arquivo) não são exibidos aqui.</p>}
    {!result.text && !result.structured && !result.omitted && <p className="muted small">Sem conteúdo na resposta.</p>}
  </div>;
}
function Fields({ connector }: { connector?: Connector }) {
  return <><div className="ai-field-grid"><label>Nome do conector<input name="label" defaultValue={connector?.label ?? ''} maxLength={60} required placeholder="Ex.: Agenda da Jornada" /></label><label>Endpoint MCP<input name="url" type="url" defaultValue={connector?.url ?? ''} maxLength={300} required placeholder="https://seu-servico.com/mcp" /></label><label>Protocolo<select name="protocol" defaultValue={connector?.protocol ?? '2026-07-28'}><option value="2026-07-28">Atual · 2026-07-28</option><option value="2025-11-25">Legado · 2025-11-25</option></select></label><label>Token Bearer (opcional)<input name="key" type="password" autoComplete="off" spellCheck={false} placeholder={connector?.has_key ? 'Guardado. Vazio mantém o atual.' : 'Somente se este servidor exigir'} maxLength={12000} /></label></div><label className="cm-check"><input name="enabled" type="checkbox" defaultChecked={connector?.enabled ?? false} /> Ligado</label></>;
}
