'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BrainCircuit, CheckCircle2, KeyRound, ListChecks, Plug, PlugZap } from 'lucide-react';
import { aiCatalog, aiTaskLabels, type AiAdminState, type AiProviderId, type AiTaskId } from '@/lib/ai/catalog';
import { autoCapable, autoModes, isAuto, modelNote, type AutoMode } from '@/lib/ai/models';
import { api } from './client';
import { UsageSettings } from './usage-settings';

type Provider = AiAdminState['providers'][number];
type Task = AiAdminState['tasks'][number];
type ModelList = { ids: string[]; auto: Partial<Record<AutoMode, string | null>> };

// Owner-only (the server answers 403 to anyone else, and then this section stays hidden).
export function AiSettings() {
  const [state, setState] = useState<AiAdminState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [models, setModels] = useState<Partial<Record<AiProviderId, ModelList>>>({});
  const [loadingModels, setLoadingModels] = useState<Partial<Record<AiProviderId, boolean>>>({});
  const requested = useRef(new Set<AiProviderId>());
  // Each task asks for its provider's models once; the list feeds the select and the automatic modes.
  const ensureModels = useCallback(async (provider: AiProviderId) => {
    if (requested.current.has(provider)) return;
    requested.current.add(provider);
    setLoadingModels(previous => ({ ...previous, [provider]: true }));
    try { const list = await api<ModelList>('/api/ai/admin', { action: 'models', provider }); setModels(previous => ({ ...previous, [provider]: list })); }
    catch { setModels(previous => ({ ...previous, [provider]: { ids: [], auto: {} } })); }
    finally { setLoadingModels(previous => ({ ...previous, [provider]: false })); }
  }, []);
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
      const result = await api<{ text: string; ms: number; model: string }>('/api/ai/admin', { action: 'test', provider: task.provider, model: task.model });
      return `Funcionou com ${result.model} em ${(result.ms / 1000).toFixed(1)} s. Resposta: “${result.text}”`;
    });
  }
  function fetchModels(provider: AiProviderId) {
    void run(`m-${provider}`, async () => {
      const list = await api<ModelList>('/api/ai/admin', { action: 'models', provider });
      requested.current.add(provider);
      setModels(previous => ({ ...previous, [provider]: list }));
      return list.ids.length ? `${list.ids.length} modelos de texto em ${aiCatalog[provider].name}. Escolha na lista de cada tarefa.` : 'Este provedor não lista modelos: digite o nome do modelo na tarefa.';
    });
  }

  return <section className="panel ai-settings" aria-labelledby="ai-settings-title">
    <div className="section-heading"><h2 id="ai-settings-title"><BrainCircuit size={16} aria-hidden="true" /> Inteligência artificial</h2><span className="muted small">Só a sua conta de proprietário vê e altera</span></div>
    <p className={state.secretReady ? 'ai-status ok' : 'ai-status'}>{state.secretReady ? <><CheckCircle2 size={15} aria-hidden="true" /> Cofre de chaves pronto: as chaves ficam cifradas e nunca voltam para a tela.</> : <><KeyRound size={15} aria-hidden="true" /> Falta o segredo do cofre de chaves no servidor (AI_KEYS_SECRET).</>}</p>
    {message && <p className="cm-message" role="status">{message}</p>}

    <UsageSettings />

    <h3><ListChecks size={15} aria-hidden="true" /> Tarefas</h3>
    <div className="ai-grid">{state.tasks.map(task => <TaskForm key={`${task.id}-${task.updated_at}`} task={task} providers={state.providers} models={models} loading={loadingModels}
      ensureModels={ensureModels} busy={busy} onSave={event => saveTask(task, event)} onTest={() => test(task)} />)}</div>
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

