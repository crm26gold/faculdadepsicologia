'use client';
import { useEffect, useState } from 'react';
import { BellRing, Download, Share, SquarePlus, X } from 'lucide-react';
import { api } from './community/client';
import { currentSubscription, deviceKind, enablePush, installed, pushSupported, type Device } from './push-client';

type InstallEvent = Event & { prompt: () => Promise<unknown>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type Step = 'install' | 'notify';
const LATER = 14 * 86_400_000;
const keyOf = (step: Step) => `jornada-plena:convite-${step}`;
const later = (step: Step) => { try { return Date.now() - Number(localStorage.getItem(keyOf(step)) || 0) < LATER; } catch { return false; } };
const remember = (step: Step) => { try { localStorage.setItem(keyOf(step), String(Date.now())); } catch { /* sem armazenamento */ } };

/** Meu dia: no celular e no tablet, convida a instalar (o caminho para a notificação, inclusive no iPhone); com o app
 * instalado ou no computador, convida a ligar as notificações. "Agora não" guarda a escolha por 14 dias. */
export function AppInvite({ cloud, onOpenAvisos }: { cloud: boolean; onOpenAvisos: () => void }) {
  const [step, setStep] = useState<Step | null>(null);
  const [device, setDevice] = useState<Device>('computer');
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [vapid, setVapid] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const kind = deviceKind();
    setDevice(kind);
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    window.addEventListener('beforeinstallprompt', available);
    if (kind !== 'computer' && !installed() && !later('install')) setStep('install');
    else if (cloud && pushSupported() && Notification.permission === 'default' && !later('notify'))
      void currentSubscription().then(subscription => subscription ? null
        : api<{ vapid: string }>('/api/reminders').then(state => { if (state.vapid) { setVapid(state.vapid); setStep('notify'); } })).catch(() => null);
    return () => window.removeEventListener('beforeinstallprompt', available);
  }, [cloud]);

  if (!step) return null;
  const tablet = device === 'ipad' || (device === 'android' && Math.min(screen.width, screen.height) >= 600);
  const where = device === 'computer' ? 'neste computador' : tablet ? 'no seu tablet' : 'no seu celular';
  const close = () => { remember(step); setStep(null); };

  async function install() {
    if (!prompt) return;
    setBusy(true);
    try { await prompt.prompt(); if ((await prompt.userChoice).outcome === 'accepted') setStep(null); }
    catch { setMessage('Abra o menu do navegador e toque em “Instalar aplicativo”.'); }
    finally { setPrompt(null); setBusy(false); }
  }
  async function notify() {
    setBusy(true); setMessage('');
    try { await enablePush(vapid); setMessage('Pronto! As notificações estão ligadas.'); window.setTimeout(() => setStep(null), 2500); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível ligar.'); }
    finally { setBusy(false); }
  }

  return <section className="panel app-invite" aria-labelledby="app-invite-title">
    <button type="button" className="icon-button app-invite-close" aria-label="Fechar o convite" onClick={close}><X size={18} aria-hidden="true" /></button>
    {step === 'install' ? <>
      <div className="app-invite-head">
        <img src="/brand/icone-192.png" alt="" width={52} height={52} />
        <div><h2 id="app-invite-title">Instale a Jornada Plena {where}</h2>
          <p>Abre direto da tela inicial, em tela cheia, e recebe as notificações dos seus lembretes e do Networking, mesmo com o app fechado.</p></div>
      </div>
      {device === 'iphone' || device === 'ipad' ? <ol className="app-invite-steps">
        <li><Share size={18} aria-hidden="true" /><span>Toque em <strong>Compartilhar</strong>, {device === 'ipad' ? 'no alto do Safari' : 'na barra do Safari'}.</span></li>
        <li><SquarePlus size={18} aria-hidden="true" /><span>Toque em <strong>Adicionar à Tela de Início</strong> e depois em Adicionar.</span></li>
        <li><BellRing size={18} aria-hidden="true" /><span>Abra a Jornada pelo novo ícone e ligue as notificações.</span></li>
      </ol> : prompt ? null : <p className="app-invite-tip">Abra o menu <strong>⋮</strong> do navegador e toque em <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</p>}
      <div className="app-invite-actions">
        {prompt && <button type="button" className="button primary" disabled={busy} onClick={() => void install()}><Download size={17} aria-hidden="true" />{busy ? 'Abrindo…' : 'Instalar agora'}</button>}
        <button type="button" className="button outline" onClick={close}>Agora não</button>
      </div>
    </> : <>
      <div className="app-invite-head">
        <span className="app-invite-icon" aria-hidden="true"><BellRing size={26} /></span>
        <div><h2 id="app-invite-title">Ligue as notificações {where}</h2>
          <p>Seus lembretes e as novidades do Networking chegam na hora, mesmo com o app fechado. O horário de silêncio e o resto ficam em <button type="button" className="text-button" onClick={onOpenAvisos}>Meu espaço › Avisos</button>.</p></div>
      </div>
      <div className="app-invite-actions">
        <button type="button" className="button primary" disabled={busy} onClick={() => void notify()}><BellRing size={17} aria-hidden="true" />{busy ? 'Ligando…' : 'Ligar notificações'}</button>
        <button type="button" className="button outline" onClick={close}>Agora não</button>
      </div>
    </>}
    {message && <p className="cm-message" role="status">{message}</p>}
  </section>;
}
