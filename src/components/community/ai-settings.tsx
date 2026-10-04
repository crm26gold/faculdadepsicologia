'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, BrainCircuit, ChevronDown, Gauge, KeyRound, LayoutDashboard, ListChecks, Plug, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { aiCatalog, aiTaskLabels, type AiAdminState, type AiProviderId } from '@/lib/ai/catalog';
import { autoCapable, autoModes, isAuto, modelNote, type AutoMode } from '@/lib/ai/models';
import { api, ApiError } from './client';
import { UsageSettings } from './usage-settings';

type Provider = AiAdminState['providers'][number];
type Task = AiAdminState['tasks'][number];
type Connection = NonNullable<AiAdminState['connections']>[number];
type ModelList = { ids: string[]; liveIds?: string[]; auto: Partial<Record<AutoMode, string | null>>; refreshedAt?: string };
type LiveResult = { connected: boolean; message: string; reference: string; stage: string; model?: string; ms: number; diagnostic?: { upstreamStatus?: number; upstreamCode?: string; reason?: string; invalidFields?: string[]; configurationIssue?: string } };
type View = 'overview' | 'connections' | 'tasks' | 'usage' | 'integrations';
const views = [{ id: 'overview', label: 'Visão geral', icon: LayoutDashboard }, { id: 'connections', label: 'Conexões e chaves', icon: KeyRound }, { id: 'tasks', label: 'Tarefas e modelos', icon: BrainCircuit }, { id: 'usage', label: 'Consumo e limites', icon: Gauge }, { id: 'integrations', label: 'Integrações', icon: Plug }] as const;
const updated = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const taskReady = (task: Task, providers: Provider[]) => !!(task.enabled && task.model && providers.some(provider => provider.id === task.provider && provider.enabled && provider.has_key));

