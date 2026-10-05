'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, BrainCircuit, ChevronDown, Gauge, KeyRound, LayoutDashboard, ListChecks, Plug, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { aiCatalog, aiTaskLabels, liveProviders, voiceOnlyProviders, type AiAdminState, type AiProviderId } from '@/lib/ai/catalog';
import { autoCapable, autoModes, isAuto, modelNote, type AutoMode } from '@/lib/ai/models';
import { api, ApiError } from './client';
import { UsageSettings } from './usage-settings';
import { McpSettings } from './mcp-settings';

type Provider = AiAdminState['providers'][number];
type Task = AiAdminState['tasks'][number];
type Connection = NonNullable<AiAdminState['connections']>[number];
type ModelList = { ids: string[]; liveIds?: string[]; auto: Partial<Record<AutoMode, string | null>>; refreshedAt?: string };
type LiveResult = { connected: boolean; message: string; reference: string; stage: string; model?: string; ms: number; diagnostic?: { upstreamStatus?: number; upstreamCode?: string; reason?: string; invalidFields?: string[]; configurationIssue?: string } };
type View = 'overview' | 'connections' | 'tasks' | 'usage' | 'integrations';
const views = [{ id: 'overview', label: 'Visão geral', icon: LayoutDashboard }, { id: 'connections', label: 'Conexões e chaves', icon: KeyRound }, { id: 'tasks', label: 'Tarefas e modelos', icon: BrainCircuit }, { id: 'usage', label: 'Consumo e limites', icon: Gauge }, { id: 'integrations', label: 'Integrações', icon: Plug }] as const;
const updated = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const taskReady = (task: Task, providers: Provider[], connections: Connection[] = []) => !!(task.enabled && task.model && ((task.connection_id ? connections.some(row => row.id === task.connection_id && row.enabled) : providers.some(provider => provider.id === task.provider && provider.enabled && provider.has_key)) || (task.routing_mode === 'fallback' && task.fallbacks?.some(fallback => fallback.model && connections.some(row => row.id === fallback.connection_id && row.enabled)))));

