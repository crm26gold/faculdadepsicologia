'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, ExternalLink, MessageCircle, RefreshCw, ShieldCheck, Unplug } from 'lucide-react';
import { api } from './community/client';

type State = { enabled: boolean; configured: boolean; state: 'offline' | 'qr' | 'connecting' | 'ready'; relay: string; heartbeat: string | null;
  qr: string | null; stt_connection: string; stt_model: string; voice: string; linked: boolean; peer: string | null; queued: number;
  connections: { id: string; label: string; enabled: boolean }[] };
const names = { offline: 'Ponte desconectada', qr: 'Escaneie o QR Code', connecting: 'Conectando ao WhatsApp', ready: 'WhatsApp conectado' };
export function WhatsAppAdmin() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ code: string; link: string } | null>(null);
  const [confirm, setConfirm] = useState<'rotate' | 'unlink' | null>(null);
  const load = useCallback(async () => {
    try { setState(await api<State>('/api/whatsapp/admin')); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não consegui carregar a conexão.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!state?.configured) return;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, state.state === 'qr' || link ? 5000 : 30_000);
    return () => window.clearInterval(timer);
  }, [state?.configured, state?.state, link, load]);
  useEffect(() => { if (state?.linked) setLink(null); }, [state?.linked]);
  async function act(action: 'rotate' | 'code' | 'unlink') {
    setBusy(true); setMessage(''); setConfirm(null);
    try {
      if (action === 'rotate') {
        const result = await api<{ config: { origin: string; token: string }; state: State }>('/api/whatsapp/admin', { action });
        const url = URL.createObjectURL(new Blob([JSON.stringify(result.config, null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'jornada-whatsapp-config.json'; anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setState(result.state); setLink(null);
        setMessage('Credencial criada e arquivo baixado. No computador da ponte, execute o comando abaixo e selecione esse arquivo. A credencial é mostrada apenas nesse download.');
      } else if (action === 'code') setLink(await api<{ code: string; link: string }>('/api/whatsapp/admin', { action }));
      else { await api('/api/whatsapp/admin', { action }); setLink(null); setMessage('Telefone desvinculado. Seus registros permanecem na Jornada.'); }
      await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não consegui concluir.'); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage('');
    try {
      await api('/api/whatsapp/admin', { action: 'save', enabled: form.get('enabled') === 'on', stt_connection: form.get('stt_connection'), stt_model: form.get('stt_model'), voice: form.get('voice') });
      setMessage('Configuração salva. Pausar impede novos pedidos e a execução dos que estão aguardando.'); await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não consegui salvar.'); }
    finally { setBusy(false); }
  }
  return <section className="panel ai-settings wa-settings" aria-labelledby="whatsapp-title">
    <div className="section-heading"><h2 id="whatsapp-title"><MessageCircle size={20} aria-hidden="true" /> WhatsApp da Jornada</h2>
      {state && <span className="ai-badge">{!state.enabled ? 'Pausado' : names[state.state]}</span>}</div>
    <p className="muted">Fale no seu WhatsApp. A Jornada organiza, consulta e responde em áudio. O número da ponte pode mudar; sua conta e seus registros continuam aqui.</p>
    {error && <p role="alert">{error} <button className="button" onClick={() => void load()}>Tentar novamente</button></p>}
    {!state && !error && <p role="status">Carregando conexão…</p>}
    {state && <>
      <div className="wa-steps">
        <article className="ai-card"><span className="eyebrow">01 · Ponte</span><h3>Conecte o número temporário</h3>
          <p className="muted small">A ponte roda neste computador ou em um servidor sempre ligado. Ela não recebe as chaves das IAs.</p>
          <button className="button primary" disabled={busy} onClick={() => state.configured ? setConfirm('rotate') : void act('rotate')}><Download size={16} /> {state.configured ? 'Substituir credencial da ponte' : 'Criar conexão e baixar configuração'}</button>
          <details><summary>Como iniciar neste computador</summary><p className="muted small">Na pasta do projeto Faculdade, abra o terminal e execute. Selecione o arquivo baixado. Depois volte a este painel para escanear o QR Code.</p>
            <pre className="wa-command"><code>npm run whatsapp:setup</code></pre>
            <p className="muted small">Guarde esse arquivo como uma senha. Não envie no chat. Para funcionar sem o computador ligado, a ponte precisa de um servidor próprio.</p></details>
          {state.qr && state.enabled && <figure className="wa-qr"><img src={state.qr} width={280} height={280} alt="QR Code para conectar o WhatsApp Business do número temporário" />
            <figcaption>No número temporário: WhatsApp Business › Aparelhos conectados › Conectar um aparelho.</figcaption></figure>}
          {state.relay && <p className="small">Número da ponte: +{state.relay}</p>}
        </article>
        <article className="ai-card"><span className="eyebrow">02 · Seu acesso</span><h3>Vincule seu telefone pessoal</h3>
          <p className="muted small">Somente o telefone vinculado pode consultar ou alterar seu espaço. O código vale uma vez, por 15 minutos.</p>
          {state.linked ? <><p><ShieldCheck size={16} /> Telefone vinculado: +{state.peer}</p><button className="button" disabled={busy} onClick={() => setConfirm('unlink')}><Unplug size={16} /> Revogar acesso</button></>
            : <button className="button primary" disabled={busy || state.state !== 'ready' || !state.enabled} onClick={() => void act('code')}>Gerar código de vínculo</button>}
          {link && <div role="status"><p>Envie do seu telefone pessoal para o número temporário:</p><pre className="wa-command"><code>/vincular {link.code}</code></pre>
            <a className="button" href={link.link} target="_blank" rel="noopener noreferrer">Abrir WhatsApp <ExternalLink size={16} /></a></div>}
          <p className="muted small">Depois diga: “Agende o dentista amanhã às 15h”. Exclusões pedem um código de confirmação. O áudio original é apagado da fila quando o pedido termina.</p>
        </article>
      </div>
      {confirm && <div className="ai-card" role="alert"><strong>{confirm === 'rotate' ? 'Substituir a conexão?' : 'Revogar o acesso deste telefone?'}</strong>
        <p>{confirm === 'rotate' ? 'A credencial anterior para de funcionar e o telefone precisa ser vinculado novamente. Seus registros permanecem.' : 'Esse telefone deixa de acessar a Jornada e os pedidos aguardando são cancelados.'}</p>
        <div className="button-row"><button className="button primary" disabled={busy} onClick={() => void act(confirm)}>Confirmar</button><button className="button" onClick={() => setConfirm(null)}>Voltar</button></div></div>}
      <form key={`${state.stt_connection}:${state.stt_model}:${state.voice}:${state.enabled}`} className="ai-card" onSubmit={save}>
        <h3>Inteligência e voz</h3><p className="muted small">As respostas usam a tarefa “Conversa do assistente” no painel de IA. A leitura de áudio e fotos tem conexão própria, para você poder trocar a inteligência central.</p>
        <div className="wa-steps"><label>Conexão para entender áudio e fotos<select name="stt_connection" defaultValue={state.stt_connection} required>
          {state.connections.map(item => <option key={item.id} value={item.id}>{item.label}{!item.enabled ? ' · desativada' : ''}</option>)}</select></label>
          <label>Modelo de leitura<input name="stt_model" defaultValue={state.stt_model} required maxLength={160} list="wa-stt-models" /><datalist id="wa-stt-models"><option value="auto:rapido" /><option value="auto:melhor" /><option value="auto:economico" /></datalist></label>
          <label>Voz da resposta<select name="voice" defaultValue={state.voice}><option value="pt-BR-AntonioNeural">Antônio · português brasileiro</option><option value="pt-BR-FranciscaNeural">Francisca · português brasileiro</option></select></label></div>
        <label className="cm-check"><input name="enabled" type="checkbox" defaultChecked={state.enabled} disabled={!state.configured} /> Permitir pedidos pelo WhatsApp</label>
        <div className="button-row"><button className="button primary" disabled={busy}>Salvar configuração</button><button className="button" type="button" disabled={busy} onClick={() => void load()}><RefreshCw size={16} /> Atualizar conexão</button></div>
        <p className="muted small">A voz usa o serviço online de leitura do Edge, em ritmo calmo. Se a síntese falhar, a resposta chega em texto. Áudio e fotos são enviados à conexão escolhida; o texto da resposta vai ao serviço de voz.</p>
      </form>
      <p className="muted small">{state.queued} pedido(s) aguardando · Sem acesso por grupos · Conexão não oficial: o WhatsApp pode interromper ou bloquear a sessão.</p>
    </>}
    {message && <p className="cm-message" role="status">{message}</p>}
  </section>;
}