// Keys stay in transient password fields, never in browser storage or returned metadata.
export function AiSettings() {
  const [state, setState] = useState<AiAdminState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<View>('overview');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [liveResult, setLiveResult] = useState<LiveResult | null>(null);
  const [models, setModels] = useState<Partial<Record<AiProviderId, ModelList>>>({});
  const [modelErrors, setModelErrors] = useState<Partial<Record<AiProviderId, string>>>({});
  const [loadingModels, setLoadingModels] = useState<Partial<Record<AiProviderId, boolean>>>({});
  const requested = useRef(new Set<AiProviderId>());
  const pendingModels = useRef(new Set<AiProviderId>());
  const load = useCallback(async () => {
    try { setState(await api<AiAdminState>('/api/ai/admin')); setLoadError(''); }
    catch (error) { if (error instanceof ApiError && error.status === 403) setHidden(true); else setLoadError('Não consegui carregar a Administração. Tente atualizar o painel.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const ensureModels = useCallback(async (provider: AiProviderId, refresh = false) => {
    if (pendingModels.current.has(provider) || (!refresh && requested.current.has(provider))) return;
    requested.current.add(provider); pendingModels.current.add(provider);
    setLoadingModels(previous => ({ ...previous, [provider]: true }));
    setModelErrors(previous => ({ ...previous, [provider]: '' }));
    try { const list = await api<ModelList>('/api/ai/admin', { action: 'models', provider }); setModels(previous => ({ ...previous, [provider]: list })); }
    catch (error) { setModelErrors(previous => ({ ...previous, [provider]: error instanceof Error ? error.message : 'Não consegui consultar os modelos.' })); }
    finally { pendingModels.current.delete(provider); setLoadingModels(previous => ({ ...previous, [provider]: false })); }
  }, []);
  async function run(key: string, action: () => Promise<string | void>) {
    setBusy(key); setMessage('');
    try { const done = await action(); if (done) setMessage(done); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.'); }
    finally { setBusy(''); }
  }
  if (hidden) return null;
  if (!state) return <div className="panel" role="status">{loadError || 'Abrindo a Administração de IA…'}{loadError && <button className="button outline" onClick={() => void load()}>Atualizar painel</button>}</div>;
  const ready = state.providers.filter(provider => provider.enabled && provider.has_key);
  const activeTasks = state.tasks.filter(task => taskReady(task, state.providers));
  const reserves = state.connections ?? [];
  function saveProvider(provider: Provider, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form);
    const value = (name: string) => String(fields.get(name) ?? '').trim();
    void run(`p-${provider.id}`, async () => {
      await api('/api/ai/admin', { action: 'save_provider', provider: provider.id, enabled: fields.get('enabled') === 'on', label: value('label'), base_url: value('base_url'), gcp_project: value('gcp_project'), gcp_location: value('gcp_location'), key: value('key') || null });
      form.reset(); requested.current.delete(provider.id); setModels(previous => ({ ...previous, [provider.id]: undefined })); setLiveResult(null);
      return `${aiCatalog[provider.id].name}: configuração salva. Teste a conexão para verificar o acesso.`;
    });
  }
  function saveTask(task: Task, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    void run(`t-${task.id}`, async () => {
      await api('/api/ai/admin', { action: 'save_task', task: task.id, provider: String(fields.get('provider') ?? ''), model: String(fields.get('model') ?? '').trim(), enabled: fields.get('enabled') === 'on' });
      if (task.id === 'voz') setLiveResult(null);
      return `${aiTaskLabels[task.id].name}: salvo.`;
    });
  }
  function test(task: Task) {
    if (task.id === 'voz') { setLiveResult(null); void run(`x-${task.id}`, async () => { setLiveResult(await api<LiveResult>('/api/ai/admin', { action: 'test_live' })); }); return; }
    if (!task.provider) return;
    void run(`x-${task.id}`, async () => {
      const result = await api<{ text: string; ms: number; model: string }>('/api/ai/admin', { action: 'test', provider: task.provider, model: task.model });
      return `Funcionou com ${result.model} em ${(result.ms / 1000).toFixed(1)} s. Resposta: “${result.text}”`;
    });
  }
  function verifyReserve(connection: Connection) {
    void run(`c-${connection.id}`, async () => {
      const list = await api<ModelList>('/api/ai/admin', { action: 'models', provider: connection.provider, connection_id: connection.id });
      return `${connection.label}: acesso à lista aceito, ${list.ids.length} modelos de texto e ${list.liveIds?.length ?? 0} de voz. Isso não garante cota para gerar respostas.`;
    });
  }
  return <section className="panel ai-settings ai-control" aria-labelledby="ai-settings-title">
    <div className="ai-control-heading"><div><span className="ai-eyebrow"><ShieldCheck size={14} aria-hidden="true" /> Administração privada</span><h2 id="ai-settings-title">Inteligência artificial</h2><p>O controle das suas conexões, em um só lugar.</p></div><button type="button" className="button outline" disabled={!!busy} onClick={() => void run('refresh', load)}><RefreshCw size={15} aria-hidden="true" /> Atualizar painel</button></div>
    <p className={state.secretReady ? 'ai-status ok' : 'ai-status'}>{state.secretReady ? <><ShieldCheck size={16} aria-hidden="true" /> Cofre de chaves pronto: as chaves ficam cifradas e nunca voltam para a tela.</> : <><KeyRound size={16} aria-hidden="true" /> Configure o segredo do cofre no servidor antes de cadastrar chaves.</>}</p>
    <nav className="ai-control-nav" aria-label="Seções da inteligência artificial">{views.map(item => <button key={item.id} type="button" aria-pressed={view === item.id} aria-controls={`ai-view-${item.id}`} onClick={() => setView(item.id)}><item.icon size={16} aria-hidden="true" />{item.label}</button>)}</nav>
    {loadError && <p className="cm-message" role="status">{loadError}</p>}{message && <p className="cm-message" role="status">{message}</p>}
    {liveResult && <div className="ai-card ai-diagnostic" role="status"><strong>{liveResult.connected ? 'Conexão Live aceita' : 'Diagnóstico da chamada'}</strong><p>{liveResult.message}</p><span className="muted small">Código: {liveResult.reference} · etapa: {liveResult.stage}{liveResult.model ? ` · ${liveResult.model}` : ''} · {(liveResult.ms / 1000).toFixed(1)} s</span>{liveResult.diagnostic && <span className="muted small">{[liveResult.diagnostic.upstreamStatus, liveResult.diagnostic.upstreamCode, liveResult.diagnostic.reason, liveResult.diagnostic.configurationIssue, ...(liveResult.diagnostic.invalidFields ?? [])].filter(Boolean).join(' · ')}</span>}<span className="muted small">Este teste não usa seu microfone, não gera fala e não executa ações.</span></div>}
    <div id="ai-view-overview" className="ai-admin-content" hidden={view !== 'overview'}>
      <div className="ai-overview-grid"><div className="ai-metric"><Plug size={20} aria-hidden="true" /><strong>{ready.length}<small> / {state.providers.length}</small></strong><span>Provedores configurados e ligados</span></div><div className="ai-metric"><ListChecks size={20} aria-hidden="true" /><strong>{activeTasks.length}<small> / {state.tasks.length}</small></strong><span>Tarefas com configuração ativa</span></div><div className="ai-metric"><ShieldCheck size={20} aria-hidden="true" /><strong>{reserves.filter(connection => connection.enabled).length}</strong><span>Chaves de reserva ligadas</span></div></div>
      <p className="muted small">Os indicadores mostram a configuração salva. Uma chave cadastrada precisa ser testada; não é uma garantia de conexão ou de créditos.</p>
      <div className="ai-card ai-next-step"><div><span className="ai-eyebrow">Seu próximo passo</span><h3>{!ready.length ? 'Conecte sua primeira API' : liveResult?.connected ? 'Experimente uma chamada' : 'Verifique a chamada ao vivo'}</h3><p>{!ready.length ? 'Escolha uma empresa, cadastre a chave e ligue a conexão.' : 'Confira a tarefa de voz e execute o diagnóstico. O resultado mostra a etapa exata da conexão.'}</p></div><button type="button" className="button primary" onClick={() => setView(ready.length ? 'tasks' : 'connections')}>{ready.length ? 'Configurar e testar' : 'Cadastrar conexão'}<ArrowRight size={16} aria-hidden="true" /></button></div>
      <h3>Sua Jornada usa IA para</h3><div className="ai-grid">{state.tasks.map(task => <div className="ai-card" key={task.id}><div className="section-heading"><strong>{aiTaskLabels[task.id].name}</strong><span className="ai-badge">{taskReady(task, state.providers) ? 'Configurada' : 'Pendente'}</span></div><span>{task.provider ? aiCatalog[task.provider].name : 'Escolha uma conexão'}</span><span className="muted small">{isAuto(task.model) ? autoModes[task.model].label : task.model || 'Modelo ainda não escolhido'}</span><button type="button" className="text-button" onClick={() => setView('tasks')}>Gerenciar tarefa <ArrowRight size={14} aria-hidden="true" /></button></div>)}</div>
      <div className="ai-explainer"><Sparkles size={22} aria-hidden="true" /><div><strong>Automático, com critérios claros</strong><p>A Jornada consulta os modelos disponíveis para sua chave e aplica sua preferência de qualidade, rapidez ou economia. A lista tem cache de até uma hora; você pode atualizar agora. A escolha segue regras de família e versão, sem gastar tokens com outra IA para escolher.</p></div></div>
    </div>
    <div id="ai-view-connections" className="ai-admin-content" hidden={view !== 'connections'}>
      <div><h3>Suas conexões</h3><p className="muted">Abra uma empresa para cadastrar ou trocar a chave, consultar os modelos e gerenciar suas reservas.</p></div>
      <div className="ai-provider-list">{state.providers.map(provider => <details className="ai-provider" key={provider.id}><summary><span className="ai-provider-symbol"><Plug size={20} aria-hidden="true" /></span><span className="ai-provider-name"><strong>{aiCatalog[provider.id].name}</strong><small>{provider.has_key ? `chave …${provider.key_hint} · ${reserves.filter(row => row.provider === provider.id && row.enabled).length} reservas ligadas` : 'Nenhuma chave cadastrada'}</small></span><span className="ai-badge">{provider.has_key ? provider.enabled ? 'Ligado' : 'Pausado' : 'Configurar'}</span><ChevronDown className="ai-provider-chevron" size={18} aria-hidden="true" /></summary>
        <ProviderForm key={`${provider.id}-${provider.updated_at}`} provider={provider} busy={busy} safe={state.secretReady} loading={!!loadingModels[provider.id]} list={models[provider.id]} error={modelErrors[provider.id]} onSave={event => saveProvider(provider, event)} onModels={() => void ensureModels(provider.id, true)} onRemove={() => {
          if (window.confirm(`Remover a chave principal de ${aiCatalog[provider.id].name}? As tarefas desta empresa serão pausadas.`)) void run(`p-${provider.id}`, async () => { await api('/api/ai/admin', { action: 'save_provider', provider: provider.id, enabled: false, label: provider.label, base_url: provider.base_url, gcp_project: provider.gcp_project, gcp_location: provider.gcp_location, key: '' }); requested.current.delete(provider.id); setModels(previous => ({ ...previous, [provider.id]: undefined })); setLiveResult(null); return 'Chave principal removida e conexão desligada.'; });
        }} />
        {reserves.filter(row => row.provider === provider.id).map(connection => <ReserveForm key={`${connection.id}-${connection.updated_at}`} connection={connection} busy={busy} onVerify={() => verifyReserve(connection)} onSave={event => { event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); void run(`c-${connection.id}`, async () => { await api('/api/ai/admin', { action: 'save_connection', id: connection.id, provider: connection.provider, label: String(fields.get('label')), position: Number(fields.get('position')), enabled: fields.get('enabled') === 'on', key: String(fields.get('key') ?? '') || null }); form.reset(); return 'Reserva salva.'; }); }} onRemove={() => { if (window.confirm(`Remover a reserva ${connection.label}?`)) void run(`c-${connection.id}`, async () => { await api('/api/ai/admin', { action: 'remove_connection', id: connection.id }); return 'Reserva removida.'; }); }} />)}
      </details>)}</div>
      {state.connections && <><h3>Continuidade com chaves de reserva</h3><p className="muted small">A chave principal vem primeiro, seguida das duas primeiras reservas ligadas, por prioridade. Use chaves da mesma empresa e do mesmo projeto ou endereço. Falhas de rede, acesso e serviço podem tentar a próxima; cota, faturamento e configuração inválida encerram o pedido. No máximo quatro tentativas, com controle de uso em cada uma.</p><NewReserve providers={state.providers} reserves={reserves} busy={busy} safe={state.secretReady} onSave={event => { event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); void run('new-connection', async () => { await api('/api/ai/admin', { action: 'save_connection', id: null, provider: String(fields.get('provider')), label: String(fields.get('label')), enabled: fields.get('enabled') === 'on', position: Number(fields.get('position')), key: String(fields.get('key')) }); form.reset(); return 'Chave de reserva cadastrada.'; }); }} /></>}
    </div>
    <div id="ai-view-tasks" className="ai-admin-content" hidden={view !== 'tasks'}><div><h3>Uma escolha para cada tarefa</h3><p className="muted">Use uma preferência automática ou fixe um modelo. Salve suas alterações antes de testar.</p></div><div className="ai-grid">{state.tasks.map(task => <TaskForm key={`${task.id}-${task.updated_at}`} task={task} providers={state.providers} models={models} loading={loadingModels} errors={modelErrors} active={view === 'tasks'} ensureModels={ensureModels} busy={busy} onSave={event => saveTask(task, event)} onTest={() => test(task)} />)}</div>{!ready.length && <button type="button" className="button outline" onClick={() => setView('connections')}>Cadastrar uma conexão primeiro</button>}</div>
    <div id="ai-view-usage" className="ai-admin-content" hidden={view !== 'usage'}>{view === 'usage' && <UsageSettings />}</div>
    <div id="ai-view-integrations" className="ai-admin-content" hidden={view !== 'integrations'}><h3>Um núcleo, várias entradas</h3><p className="muted">Conexões externas têm autorização própria. As opções abaixo indicam o que está disponível e o que ainda precisa ser ativado.</p><ul className="ai-roadmap"><li><strong>Telegram · configuração disponível</strong><span>O bot usa o mesmo núcleo, modelos e reservas desta Administração. Configure e vincule sua conta na seção Telegram da Administração. A chamada abre no site.</span></li><li><strong>WhatsApp · API da Meta pendente</strong><span>Ter o WhatsApp Business no celular não ativa a integração. O recebimento continua fechado até a configuração da API, assinatura do webhook e vínculo da pessoa.</span></li><li><strong>MCP · planejado</strong><span>O conector da Jornada para outros assistentes ainda não foi ativado. Precisa de autenticação, permissões e revogação por pessoa.</span></li><li><strong>Google Agenda e Drive · autorização pendente</strong><span>A exportação da agenda em arquivo já funciona. Sincronização e acesso ao Drive dependem de conexão OAuth.</span></li></ul><div className="ai-explainer"><ShieldCheck size={20} aria-hidden="true" /><p>Nenhuma assinatura ou integração é ativada por abrir este painel. Testes de geração e chamadas podem consumir a cota da API; consultar modelos não gera uma resposta de IA.</p></div></div>
  </section>;
}

