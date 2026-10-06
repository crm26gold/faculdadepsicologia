'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Info, Network, RefreshCw, Users } from 'lucide-react';
import { aiCatalog, aiTaskLabels } from '@/lib/ai/catalog';
import { autoModes, isAuto } from '@/lib/ai/models';
import { capabilityLabels, declarableProviders, modelDependentCapabilities, providerCapabilities, reasonLabels, resourceInsights, resourceName, sourceNamer, stateLabels,
  type AiResource, type AiResourceMap, type AiRouteMap } from '@/lib/ai/resources';
import { api } from './client';
import { Modal } from '../modal';

export type ResourceMapState = { map: AiResourceMap | null; unavailable: boolean; error: string; reload: () => Promise<boolean> };
/** One owner-only read; the panel reuses it for the overview notice and the map view. */
export function useResourceMap(enabled: boolean): ResourceMapState {
  const [map, setMap] = useState<AiResourceMap | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      const data = await api<{ available: boolean; map?: AiResourceMap }>('/api/ai/resources');
      setUnavailable(!data.available); setMap(data.map ?? null); setError('');
      return true;
    } catch { setError('Não consegui abrir o mapa de recursos agora. Tente atualizar.'); return false; }
  }, []);
  useEffect(() => { if (enabled) void reload(); }, [enabled, reload]);
  return { map, unavailable, error, reload };
}

const modeLabels: Record<AiRouteMap['mode'], string> = { fixed: 'Rota fixa', fallback: 'Com alternativas', auto: 'Automático', legacy: 'Modo antigo' };

