'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, Sprout } from 'lucide-react';
import { api, ApiError } from './community/client';
import type { Home } from '@/lib/community';

export const OAUTH_RETURN_KEY = 'jornada-plena:oauth-return';
type Request = { client_id: string; redirect_uri: string; code_challenge: string; state?: string; resource?: string; write: boolean };

/** Consent for ChatGPT, Claude and other MCP clients. Login comes first; the decision is the person's. */
export function OAuthConsent({ problem, clientName, identity, request }: { problem: string; clientName: string; identity: { origin: string; address: string }; request: Request }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [account, setAccount] = useState<Home['account'] | null>(null);
  const [write, setWrite] = useState(request.write);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (problem) return;
    let active = true;
    void api<Home>('/api/me').then(home => { if (active) { setAccount(home.account); setSignedIn(true); } }, error => { if (!active) return; if (error instanceof ApiError && error.status === 401) setSignedIn(false); else setMessage('Não consegui verificar sua conta. Recarregue a página.'); });
    return () => { active = false; };
  }, [problem]);
  function login() {
    // The app returns here after Google login; only this same-origin consent page is remembered.
    try { localStorage.setItem(OAUTH_RETURN_KEY, window.location.pathname + window.location.search); } catch { /* the person can reopen the link */ }
    window.location.assign('/login');
  }
  async function decide(allow: boolean) {
    setBusy(true); setMessage('');
    try { const result = await api<{ redirect: string }>('/api/oauth/authorize', { ...request, write, allow }); window.location.assign(result.redirect); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível concluir.'); setBusy(false); }
  }
  return <main className="legal-page oauth-consent">
    <a href="/" className="legal-brand"><span><Sprout size={18} aria-hidden="true" /></span>Jornada <strong>Plena.</strong></a>
    <article>
      <h1>Conectar assistente</h1>
      {problem ? <p role="alert">{problem}</p> : <>
        <p><strong>{clientName}</strong> quer acessar a sua Jornada pelo servidor MCP.</p>
        <section aria-label="Identidade do aplicativo">
          <p><strong>Endereço do aplicativo:</strong><br /><code style={{ overflowWrap: 'anywhere' }}>{identity.origin}</code></p>
          <details><summary>Ver endereço completo de retorno</summary><p style={{ overflowWrap: 'anywhere' }}>{identity.address}</p></details>
          <p className="muted small">O nome foi informado pelo aplicativo e não comprova sua identidade. Confira se o endereço pertence ao serviço que você está conectando.</p>
        </section>
        {account && <p><strong>Conta que será conectada:</strong> {account.display_name} ({account.email})</p>}
        <ul>
          <li>Consultar agenda, anotações, finanças, hábitos, metas, projetos e estudos da sua vida pessoal.</li>
          <li>{write ? 'Registrar e editar itens com as validações do aplicativo.' : 'Não poderá registrar nem editar nada.'}</li>
          <li>Exclusões continuam sendo confirmadas aqui no aplicativo. Grupos, salas e outras pessoas nunca entram.</li>
        </ul>
        <p className="muted small"><ShieldCheck size={15} aria-hidden="true" /> Você pode revogar a qualquer momento em Meu espaço › Conectar assistentes.</p>
        {signedIn === false && <button type="button" className="button primary" onClick={login}>Entrar para continuar</button>}
        {signedIn === null && !message && <p role="status">Verificando sua conta…</p>}
        {signedIn && <form method="post" action="/api/oauth/authorize" aria-busy={busy} onSubmit={event => { event.preventDefault(); void decide(true); }}>
          <label className="cm-check"><input type="checkbox" name="write" checked={write} disabled={busy} onChange={event => setWrite(event.target.checked)} /> Permitir registrar e editar</label>
          <div className="button-row">
            <button type="submit" className="button primary" disabled={busy}>{busy ? 'Concluindo…' : 'Permitir acesso'}</button>
            <button type="button" className="button outline" disabled={busy} onClick={() => void decide(false)}>Recusar</button>
          </div>
        </form>}
        {message && <p className="cm-message" role="alert">{message}</p>}
      </>}
    </article>
  </main>;
}