function ProviderForm({ provider, busy, safe, loading, list, error, onSave, onModels, onRemove }: { provider: Provider; busy: string; safe: boolean; loading: boolean; list?: ModelList; error?: string; onSave: (event: FormEvent<HTMLFormElement>) => void; onModels: () => void; onRemove: () => void }) {
  const info = aiCatalog[provider.id];
  return <form className="ai-card ai-provider-form" onSubmit={onSave}><strong>Chave principal · {info.name}</strong><span className="muted small">{info.help}</span><label>Nome da conexão<input name="label" defaultValue={provider.label} placeholder="Ex.: Minha conta principal" maxLength={60} /></label>{info.fields.includes('base_url') && <label>Endereço base da API<input name="base_url" defaultValue={provider.base_url} placeholder="https://…/v1" maxLength={300} /></label>}{info.fields.includes('gcp_project') && <label>Projeto do Google Cloud<input name="gcp_project" defaultValue={provider.gcp_project} placeholder="Opcional: lido da credencial" maxLength={100} /></label>}{info.fields.includes('gcp_location') && <label>Região<input name="gcp_location" defaultValue={provider.gcp_location} placeholder="us-central1 ou global" maxLength={40} /></label>}<label>{info.keyLabel}{provider.id === 'vertex' ? <textarea name="key" rows={3} spellCheck={false} autoComplete="off" placeholder={provider.has_key ? 'Guardada. Cole outra para trocar.' : 'Cole o conteúdo do arquivo JSON'} /> : <input name="key" type="password" autoComplete="off" spellCheck={false} placeholder={provider.has_key ? `Guardada (…${provider.key_hint}). Cole outra para trocar.` : 'Cole a chave'} />}</label><span className="muted small">Deixe a chave vazia para manter a atual. Ela não fica salva no navegador.</span><label className="cm-check"><input type="checkbox" name="enabled" defaultChecked={provider.enabled} /> Ligado</label><div className="button-row"><button className="button primary" disabled={!!busy || !safe}>{busy === `p-${provider.id}` ? 'Salvando…' : 'Salvar'}</button>{provider.has_key && provider.id !== 'vertex' && <button type="button" className="button outline" disabled={!!busy || loading} onClick={onModels}><RefreshCw size={14} aria-hidden="true" />{loading ? 'Buscando…' : 'Ver modelos'}</button>}{provider.has_key && <button type="button" className="text-button cm-danger" disabled={!!busy} onClick={onRemove}>Remover chave</button>}</div>{error && <p className="cm-message" role="status">{error}</p>}{list && <div className="ai-model-summary"><strong>{list.ids.length} modelos de texto · {list.liveIds?.length ?? 0} de voz</strong>{list.refreshedAt && <span className="muted small">Consulta: {updated(list.refreshedAt)}</span>}<span className="muted small">Escolha em Tarefas e modelos. A listagem confirma acesso, mas não garante cota de geração.</span></div>}</form>;
}