export function ResourceMap({ state, onChanged }: { state: ResourceMapState; onChanged?: () => void }) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [baseConfirm, setBaseConfirm] = useState(false);
  const [offer, setOffer] = useState<{ resource: AiResource; privacy_basis: 'paid' | 'no_training' } | null>(null);
  const { map } = state;
  async function run(key: string, action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(key); setMessage('');
    try {
      await action();
      if (!await state.reload()) throw new Error('A alteração foi enviada, mas não consegui atualizar o mapa. Toque em Atualizar mapa.');
      setMessage(success); onChanged?.();
    }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não consegui concluir.'); }
    finally { setBusy(''); }
  }
  const savePolicy = (resource: AiResource, privacy_basis: 'paid' | 'no_training' | null, audience: 'owner' | 'members') =>
    run(`policy-${resource.source_id}`, () => api('/api/ai/resources', { action: 'set_source_policy', provider: resource.provider,
      connection_id: resource.connection_id, privacy_basis, audience }),
    !privacy_basis ? `${resourceName(resource)}: declaração retirada.` : audience === 'members' ? `${resourceName(resource)}: oferecida aos membros.` : `${resourceName(resource)}: liberada só para você.`);
  if (state.unavailable) return <p className="muted" role="status">O mapa de recursos aguarda a atualização do banco. Suas conexões continuam funcionando como antes.</p>;
  if (!map) return <p className="muted" role="status">{state.error || 'Abrindo o mapa de recursos…'}{state.error && <button type="button" className="button outline" onClick={() => void state.reload()}>Atualizar mapa</button>}</p>;
  const name = sourceNamer(map);
  const insights = resourceInsights(map);
  const shared = map.resources.filter(resource => resource.kind !== 'personal');
  const configured = shared.filter(resource => resource.configured);
  const personal = map.resources.filter(resource => resource.kind === 'personal');
  const offered = configured.some(resource => resource.declaration.audience === 'members' && resource.declaration.current);
  return <div className="ai-resource-map">
    <div className="section-heading"><div><h3>Mapa de recursos</h3><p className="muted small">O que está conectado e o que realmente atende cada tarefa agora. O servidor calcula o mapa com as mesmas regras que escolhem a conexão. Abrir esta tela não consulta os provedores nem gasta créditos.</p></div>
      <button type="button" className="button outline" disabled={!!busy} onClick={() => void run('refresh', async () => {}, 'Mapa atualizado.')}><RefreshCw size={15} aria-hidden="true" /> Atualizar mapa</button></div>
    {message && <p className="cm-message" role="status">{message}</p>}
    {state.error && !message && <p className="cm-message" role="status">{state.error}</p>}
    {insights.length > 0 && <div className="ai-card ai-insights"><strong>O que merece sua atenção</strong><ul>{insights.map((insight, index) => <li key={index} data-level={insight.level}>
      {insight.level === 'warning' ? <AlertTriangle size={16} aria-hidden="true" /> : <Info size={16} aria-hidden="true" />}<span>{insight.text}</span></li>)}</ul></div>}

    <h3>Cada tarefa, agora</h3>
    <div className="ai-grid">{map.routes.map(route => <div className="ai-card ai-route-map" key={route.task}>
      <div className="section-heading"><strong>{aiTaskLabels[route.task].name}</strong><span className="ai-badge">{!route.enabled ? 'Desligada'
        : route.routing_effective && route.routing_effective !== route.mode && !route.served_by ? `${modeLabels[route.mode]} · funcionando como automático` : modeLabels[route.mode]}</span></div>
      <span className="muted small">{!route.chain.length ? 'Nenhuma conexão está atuando nesta tarefa.'
        : route.served_by ? `Sem conexão própria atuando, usa a rota da ${aiTaskLabels[route.served_by].name}, nesta ordem:` : 'Atuando agora, nesta ordem:'}</span>
      {route.chain.length > 0 && <ol className="ai-chain">{route.chain.map(item => <li key={item.source_id}><span>{name(item.source_id)}</span><small className="muted">{isAuto(item.model) ? autoModes[item.model].label : item.model}</small></li>)}</ol>}
      {route.sources.some(source => source.state !== 'active') && <ul className="ai-source-states">{route.sources.filter(source => source.state !== 'active').map(source => <li key={source.source_id} data-state={source.state}>
        <span className="ai-source-name">{name(source.source_id)}</span><span className="ai-state">{stateLabels[source.state]}</span>
        {source.reason && source.reason !== 'capability' && <small className="muted">{reasonLabels[source.reason]}</small>}</li>)}</ul>}
      <span className="muted small"><Users size={13} aria-hidden="true" /> {route.members_note === 'voice_not_shared' ? 'Membros: a voz ao vivo não é compartilhada.'
        : route.members_note === 'base_off' ? 'Membros: a base está desligada; usam só as próprias chaves.'
        : route.members_chain.length ? `Membros recebem${route.members_served_by ? `, pela rota da ${aiTaskLabels[route.members_served_by].name}` : ''}: ${route.members_chain.map(name).join(', ')}.`
        : 'Membros: nenhuma conexão desta tarefa foi oferecida.'}</span>
    </div>)}</div>

    <h3>Suas chaves e conexões</h3>
    <p className="muted small">As capacidades vêm do código de cada adaptador. Elas mostram o que a Jornada sabe fazer com o serviço, não provam cota, créditos ou acesso ao modelo. A declaração de privacidade é sua: a Jornada não consulta o contrato na empresa.</p>
    {!configured.length && <p className="muted" role="status">Nenhuma chave cadastrada ainda. Use Conexões e chaves para conectar a primeira.</p>}
    <div className="ai-grid">{configured.map(resource => <ResourceCard key={`${resource.source_id}-${resource.updated_at}-${resource.declaration.privacy_basis}-${resource.declaration.audience}`} resource={resource} busy={busy}
      baseEnabled={map.base_enabled} onSave={(privacy, audience) => {
        const offeredNow = resource.declaration.audience === 'members' && resource.declaration.current;
        if (privacy && audience === 'members' && map.base_enabled && !offeredNow) setOffer({ resource, privacy_basis: privacy });
        else void savePolicy(resource, privacy, audience);
      }} />)}</div>
    {personal.length > 0 && <div className="ai-card"><strong>Suas chaves pessoais</strong><p className="muted small">Ficam em Meu espaço › Minhas chaves de IA e entram primeiro nas suas conversas de texto. Nunca atendem outra pessoa.</p>
      <ul className="ai-source-states">{personal.map(resource => <li key={resource.source_id} data-state={resource.enabled ? 'active' : 'unusable'}><span className="ai-source-name">{aiCatalog[resource.provider].name}</span><span className="ai-state">{resource.enabled ? 'Ligada' : 'Pausada'}</span></li>)}</ul></div>}

    <h3>Base para membros</h3>
    <div className="ai-card"><div className="section-heading"><strong>{map.base_enabled ? 'Base ligada' : 'Base desligada'}</strong><span className="ai-badge">{map.members.accounts} {map.members.accounts === 1 ? 'conta de membro' : 'contas de membros'}</span></div>
      <p className="muted small">{map.members.with_personal_keys} {map.members.with_personal_keys === 1 ? 'membro usa' : 'membros usam'} chaves próprias. Detalhes das contas e das chaves dos membros não aparecem aqui. A base atende conversas e organização, inclusive áudios e fotos enviados por Telegram e WhatsApp; a chamada de voz ao vivo nunca é compartilhada.</p>
      <p className="muted small">Só entram na base as conexões que você marcou como “Eu e membros”. Declarar uma conexão para você não a oferece aos membros.</p>
      <button type="button" className={`button ${map.base_enabled ? 'outline' : 'primary'}`} disabled={!!busy || (!map.base_enabled && !offered)}
        onClick={() => { if (map.base_enabled) void run('base-off', () => api('/api/ai/resources', { action: 'set_base', enabled: false }), 'Base para membros desligada.'); else setBaseConfirm(true); }}>
        {map.base_enabled ? 'Desligar base para membros' : 'Ligar base para membros'}</button>
      {!map.base_enabled && !offered && <span className="muted small">Para ligar, marque antes ao menos uma conexão como “Eu e membros”.</span>}</div>

    <h3>Canais e MCP</h3>
    <div className="ai-grid">
      {map.channels.map(channel => <div className="ai-card" key={channel.channel}><div className="section-heading"><strong>{channel.channel === 'telegram' ? 'Telegram' : 'WhatsApp'}</strong><span className="ai-badge">{channel.enabled ? 'Ligado' : 'Desligado'}</span></div>
        <span className="muted small">{channel.channel === 'telegram' && channel.bot ? `@${channel.bot} · ` : ''}{channel.owner_linked ? 'Sua conta está vinculada' : 'Sua conta não está vinculada'} · {channel.member_links} {channel.member_links === 1 ? 'membro vinculado' : 'membros vinculados'}</span>
        {channel.channel === 'whatsapp' && map.whatsapp && <span className="small">Ponte: {map.whatsapp.state === 'ready' ? 'conectada' : 'desconectada'}. Transcrição de áudio: {map.whatsapp.stt.source_id ? name(map.whatsapp.stt.source_id) : 'não escolhida'} · {map.whatsapp.stt.state === 'active' ? 'atuando' : reasonLabels[map.whatsapp.stt.reason ?? 'not_configured']}</span>}
        {channel.channel === 'whatsapp' && map.whatsapp?.stt.reason === 'capability' && <span className="muted small">Escolha Gemini, Google Cloud, Groq ou OpenAI para transcrever.</span>}
      </div>)}
      <div className="ai-card"><div className="section-heading"><strong>MCP da Jornada · entrada</strong><span className="ai-badge">{map.mcp_inbound.owner_tokens + map.mcp_inbound.owner_oauth} {map.mcp_inbound.owner_tokens + map.mcp_inbound.owner_oauth === 1 ? 'acesso ativo' : 'acessos ativos'}</span></div>
        <span className="muted small">Assistentes externos, como ChatGPT ou Claude, consultam e registram na sua Jornada com o seu acesso. Isso não permite que a Jornada use o modelo ou a assinatura deles.</span>
        <span className="muted small">{map.mcp_inbound.owner_oauth} por login OAuth · {map.mcp_inbound.owner_tokens} por token · {map.mcp_inbound.members_with_access} {map.mcp_inbound.members_with_access === 1 ? 'membro com acesso próprio' : 'membros com acesso próprio'}</span></div>
      <div className="ai-card"><div className="section-heading"><strong>Servidores MCP externos · saída</strong><span className="ai-badge">{map.mcp_outbound.length} {map.mcp_outbound.length === 1 ? 'cadastrado' : 'cadastrados'}</span></div>
        <span className="muted small">Hoje a Jornada só descobre as ferramentas desses servidores. Ela ainda não executa ferramentas externas nem envia seus dados a eles.</span>
        {map.mcp_outbound.length > 0 && <ul className="ai-source-states">{map.mcp_outbound.map(item => <li key={item.id} data-state={item.enabled ? 'available' : 'unusable'}><span className="ai-source-name">{item.label}</span><span className="ai-state">{item.enabled ? 'Ligado' : 'Pausado'}</span><small className="muted">{item.host ?? 'endereço inválido'} · {item.has_key ? 'com token' : 'sem token'}</small></li>)}</ul>}</div>
    </div>
    <p className="muted small"><Network size={13} aria-hidden="true" /> Mapa gerado em {new Date(map.generated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</p>

    {baseConfirm && <Modal title="Ligar a base de IA para membros" onClose={() => { if (!busy) setBaseConfirm(false); }}>
      <p>As conexões marcadas como “Eu e membros” passarão a processar dados pessoais dos membros e a consumir suas cotas de API, dentro dos limites por pessoa. A voz ao vivo continua só sua. A ativação fica registrada na auditoria.</p>
      <div className="button-row"><button type="button" className="button outline" disabled={!!busy} onClick={() => setBaseConfirm(false)}>Cancelar</button>
        <button type="button" className="button primary" disabled={!!busy} onClick={() => void run('base-on', async () => { await api('/api/ai/resources', { action: 'set_base', enabled: true }); setBaseConfirm(false); }, 'Base para membros ligada.')}>Ligar base</button></div></Modal>}
    {offer && <Modal title="Oferecer esta conexão aos membros" onClose={() => { if (!busy) setOffer(null); }}>
      <p>A base já está ligada. Ao confirmar, {resourceName(offer.resource)} passa a atender os membros agora, com dados pessoais deles e a sua cota. Você pode voltar para “Só eu” a qualquer momento.</p>
      <div className="button-row"><button type="button" className="button outline" disabled={!!busy} onClick={() => setOffer(null)}>Cancelar</button>
        <button type="button" className="button primary" disabled={!!busy} onClick={() => { const current = offer; void savePolicy(current.resource, current.privacy_basis, 'members').then(() => setOffer(null)); }}>Oferecer aos membros</button></div></Modal>}
  </div>;
}

function ResourceCard({ resource, busy, baseEnabled, onSave }: { resource: AiResource; busy: string; baseEnabled: boolean; onSave: (privacy: 'paid' | 'no_training' | null, audience: 'owner' | 'members') => void }) {
  const [privacy, setPrivacy] = useState<'' | 'paid' | 'no_training'>(resource.declaration.current ? resource.declaration.privacy_basis ?? '' : '');
  const [audience, setAudience] = useState<'owner' | 'members'>(resource.declaration.current ? resource.declaration.audience ?? 'owner' : 'owner');
  const declarable = declarableProviders.includes(resource.provider);
  const capabilities = providerCapabilities[resource.provider];
  const dependent = modelDependentCapabilities[resource.provider] ?? [];
  const stale = !!resource.declaration.privacy_basis && !resource.declaration.current;
  const id = resource.source_id.replace(/[^a-z0-9]/gi, '-');
  const paused = !resource.enabled;
  const declared = !!resource.declaration.privacy_basis;
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSave(privacy || null, privacy ? audience : 'owner'); }
  return <form className="ai-card ai-resource" onSubmit={submit} aria-label={resourceName(resource)}>
    <div className="section-heading"><strong>{resourceName(resource)}</strong><span className="ai-badge">{resource.enabled ? 'Ligada' : 'Pausada'}</span></div>
    <span className="muted small">{resource.kind === 'connection' ? 'Conexão extra' : 'Chave principal'}{resource.key_hint ? ` · chave …${resource.key_hint}` : ''}</span>
    <ul className="ai-capabilities" aria-label="O que este serviço faz na Jornada">{capabilities.map(capability => <li key={capability}>{capabilityLabels[capability]}</li>)}
      {dependent.map(capability => <li key={capability}>{capabilityLabels[capability]} (depende do modelo)</li>)}</ul>
    <span className="small">{resource.personal_data_ok ? 'Pode receber seus dados pessoais nas suas rotas.' : 'Fora das rotas com dados pessoais até a declaração.'}</span>
    {stale && <p className="cm-message" role="status">{reasonLabels.declaration_stale}</p>}
    {declarable && paused ? <>
      <span className="muted small">Ligue esta conexão em Conexões e chaves para declarar as condições de privacidade.</span>
      {declared && <button type="button" className="button outline" disabled={!!busy} onClick={() => onSave(null, 'owner')}>Retirar declaração</button>}
    </> : declarable ? <>
      <label htmlFor={`${id}-privacy`}>Condições de privacidade</label>
      <select id={`${id}-privacy`} value={privacy} disabled={!!busy} onChange={event => setPrivacy(event.target.value as typeof privacy)}>
        <option value="">Ainda não conferi</option><option value="paid">Conferi: API paga</option>
        {resource.provider !== 'gemini' && <option value="no_training">Conferi: contrato sem uso para treino</option>}</select>
      <label htmlFor={`${id}-audience`}>Quem pode usar</label>
      <select id={`${id}-audience`} value={privacy ? audience : 'owner'} disabled={!!busy || !privacy} onChange={event => setAudience(event.target.value as typeof audience)}>
        <option value="owner">Só eu</option><option value="members">Eu e membros{baseEnabled ? '' : ' (quando a base for ligada)'}</option></select>
      {resource.provider === 'gemini' && <span className="muted small">Gemini gratuito pode usar o conteúdo para melhorar os produtos do Google. Declare “API paga” só se o faturamento estiver ativo no projeto desta chave.</span>}
      <button type="submit" className="button outline" disabled={!!busy}>Salvar condições</button>
    </> : <span className="muted small">{resource.provider === 'elevenlabs' ? 'Atende só a sua voz ao vivo; não é compartilhada com membros.' : 'Atende só as suas rotas; não é oferecida aos membros.'}</span>}
  </form>;
}