// One task: provider, then the account's real models, plus automatic modes that follow new releases.
function TaskForm({ task, providers, models, loading, ensureModels, busy, onSave, onTest }: {
  task: Task; providers: Provider[]; models: Partial<Record<AiProviderId, ModelList>>; loading: Partial<Record<AiProviderId, boolean>>;
  ensureModels: (provider: AiProviderId) => Promise<void>; busy: string; onSave: (event: FormEvent<HTMLFormElement>) => void; onTest: () => void;
}) {
  const [provider, setProvider] = useState<AiProviderId | ''>(task.provider ?? '');
  const [model, setModel] = useState(task.model || (task.provider && autoCapable.includes(task.provider) ? 'auto:rapido' : ''));
  const [custom, setCustom] = useState(false);
  const [enabled, setEnabled] = useState(task.enabled);
  const voice = task.id === 'voz';
  const list = provider ? models[provider] : undefined;
  const ids = voice ? provider === 'openai' ? ['gpt-live-1'] : provider === 'gemini' ? ['gemini-3.8-live'] : [] : provider ? [...new Set([...(list?.ids ?? []), ...aiCatalog[provider].models])] : [];
  const canAuto = voice ? provider === 'gemini' : !!provider && autoCapable.includes(provider);
  const hasKey = !!providers.find(item => item.id === provider)?.has_key;
  useEffect(() => { if (provider && hasKey && !voice) void ensureModels(provider); }, [provider, hasKey, voice, ensureModels]);
  // A saved name that the list does not offer (or a provider that cannot list) opens the free-text field.
  const typed = custom || (!!model && !isAuto(model) && (!!list || !canAuto) && !ids.includes(model));
  const label = aiTaskLabels[task.id as AiTaskId];
  const picked = isAuto(model) ? list?.auto?.[model] : null;
  return <form className="ai-card" onSubmit={onSave}>
    <strong>{label.name}</strong>
    <span className="muted small">{label.help}</span>
    <label>Provedor<select name="provider" value={provider} onChange={event => { const next = event.target.value as AiProviderId | ''; setProvider(next); setCustom(false); if (next && !provider) setEnabled(true); setModel(voice && next === 'openai' ? 'gpt-live-1' : next && autoCapable.includes(next) ? 'auto:rapido' : ''); }}>
      <option value="">Nenhum</option>
      {providers.filter(item => !voice || ['gemini', 'openai'].includes(item.id)).map(item => <option key={item.id} value={item.id} disabled={!item.has_key}>{aiCatalog[item.id].name}{item.has_key ? item.enabled ? '' : ' · desligado' : ' · sem chave'}</option>)}
    </select></label>
    {provider && !typed && <label>Modelo<select aria-label="Modelo" value={model} onChange={event => { if (event.target.value === '__custom') { setCustom(true); setModel(''); } else setModel(event.target.value); }}>
      {!model && <option value="">Escolha um modelo</option>}
      {canAuto && (voice ? <option value="auto:rapido">Automático · voz disponível</option> : <optgroup label="Automático: acompanha os lançamentos">{(Object.keys(autoModes) as AutoMode[]).map(mode => <option key={mode} value={mode}>{autoModes[mode].label}{list?.auto?.[mode] ? ` (agora: ${list.auto[mode]})` : ''}</option>)}</optgroup>)}
      {ids.length > 0 && <optgroup label={`Modelos da sua conta (${ids.length})`}>{ids.map(id => <option key={id} value={id}>{id}{modelNote(provider, id) ? ` · ${modelNote(provider, id)}` : ''}</option>)}</optgroup>}
      {(!voice || provider === 'gemini') && <option value="__custom">Outro: digitar o nome…</option>}
    </select></label>}
    {provider && typed && <label>Nome do modelo<input value={model} onChange={event => setModel(event.target.value)} maxLength={120} placeholder="Ex.: gemini-3.8-flash" />
      {(canAuto || ids.length > 0) && <button type="button" className="text-button" onClick={() => { setCustom(false); setModel(canAuto ? 'auto:rapido' : ids[0] ?? ''); }}>Voltar para a lista</button>}</label>}
    <input type="hidden" name="model" value={model} />
    {provider && loading[provider] && <span className="muted small" role="status">Buscando os modelos da sua conta…</span>}
    {isAuto(model) && <span className="muted small">{voice ? 'Escolhe um modelo de voz autorizado para sua chave, priorizando a conversa sem espera de raciocínio prolongado.' : `${autoModes[model].hint}${picked ? ` Hoje usaria: ${picked}.` : ''}`}</span>}
    {provider === 'gemini' && !voice && <span className="muted small">Na chave gratuita do AI Studio, use os modos “rápido” ou “econômico” (Flash e Flash-Lite): os modelos Pro cobram desde o primeiro uso.</span>}
    {voice && <span className="muted small">Salve e teste em Assistente › Conversar ao vivo. A disponibilidade e a cobrança dependem da sua conta de API; a assinatura do ChatGPT ou do Claude não inclui esse uso.</span>}
    <label className="cm-check"><input type="checkbox" name="enabled" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Ligada</label>
    <div className="button-row">
      <button className="button primary" disabled={!!busy || (!!provider && !model)}>{busy === `t-${task.id}` ? 'Salvando…' : 'Salvar'}</button>
      {!voice && <button type="button" className="button outline" disabled={!!busy || !task.provider || !task.model} onClick={onTest}>{busy === `x-${task.id}` ? 'Testando…' : 'Testar'}</button>}
    </div>
  </form>;
}
