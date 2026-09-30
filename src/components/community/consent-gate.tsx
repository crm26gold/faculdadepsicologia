'use client';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from './client';

// Aceite no primeiro acesso: linguagem simples, com os pontos que a pessoa precisa saber.
export function ConsentGate({ onAccepted }: { onAccepted: () => void }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="cm-consent-backdrop"><section className="cm-consent" role="dialog" aria-modal="true" aria-labelledby="consent-title">
    <span className="cm-consent-icon"><ShieldCheck size={26} aria-hidden="true" /></span>
    <h2 id="consent-title">Antes de começar, o combinado</h2>
    <ul>
      <li><strong>Seu espaço pessoal é só seu.</strong> Matérias, caderno, agenda, finanças, rotina e contatos não aparecem para colegas, professores nem para a administração.</li>
      <li><strong>O que você envia a uma sala ou grupo é compartilhado</strong> com quem participa dela (colegas do grupo e quem orienta).</li>
      <li><strong>Você pode baixar ou excluir seus dados</strong> quando quiser. O que já foi entregue a um trabalho de grupo continua no trabalho, como “Ex-membro”.</li>
      <li><strong>Sem venda de dados.</strong> Para melhorar o sistema usamos só estatísticas anônimas. Quando houver recursos de IA, você será avisado sobre o que é enviado e para quem.</li>
    </ul>
    <p className="muted small">Leia na íntegra: <a href="/termos" target="_blank" rel="noopener">Termos de uso</a> · <a href="/privacidade" target="_blank" rel="noopener">Política de privacidade</a></p>
    <label className="cm-check"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} /> Li e concordo com os termos de uso e a política de privacidade.</label>
    {error && <p className="cm-message" role="alert">{error}</p>}
    <button className="button primary full-width" disabled={!checked || busy} onClick={async () => {
      setBusy(true); setError('');
      try { await api('/api/me', { action: 'accept_terms' }); onAccepted(); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Tente novamente.'); setBusy(false); }
    }}>Concordo e quero continuar</button>
    <form action="/auth/logout" method="post"><button className="text-button full-width">Agora não, sair</button></form>
  </section></div>;
}
