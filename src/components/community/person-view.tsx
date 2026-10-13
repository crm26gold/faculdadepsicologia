'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, LockKeyhole, Menu, Plus, X } from 'lucide-react';
import { Modal } from '../modal';
import { api, formatDay } from './client';
import { PersonAvatar } from './avatar';
import { PostCard } from './feed';
import { StoryViewer, markSeen, readSeen } from './stories';
import type { NetworkEvent, NetworkPost, Person, PersonProfile, StoryGroup, Updates as UpdatesData } from '@/lib/network';

/** Um quadrado da grade: a primeira foto, o card ou o começo do texto. */
function PostTile({ post, onOpen }: { post: NetworkPost; onOpen: () => void }) {
  const label = post.photos.length ? `Foto${post.photos.length > 1 ? `s (${post.photos.length})` : ''}${post.body ? `: ${post.body.slice(0, 60)}` : ''}` : post.body.slice(0, 80);
  return <button type="button" className={`nw-tile ${post.photos.length ? 'photo' : post.style}`} onClick={onOpen} aria-label={`Abrir publicação. ${label}`}>
    {post.photos.length ? <>
      <img src={`/api/network/photo/${post.photos[0].id}`} alt="" loading="lazy" decoding="async" />
      {post.photos.length > 1 && <Copy className="nw-tile-many" size={16} aria-hidden="true" />}
    </> : <span>{post.body}</span>}
  </button>;
}

/** Perfil no jeito do Instagram: avatar com o anel do story, números, ações e as publicações em grade.
 * Tocar num quadrado abre a lista a partir dele; o Voltar volta para a grade. */
