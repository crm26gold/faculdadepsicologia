'use client';
import { useState } from 'react';
import { Download, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { Modal } from '../modal';
import { api } from './client';
import { hasPro, type Home } from '@/lib/community';

export function AccountSettings({ home, refreshHome }: { home: Home; refreshHome: () => void }) {
  const [name, setName] = useState(home.account.display_name);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const account = home.account;
  const plan = account.is_master ? 'Administrador master' : account.plan === 'pro' ? `Pro${account.plan_source === 'courtesy' ? ' (cortesia)' : ''}${account.pro_until ? ` até ${new Date(account.pro_until).toLocaleDateString('pt-BR')}` : ''}` : 'Acadêmico (gratuito)';

  async function rename() {
    setBusy(true); setMessage('');
    try { await api('/api/me', { action: 'rename', name }); setMessage('Nome atualizado.'); refreshHome(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }

  return <section className="panel cm-account">
    <div className="section-heading"><h2><UserRound size={16} aria-hidden="true" /> Minha conta</h2></div>
    <p className="muted small">{account.email} · Plano: <strong>{plan}</strong>{home.settings.open_access && !account.is_master ? ' · período de lançamento: tudo liberado' : ''}</p>
    {!hasPro(home) && <p className="cm-privacy-note">No plano Acadêmico você usa tudo da vida acadêmica e das salas. Finanças, rotina e metas fazem parte do Pro.</p>}
    <label htmlFor="display-name">Nome exibido nas salas e grupos</label>
    <div className="cm-inline-form"><input id="display-name" value={name} maxLength={120} onChange={event => setName(event.target.value)} /><button className="button outline" disabled={busy || !name.trim() || name.trim() === account.display_name} onClick={rename}>Salvar nome</button></div>
    {message && <p className="cm-message" role="status">{message}</p>}
    <h3><ShieldCheck size={15} aria-hidden="true" /> Seus dados (LGPD)</h3>
    <p className="muted small">Seu espaço pessoal é visível só para você. O que você envia a uma sala ou grupo fica visível para quem participa dela. Leia os <a href="/termos" target="_blank" rel="noopener">termos de uso</a> e a <a href="/privacidade" target="_blank" rel="noopener">política de privacidade</a>.</p>
    <div className="button-row">
      <a className="button outline" href="/api/me?export=1" download><Download size={16} aria-hidden="true" />Baixar todos os meus dados</a>
      {!account.is_master && <button className="button outline cm-danger" onClick={() => setDeleting(true)}><Trash2 size={16} aria-hidden="true" />Excluir minha conta</button>}
    </div>
    {deleting && <Modal title="Excluir minha conta" onClose={() => setDeleting(false)}><form className="entry-form" onSubmit={async event => {
      event.preventDefault();
      const confirm = String(new FormData(event.currentTarget).get('confirm') ?? '');
      setBusy(true); setMessage('');
      try { await api('/api/me', { action: 'delete_account', confirm }); window.location.href = '/'; }
      catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível excluir.'); setBusy(false); }
    }}>
      <p>Isto apaga para sempre: seu espaço pessoal (matérias, caderno, agenda, finanças), anexos, contatos e participação nas salas.</p>
      <p><strong>O que continua:</strong> textos que você já entregou em trabalhos de grupo permanecem no trabalho coletivo, com autoria trocada para “Ex-membro”, porque fazem parte da entrega do grupo.</p>
      <p>Antes, se quiser, baixe seus dados.</p>
      <label htmlFor="delete-confirm">Digite EXCLUIR para confirmar</label><input id="delete-confirm" name="confirm" required autoComplete="off" />
      {message && <p className="cm-message" role="alert">{message}</p>}
      <div className="form-footer"><button className="button primary cm-danger" disabled={busy}>Excluir definitivamente</button></div>
    </form></Modal>}
  </section>;
}
