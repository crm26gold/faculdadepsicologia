'use client';
import { useEffect, useState } from 'react';
import { api } from './community/client';

type State = { ready: boolean; available: boolean; linked: boolean; relay?: string; peer?: string };
export function WhatsAppMyLink() {
  const [state, setState] = useState<State>();
  const [code, setCode] = useState<{ code: string; link: string }>();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState('');
  async function load() { setState(await api<State>('/api/whatsapp/my-link')); }
  useEffect(() => { let current = true; void api<State>('/api/whatsapp/my-link').then(value => { if (current) setState(value); }).catch(() => { if (current) setMessage('Não consegui consultar seu vínculo com o WhatsApp.'); }); return () => { current = false; }; }, []);
  async function act(action: 'code' | 'unlink') {
    setBusy(true); setMessage('');
    try {
      const result = await api<{ code?: string; link?: string }>('/api/whatsapp/my-link', { action });
      if (action === 'code' && result.code && result.link) { setCode({ code: result.code, link: result.link }); setMessage('Código válido por 15 minutos. Envie pelo seu próprio telefone.'); }
      else { setCode(undefined); setMessage('Telefone desvinculado. Seus registros continuam na conta.'); }
      setConfirm(false); await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não consegui atualizar o vínculo.'); }
    finally { setBusy(false); }
  }
  return <details className="ai-provider"><summary>Meu WhatsApp <span className="ai-badge">{state?.linked ? 'Vinculado' : 'Não vinculado'}</span></summary>
    <div className="ai-card"><p>Use suas chaves de IA para organizar sua vida por texto ou áudio. O telefone vinculado acessa somente sua Jornada.</p>
      {!state ? <p role="status">Consultando vínculo…</p> : !state.ready ? <p>O vínculo pessoal está aguardando a atualização do banco.</p> : <>
        {state.linked && <p>Seu telefone: <strong>{state.peer}</strong></p>}
        {!state.available && <p>A conexão de WhatsApp está offline. Você poderá vincular seu telefone quando a administração ativá-la.</p>}
        <div className="button-row"><button className="button outline" type="button" disabled={busy || !state.available} onClick={() => void act('code')}>{busy ? 'Aguarde…' : state.linked ? 'Vincular outro telefone' : 'Gerar código de vínculo'}</button>
          {state.linked && <button className="text-button cm-danger" type="button" disabled={busy} onClick={() => setConfirm(true)}>Desvincular meu telefone</button>}
          </div>
      </>}
      <button className="text-button" type="button" disabled={busy} onClick={() => { setMessage(''); void load().catch(() => setMessage('Não consegui atualizar o vínculo.')); }}>Atualizar vínculo</button>
      {code && <div className="ai-model-summary"><p>Envie <code>/vincular {code.code}</code> para o número da Jornada.</p><a className="button outline" href={code.link} target="_blank" rel="noopener noreferrer">Abrir no WhatsApp</a></div>}
      {confirm && <div role="group" aria-label="Confirmar desvínculo"><p>Este telefone perderá acesso à sua Jornada e os pedidos aguardando serão cancelados.</p><div className="button-row"><button className="button outline" type="button" disabled={busy} onClick={() => setConfirm(false)}>Manter vínculo</button><button className="button primary" type="button" disabled={busy} onClick={() => void act('unlink')}>Confirmar desvínculo</button></div></div>}
      {message && <p className="cm-message" role="status">{message}</p>}
    </div></details>;
}
