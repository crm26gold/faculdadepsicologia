'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, ClipboardCheck, GraduationCap, Link2, PenLine, School, Users } from 'lucide-react';
import { api, formatDay, PENDING_INVITE_KEY } from './client';
import { SpaceView } from './space-view';
import { AssignmentView } from './assignment-view';
import { roleLabels, statusLabels, type Home, type SpaceSummary } from '@/lib/community';

export type CommunityRoute = { kind: 'list' } | { kind: 'space'; id: string } | { kind: 'work'; id: string; from?: string };

export function CommunityPanel({ home, route, onRoute, refreshHome, onAddToAgenda }: {
  home: Home; route: CommunityRoute; onRoute: (route: CommunityRoute) => void; refreshHome: () => void;
  onAddToAgenda?: (title: string, date: string) => boolean;
}) {
  const me = home.account.user_id;
  if (route.kind === 'space') return <SpaceView key={route.id} id={route.id} me={me} onBack={() => onRoute({ kind: 'list' })} onChanged={refreshHome}
    onOpenSpace={id => onRoute({ kind: 'space', id })} onOpenWork={id => onRoute({ kind: 'work', id, from: route.id })} />;
  if (route.kind === 'work') return <AssignmentView key={route.id} id={route.id} me={me} onChanged={refreshHome} onAddToAgenda={onAddToAgenda}
    onBack={() => onRoute(route.from ? { kind: 'space', id: route.from } : { kind: 'list' })} />;
  return <CommunityHome home={home} onRoute={onRoute} refreshHome={refreshHome} />;
}

function CommunityHome({ home, onRoute, refreshHome }: { home: Home; onRoute: (route: CommunityRoute) => void; refreshHome: () => void }) {
  const [invite, setInvite] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const active = home.spaces.filter(space => !space.archived_at);
  const classes = active.filter(space => space.kind === 'class');
  const groupsOf = (id: string) => active.filter(space => space.kind === 'group' && space.parent_id === id);
  const orphanGroups = active.filter(space => space.kind === 'group' && !classes.some(item => item.id === space.parent_id));
  const institutions = active.filter(space => space.kind === 'institution');
  const teaching = active.filter(space => space.my_role === 'teacher' || space.my_role === 'owner' || space.my_role === 'assistant');

  async function join(raw: string) {
    const token = raw.trim().split('/convite/').pop()?.split(/[?#]/)[0] ?? '';
    if (!/^[A-Za-z0-9_-]{20,200}$/.test(token)) { setMessage('Cole o link de convite completo que você recebeu.'); return; }
    setBusy(true); setMessage('');
    try {
      const spaceId = await api<string>('/api/spaces', { action: 'accept_invitation', token });
      setInvite(''); setMessage('Pronto! Você entrou.'); refreshHome();
      if (spaceId) onRoute({ kind: 'space', id: spaceId });
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Convite inválido.'); }
    finally { setBusy(false); }
  }

  const card = (space: SpaceSummary) => <button key={space.id} className={`cm-space-card ${space.color}`} onClick={() => onRoute({ kind: 'space', id: space.id })}>
    <span className="eyebrow">{space.kind === 'group' ? 'Grupo' : space.kind === 'class' ? 'Sala' : 'Instituição'}{space.my_role ? ` · ${roleLabels[space.my_role]}` : ''}</span>
    <strong>{space.name}</strong>{space.description && <span>{space.description}</span>}
    <small className="cm-open">Abrir <ArrowRight size={13} aria-hidden="true" /></small>
  </button>;

  return <div className="cm-stack">
    {(home.my_parts.length > 0 || home.to_review.length > 0) && <div className="cm-grid-2">
      {home.my_parts.length > 0 && <section className="panel"><div className="section-heading"><h2><PenLine size={16} aria-hidden="true" /> Minhas partes</h2></div>
        <ul className="cm-todo">{home.my_parts.map(part => <li key={part.id}><button onClick={() => onRoute({ kind: 'work', id: part.assignment_id })}>
          <span className={`cm-status ${part.status}`}>{statusLabels[part.status]}</span><strong>{part.title}</strong><small>{part.assignment_title}{part.due_date ? ` · entrega ${formatDay(part.due_date)}` : ''}</small></button></li>)}</ul></section>}
      {home.to_review.length > 0 && <section className="panel"><div className="section-heading"><h2><ClipboardCheck size={16} aria-hidden="true" /> Para revisar</h2></div>
        <ul className="cm-todo">{home.to_review.map(part => <li key={part.id}><button onClick={() => onRoute({ kind: 'work', id: part.assignment_id })}>
          <span className="cm-status submitted">Entregue</span><strong>{part.title}</strong><small>{part.assignment_title} · {formatDay(part.submitted_at)}</small></button></li>)}</ul></section>}
    </div>}

    {teaching.length > 0 && <section><div className="section-heading"><h2><GraduationCap size={17} aria-hidden="true" /> Onde você ensina ou orienta</h2></div><div className="cm-card-grid">{teaching.map(card)}</div></section>}

    <section><div className="section-heading"><h2><School size={17} aria-hidden="true" /> Minhas salas e grupos</h2></div>
      {classes.map(item => <div key={item.id} className="cm-class-block">
        {card(item)}
        {groupsOf(item.id).length > 0 && <div className="cm-card-grid nested">{groupsOf(item.id).map(card)}</div>}
      </div>)}
      {orphanGroups.length > 0 && <div className="cm-card-grid">{orphanGroups.map(card)}</div>}
      {institutions.length > 0 && <div className="cm-card-grid">{institutions.map(card)}</div>}
      {!active.length && <div className="panel cm-empty"><Users size={30} aria-hidden="true" /><h3>Você ainda não está em nenhuma sala.</h3>
        <p>Peça o link de convite ao seu professor, líder de grupo ou à administração, e cole abaixo. Seu espaço pessoal continua funcionando normalmente.</p></div>}
    </section>

    <section className="panel cm-join"><h2><Link2 size={16} aria-hidden="true" /> Entrar com um convite</h2>
      <form onSubmit={event => { event.preventDefault(); void join(invite); }} className="cm-inline-form">
        <label htmlFor="invite-input" className="sr-only">Link de convite</label>
        <input id="invite-input" value={invite} onChange={event => setInvite(event.target.value)} placeholder="Cole aqui o link de convite" maxLength={400} />
        <button className="button primary" disabled={busy || !invite.trim()}>Entrar</button>
      </form>
      {message && <p className="cm-message" role="status">{message}</p>}
    </section>
  </div>;
}

/** Aceita automaticamente o convite guardado antes do login (link /convite/...). */
export function usePendingInvite(enabled: boolean, onJoined: (spaceId: string | null, error?: string) => void) {
  useEffect(() => {
    if (!enabled) return;
    let token: string | null = null;
    try { token = localStorage.getItem(PENDING_INVITE_KEY); } catch { return; }
    if (!token) return;
    try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
    api<string>('/api/spaces', { action: 'accept_invitation', token })
      .then(id => onJoined(id ?? null))
      .catch(reason => onJoined(null, reason instanceof Error ? reason.message : 'Convite inválido.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
