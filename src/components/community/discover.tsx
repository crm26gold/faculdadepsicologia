'use client';
import { useEffect, useState } from 'react';
import { BadgeCheck, KeyRound, LockKeyhole, Search, Users } from 'lucide-react';
import { Modal } from '../modal';
import { api } from './client';
import { templateLabels, type DiscoverCard, type JoinResult } from '@/lib/community';

const results: Record<Exclude<JoinResult, 'joined'>, string> = {
  requested: 'Pedido enviado. Você entra quando quem cuida do grupo aceitar.',
  wrong_password: 'Senha errada. Confira com quem te passou.',
  too_many_attempts: 'Muitas tentativas erradas. Tente de novo daqui a uma hora.',
  email_required: 'Este grupo pede seu nome e e-mail para entrar.',
};

/** Busca de grupos abertos (a todos ou à sua sala) por nome, origem ou #tema. */
export function Discover({ email, onOpen, onJoined }: { email: string; onOpen: (id: string) => void; onJoined: () => void }) {
  const [term, setTerm] = useState('');
  const [cards, setCards] = useState<DiscoverCard[] | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [joining, setJoining] = useState<DiscoverCard | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      api<DiscoverCard[]>(`/api/spaces?discover=${encodeURIComponent(term.trim())}`)
        .then(list => { if (current) { setCards(list ?? []); setError(''); } })
        .catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Não foi possível buscar.'); });
    }, term ? 300 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [term]);

  async function join(card: DiscoverCard, password: string | null, shareEmail: boolean) {
    setBusy(true); setMessage('');
    try {
      const result = await api<JoinResult>('/api/spaces', { action: 'join_group', space: card.id, password, share_email: shareEmail });
      if (result === 'joined') { setJoining(null); onJoined(); onOpen(card.id); return; }
      setMessage(results[result]);
      if (result === 'requested') { setJoining(null); setCards(list => list?.map(item => item.id === card.id ? { ...item, requested: true } : item) ?? null); }
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }
  async function withdraw(card: DiscoverCard) {
    setBusy(true); setMessage('');
    try { await api('/api/spaces', { action: 'withdraw_request', space: card.id }); setCards(list => list?.map(item => item.id === card.id ? { ...item, requested: false } : item) ?? null); setMessage('Pedido retirado.'); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível retirar.'); }
    finally { setBusy(false); }
  }

  return <div className="cm-stack">
    <label className="nw-search" htmlFor="nw-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar grupos</span>
      <input id="nw-search" type="search" value={term} onChange={event => setTerm(event.target.value)} maxLength={60} placeholder="Buscar por nome, curso ou #tema" /></label>
    {message && <p className="cm-message" role="status">{message}</p>}
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!cards && !error && <p role="status" className="muted">Buscando…</p>}
    {cards && !cards.length && <div className="empty-inline"><Users size={22} aria-hidden="true" /><p>{term ? 'Nenhum grupo aberto com isso. Que tal criar um?' : 'Ainda não há grupos abertos. Crie o primeiro.'}</p></div>}
    <div className="cm-card-grid">{cards?.map(card => <article key={card.id} className={`cm-space-card nw-card ${card.color}`}>
      <span className="eyebrow">{templateLabels[card.template]}{card.class_name ? ` · ${card.class_name}` : ''}</span>
      <strong>{card.name}{card.official && <BadgeCheck className="nw-seal" size={16} aria-label="Oficial" />}</strong>
      {card.origin && <small className="muted">{card.origin}</small>}
      {card.description && <span>{card.description}</span>}
      {card.topics.length > 0 && <span className="nw-topics">{card.topics.map(topic => <button key={topic} type="button" className="nw-topic" onClick={() => setTerm(`#${topic}`)}>#{topic}</button>)}</span>}
      <small className="muted">{card.members} {card.members === 1 ? 'pessoa' : 'pessoas'}{card.has_password ? ' · com senha' : ''}{card.join_approval ? ' · com aprovação' : ''}</small>
      <div className="nw-card-actions">
        {card.is_member ? <button type="button" className="button outline" onClick={() => onOpen(card.id)}>Abrir</button>
          : card.requested ? <><span className="muted small">Pedido enviado</span><button type="button" className="text-button" disabled={busy} onClick={() => withdraw(card)}>Desistir</button></>
          : <button type="button" className="button primary" disabled={busy} onClick={() => card.has_password || card.join_asks_email ? (setMessage(''), setJoining(card)) : join(card, null, false)}>
            {card.has_password && <LockKeyhole size={15} aria-hidden="true" />}{card.join_approval ? 'Pedir para entrar' : 'Entrar'}</button>}
      </div>
    </article>)}</div>
    {joining && <JoinDialog card={joining} email={email} busy={busy} message={message} onClose={() => setJoining(null)} onJoin={join} />}
  </div>;
}

function JoinDialog({ card, email, busy, message, onClose, onJoin }: {
  card: DiscoverCard; email: string; busy: boolean; message: string; onClose: () => void;
  onJoin: (card: DiscoverCard, password: string | null, shareEmail: boolean) => void;
}) {
  const [password, setPassword] = useState('');
  const [share, setShare] = useState(false);
  return <Modal title={`Entrar em ${card.name}`} onClose={onClose}><form className="entry-form" onSubmit={event => { event.preventDefault(); onJoin(card, card.has_password ? password : null, share); }}>
    {card.has_password && <><label htmlFor="nw-join-password"><KeyRound size={14} aria-hidden="true" /> Senha do grupo</label>
      <input id="nw-join-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={72} autoComplete="off" required /></>}
    {card.join_asks_email && <label className="cm-check"><input type="checkbox" checked={share} onChange={event => setShare(event.target.checked)} required />
      Aceito mostrar meu nome e meu e-mail ({email}) para quem cuida deste grupo.</label>}
    {message && <p className="cm-message" role="status">{message}</p>}
    <div className="form-footer"><button type="button" className="button outline" onClick={onClose}>Cancelar</button>
      <button className="button primary" disabled={busy}>{card.join_approval ? 'Pedir para entrar' : 'Entrar'}</button></div>
  </form></Modal>;
}
