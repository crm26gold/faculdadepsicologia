'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BrainCircuit, CheckCircle2, KeyRound, ListChecks, Plug, PlugZap } from 'lucide-react';
import { aiCatalog, aiTaskLabels, type AiAdminState, type AiProviderId, type AiTaskId } from '@/lib/ai/catalog';
import { api } from './client';

type Provider = AiAdminState['providers'][number];
type Task = AiAdminState['tasks'][number];

// Owner-only (the server answers 403 to anyone else, and then this section stays hidden).
export function AiSettings() {
  const [state, setState] = useState<AiAdminState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [models, setModels] = useState<Partial<Record<AiProviderId, string[]>>>({});
  const load = useCallback(async () => {
    try { setState(await api<AiAdminState>('/api/ai/admin')); }
    catch { setHidden(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function run(key: string, action: () => Promise<string | void>) {
    setBusy(key); setMessage('');
    try { const done = await action(); if (done) setMessage(done); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.'); }
    finally { setBusy(''); }
  }
  if (hidden) return null;
  if (!state) return <p role="status" className="loading-panel">Abrindo a configuração de IA…</p>;
  const ready = state.providers.filter(provider => provider.enabled && provider.has_key);

  function saveProvider(provider: Provider, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const value = (name: string) => String(fields.get(name) ?? '').trim();
    const key = value('key');
    void run(`p-${provider.id}`, async () => {
      await api('/api/ai/admin', { action: 'save_provider', provider: provider.id, enabled: fields.get('enabled') === 'on', label: value('label'),
        base_url: value('base_url'), gcp_project: value('gcp_project'), gcp_location: value('gcp_location'), key: key || null });
      (event.target as HTMLFormElement).reset();
      return `${aiCatalog[provider.id].name}: salvo.`;
    });
  }
  function saveTask(task: Task, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void run(`t-${task.id}`, async () => {
      await api('/api/ai/admin', { action: 'save_task', task: task.id, provider: String(fields.get('provider') ?? ''), model: String(fields.get('model') ?? '').trim(), enabled: fields.get('enabled') === 'on' });
      return `${aiTaskLabels[task.id].name}: salvo.`;
    });
  }
  function test(task: Task) {
    if (!task.provider) { setMessage('Escolha um provedor e salve antes de testar.'); return; }
    void run(`x-${task.id}`, async () => {
      const result = await api<{ text: string; ms: number }>('/api/ai/admin', { action: 'test', provider: task.provider, model: task.model });
      return `Funcionou em ${(result.ms / 1000).toFixed(1)} s. Resposta: “${result.text}”`;
    });
  }
  function fetchModels(provider: AiProviderId) {
    void run(`m-${provider}`, async () => {
      const list = await api<string[]>('/api/ai/admin', { action: 'models', provider });
      setModels(previous => ({ ...previous, [provider]: list }));
      return list.length ? `${list.length} modelos disponíveis em ${aiCatalog[provider].name}. Eles aparecem como sugestão no campo Modelo.` : 'Este provedor não lista modelos: digite o nome do modelo.';
    });
  }

  return <section className="panel ai-settings" aria-labelledby="ai-settings-title">
    <div className="section-heading"><h2 id="ai-settings-title"><BrainCircuit size={16} aria-hidden="true" /> Inteligência artificial</h2><span className="muted small">Só a sua conta de proprietário vê e altera</span></div>
    <p className={state.secretReady ? 'ai-status ok' : 'ai-status'}>{state.secretReady ? <><CheckCircle2 size={15} aria-hidden="true" /> Cofre de chaves pronto: as chaves ficam cifradas e nunca voltam para a tela.</> : <><KeyRound size={15} aria-hidden="true" /> Falta o segredo do cofre de chaves no servidor (AI_KEYS_SECRET).</>}</p>
    {message && <p className="cm-message" role="status">{message}</p>}

    <h3><ListChecks size={15} aria-hidden="true" /> Tarefas</h3>
    <div className="ai-grid">{state.tasks.map(task => <form key={task.id} className="ai-card" onSubmit={event => saveTask(task, event)}>
      <strong>{aiTaskLabels[task.id as AiTaskId].name}</strong>
      <span className="muted small">{aiTaskLabels[task.id as AiTaskId].help}</span>
      <label>Provedor<select name="provider" defaultValue={task.provider ?? ''}><option value="">Nenhum</option>{state.providers.map(provider => <option key={provider.id} value={provider.id} disabled={!provider.has_key}>{aiCatalog[provider.id].name}{provider.has_key ? provider.enabled ? '' : ' · desligado' : ' · sem chave'}</option>)}</select></label>
      <label>Modelo<input name="model" defaultValue={task.model} maxLength={120} list={`ai-models-${task.id}`} placeholder="Nome exato do modelo" /></label>
      <datalist id={`ai-models-${task.id}`}>{(task.provider ? [...(models[task.provider] ?? []), ...aiCatalog[task.provider].models] : []).map(model => <option key={model} value={model} />)}</datalist>
      <label className="cm-check"><input type="checkbox" name="enabled" defaultChecked={task.enabled} /> Ligada</label>
      <div className="button-row"><button className="button primary" disabled={!!busy}>{busy === `t-${task.id}` ? 'Salvando…' : 'Salvar'}</button><button type="button" className="button outline" disabled={!!busy || !task.provider || !task.model} onClick={() => test(task)}>{busy === `x-${task.id}` ? 'Testando…' : 'Testar'}</button></div>
    </form>)}</div>
    {!ready.length && <p className="muted small">Cadastre e ligue pelo menos um provedor abaixo para escolher nas tarefas.</p>}

    <h3><KeyRound size={15} aria-hidden="true" /> Provedores</h3>
    <div className="ai-grid">{state.providers.map(provider => { const info = aiCatalog[provider.id]; return <form key={provider.id} className="ai-card" onSubmit={event => saveProvider(provider, event)}>
      <strong>{info.name}{provider.has_key && <span className="ai-badge">{provider.enabled ? 'Ligado' : 'Desligado'} · chave …{provider.key_hint}</span>}</strong>
      <span className="muted small">{info.help}</span>
      {info.fields.includes('base_url') && <label>Endereço base da API<input name="base_url" defaultValue={provider.base_url} placeholder="https://…/v1" maxLength={300} /></label>}
      {info.fields.includes('gcp_project') && <label>Projeto do Google Cloud<input name="gcp_project" defaultValue={provider.gcp_project} placeholder="Opcional: lido da credencial" maxLength={100} /></label>}
      {info.fields.includes('gcp_location') && <label>Região<input name="gcp_location" defaultValue={provider.gcp_location} placeholder="us-central1 ou global" maxLength={40} /></label>}
      <label>{info.keyLabel}{provider.id === 'vertex'
        ? <textarea name="key" rows={3} spellCheck={false} autoComplete="off" placeholder={provider.has_key ? 'Guardada. Cole outra para trocar.' : 'Cole aqui o conteúdo do arquivo JSON'} />
        : <input name="key" type="password" autoComplete="off" spellCheck={false} placeholder={provider.has_key ? `Guardada (…${provider.key_hint}). Cole outra para trocar.` : 'Cole a chave'} />}</label>
      <input type="hidden" name="label" value={provider.label} />
      <label className="cm-check"><input type="checkbox" name="enabled" defaultChecked={provider.enabled} /> Ligado</label>
      <div className="button-row">
        <button className="button primary" disabled={!!busy}>{busy === `p-${provider.id}` ? 'Salvando…' : 'Salvar'}</button>
        {provider.has_key && provider.id !== 'vertex' && <button type="button" className="button outline" disabled={!!busy} onClick={() => fetchModels(provider.id)}>{busy === `m-${provider.id}` ? 'Buscando…' : 'Ver modelos'}</button>}
        {provider.has_key && <button type="button" className="button outline cm-danger" disabled={!!busy} onClick={() => { if (window.confirm(`Remover a chave de ${info.name}?`)) void run(`p-${provider.id}`, async () => { await api('/api/ai/admin', { action: 'save_provider', provider: provider.id, enabled: false, label: provider.label, base_url: provider.base_url, gcp_project: provider.gcp_project, gcp_location: provider.gcp_location, key: '' }); return 'Chave removida.'; }); }}>Remover chave</button>}
      </div>
    </form>; })}</div>

    <h3><Plug size={15} aria-hidden="true" /> Conectores com outras IAs</h3>
    <div className="ai-card ai-connectors">
      <strong><PlugZap size={15} aria-hidden="true" /> ChatGPT, Claude e outros assistentes (padrão MCP)</strong>
      <span className="muted small">Próxima etapa: um conector seguro para você conversar com a sua Jornada Plena de dentro do ChatGPT ou do Claude, usando as suas assinaturas. Cada acesso vai pedir a sua autorização e poderá ser revogado aqui.</span>
    </div>
    <h3><Plug size={15} aria-hidden="true" /> Integrações planejadas (visível só para você)</h3>
    <ul className="ai-roadmap">
      <li><strong>WhatsApp</strong><span>Fechado por segurança: o endereço de recebimento recusa tudo até cada pessoa vincular e confirmar o próprio número. Nada aparece para os usuários.</span></li>
      <li><strong>Google Agenda (sincronização)</strong><span>Hoje só a exportação em arquivo funciona. A sincronização nos dois sentidos depende de autorização do Google por pessoa.</span></li>
      <li><strong>Google Drive</strong><span>Biblioteca de materiais por matéria e backup; depende de autorização do Google por pessoa.</span></li>
      <li><strong>Microsoft Teams e instituições</strong><span>Avisos da turma; depende de acesso liberado por cada instituição.</span></li>
    </ul>
  </section>;
}
