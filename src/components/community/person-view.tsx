'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, LockKeyhole, X } from 'lucide-react';
import { Modal } from '../modal';
import { api, formatDay } from './client';
import { PersonAvatar } from './avatar';
import { PostCard } from './feed';
import type { NetworkEvent, Person, PersonProfile, Updates as UpdatesData } from '@/lib/network';

/** Perfil de uma pessoa: seguir, pedido, contagens e as publicações que você pode ver. */
export function PersonView({ id, me, onBack, onOpenPerson, onEditProfile, onChanged }: {
  id: string; me: string; onBack: () => void; onOpenPerson: (id: string) => void; onEditProfile: () => void; onChanged: () => void;
}) {
  const [person, setPerson] = useState<PersonProfile | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<{ which: 'followers' | 'following'; people: Person[] } | null>(null);
  const load = useCallback(async () => {
    try { setPerson(await api<PersonProfile>(`/api/network?person=${id}`)); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir este perfil.'); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function run(body: Record<string, unknown>, done = '') {
    setBusy(true); setMessage('');
    try { await api('/api/network', body); if (done) setMessage(done); await load(); onChanged(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  }
  async function openList(which: 'followers' | 'following') {
    try { setList({ which, people: await api<Person[]>(`/api/network?follows=${id}&list=${which}`) ?? [] }); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Esta lista é privada.'); }
  }

  const back = <button className="text-button" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" /> Voltar</button>;
  if (error) return <section className="cm-page">{back}<div className="error-banner" role="alert">{error}</div></section>;
  if (!person) return <p role="status" className="loading-panel">Abrindo…</p>;
  const lists = person.is_me || person.show_follows;
  return <section className="cm-page">
    {back}
    <header className="panel nw-person">
      <div className="nw-person-top">
        <PersonAvatar name={person.name} avatar={person.avatar} size={84} />
        <div className="nw-counts">
          <span><strong>{person.posts.length}{person.posts.length === 30 ? '+' : ''}</strong>publicações</span>
          <button type="button" disabled={!lists} onClick={() => openList('followers')}><strong>{person.followers}</strong>seguidores</button>
          <button type="button" disabled={!lists} onClick={() => openList('following')}><strong>{person.following}</strong>seguindo</button>
        </div>
      </div>
      <h2>{person.closed && <LockKeyhole size={15} aria-label="Perfil fechado" />} {person.name}</h2>
      {person.bio && <p>{person.bio}</p>}
      {person.follows_me && !person.is_me && <small className="muted">Segue você</small>}
      <div className="button-row">
        {person.is_me ? <button className="button outline" onClick={onEditProfile}>Editar perfil e privacidade</button>
          : person.status === 'following' ? <button className="button outline" disabled={busy} onClick={() => run({ action: 'unfollow', person: id }, 'Você deixou de seguir.')}>Seguindo</button>
          : person.status === 'requested' ? <button className="button outline" disabled={busy} onClick={() => run({ action: 'unfollow', person: id }, 'Pedido cancelado.')}>Pedido enviado · cancelar</button>
          : <button className="button primary" disabled={busy} onClick={() => run({ action: 'follow', person: id }, person.closed ? 'Pedido enviado.' : 'Agora você segue.')}>Seguir</button>}
        {person.requested_me && <>
          <button className="button primary" disabled={busy} onClick={() => run({ action: 'answer_follow', person: id, accept: true }, 'Pedido aceito.')}><Check size={15} aria-hidden="true" />Aceitar pedido</button>
          <button className="button outline" disabled={busy} onClick={() => run({ action: 'answer_follow', person: id, accept: false }, 'Pedido recusado.')}><X size={15} aria-hidden="true" />Recusar</button></>}
      </div>
      {message && <p className="cm-message" role="status">{message}</p>}
    </header>
    {person.posts.length ? <div className="nw-feed">{person.posts.map(post => <PostCard key={post.id} post={post} me={me} onOpenPerson={onOpenPerson}
      onRemoved={postId => setPerson(value => value && { ...value, posts: value.posts.filter(item => item.id !== postId) })} />)}</div>
      : <div className="empty-inline"><LockKeyhole size={22} aria-hidden="true" /><p>{person.is_me ? 'Você ainda não publicou.' : person.closed && person.status !== 'following' ? 'Perfil fechado: as publicações aparecem quando o pedido para seguir for aceito.' : 'Nenhuma publicação para você ver.'}</p></div>}
    {list && <Modal title={list.which === 'followers' ? 'Seguidores' : 'Seguindo'} onClose={() => setList(null)}>
      {list.people.length ? <ul className="cm-people">{list.people.map(item => <li key={item.id}>
        <button type="button" className="nw-post-author" onClick={() => { setList(null); onOpenPerson(item.id); }}><PersonAvatar name={item.name} avatar={item.avatar} /><span><strong>{item.name}</strong></span></button>
        {person.is_me && list.which === 'followers' && <button className="text-button" disabled={busy} onClick={async () => { await run({ action: 'remove_follower', person: item.id }, 'Seguidor removido.'); setList(value => value && { ...value, people: value.people.filter(p => p.id !== item.id) }); }}>Remover</button>}
      </li>)}</ul> : <p className="muted">Ninguém por aqui ainda.</p>}
    </Modal>}
  </section>;
}

const eventText: Record<NetworkEvent['kind'], string> = {
  follow: 'começou a seguir você', follow_request: 'pediu para seguir você', follow_accepted: 'aceitou seu pedido para seguir',
  gostei: 'gostou da sua publicação', util: 'achou útil sua publicação', join_request: 'pediu para entrar no grupo', join_approved: 'aceitou você no grupo',
};

/** Atualizações: pedidos para seguir e o que aconteceu com você na rede. Abrir marca tudo como lido. */
export function UpdatesView({ onBack, onOpenPerson, onOpenSpace, onChanged }: {
  onBack: () => void; onOpenPerson: (id: string) => void; onOpenSpace: (id: string) => void; onChanged: () => void;
}) {
  const [data, setData] = useState<UpdatesData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setData(await api<UpdatesData>('/api/network?updates=1')); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir.'); }
  }, []);
  useEffect(() => {
    void load().then(() => api('/api/network', { action: 'mark_read' })).then(onChanged, () => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);
  async function answer(person: string, accept: boolean) {
    setBusy(true);
    try { await api('/api/network', { action: 'answer_follow', person, accept }); await load(); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível responder.'); }
    finally { setBusy(false); }
  }
  return <section className="cm-page">
    <button className="text-button" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" /> Voltar</button>
    <h2 className="nw-title">Atualizações</h2>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!data && !error && <p role="status" className="muted">Abrindo…</p>}
    {data && data.requests.length > 0 && <><h3 className="small-heading">Pedidos para seguir você</h3><ul className="cm-people">{data.requests.map(person => <li key={person.id}>
      <button type="button" className="nw-post-author" onClick={() => onOpenPerson(person.id)}><PersonAvatar name={person.name} avatar={person.avatar} /><span><strong>{person.name}</strong></span></button>
      <span className="cm-person-tools"><button className="button primary" disabled={busy} onClick={() => answer(person.id, true)}><Check size={15} aria-hidden="true" />Aceitar</button>
        <button className="button outline" disabled={busy} onClick={() => answer(person.id, false)}><X size={15} aria-hidden="true" />Recusar</button></span></li>)}</ul></>}
    {data && <ul className="nw-events">{data.events.filter(event => event.kind !== 'follow_request').map(event => <li key={event.id} className={event.read ? '' : 'unread'}>
      <button type="button" onClick={() => event.space ? onOpenSpace(event.space.id) : event.actor && onOpenPerson(event.actor.id)}>
        <PersonAvatar name={event.actor?.name ?? '?'} avatar={event.actor?.avatar} />
        <span><strong>{event.actor?.name ?? 'Alguém'}</strong> {eventText[event.kind]}{event.space ? ` ${event.space.name}` : ''}{event.post?.body ? `: “${event.post.body}”` : ''}<small>{formatDay(event.created_at)}</small></span>
      </button></li>)}</ul>}
    {data && !data.requests.length && !data.events.some(event => event.kind !== 'follow_request') && <div className="empty-inline"><Check size={22} aria-hidden="true" /><p>Nada novo por aqui.</p></div>}
  </section>;
}