// Keys stay in transient password fields, never in browser storage or returned metadata.
export function AiSettings() {
  const [state, setState] = useState<AiAdminState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<View>('overview');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [liveResult, setLiveResult] = useState<LiveResult | null>(null);
  const [models, setModels] = useState<Record<string, ModelList | undefined>>({});
  const [modelErrors, setModelErrors] = useState<Record<string, string | undefined>>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean | undefined>>({});
  const requested = useRef(new Set<string>());
  const pendingModels = useRef(new Set<string>());
  const [search, setSearch] = useState('');
  const load = useCallback(async () => {
    try { setState(await api<AiAdminState>('/api/ai/admin')); setLoadError(''); }
    catch (error) { if (error instanceof ApiError && error.status === 403) setHidden(true); else setLoadError('Não consegui carregar a Administração. Tente atualizar o painel.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const ensureModels = useCallback(async (provider: AiProviderId, refresh = false, connectionId?: string) => {
    const key = connectionId || provider;
    if (pendingModels.current.has(key) || (!refresh && requested.current.has(key))) return;
    requested.current.add(key); pendingModels.current.add(key);
    setLoadingModels(previous => ({ ...previous, [key]: true }));
    setModelErrors(previous => ({ ...previous, [key]: '' }));
    try { const list = await api<ModelList>('/api/ai/admin', { action: 'models', provider, ...(connectionId ? { connection_id: connectionId } : {}) }); setModels(previous => ({ ...previous, [key]: list })); }
    catch (error) { setModelErrors(previous => ({ ...previous, [key]: error instanceof Error ? error.message : 'Não consegui consultar os modelos.' })); }
    finally { pendingModels.current.delete(key); setLoadingModels(previous => ({ ...previous, [key]: false })); }
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
  const activeTasks = state.tasks.filter(task => taskReady(task, state.providers, state.connections));
  const reserves = state.connections ?? [];
  const availableCount = ready.length + reserves.filter(row => row.enabled).length;
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
      const provider = String(fields.get('provider') ?? '');
      if (!provider) { await api('/api/ai/admin', { action: 'save_task', task: task.id, provider: '', model: '', enabled: false }); return 'Tarefa desligada.'; }
      const fallbacks = [0,1].flatMap(index => fields.get(`fallback-${index}`) ? [{ connection_id: String(fields.get(`fallback-${index}`)), model: String(fields.get(`fallback-model-${index}`)).trim() }] : []);
      await api('/api/ai/admin', { action: 'save_route', task: task.id, provider, connection_id: fields.get('connection_id') || null, model: String(fields.get('model') ?? '').trim(), enabled: fields.get('enabled') === 'on', routing_mode: fields.get('routing_mode') ?? 'fixed', fallbacks });
      if (task.id === 'voz') setLiveResult(null);
      return `${aiTaskLabels[task.id].name}: salvo.`;
    });
  }
  function test(task: Task) {
    if (task.id === 'voz') { setLiveResult(null); void run(`x-${task.id}`, async () => { setLiveResult(await api<LiveResult>('/api/ai/admin', { action: 'test_live' })); }); return; }
    if (!task.provider) return;
    void run(`x-${task.id}`, async () => {
      const result = await api<{ text: string; ms: number; model: string; provider?: AiProviderId }>('/api/ai/admin', { action: 'test_task', task: task.id });
      return `Funcionou com ${result.model} em ${(result.ms / 1000).toFixed(1)} s${result.provider ? ` · ${aiCatalog[result.provider].name}` : ""}. Resposta: “${result.text}”`;
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
    {liveResult && <div className="ai-card ai-diagnostic" role="status"><strong>{liveResult.connected ? 'Conexão de voz aceita' : 'Diagnóstico da chamada'}</strong><p>{liveResult.message}</p><span className="muted small">Código: {liveResult.reference} · etapa: {liveResult.stage}{liveResult.model ? ` · ${liveResult.model}` : ''} · {(liveResult.ms / 1000).toFixed(1)} s</span>{liveResult.diagnostic && <span className="muted small">{[liveResult.diagnostic.upstreamStatus, liveResult.diagnostic.upstreamCode, liveResult.diagnostic.reason, liveResult.diagnostic.configurationIssue, ...(liveResult.diagnostic.invalidFields ?? [])].filter(Boolean).join(' · ')}</span>}<span className="muted small">Este teste não usa seu microfone, não gera fala e não executa ações.</span></div>}
    <div id="ai-view-overview" className="ai-admin-content" hidden={view !== 'overview'}>
      <div className="ai-overview-grid"><div className="ai-metric"><Plug size={20} aria-hidden="true" /><strong>{ready.length}<small> / {state.providers.length}</small></strong><span>Provedores configurados e ligados</span></div><div className="ai-metric"><ListChecks size={20} aria-hidden="true" /><strong>{activeTasks.length}<small> / {state.tasks.length}</small></strong><span>Tarefas com configuração ativa</span></div><div className="ai-metric"><ShieldCheck size={20} aria-hidden="true" /><strong>{reserves.filter(connection => connection.enabled).length}</strong><span>Conexões extras ligadas</span></div></div>
      <p className="muted small">Os indicadores mostram a configuração salva. Uma chave cadastrada precisa ser testada; não é uma garantia de conexão ou de créditos.</p>
      <div className="ai-card ai-next-step"><div><span className="ai-eyebrow">Seu próximo passo</span><h3>{!availableCount ? 'Conecte sua primeira API' : liveResult?.connected ? 'Experimente uma chamada' : 'Verifique a chamada ao vivo'}</h3><p>{!availableCount ? 'Escolha uma empresa, cadastre a chave e ligue a conexão.' : 'Confira a tarefa de voz e execute o diagnóstico. O resultado mostra a etapa exata da conexão.'}</p></div><button type="button" className="button primary" onClick={() => setView(availableCount ? 'tasks' : 'connections')}>{availableCount ? 'Configurar e testar' : 'Cadastrar conexão'}<ArrowRight size={16} aria-hidden="true" /></button></div>
      <h3>Sua Jornada usa IA para</h3><div className="ai-grid">{state.tasks.map(task => <div className="ai-card" key={task.id}><div className="section-heading"><strong>{aiTaskLabels[task.id].name}</strong><span className="ai-badge">{taskReady(task, state.providers, reserves) ? 'Configurada' : 'Pendente'}</span></div><span>{task.provider ? aiCatalog[task.provider].name : 'Escolha uma conexão'}</span><span className="muted small">{isAuto(task.model) ? autoModes[task.model].label : task.model || 'Modelo ainda não escolhido'}</span><button type="button" className="text-button" onClick={() => setView('tasks')}>Gerenciar tarefa <ArrowRight size={14} aria-hidden="true" /></button></div>)}</div>
      <div className="ai-explainer"><Sparkles size={22} aria-hidden="true" /><div><strong>Automático, com critérios claros</strong><p>A Jornada consulta os modelos disponíveis para sua chave e aplica sua preferência de qualidade, rapidez ou economia. A lista tem cache de até uma hora; você pode atualizar agora. A escolha segue regras de família e versão, sem gastar tokens com outra IA para escolher.</p></div></div>
    </div>
    <div id="ai-view-connections" className="ai-admin-content" hidden={view !== 'connections'}>
      <div><h3>Suas conexões</h3><p className="muted">Abra uma empresa para cadastrar ou trocar a chave, consultar os modelos e gerenciar conexões independentes.</p></div>
      <label className="ai-search">Buscar empresa ou conexão<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Google, Claude, DeepSeek…" /></label><div className="ai-provider-list">{state.providers.filter(provider => `${aiCatalog[provider.id].name} ${provider.label} ${reserves.filter(row => row.provider === provider.id).map(row => row.label).join(" ")}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(provider => <details className="ai-provider" key={provider.id}><summary><span className="ai-provider-symbol"><Plug size={20} aria-hidden="true" /></span><span className="ai-provider-name"><strong>{aiCatalog[provider.id].name}</strong><small>{provider.has_key ? `chave …${provider.key_hint} · ${reserves.filter(row => row.provider === provider.id && row.enabled).length} conexões extras ligadas` : 'Nenhuma chave cadastrada'}</small></span><span className="ai-badge">{provider.has_key ? provider.enabled ? 'Ligado' : 'Pausado' : 'Configurar'}</span><ChevronDown className="ai-provider-chevron" size={18} aria-hidden="true" /></summary>
        <ProviderForm key={`${provider.id}-${provider.updated_at}`} provider={provider} busy={busy} safe={state.secretReady} loading={!!loadingModels[provider.id]} list={models[provider.id]} error={modelErrors[provider.id]} onSave={event => saveProvider(provider, event)} onModels={() => void ensureModels(provider.id, true)} onRemove={() => {
          if (window.confirm(`Remover a chave principal de ${aiCatalog[provider.id].name}? As tarefas que usam esta chave deixarão de acessá-la.`)) void run(`p-${provider.id}`, async () => { await api('/api/ai/admin', { action: 'save_provider', provider: provider.id, enabled: false, label: provider.label, base_url: provider.base_url, gcp_project: provider.gcp_project, gcp_location: provider.gcp_location, key: '' }); requested.current.delete(provider.id); setModels(previous => ({ ...previous, [provider.id]: undefined })); setLiveResult(null); return 'Chave principal removida e conexão desligada.'; });
        }} />
        {reserves.filter(row => row.provider === provider.id).map(connection => <ReserveForm key={`${connection.id}-${connection.updated_at}`} connection={connection} busy={busy} onVerify={() => verifyReserve(connection)} onSave={event => { event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); void run(`c-${connection.id}`, async () => { await api('/api/ai/admin', { action: 'save_connection', id: connection.id, provider: connection.provider, label: String(fields.get('label')), position: Number(fields.get('position')), enabled: fields.get('enabled') === 'on', key: String(fields.get('key') ?? '') || null, base_url: String(fields.get('base_url') ?? ''), gcp_project: String(fields.get('gcp_project') ?? ''), gcp_location: String(fields.get('gcp_location') ?? '') }); form.reset(); requested.current.delete(connection.id); setModels(previous => ({ ...previous, [connection.id]: undefined })); setLiveResult(null); return 'Conexão independente salva.'; }); }} onRemove={() => { if (window.confirm(`Remover a conexão ${connection.label}? Tarefas que a usam diretamente serão pausadas.`)) void run(`c-${connection.id}`, async () => { await api('/api/ai/admin', { action: 'remove_connection', id: connection.id }); return 'Conexão removida.'; }); }} />)}
      </details>)}</div>
      {state.connections && <><h3>Continuidade com conexões independentes</h3><p className="muted small">As tarefas antigas mantêm sua configuração. Ao salvar uma tarefa, você define quais conexões ela poderá usar. Cada conexão extra tem endereço e projeto próprios. Em Tarefas e modelos, escolha a conexão principal e autorize até duas alternativas, inclusive de outras empresas para texto. Falhas de rede, acesso e serviço podem tentar a próxima; cota, faturamento e configuração inválida encerram o pedido. No máximo quatro tentativas, com controle de uso em cada uma.</p><NewReserve providers={state.providers} reserves={reserves} busy={busy} safe={state.secretReady} onSave={event => { event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); void run('new-connection', async () => { await api('/api/ai/admin', { action: 'save_connection', id: null, provider: String(fields.get('provider')), label: String(fields.get('label')), enabled: fields.get('enabled') === 'on', position: Number(fields.get('position')), key: String(fields.get('key')), base_url: String(fields.get('base_url') ?? ''), gcp_project: String(fields.get('gcp_project') ?? ''), gcp_location: String(fields.get('gcp_location') ?? '') }); form.reset(); return 'Conexão independente cadastrada.'; }); }} /></>}
    </div>
    <div id="ai-view-tasks" className="ai-admin-content" hidden={view !== 'tasks'}><div><h3>Uma escolha para cada tarefa</h3><p className="muted">Use uma preferência automática ou fixe um modelo. Salve suas alterações antes de testar.</p></div><div className="ai-grid">{state.tasks.map(task => <TaskForm key={`${task.id}-${task.updated_at}`} task={task} providers={state.providers} connections={reserves} models={models} loading={loadingModels} errors={modelErrors} active={view === 'tasks'} ensureModels={ensureModels} busy={busy} onSave={event => saveTask(task, event)} onTest={() => test(task)} />)}</div>{!availableCount && <button type="button" className="button outline" onClick={() => setView('connections')}>Cadastrar uma conexão primeiro</button>}</div>
    <div id="ai-view-usage" className="ai-admin-content" hidden={view !== 'usage'}>{view === 'usage' && <UsageSettings />}</div>
    <div id="ai-view-integrations" className="ai-admin-content" hidden={view !== 'integrations'}><McpSettings connectors={state.connectors ?? []} safe={state.secretReady} onReload={load} /><h3>Assinaturas e acesso às APIs</h3><p className="muted small">Orientações verificadas em 04/10/2026. Benefícios dependem do plano e da conta; cadastrar uma chave não cria créditos nem reativa faturamento.</p><div className="ai-grid"><div className="ai-card"><strong>Google AI · confira seus benefícios</strong><p className="muted small">Planos elegíveis podem oferecer créditos mensais de Google Cloud. Confira o valor na sua conta e resgate o benefício antes de autorizar uso pago.</p><a className="text-button" href="https://developers.google.com/profile/help/benefits" target="_blank" rel="noreferrer">Consultar benefícios oficiais ↗</a></div><div className="ai-card"><strong>Claude e Codex</strong><p className="muted small">As assinaturas dão acesso nos próprios produtos. As APIs da Jornada usam chaves e cobrança próprias. MCP pode conectar ferramentas quando o cliente permitir; ele não transfere os tokens da sua assinatura para o site.</p><a className="text-button" href="https://learn.chatgpt.com/docs/auth" target="_blank" rel="noreferrer">Autenticação Codex ↗</a><a className="text-button" href="https://support.claude.com/en/articles/9876003-i-have-a-paid-claude-subscription-pro-max-team-or-enterprise-plans-why-do-i-have-to-pay-separately-to-use-the-claude-api-and-console" target="_blank" rel="noreferrer">Assinatura e API Claude ↗</a></div></div><h3>Um núcleo, várias entradas</h3><p className="muted">Conexões externas têm autorização própria. As opções abaixo indicam o que está disponível e o que ainda precisa ser ativado.</p><ul className="ai-roadmap"><li><strong>Telegram · configuração disponível</strong><span>O bot usa o mesmo núcleo, modelos e reservas desta Administração. Configure e vincule sua conta na seção Telegram da Administração. A chamada abre no site.</span></li><li><strong>WhatsApp · ponte por QR disponível</strong><span>Configure em Administração › WhatsApp da Jornada: conecte o número temporário pelo QR e vincule seu telefone por código. A ponte roda no seu computador, que precisa ficar ligado. A API oficial da Meta não está integrada.</span></li><li><strong>MCP · cadastro e descoberta disponíveis</strong><span>Cadastre servidores abaixo, consulte o catálogo e confira o acesso. A execução de ferramentas e a conexão OAuth por pessoa são etapas separadas.</span></li><li><strong>Google Agenda e Drive · autorização pendente</strong><span>A exportação da agenda em arquivo já funciona. Sincronização e acesso ao Drive dependem de conexão OAuth.</span></li></ul><div className="ai-explainer"><ShieldCheck size={20} aria-hidden="true" /><p>Nenhuma assinatura ou integração é ativada por abrir este painel. Testes de geração e chamadas podem consumir a cota da API; consultar modelos não gera uma resposta de IA.</p></div></div>
  </section>;
}