export function PersonView({ id, me, post: openPost, onOpenPerson, onOpenPost, onEditProfile, onNewStory, onOpenSettings, onChanged }: {
  id: string; me: string; post?: string; onOpenPerson: (id: string) => void; onOpenPost: (post: string) => void;
  onEditProfile: () => void; onNewStory: () => void; onOpenSettings: () => void; onChanged: () => void;
}) {
  const [person, setPerson] = useState<PersonProfile | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<{ which: 'followers' | 'following'; people: Person[] } | null>(null);
  const [stories, setStories] = useState<StoryGroup | null>(null);
  const [watching, setWatching] = useState(false);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    try { setPerson(await api<PersonProfile>(`/api/network?person=${id}`)); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir este perfil.'); }
  }, [id]);
  const loadStories = useCallback(() => api<StoryGroup[]>('/api/network?stories=following')
    .then(groups => setStories((groups ?? []).find(group => group.author.id === id) ?? null), () => setStories(null)), [id]);
  useEffect(() => { void load(); void loadStories(); setSeen(readSeen()); }, [load, loadStories]);
  const seenNow = useCallback((story: string) => { markSeen(story); setSeen(readSeen()); }, []);
  // Na lista, a publicação tocada aparece no topo da tela.
  useEffect(() => {
    if (openPost && person) requestAnimationFrame(() => document.getElementById(`post-${openPost}`)?.scrollIntoView({ block: 'start' }));
  }, [openPost, person]);

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

  if (error) return <div className="error-banner" role="alert">{error}</div>;
  if (!person) return <p role="status" className="loading-panel">Abrindo…</p>;
  const lists = person.is_me || person.show_follows;
  const unseen = !!stories?.stories.some(story => !seen.has(story.id));
  const removed = (postId: string) => setPerson(value => value && { ...value, posts: value.posts.filter(item => item.id !== postId) });

  if (openPost) return <section className="cm-page nw-feed" aria-label={`Publicações de ${person.name}`}>
    {person.posts.map(item => <div key={item.id} id={`post-${item.id}`} className="nw-anchor">
      <PostCard post={item} me={me} onOpenPerson={onOpenPerson} onRemoved={removed} /></div>)}
  </section>;

  return <section className="cm-page nw-profile" aria-labelledby="nw-profile-name">
    <header className="nw-profile-head">
      <div className="nw-profile-top">
        <div className="nw-profile-avatar">
          {stories ? <button type="button" className={`nw-story-ring ${unseen ? '' : 'seen'}`} aria-label={`Ver stories de ${person.name}`} onClick={() => setWatching(true)}>
            <PersonAvatar name={person.name} avatar={person.avatar} size={84} /></button>
            : <span className="nw-story-ring empty"><PersonAvatar name={person.name} avatar={person.avatar} size={84} /></span>}
          {person.is_me && <button type="button" className="nw-story-add" aria-label="Publicar um story" onClick={onNewStory}><Plus size={14} aria-hidden="true" /></button>}
        </div>
        <div className="nw-counts">
          <span><strong>{person.posts.length}{person.posts.length === 30 ? '+' : ''}</strong>publicações</span>
          <button type="button" disabled={!lists} onClick={() => openList('followers')}><strong>{person.followers}</strong>seguidores</button>
          <button type="button" disabled={!lists} onClick={() => openList('following')}><strong>{person.following}</strong>seguindo</button>
        </div>
      </div>
      <h2 id="nw-profile-name" className="nw-profile-name">{person.name}</h2>
      {person.bio && <p className="nw-profile-bio">{person.bio}</p>}
      {person.closed && <small className="muted nw-profile-lock"><LockKeyhole size={12} aria-hidden="true" />Perfil fechado: quem quiser seguir pede</small>}
      {person.follows_me && !person.is_me && <small className="muted">Segue você</small>}
      <div className="nw-profile-actions">
        {person.is_me ? <>
          <button type="button" className="button soft" onClick={onEditProfile}>Editar perfil</button>
          <button type="button" className="button soft" onClick={onNewStory}>Novo story</button>
          <button type="button" className="button soft nw-profile-menu" aria-label="Meu espaço e configurações" onClick={onOpenSettings}><Menu size={20} aria-hidden="true" /></button>
        </> : person.status === 'following' ? <button type="button" className="button soft" disabled={busy} onClick={() => run({ action: 'unfollow', person: id }, 'Você deixou de seguir.')}>Seguindo</button>
          : person.status === 'requested' ? <button type="button" className="button soft" disabled={busy} onClick={() => run({ action: 'unfollow', person: id }, 'Pedido cancelado.')}>Pedido enviado · cancelar</button>
          : <button type="button" className="button primary" disabled={busy} onClick={() => run({ action: 'follow', person: id }, person.closed ? 'Pedido enviado.' : 'Agora você segue.')}>Seguir</button>}
        {person.requested_me && <>
          <button type="button" className="button primary" disabled={busy} onClick={() => run({ action: 'answer_follow', person: id, accept: true }, 'Pedido aceito.')}><Check size={15} aria-hidden="true" />Aceitar pedido</button>
          <button type="button" className="button outline" disabled={busy} onClick={() => run({ action: 'answer_follow', person: id, accept: false }, 'Pedido recusado.')}><X size={15} aria-hidden="true" />Recusar</button></>}
      </div>
      {message && <p className="cm-message" role="status">{message}</p>}
    </header>
    <h3 className="nw-profile-tab">Publicações</h3>
    {person.posts.length ? <div className="nw-grid">{person.posts.map(item => <PostTile key={item.id} post={item} onOpen={() => onOpenPost(item.id)} />)}</div>
      : <div className="empty-inline"><LockKeyhole size={22} aria-hidden="true" /><p>{person.is_me ? 'Você ainda não publicou. Toque em Publicar na aba Networking.' : person.closed && person.status !== 'following' ? 'Perfil fechado: as publicações aparecem quando o pedido para seguir for aceito.' : 'Nenhuma publicação para você ver.'}</p></div>}
    {list && <Modal title={list.which === 'followers' ? 'Seguidores' : 'Seguindo'} onClose={() => setList(null)}>
      {list.people.length ? <ul className="cm-people">{list.people.map(item => <li key={item.id}>
        <button type="button" className="nw-post-author" onClick={() => { setList(null); onOpenPerson(item.id); }}><PersonAvatar name={item.name} avatar={item.avatar} /><span><strong>{item.name}</strong></span></button>
        {person.is_me && list.which === 'followers' && <button className="text-button" disabled={busy} onClick={async () => { await run({ action: 'remove_follower', person: item.id }, 'Seguidor removido.'); setList(value => value && { ...value, people: value.people.filter(p => p.id !== item.id) }); }}>Remover</button>}
      </li>)}</ul> : <p className="muted">Ninguém por aqui ainda.</p>}
    </Modal>}
    {watching && stories && <StoryViewer groups={[stories]} start={0} me={me} onSeen={seenNow} onRemoved={() => void loadStories()} onClose={() => setWatching(false)} />}
  </section>;
}