function ReserveForm({ connection, busy, onSave, onRemove, onVerify }: { connection: Connection; busy: string; onSave: (event: FormEvent<HTMLFormElement>) => void; onRemove: () => void; onVerify: () => void }) {
  return <form className="ai-card ai-reserve-form" onSubmit={onSave}><strong>Reserva · {connection.label} <span className="ai-badge">{connection.enabled ? 'Ligada' : 'Pausada'} · chave …{connection.key_hint}</span></strong><div className="ai-field-grid"><label>Nome<input name="label" defaultValue={connection.label} maxLength={60} required /></label><label>Prioridade<select name="position" defaultValue={connection.position}>{[1,2,3,4,5].map(position => <option key={position} value={position}>{position} · menor número primeiro</option>)}</select></label></div><label>Trocar chave<input name="key" type="password" autoComplete="off" placeholder="Deixe vazio para manter" /></label><label className="cm-check"><input type="checkbox" name="enabled" defaultChecked={connection.enabled} /> Usar como reserva</label><div className="button-row"><button className="button primary" disabled={!!busy}>Salvar reserva</button>{connection.provider !== 'vertex' && <button type="button" className="button outline" disabled={!!busy} onClick={onVerify}>Verificar reserva</button>}<button type="button" className="text-button cm-danger" disabled={!!busy} onClick={onRemove}>Remover</button></div></form>;
}