function ProviderForm({ provider, busy, safe, loading, list, error, onSave, onModels, onRemove }: { provider: Provider; busy: string; safe: boolean; loading: boolean; list?: ModelList; error?: string; onSave: (event: FormEvent<HTMLFormElement>) => void; onModels: () => void; onRemove: () => void }) {
  const info = aiCatalog[provider.id];
  return <form className="ai-card ai-provider-form" onSubmit={onSave}><strong>Chave principal · {info.name}</strong><span className="muted small">{info.help}</span>{info.docs && <a className="text-button" href={info.docs} target="_blank" rel="noreferrer">Documentação oficial ↗</a>}<label>Nome da conexão<input name="label" defaultValue={provider.label} placeholder="Ex.: Minha conta principal" maxLength={60} /></label>{info.fields.includes('base_url') && <label>Endereço base da API<input name="base_url" defaultValue={provider.base_url} placeholder="https://…/v1" maxLength={300} /></label>}{info.fields.includes('gcp_project') && <label>Projeto do Google Cloud<input name="gcp_project" defaultValue={provider.gcp_project} placeholder={provider.id === 'vertex' ? 'Opcional: lido da credencial' : 'Vazio somente para modo Express'} maxLength={100} /></label>}{info.fields.includes('gcp_location') && <label>Região<input name="gcp_location" defaultValue={provider.gcp_location} placeholder="us-central1 ou global" maxLength={40} /></label>}<label>{info.keyLabel}<input name="key" type="password" maxLength={12000} autoComplete="off" spellCheck={false} placeholder={provider.has_key ? `Guardada (…${provider.key_hint}). Cole outra para trocar.` : provider.id === 'vertex' ? 'Cole o JSON completo; ele fica oculto' : 'Cole a chave'} /></label><span className="muted small">Deixe a chave vazia para manter a atual. Ela não fica salva no navegador.</span><label className="cm-check"><input type="checkbox" name="enabled" defaultChecked={provider.enabled} /> Ligado</label><div className="button-row"><button className="button primary" disabled={!!busy || !safe}>{busy === `p-${provider.id}` ? 'Salvando…' : 'Salvar'}</button>{provider.has_key && !['vertex','google_cloud'].includes(provider.id) && <button type="button" className="button outline" disabled={!!busy || loading} onClick={onModels}><RefreshCw size={14} aria-hidden="true" />{loading ? 'Buscando…' : 'Ver modelos'}</button>}{provider.has_key && <button type="button" className="text-button cm-danger" disabled={!!busy} onClick={onRemove}>Remover chave</button>}</div>{error && <p className="cm-message" role="status">{error}</p>}{list && <div className="ai-model-summary"><strong>{list.ids.length} modelos de texto · {list.liveIds?.length ?? 0} de voz</strong>{list.refreshedAt && <span className="muted small">Consulta: {updated(list.refreshedAt)}</span>}<span className="muted small">Escolha em Tarefas e modelos. A listagem confirma acesso, mas não garante cota de geração.</span></div>}</form>;
}