const eventText: Record<NetworkEvent['kind'], string> = {
  follow: 'começou a seguir você', follow_request: 'pediu para seguir você', follow_accepted: 'aceitou seu pedido para seguir',
  gostei: 'gostou da sua publicação', util: 'achou útil sua publicação', join_request: 'pediu para entrar no grupo', join_approved: 'aceitou você no grupo',
};
// Como no Instagram: o que chegou hoje, nesta semana e antes.
const when = (value: string) => {
  const days = (Date.now() - Date.parse(value)) / 86_400_000;
  return new Date(value).toDateString() === new Date().toDateString() ? 'Hoje' : days < 7 ? 'Esta semana' : 'Antes';
};

/** Novidades: pedidos para seguir e o que aconteceu com você na rede. Abrir marca tudo como lido. */
export function UpdatesView({ onOpenPerson, onOpenSpace, onChanged }: {
  onOpenPerson: (id: string) => void; onOpenSpace: (id: string) => void; onChanged: () => void;
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
  const events = data?.events.filter(event => event.kind !== 'follow_request') ?? [];
  const sections = (['Hoje', 'Esta semana', 'Antes'] as const).map(title => ({ title, items: events.filter(event => when(event.created_at) === title) })).filter(section => section.items.length);
  return <section className="cm-page" aria-labelledby="nw-updates-title">
    <h2 id="nw-updates-title" className="nw-title">Novidades</h2>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!data && !error && <p role="status" className="muted">Abrindo…</p>}
    {data && data.requests.length > 0 && <><h3 className="small-heading">Pedidos para seguir você</h3><ul className="cm-people">{data.requests.map(person => <li key={person.id}>
      <button type="button" className="nw-post-author" onClick={() => onOpenPerson(person.id)}><PersonAvatar name={person.name} avatar={person.avatar} /><span><strong>{person.name}</strong></span></button>
      <span className="cm-person-tools"><button className="button primary" disabled={busy} onClick={() => answer(person.id, true)}><Check size={15} aria-hidden="true" />Aceitar</button>
        <button className="button outline" disabled={busy} onClick={() => answer(person.id, false)}><X size={15} aria-hidden="true" />Recusar</button></span></li>)}</ul></>}
    {sections.map(section => <div key={section.title}><h3 className="small-heading">{section.title}</h3>
      <ul className="nw-events">{section.items.map(event => <li key={event.id} className={event.read ? '' : 'unread'}>
        <button type="button" onClick={() => event.space ? onOpenSpace(event.space.id) : event.actor && onOpenPerson(event.actor.id)}>
          <PersonAvatar name={event.actor?.name ?? '?'} avatar={event.actor?.avatar} />
          <span><strong>{event.actor?.name ?? 'Alguém'}</strong> {eventText[event.kind]}{event.space ? ` ${event.space.name}` : ''}{event.post?.body ? `: “${event.post.body}”` : ''}<small>{formatDay(event.created_at)}</small></span>
        </button></li>)}</ul></div>)}
    {data && !data.requests.length && !events.length && <div className="empty-inline"><Check size={22} aria-hidden="true" /><p>Nada novo por aqui.</p></div>}
  </section>;
}