function NewReserve({ providers, reserves, busy, safe, onSave }: { providers: Provider[]; reserves: Connection[]; busy: string; safe: boolean; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const [provider, setProvider] = useState<AiProviderId>(providers.find(item => item.has_key)?.id ?? providers[0].id);
  const [position, setPosition] = useState('');
  const free = [1,2,3,4,5].filter(value => !reserves.some(row => row.provider === provider && row.position === value));
  const selected = free.includes(Number(position)) ? position : String(free[0] ?? '');
  return <form className="ai-card" onSubmit={onSave}><strong>Adicionar uma reserva</strong><div className="ai-field-grid"><label>Empresa<select name="provider" value={provider} onChange={event => { setProvider(event.target.value as AiProviderId); setPosition(''); }}>{providers.map(item => <option key={item.id} value={item.id}>{aiCatalog[item.id].name}</option>)}</select></label><label>Nome<input name="label" maxLength={60} required placeholder="Ex.: Minha reserva" /></label><label>Prioridade<select name="position" value={selected} onChange={event => setPosition(event.target.value)}>{free.map(value => <option key={value} value={value}>{value} · menor número primeiro</option>)}{!free.length && <option value="">Todas as posições ocupadas</option>}</select></label><label>{provider === 'vertex' ? 'Credencial JSON' : 'Chave'}{provider === 'vertex' ? <textarea name="key" autoComplete="off" rows={3} required /> : <input name="key" type="password" autoComplete="off" required />}</label></div><label className="cm-check"><input type="checkbox" name="enabled" /> Usar como reserva</label><p className="muted small">Uma reserva precisa da conexão principal ligada. É ativada somente se você marcar esta opção.</p><button className="button primary" disabled={!!busy || !safe || !free.length}>Cadastrar reserva</button></form>;
}

function TaskForm({ task, providers, models, loading, errors, active, ensureModels, busy, onSave, onTest }: { task: Task; providers: Provider[]; models: Partial<Record<AiProviderId, ModelList>>; loading: Partial<Record<AiProviderId, boolean>>; errors: Partial<Record<AiProviderId, string>>; active: boolean; ensureModels: (provider: AiProviderId, refresh?: boolean) => Promise<void>; busy: string; onSave: (event: FormEvent<HTMLFormElement>) => void; onTest: () => void }) {
  const [provider, setProvider] = useState<AiProviderId | ''>(task.provider ?? '');
  const [model, setModel] = useState(task.model || (task.provider && autoCapable.includes(task.provider) ? 'auto:rapido' : ''));
  const [custom, setCustom] = useState(false);
  const [enabled, setEnabled] = useState(task.enabled);
  const voice = task.id === 'voz'; const list = provider ? models[provider] : undefined;
  const ids = voice ? provider === 'openai' ? ['gpt-live-1'] : list?.liveIds ?? [] : list?.ids ?? [];
  const canAuto = voice ? provider === 'gemini' : !!provider && autoCapable.includes(provider);
  const hasKey = !!providers.find(item => item.id === provider)?.has_key;
  const dirty = provider !== (task.provider ?? '') || model !== task.model || enabled !== task.enabled;
  useEffect(() => { if (active && provider && hasKey && provider !== 'vertex') void ensureModels(provider); }, [active, provider, hasKey, ensureModels]);
  const typed = custom || (!!model && !isAuto(model) && (!!list || !canAuto) && !ids.includes(model));
  const picked = isAuto(model) ? list?.auto?.[model] : null;
  return <form className="ai-card ai-task-card" onSubmit={onSave}><div className="section-heading"><strong>{aiTaskLabels[task.id].name}</strong><span className="ai-badge">{dirty ? 'Não salvo' : taskReady(task, providers) ? 'Configurada' : 'Pendente'}</span></div><span className="muted small">{aiTaskLabels[task.id].help}</span><label>Provedor<select name="provider" value={provider} onChange={event => { const next = event.target.value as AiProviderId | ''; setProvider(next); setCustom(false); setModel(voice && next === 'openai' ? 'gpt-live-1' : next && autoCapable.includes(next) ? 'auto:rapido' : ''); }}><option value="">Nenhum</option>{providers.filter(item => !voice || ['gemini', 'openai'].includes(item.id)).map(item => <option key={item.id} value={item.id} disabled={!item.has_key || !item.enabled}>{aiCatalog[item.id].name}{item.has_key ? item.enabled ? '' : ' · pausado' : ' · sem chave'}</option>)}</select></label>
    {provider && !typed && <label>Modelo<select aria-label="Modelo" value={model} onChange={event => { if (event.target.value === '__custom') { setCustom(true); setModel(''); } else setModel(event.target.value); }}>{!model && <option value="">Escolha um modelo</option>}{canAuto && (voice ? <option value="auto:rapido">Automático · voz disponível</option> : <optgroup label="Preferência automática">{(Object.keys(autoModes) as AutoMode[]).map(mode => <option key={mode} value={mode}>{autoModes[mode].label}</option>)}</optgroup>)}{ids.length > 0 && <optgroup label={`Modelos da sua conta (${ids.length})`}>{ids.map(id => <option key={id} value={id}>{id}{modelNote(provider, id) ? ` · ${modelNote(provider, id)}` : ''}</option>)}</optgroup>}{(!voice || provider === 'gemini') && <option value="__custom">Outro: digitar o nome…</option>}</select></label>}
    {provider && typed && <label>Nome do modelo<input value={model} onChange={event => setModel(event.target.value)} maxLength={120} placeholder="Nome exato do modelo" />{(canAuto || ids.length > 0) && <button type="button" className="text-button" onClick={() => { setCustom(false); setModel(canAuto ? 'auto:rapido' : ids[0] ?? ''); }}>Voltar para a lista</button>}</label>}<input type="hidden" name="model" value={model} />
    {provider && loading[provider] && <span className="muted small" role="status">Buscando os modelos da sua conta…</span>}{provider && errors[provider] && <p className="cm-message" role="status">{errors[provider]}</p>}{provider && hasKey && provider !== 'vertex' && <button type="button" className="text-button" disabled={!!busy || !!loading[provider]} onClick={() => void ensureModels(provider, true)}><RefreshCw size={14} aria-hidden="true" /> Atualizar modelos</button>}{list?.refreshedAt && <span className="muted small">Lista consultada: {updated(list.refreshedAt)}</span>}
    {isAuto(model) && <div className="ai-model-summary"><Sparkles size={16} aria-hidden="true" /><span className="muted small">{voice ? 'Escolhe um modelo Live autorizado para sua chave no momento da chamada.' : `${autoModes[model].hint}${picked ? ` Hoje usaria: ${picked}.` : ''}`}</span></div>}{voice && <span className="muted small">A assinatura do ChatGPT ou Claude não inclui uso da API. O teste de conexão abaixo é para Gemini; teste OpenAI no Assistente.</span>}<label className="cm-check"><input type="checkbox" name="enabled" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Ligada</label><div className="button-row"><button className="button primary" disabled={!!busy || (!!provider && !model)}>{busy === `t-${task.id}` ? 'Salvando…' : 'Salvar'}</button><button type="button" className="button outline" disabled={!!busy || dirty || !taskReady(task, providers) || (voice && task.provider !== 'gemini')} onClick={onTest}>{busy === `x-${task.id}` ? 'Testando…' : voice ? 'Testar conexão de voz' : 'Testar'}</button></div>{dirty && <span className="muted small">Salve para testar esta configuração.</span>}</form>;
}