function ReserveForm({ connection, busy, onSave, onRemove, onVerify }: { connection: Connection; busy: string; onSave: (event: FormEvent<HTMLFormElement>) => void; onRemove: () => void; onVerify: () => void }) {
  return <form className="ai-card ai-reserve-form" onSubmit={onSave}><strong>Conexão · {connection.label} <span className="ai-badge">{connection.enabled ? 'Ligada' : 'Pausada'} · chave …{connection.key_hint}</span></strong><div className="ai-field-grid"><label>Nome<input name="label" defaultValue={connection.label} maxLength={60} required /></label><label>Prioridade<select name="position" defaultValue={connection.position}>{[1,2,3,4,5].map(position => <option key={position} value={position}>{position} · menor número primeiro</option>)}</select></label></div><ConnectionFields provider={connection.provider} connection={connection} /><label>Trocar chave<input name="key" type="password" autoComplete="off" placeholder="Deixe vazio para manter" /></label><label className="cm-check"><input type="checkbox" name="enabled" defaultChecked={connection.enabled} /> Ligada</label><div className="button-row"><button className="button primary" disabled={!!busy}>Salvar conexão</button>{!['vertex','google_cloud'].includes(connection.provider) && <button type="button" className="button outline" disabled={!!busy} onClick={onVerify}>Consultar modelos</button>}<button type="button" className="text-button cm-danger" disabled={!!busy} onClick={onRemove}>Remover</button></div></form>;
}

