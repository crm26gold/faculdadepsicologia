'use client';
import { useEffect, useState } from 'react';
import { Sprout } from 'lucide-react';
import { PENDING_INVITE_KEY } from './client';

// Guarda o convite neste navegador e segue para o app. Depois do login com Google,
// o app aceita o convite automaticamente e abre a sala.
export function InviteCapture({ token }: { token: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!token) return;
    try { localStorage.setItem(PENDING_INVITE_KEY, token); window.location.replace('/#community'); }
    catch { setFailed(true); }
  }, [token]);
  return <main className="legal-page"><a href="/" className="legal-brand"><span><Sprout size={18} aria-hidden="true" /></span>Jornada <strong>Plena.</strong></a>
    <article><h1>Convite para o Jornada Plena</h1>
      {!token ? <p>Este link de convite não é válido. Peça um novo link a quem convidou você.</p>
        : failed ? <p>Seu navegador bloqueou o armazenamento local. Entre no Jornada Plena e cole este link em “Salas e grupos → Entrar com um convite”.</p>
        : <p role="status">Preparando seu acesso… Se nada acontecer, <a href="/#community">continue por aqui</a>.</p>}
    </article></main>;
}
