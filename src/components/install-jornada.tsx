'use client';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

type InstallEvent = Event & { prompt: () => Promise<unknown>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

/** Offer installation only when the mobile browser declares it available. */
export function InstallJornada() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (!/Android|iPhone|iPad/i.test(navigator.userAgent) || window.matchMedia('(display-mode: standalone)').matches) return;
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const installed = () => { setPrompt(null); setProblem(''); };
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', installed); };
  }, []);
  async function install() {
    if (!prompt || busy) return;
    setBusy(true); setProblem('');
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { setProblem('Abra o menu do navegador e procure “Instalar aplicativo” ou “Adicionar à tela inicial”.'); }
    finally { setPrompt(null); setBusy(false); }
  }
  if (!prompt && !problem) return null;
  return <div className="assistant-install">
    {prompt && <button type="button" className="button outline" disabled={busy} onClick={() => void install()}><Download size={17} aria-hidden="true" />{busy ? 'Abrindo…' : 'Instalar Jornada Plena'}</button>}
    <p className="muted small" role="status">{problem || 'Tenha um atalho para sua Jornada na tela inicial.'}</p>
  </div>;
}
