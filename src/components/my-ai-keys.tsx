'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, KeyRound, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { aiCatalog, personalProviderIds, type AiMyKeysState, type PersonalProviderId } from '@/lib/ai/catalog';
import { api } from './community/client';
import { Modal } from './modal';

export function MyAiKeys() {
  const [state, setState] = useState<AiMyKeysState | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [provider, setProvider] = useState<PersonalProviderId>('groq');
  const [showSecret, setShowSecret] = useState(false);
  const [remove, setRemove] = useState<PersonalProviderId | null>(null);
  const [baseConfirm, setBaseConfirm] = useState(false);
  const operation = useRef(false);
  const load = useCallback(async () => {
    try { setState(await api<AiMyKeysState>('/api/ai/my-keys')); }
    catch { setMessage('Não consegui consultar suas chaves. Tente atualizar.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function run(id: string, action: () => Promise<void>, success: string) {
    if (operation.current) return;
    operation.current = true;
    setBusy(id); setMessage('');
    try { await action(); setMessage(success); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não consegui concluir.'); }
    finally { operation.current = false; setBusy(''); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, fields = new FormData(form);
    let result = '';
    await run('save', async () => {
      const answer = await api<{ message: string }>('/api/ai/my-keys', { action: 'save', provider,
        key: String(fields.get('key') ?? '').trim(), enabled: fields.get('enabled') === 'on', privacy_basis: fields.get('privacy_basis') || null });
      result = answer.message; form.reset(); setShowSecret(false);
    }, 'Chave validada e guardada.');
    if (result) setMessage(result);
  }
  if (state && !state.available) return null; // Code is deployed before its additive database migration.
  if (!state) return <section className="panel my-ai-keys" aria-label="Minhas chaves de IA" role="status">{message || 'Consultando suas chaves de IA…'}{message && <button type="button" className="button outline" onClick={() => void load()}>Atualizar</button>}</section>;
  const current = state.keys.find(key => key.provider === provider);
  return <section className="panel ai-control my-ai-keys" aria-labelledby="my-ai-keys-title">
    <div className="ai-control-heading"><div><h2 id="my-ai-keys-title"><KeyRound size={20} aria-hidden="true" /> Minhas chaves de IA</h2><p>Suas APIs, utilizadas primeiro e somente na sua conta.</p></div><button type="button" className="button outline" disabled={!!busy} onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" />Atualizar</button></div>
    <p className="muted small">Assinaturas do ChatGPT, Claude e outros aplicativos se conectam em Conectar assistentes (MCP). Aqui você cadastra chaves de API, com cobrança e regras próprias de cada empresa.</p>
    <p className="ai-status"><ShieldCheck size={16} aria-hidden="true" />As chaves ficam cifradas no servidor e não são compartilhadas com outras pessoas. Seus registros continuam privados.</p>
    {state.keys.length > 0 && <ul className="ai-key-list">{state.keys.map(key => <li key={key.provider}><div><strong>{aiCatalog[key.provider].name}</strong><span className="muted small">Chave …{key.key_hint} · {key.enabled ? 'Ligada' : 'Pausada'}</span></div><div className="button-row">
      <button type="button" className="button outline" disabled={!!busy} onClick={() => void run(`test-${key.provider}`, async () => { const answer = await api<{ message: string }>('/api/ai/my-keys', { action: 'test', provider: key.provider }); setMessage(answer.message); }, 'Acesso à lista de modelos aceito; geração e cota precisam de teste.')}>Testar chave</button>
      <button type="button" className="button outline" disabled={!!busy} onClick={() => void run(`set-${key.provider}`, async () => { await api('/api/ai/my-keys', { action: 'set', provider: key.provider, enabled: !key.enabled }); }, key.enabled ? 'Chave pausada.' : 'Chave ligada.')}>{key.enabled ? 'Pausar' : 'Ligar'}</button>
      <button type="button" className="text-button cm-danger" disabled={!!busy} onClick={() => setRemove(key.provider)}><Trash2 size={15} aria-hidden="true" />Remover</button>
    </div></li>)}</ul>}
    <form className="ai-card" onSubmit={save}><fieldset disabled={!!busy}>
      <strong>{current ? 'Trocar sua chave' : 'Cadastrar sua chave'}</strong>
      <label>Empresa<select value={provider} onChange={event => { setProvider(event.target.value as PersonalProviderId); setShowSecret(false); }} disabled={!!busy}>{personalProviderIds.map(id => <option key={id} value={id}>{aiCatalog[id].name}</option>)}</select></label>
      <p className="muted small">{aiCatalog[provider].help}</p>
      <label>Chave de API<span className="ai-secret-input"><input key={provider} name="key" type={showSecret ? 'text' : 'password'} required maxLength={12_000} autoComplete="off" spellCheck={false} placeholder={current ? 'Cole a nova chave para substituir' : 'Cole sua chave de API'} /><button type="button" className="button outline" aria-pressed={showSecret} aria-label={showSecret ? 'Ocultar chave de API' : 'Mostrar chave de API'} onClick={() => setShowSecret(!showSecret)}>{showSecret ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}</button></span></label>
      <label>Condições de privacidade da minha API<select key={`privacy-${provider}-${current?.updated_at || ''}`} name="privacy_basis" defaultValue={current?.privacy_basis ?? ''}><option value="">Ainda não conferi: guardar pausada</option><option value="paid">Conferi: faturamento da API paga habilitado</option>{provider !== 'gemini' && <option value="no_training">Conferi: contrato sem uso dos dados para treino</option>}</select></label>
      <label className="cm-check"><input key={`enabled-${provider}`} type="checkbox" name="enabled" defaultChecked={false} />Ligar depois de validar e conferir as condições acima</label>
      <p className="muted small">A Jornada envia contexto pessoal para suas APIs habilitadas. Gemini gratuito não permite dados pessoais ou sensíveis; para ligá-lo, confirme faturamento pago habilitado no projeto. Guardar uma chave não habilita faturamento nem altera seu plano. A declaração de condições é sua; a Jornada não verifica seu contrato na empresa. Consultar modelos não garante créditos.</p>
      <p className="muted small">Para membros, chamadas usam uma chave própria Gemini Live, OpenAI ou xAI. No proprietário, Chamada ao vivo continua usando a configuração da Administração.</p>
      <button className="button primary" disabled={!!busy || !state.secretReady}>{busy === 'save' ? 'Validando e guardando…' : 'Validar e guardar chave'}</button>
    </fieldset></form>
    {!state.secretReady && <p className="cm-message" role="status">O cofre de chaves precisa ser configurado pelo administrador.</p>}
    {state.isOwner && <details className="ai-card"><summary>Privacidade das conexões e base para membros</summary>
      <p className="muted small">Confirme as condições de cada conexão antes de autorizar dados pessoais. Gemini exige faturamento pago habilitado; sem essa declaração, fica fora das rotas com dados pessoais. Para os outros serviços, confira API paga ou contrato sem uso para treino. Trocar a chave exige nova autorização.</p><p className="muted small">A base compartilhada é desligada por padrão e só atende texto. Sua conta ElevenLabs não atende chamadas de membros. Confirmar privacidade abaixo não liga a base; a ativação é um passo separado.</p>
      {(state.baseSources ?? []).map(source => <label key={source.connection_id || source.provider}>{source.label} · {aiCatalog[source.provider].name}<select disabled={!!busy} value={source.privacy_basis ?? ''} onChange={event => { const value = event.target.value as 'paid' | 'no_training' | ''; void run(`base-${source.connection_id || source.provider}`, async () => { await api('/api/ai/my-keys', { action: 'set_base_source', provider: source.provider, connection_id: source.connection_id, privacy_basis: value || null }); }, value ? 'Conexão autorizada para a base de membros.' : 'Conexão retirada da base.'); }}><option value="">Não compartilhar</option><option value="paid">Conferi: API paga</option>{source.provider !== 'gemini' && <option value="no_training">Conferi: contrato sem uso para treino</option>}</select></label>)}
      <button type="button" className={`button ${state.baseEnabled ? 'outline' : 'primary'}`} disabled={!!busy || (!state.baseEnabled && !(state.baseSources ?? []).some(source => source.privacy_basis))} onClick={() => { if (state.baseEnabled) void run('base-off', async () => { await api('/api/ai/my-keys', { action: 'set_base', enabled: false }); }, 'Base para membros desligada.'); else setBaseConfirm(true); }}>{state.baseEnabled ? 'Desligar base para membros' : 'Ligar base para membros'}</button>
    </details>}
    {!state.isOwner && <p className="muted small">{state.baseEnabled ? 'Se suas chaves falharem, a Jornada pode usar a base autorizada pelo proprietário para texto, dentro dos limites por pessoa.' : 'A base compartilhada está desligada. Para usar IA, cadastre sua chave ou conecte seu assistente por MCP.'}</p>}
    {message && <p className="cm-message" role="status">{message}</p>}
    {remove && <Modal title="Remover sua chave de IA" onClose={() => { if (!busy) setRemove(null); }}><p>Remover a chave de {aiCatalog[remove].name}? Ela será apagada do cofre. Seus registros continuam guardados. A IA poderá usar outras chaves suas ou a base autorizada para texto.</p><div className="button-row"><button type="button" className="button outline" disabled={!!busy} onClick={() => setRemove(null)}>Cancelar</button><button type="button" className="button danger" disabled={!!busy} onClick={() => void run('remove', async () => { await api('/api/ai/my-keys', { action: 'remove', provider: remove }); setRemove(null); }, 'Sua chave foi removida do cofre.')}>Remover chave</button></div></Modal>}
    {baseConfirm && <Modal title="Autorizar base de IA para membros" onClose={() => { if (!busy) setBaseConfirm(false); }}><p>As conexões autorizadas poderão processar dados pessoais dos membros e consumir suas cotas de API. Confira as regras de privacidade e os custos de cada conexão. A ativação fica registrada na auditoria.</p><div className="button-row"><button type="button" className="button outline" disabled={!!busy} onClick={() => setBaseConfirm(false)}>Cancelar</button><button type="button" className="button primary" disabled={!!busy} onClick={() => void run('base-on', async () => { await api('/api/ai/my-keys', { action: 'set_base', enabled: true }); setBaseConfirm(false); }, 'Base autorizada para membros ligada.')}>Autorizar e ligar</button></div></Modal>}
  </section>;
}