function NewReserve({ providers, reserves, busy, safe, onSave }: { providers: Provider[]; reserves: Connection[]; busy: string; safe: boolean; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const [provider, setProvider] = useState<AiProviderId>(providers.find(item => item.has_key)?.id ?? providers[0]?.id ?? 'gemini');
  const [position, setPosition] = useState('');
  const free = [1,2,3,4,5].filter(value => !reserves.some(row => row.provider === provider && row.position === value));
  const selected = free.includes(Number(position)) ? position : String(free[0] ?? '');
  return <form className="ai-card" onSubmit={onSave}><strong>Adicionar outra conexão</strong><div className="ai-field-grid"><label>Empresa<select name="provider" value={provider} onChange={event => { setProvider(event.target.value as AiProviderId); setPosition(''); }}>{providers.map(item => <option key={item.id} value={item.id}>{aiCatalog[item.id].name}</option>)}</select></label><label>Nome<input name="label" maxLength={60} required placeholder="Ex.: Segunda conta da empresa" /></label><label>Prioridade<select name="position" value={selected} onChange={event => setPosition(event.target.value)}>{free.map(value => <option key={value} value={value}>{value} · menor número primeiro</option>)}{!free.length && <option value="">Todas as posições ocupadas</option>}</select></label><label>{provider === 'vertex' ? 'Credencial JSON' : 'Chave'}<input key={provider} name="key" type="password" maxLength={12000} autoComplete="off" spellCheck={false} required /></label></div><ConnectionFields key={provider} provider={provider} /><label className="cm-check"><input type="checkbox" name="enabled" /> Ligada</label><p className="muted small">A conexão funciona independentemente da chave principal. Ligue aqui e escolha em Tarefas e modelos. Nenhuma tarefa nova será ativada ao cadastrar.</p><button className="button primary" disabled={!!busy || !safe || !free.length}>Cadastrar conexão</button></form>;
}

function ConnectionFields({ provider, connection }: { provider: AiProviderId; connection?: Connection }) {
  return <div className="ai-field-grid">{aiCatalog[provider].fields.includes('base_url') && <label>Endereço desta conexão<input name="base_url" type="url" defaultValue={connection?.base_url ?? ''} placeholder="https://…/v1" maxLength={300} required /></label>}{aiCatalog[provider].fields.includes('gcp_project') && <><label>Projeto desta conexão<input name="gcp_project" defaultValue={connection?.gcp_project ?? ''} maxLength={100} placeholder={provider === 'vertex' ? 'Lido do JSON se vazio' : 'Vazio somente para modo Express'} /></label><label>Região desta conexão<input name="gcp_location" defaultValue={connection?.gcp_location ?? ''} maxLength={40} placeholder="global ou us-central1" /></label></>}</div>;
}

function TaskForm({ task, providers, connections, models, loading, errors, active, ensureModels, busy, onSave, onTest }: {
  task: Task; providers: Provider[]; connections: Connection[]; models: Record<string, ModelList | undefined>; loading: Record<string, boolean | undefined>; errors: Record<string, string | undefined>;
  active: boolean; ensureModels: (provider: AiProviderId, refresh?: boolean, connectionId?: string) => Promise<void>; busy: string; onSave: (event: FormEvent<HTMLFormElement>) => void; onTest: () => void;
}) {
  const [selected, setSelected] = useState(task.connection_id || task.provider || '');
  const extra = connections.find(row => row.id === selected);
  const provider = extra?.provider || providers.find(row => row.id === selected)?.id;
  const [model, setModel] = useState(task.model);
  const [custom, setCustom] = useState(false);
  const [enabled, setEnabled] = useState(task.enabled);
  const [mode, setMode] = useState(task.routing_mode === 'fallback' ? 'fallback' : 'fixed');
  const [fallbacks, setFallbacks] = useState(task.fallbacks ?? []);
  const voice = task.id === 'voz'; const list = models[selected];
  const ids = voice ? provider === 'openai' ? ['gpt-live-1'] : list?.liveIds ?? [] : list?.ids ?? [];
  const canAuto = voice ? provider === 'gemini' || provider === 'elevenlabs' : !!provider && autoCapable.includes(provider);
  const hasKey = !!extra || !!providers.find(item => item.id === provider)?.has_key;
  const dirty = selected !== (task.connection_id || task.provider || '') || model !== task.model || enabled !== task.enabled || mode !== (task.routing_mode === 'fallback' ? 'fallback' : 'fixed') || JSON.stringify(fallbacks) !== JSON.stringify(task.fallbacks ?? []);
  useEffect(() => { if (active && provider && hasKey && !['vertex','google_cloud'].includes(provider)) void ensureModels(provider, false, extra?.id); }, [active, provider, hasKey, extra?.id, ensureModels]);
  const typed = custom || (!!model && !isAuto(model) && (!!list || !canAuto) && !ids.includes(model));
  const picked = isAuto(model) ? list?.auto?.[model] : null;
  const choices = connections.filter(row => row.id !== selected && row.enabled && (voice ? row.provider === provider : !voiceOnlyProviders.includes(row.provider)));
  const choose = (value: string) => {
    setSelected(value); setCustom(false); setFallbacks([]);
    const next = connections.find(row => row.id === value)?.provider || providers.find(row => row.id === value)?.id;
    setModel(voice && next === 'openai' ? 'gpt-live-1' : next && (autoCapable.includes(next) || (voice && next === 'elevenlabs')) ? 'auto:rapido' : '');
  };
  return <form className="ai-card ai-task-card" onSubmit={onSave}>
    <div className="section-heading"><strong>{aiTaskLabels[task.id].name}</strong><span className="ai-badge">{dirty ? 'Não salvo' : taskReady(task, providers, connections) ? 'Configurada' : 'Pendente'}</span></div>
    <span className="muted small">{aiTaskLabels[task.id].help}</span>
    <label>Provedor<select value={selected} onChange={event => choose(event.target.value)}><option value="">Nenhum</option>{providers.filter(row => voice ? liveProviders.includes(row.id) : !voiceOnlyProviders.includes(row.id)).map(row => <optgroup key={row.id} label={aiCatalog[row.id].name}><option value={row.id} disabled={!row.has_key || !row.enabled}>{row.label || 'Chave principal'}{!row.has_key ? ' · sem chave' : !row.enabled ? ' · pausada' : ''}</option>{connections.filter(c => c.provider === row.id).map(c => <option key={c.id} value={c.id} disabled={!c.enabled}>{c.label}{!c.enabled ? ' · pausada' : ''}</option>)}</optgroup>)}</select></label>
    <input type="hidden" name="provider" value={provider ?? ''} /><input type="hidden" name="connection_id" value={extra?.id ?? ''} />
    {provider && !typed && <label>Modelo<select aria-label="Modelo" value={model} onChange={event => { if (event.target.value === '__custom') { setCustom(true); setModel(''); } else setModel(event.target.value); }}>{!model && <option value="">Escolha um modelo</option>}{canAuto && (voice ? <option value="auto:rapido">Automático · voz disponível</option> : <optgroup label="Preferência automática">{(Object.keys(autoModes) as AutoMode[]).map(value => <option key={value} value={value}>{autoModes[value].label}</option>)}</optgroup>)}{ids.length > 0 && <optgroup label={`Modelos da sua conta (${ids.length})`}>{ids.map(id => <option key={id} value={id}>{id}{modelNote(provider,id) ? ` · ${modelNote(provider,id)}` : ''}</option>)}</optgroup>}{(!voice || provider !== 'openai') && <option value="__custom">Outro: digitar o nome…</option>}</select></label>}
    {provider && typed && <label>Nome do modelo<input value={model} onChange={event => setModel(event.target.value)} maxLength={120} placeholder="Nome exato do modelo autorizado" />{(canAuto || ids.length > 0) && <button type="button" className="text-button" onClick={() => { setCustom(false); setModel(canAuto ? 'auto:rapido' : ids[0] ?? ''); }}>Voltar para a lista</button>}</label>}
    <input type="hidden" name="model" value={model} />
    {loading[selected] && <span className="muted small" role="status">Buscando os modelos desta conexão…</span>}{errors[selected] && <p className="cm-message" role="status">{errors[selected]}</p>}
    {provider && hasKey && !['vertex','google_cloud'].includes(provider) && <button type="button" className="text-button" disabled={!!busy || !!loading[selected]} onClick={() => void ensureModels(provider,true,extra?.id)}><RefreshCw size={14} aria-hidden="true" /> Atualizar modelos</button>}
    {list?.refreshedAt && <span className="muted small">Lista consultada: {updated(list.refreshedAt)}</span>}
    {isAuto(model) && <div className="ai-model-summary"><Sparkles size={16} aria-hidden="true" /><span className="muted small">{voice ? provider === 'elevenlabs' ? 'Escolhe um modelo rápido disponível para agentes nesta conta ElevenLabs ao preparar a chamada.' : 'Escolhe um modelo Live autorizado para esta chave ao iniciar a chamada.' : `${autoModes[model].hint}${picked ? ` Hoje usaria: ${picked}.` : ''}`}</span></div>}
    <label>Se a conexão falhar<select name="routing_mode" value={mode} onChange={event => setMode(event.target.value)}><option value="fixed">Usar somente a conexão escolhida</option><option value="fallback">Tentar minhas alternativas autorizadas</option></select></label>
    {mode === 'fallback' && <div className="ai-route-steps"><p className="muted small">Ordem explícita: principal → alternativa 1 → alternativa 2. {voice ? 'Voz usa alternativas da mesma empresa.' : 'Cada empresa usa seu próprio modelo. Dados também serão enviados às alternativas escolhidas.'} Cota, faturamento e pedido inválido encerram a operação.</p>{[0,1].map(index => {
      const value = fallbacks[index]; const current = connections.find(c => c.id === value?.connection_id);
      return <div className="ai-route-step" key={index}><label>Alternativa {index + 1}<select aria-label={`Alternativa ${index + 1}`} name={`fallback-${index}`} disabled={index === 1 && !fallbacks[0]} value={value?.connection_id ?? ''} onChange={event => {
        const next = connections.find(row => row.id === event.target.value); setFallbacks(previous => { const result=previous.slice(0,2); if (!next) return result.slice(0,index); if(index === 1 && !result[0]) return result; result[index]={ connection_id: next.id, model: voice && next.provider === 'openai' ? 'gpt-live-1' : autoCapable.includes(next.provider) || next.provider === 'elevenlabs' ? 'auto:rapido' : '' }; return result; });
      }}><option value="">Sem alternativa</option>{choices.filter(c => !fallbacks.some((f,i) => i !== index && f?.connection_id === c.id)).map(row => <option key={row.id} value={row.id}>{aiCatalog[row.provider].name} · {row.label}</option>)}</select></label>{current && <label>Modelo da alternativa {index + 1}<input name={`fallback-model-${index}`} value={value?.model ?? ''} maxLength={120} required onChange={event => setFallbacks(previous => previous.map((row,i) => i === index ? { ...row, model: event.target.value } : row))} placeholder={autoCapable.includes(current.provider) ? 'auto:rapido ou modelo exato' : 'Modelo exato desta conexão'} /></label>}</div>;
    })}{!choices.length && <span className="muted small">Cadastre e ligue uma conexão extra para escolher aqui.</span>}</div>}
    {task.routing_mode === "legacy" && <span className="muted small">Configuração anterior: reservas da mesma empresa. Salvar aplica a política explícita escolhida acima.</span>}
    {voice && <span className="muted small">Voz e raciocínio são independentes. Com ElevenLabs, o modelo é o que conduz a conversa do agente; as ações continuam na Conversa do assistente. O teste abaixo verifica Gemini e ElevenLabs (prepara o agente na sua conta); OpenAI é testado no Assistente.</span>}
    <label className="cm-check"><input type="checkbox" name="enabled" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Ligada</label>
    <div className="button-row"><button className="button primary" disabled={!!busy || (!!provider && !model) || (mode === 'fallback' && fallbacks.some(row => !row.model))}>{busy === `t-${task.id}` ? 'Salvando…' : 'Salvar'}</button><button type="button" className="button outline" disabled={!!busy || dirty || !taskReady(task,providers,connections) || (voice && !['gemini','elevenlabs'].includes(task.provider ?? ''))} onClick={onTest}>{busy === `x-${task.id}` ? 'Testando…' : voice ? 'Testar conexão de voz' : 'Testar'}</button></div>
    {dirty && <span className="muted small">Salve para testar esta configuração.</span>}
  </form>;
}
