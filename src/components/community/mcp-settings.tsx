'use client';
import { useState, type FormEvent } from 'react';
import { Plug, ShieldCheck } from 'lucide-react';
import type { AiAdminState } from '@/lib/ai/catalog';
import type { McpTool } from '@/lib/integrations/mcp-wire';
import { api } from './client';

type Connector = NonNullable<AiAdminState['connectors']>[number];
type Inventory = { tools: McpTool[]; hasMore: boolean; checkedAt: string };
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
  return <div className="ai-mcp-settings"><div className="section-heading"><h3><Plug size={18} aria-hidden="true" /> Servidores MCP</h3><span className="ai-badge">Descoberta de ferramentas</span></div>
    <p className="muted">Cadastre um endpoint HTTPS e uma autorização específica para a Jornada. O teste consulta até 50 ferramentas; não executa comandos nem envia suas conversas. OAuth interativo precisa de um adaptador próprio.</p>
    {message && <p className="cm-message" role="status">{message}</p>}
    {connectors.map(connector => <details className="ai-provider" key={connector.id}><summary><span className="ai-provider-symbol"><Plug size={18} aria-hidden="true" /></span><span className="ai-provider-name"><strong>{connector.label}</strong><small>{connector.enabled ? 'Ligado para consulta' : 'Pausado'} · {connector.has_key ? `token …${connector.key_hint}` : 'sem token'}</small></span></summary>
      <form className="ai-card ai-provider-form" key={connector.updated_at} onSubmit={event=>save(event,connector.id)}><Fields connector={connector} /><div className="button-row"><button className="button primary" disabled={!!busy}>Salvar conector</button><button type="button" className="button outline" disabled={!!busy || !connector.enabled} onClick={()=>void run(connector.id,async()=>{const result=await api<Inventory>('/api/ai/admin',{action:'test_connector',id:connector.id});setInventories(previous=>({...previous,[connector.id]:result}));setMessage('Catálogo consultado. Nenhuma ferramenta foi executada.');})}>Consultar ferramentas</button><button type="button" className="text-button cm-danger" disabled={!!busy} onClick={()=>{if(window.confirm(`Remover o conector ${connector.label}?`)) void run(connector.id,async()=>{await api('/api/ai/admin',{action:'remove_connector',id:connector.id});await onReload();setMessage('Conector removido da Jornada.');});}}>Remover</button></div>{connector.has_key && <button type="button" className="text-button cm-danger" disabled={!!busy} onClick={()=>{if(window.confirm('Remover o token salvo e pausar este conector?')) void run(connector.id,async()=>{await api('/api/ai/admin',{action:'save_connector',...connector,enabled:false,key:''});await onReload();setMessage('Token removido e conector pausado.');});}}>Remover token e pausar</button>}</form>
      {inventories[connector.id] && <div className="ai-card"><strong>{inventories[connector.id]!.tools.length} ferramentas recebidas</strong><span className="muted small">Consulta: {new Date(inventories[connector.id]!.checkedAt).toLocaleString('pt-BR')}{inventories[connector.id]!.hasMore ? ' · catálogo parcial' : ''}</span><ul className="ai-tool-list">{inventories[connector.id]!.tools.map((tool,index)=><li key={`${tool.name}-${index}`}><strong>{tool.name}</strong><span className="muted small">{tool.description}</span></li>)}</ul></div>}
    </details>)}
    <form className="ai-card" onSubmit={event=>save(event,null)}><strong>Adicionar servidor MCP</strong><Fields /><button className="button primary" disabled={!!busy || !safe || connectors.length>=20}>Cadastrar conector</button></form>
    <div className="ai-explainer"><ShieldCheck size={20} aria-hidden="true" /><p>Os tokens ficam cifrados. A Jornada bloqueia destinos internos e redirecionamentos. Ativar um conector permite consultar seu catálogo; a execução de ferramentas ainda exige uma integração com permissões e confirmação por ação.</p></div>
  </div>;
}
function Fields({ connector }: { connector?: Connector }) {
  return <><div className="ai-field-grid"><label>Nome do conector<input name="label" defaultValue={connector?.label ?? ''} maxLength={60} required placeholder="Ex.: Agenda da Jornada" /></label><label>Endpoint MCP<input name="url" type="url" defaultValue={connector?.url ?? ''} maxLength={300} required placeholder="https://seu-servico.com/mcp" /></label><label>Protocolo<select name="protocol" defaultValue={connector?.protocol ?? '2026-07-28'}><option value="2026-07-28">Atual · 2026-07-28</option><option value="2025-11-25">Legado · 2025-11-25</option></select></label><label>Token Bearer (opcional)<input name="key" type="password" autoComplete="off" spellCheck={false} placeholder={connector?.has_key ? 'Guardado. Vazio mantém o atual.' : 'Somente se este servidor exigir'} maxLength={12000} /></label></div><label className="cm-check"><input name="enabled" type="checkbox" defaultChecked={connector?.enabled ?? false} /> Ligado para consulta</label></>;
}
