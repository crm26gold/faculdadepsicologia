'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, KeyRound, Plug, Trash2 } from 'lucide-react';
import { api } from './community/client';

type Token = { id: string; label: string; hint: string; can_write: boolean; created_at: string; expires_at: string | null; last_used_at: string | null };
type State = { tokens: Token[]; endpoint: string | null };
const when = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca';

/** Ready-to-paste settings for each app; the key appears here only right after it is created. */
export function connectionGuides(endpoint: string, token: string) {
  return [
    { app: 'Claude Code', where: 'No terminal:', code: `claude mcp add --transport http jornada ${endpoint} --header "Authorization: Bearer ${token}"` },
    { app: 'Codex (CLI e app)', where: 'Defina a variável JORNADA_TOKEN com a chave e rode no terminal:', code: `export JORNADA_TOKEN="${token}"\ncodex mcp add jornada --url ${endpoint} --bearer-token-env-var JORNADA_TOKEN` },
    { app: 'Gemini CLI', where: 'Em ~/.gemini/settings.json:', code: JSON.stringify({ mcpServers: { jornada: { httpUrl: endpoint, headers: { Authorization: `Bearer ${token}` } } } }, null, 2) },
    { app: 'Antigravity', where: 'Agente › … › MCP Servers › Manage › View raw config (mcp_config.json):', code: JSON.stringify({ mcpServers: { jornada: { serverUrl: endpoint, headers: { Authorization: `Bearer ${token}` } } } }, null, 2) },
  ];
}

/** Each person connects their own assistants (and subscriptions) to their own private life. */
export function AssistantConnections() {
  const [state, setState] = useState<State | null>(null);
  const [created, setCreated] = useState<{ token: string; endpoint: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => { try { setState(await api<State>('/api/mcp-tokens')); } catch { setState(null); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (!state) return null;
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget), form = event.currentTarget;
    setBusy(true); setMessage('');
    try {
      const days = String(fields.get('valid_days'));
      const result = await api<{ token: string; endpoint: string | null }>('/api/mcp-tokens', { action: 'create', label: String(fields.get('label') ?? '').trim(),
        can_write: fields.get('permission') === 'write', valid_days: days === 'never' ? null : Number(days) });
      if (result.endpoint) setCreated({ token: result.token, endpoint: result.endpoint });
      form.reset(); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível criar a chave.'); }
    finally { setBusy(false); }
  }
  async function revoke(token: Token) {
    if (!window.confirm(`Revogar a chave “${token.label}”? Os aplicativos que a usam perdem o acesso na hora.`)) return;
    setBusy(true); setMessage('');
    try { await api('/api/mcp-tokens', { action: 'revoke', id: token.id }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível revogar.'); }
    finally { setBusy(false); }
  }
  const copy = (value: string) => { void navigator.clipboard?.writeText(value).then(() => setMessage('Copiado.'), () => setMessage('Selecione o texto e copie manualmente.')); };
  return <section className="panel assistant-connections" aria-labelledby="assistant-connections-title">
    <h2 id="assistant-connections-title"><Plug size={17} aria-hidden="true" /> Conectar assistentes (MCP)</h2>
    <p className="muted">Use o Claude Code, o Codex, o Gemini ou o Antigravity com a sua própria assinatura para consultar e organizar a sua Jornada. Cada chave acessa só a sua vida pessoal, nunca grupos ou outras pessoas. Exclusões continuam sendo confirmadas aqui no aplicativo.</p>
    {state.endpoint && <p className="small">Endereço do servidor: <code>{state.endpoint}</code></p>}
    {created && <div className="ai-card" role="status">
      <strong><KeyRound size={16} aria-hidden="true" /> Sua chave nova (aparece só agora)</strong>
      <p className="muted small">Guarde num gerenciador de senhas. Não envie em conversas. Se perder, revogue e crie outra.</p>
      <div className="button-row"><code className="mcp-token">{created.token}</code><button type="button" className="button outline" onClick={() => copy(created.token)}><Copy size={15} aria-hidden="true" />Copiar chave</button></div>
      {connectionGuides(created.endpoint, created.token).map(guide => <details key={guide.app}><summary>{guide.app}</summary><p className="muted small">{guide.where}</p><pre className="mcp-snippet">{guide.code}</pre><button type="button" className="text-button" onClick={() => copy(guide.code)}><Copy size={14} aria-hidden="true" />Copiar</button></details>)}
      <button type="button" className="text-button" onClick={() => setCreated(null)}>Já guardei, esconder</button>
    </div>}
    <form className="ai-card" onSubmit={create}>
      <strong>Criar chave</strong>
      <div className="ai-field-grid">
        <label>Nome<input name="label" required maxLength={60} placeholder="Ex.: Claude Code do notebook" /></label>
        <label>Permissão<select name="permission" defaultValue="read"><option value="read">Só consultar</option><option value="write">Consultar e registrar</option></select></label>
        <label>Validade<select name="valid_days" defaultValue="90"><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">1 ano</option><option value="never">Sem validade</option></select></label>
      </div>
      <button className="button primary" disabled={busy}>Criar chave</button>
    </form>
    {state.tokens.length > 0 && <ul className="mcp-token-list">{state.tokens.map(token => <li key={token.id}>
      <span><strong>{token.label}</strong> · …{token.hint} · {token.can_write ? 'consulta e registra' : 'só consulta'}<br /><span className="muted small">Último uso: {when(token.last_used_at)}{token.expires_at ? ` · vale até ${when(token.expires_at)}` : ''}</span></span>
      <button type="button" className="text-button cm-danger" disabled={busy} onClick={() => void revoke(token)}><Trash2 size={15} aria-hidden="true" />Revogar</button>
    </li>)}</ul>}
    {message && <p className="cm-message" role="status">{message}</p>}
  </section>;
}
