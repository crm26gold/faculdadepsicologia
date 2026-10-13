'use client';
import { useCallback, useEffect, useState } from 'react';
import { Bookmark, Check, Copy, Eye, Grid3x3, LockKeyhole, Menu, Plus, X } from 'lucide-react';
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

/** Capa redonda do destaque: a foto do primeiro story ou a cor do card. */
function HighlightCover({ story }: { story: NetworkPost }) {
  return story.photos[0] ? <img className="nw-highlight-cover" src={`/api/network/photo/${story.photos[0].id}`} alt="" loading="lazy" decoding="async" />
    : <span className={`nw-highlight-cover ${story.style === 'text' ? 'card_blue' : story.style}`} aria-hidden="true">{story.body.slice(0, 1).toUpperCase()}</span>;
}

export type ProfileView = { post?: string; tab?: 'saved'; as?: 'visitor' | 'follower' };

/** Perfil no jeito do Instagram: avatar com o anel do story, números, ações, destaques e as publicações em grade.
 * Tocar num quadrado abre a lista a partir dele; o Voltar volta para a grade. No seu perfil, a aba Salvos (só você vê)
 * e o "Ver como visitante", que mostra o que quem não segue ou quem segue enxerga. */
export function PersonView({ id, me, post: openPost, tab, as, onView, onBack, onOpenPerson, onEditProfile, onNewStory, onOpenSettings, onChanged }: ProfileView & {
  id: string; me: string; onView: (next: ProfileView, replace?: boolean) => void; onBack: () => void; onOpenPerson: (id: string) => void;
  onEditProfile: () => void; onNewStory: () => void; onOpenSettings: () => void; onChanged: () => void;
}) {
  const [person, setPerson] = useState<PersonProfile | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<{ which: 'followers' | 'following'; people: Person[] } | null>(null);
  const [stories, setStories] = useState<StoryGroup | null>(null);
  const [watching, setWatching] = useState<StoryGroup | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<NetworkPost[] | null>(null);
  const [more, setMore] = useState(false);
  const load = useCallback(async () => {
    try { setPerson(await api<PersonProfile>(`/api/network?person=${id}`)); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir este perfil.'); }
  }, [id]);
  const loadStories = useCallback(() => api<StoryGroup[]>('/api/network?stories=following')
    .then(groups => setStories((groups ?? []).find(group => group.author.id === id) ?? null), () => setStories(null)), [id]);
  useEffect(() => { void load(); void loadStories(); setSeen(readSeen()); }, [load, loadStories]);
  const seenNow = useCallback((story: string) => { markSeen(story); setSeen(readSeen()); }, []);
  const loadSaved = useCallback(async (before?: string) => {
    try {
      const page = await api<NetworkPost[]>(`/api/network?saved=1${before ? `&before=${encodeURIComponent(before)}` : ''}`) ?? [];
      setSaved(value => before ? [...value ?? [], ...page] : page); setMore(page.length === 30);
    } catch (reason) { setSaved(value => value ?? []); setMessage(reason instanceof Error ? reason.message : 'Não foi possível abrir os Salvos.'); }
  }, []);
  useEffect(() => { if (tab === 'saved' && id === me && saved === null) void loadSaved(); }, [tab, id, me, saved, loadSaved]);
  // Na lista, a publicação tocada aparece no topo da tela.
  const ready = tab === 'saved' ? saved !== null : !!person;
  useEffect(() => {
    if (openPost && ready) requestAnimationFrame(() => document.getElementById(`post-${openPost}`)?.scrollIntoView({ block: 'start' }));
  }, [openPost, ready]);

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
  // Ver como visitante: o filtro repete a regra do banco (publicação "Todos" só aparece em perfil aberto, ou para quem segue).
  const viewer = person.is_me ? as : undefined;
  const visible = (item: NetworkPost) => !viewer || (item.audience === 'public' && (viewer === 'follower' || !person.closed))
    || (viewer === 'follower' && item.audience === 'followers');
  const posts = person.posts.filter(visible);
  const highlights = (person.highlights ?? []).map(item => ({ ...item, stories: item.stories.filter(visible) })).filter(item => item.stories.length);
  const titles = (person.highlights ?? []).map(item => item.title);
  const ring = stories && (viewer === 'visitor' ? null : { ...stories, stories: stories.stories.filter(visible) });
  const unseen = !!ring?.stories.some(story => !seen.has(story.id));
  const lists = (person.is_me && !viewer) || person.show_follows;
  const avatar = person.photo_large && person.avatar?.kind === 'photo' ? { ...person.avatar, photo: person.photo_large } : person.avatar;
  const showSaved = person.is_me && !viewer && tab === 'saved';
  const removed = (postId: string) => {
    setPerson(value => value && { ...value, posts: value.posts.filter(item => item.id !== postId) });
    setSaved(value => value && value.filter(item => item.id !== postId));
  };
  const card = (item: NetworkPost) => <div key={item.id} id={`post-${item.id}`} className="nw-anchor">
    <PostCard post={item} me={me} onOpenPerson={onOpenPerson} onRemoved={removed} /></div>;

  if (openPost) return <section className="cm-page nw-feed" aria-label={showSaved ? 'Seus salvos' : `Publicações de ${person.name}`}>
    {showSaved ? saved === null ? <p role="status" className="loading-panel">Abrindo…</p> : saved.map(card) : posts.map(card)}
  </section>;

  return <section className="cm-page nw-profile" aria-labelledby="nw-profile-name">
    {viewer && <div className="nw-visitor-bar">
      <p role="status"><Eye size={16} aria-hidden="true" />{viewer === 'visitor' ? 'Assim quem não segue você vê seu perfil.' : 'Assim quem segue você vê seu perfil.'}</p>
      <div className="nw-chips" role="group" aria-label="Ver como">
        <button type="button" className="nw-chip" aria-pressed={viewer === 'visitor'} onClick={() => onView({ as: 'visitor' }, true)}>Quem não segue</button>
        <button type="button" className="nw-chip" aria-pressed={viewer === 'follower'} onClick={() => onView({ as: 'follower' }, true)}>Quem segue</button>
      </div>
      <small className="muted">Quem divide um grupo com você também vê o que você publicou para o grupo.</small>
      <button type="button" className="button outline" onClick={onBack}>Sair da visualização</button>
    </div>}
    <header className="nw-profile-head">
      <div className="nw-profile-top">
        <div className="nw-profile-avatar">
          {ring?.stories.length ? <button type="button" className={`nw-story-ring ${unseen ? '' : 'seen'}`} aria-label={`Ver stories de ${person.name}`} onClick={() => setWatching(ring)}>
            <PersonAvatar name={person.name} avatar={avatar} size={84} /></button>
            : <span className="nw-story-ring empty"><PersonAvatar name={person.name} avatar={avatar} size={84} /></span>}
          {person.is_me && !viewer && <button type="button" className="nw-story-add" aria-label="Publicar um story" onClick={onNewStory}><Plus size={14} aria-hidden="true" /></button>}
        </div>
        <div className="nw-counts">
          <span><strong>{posts.length}{person.posts.length === 30 ? '+' : ''}</strong>publicações</span>
          <button type="button" disabled={!lists} onClick={() => openList('followers')}><strong>{person.followers}</strong>seguidores</button>
          <button type="button" disabled={!lists} onClick={() => openList('following')}><strong>{person.following}</strong>seguindo</button>
        </div>
      </div>
      <h2 id="nw-profile-name" className="nw-profile-name">{person.name}</h2>
      {person.bio && <p className="nw-profile-bio">{person.bio}</p>}
      {person.closed && <small className="muted nw-profile-lock"><LockKeyhole size={12} aria-hidden="true" />Perfil fechado: quem quiser seguir pede</small>}
      {person.follows_me && !person.is_me && <small className="muted">Segue você</small>}
      <div className="nw-profile-actions">
        {viewer ? <button type="button" className={`button ${viewer === 'visitor' ? 'primary' : 'soft'}`} disabled>{viewer === 'visitor' ? 'Seguir' : 'Seguindo'}</button>
        : person.is_me ? <>
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
      {person.is_me && !viewer && <button type="button" className="text-button nw-visitor-open" onClick={() => onView({ as: 'visitor' })}><Eye size={15} aria-hidden="true" />Ver como visitante</button>}
      {message && <p className="cm-message" role="status">{message}</p>}
    </header>
    {highlights.length > 0 && <ul className="nw-stories nw-highlights" aria-label="Destaques">
      {highlights.map(item => <li key={item.title}><button type="button" className="nw-story-bubble" onClick={() => setWatching({ author: person, stories: item.stories })}
          aria-label={`Destaque ${item.title}, ${item.stories.length === 1 ? '1 story' : `${item.stories.length} stories`}`}>
        <span className="nw-story-ring seen"><HighlightCover story={item.stories[0]} /></span>
        <span className="nw-story-name">{item.title}</span></button></li>)}
    </ul>}
    {person.is_me && !viewer ? <div className="nw-profile-tabs" role="group" aria-label="O que mostrar">
      <button type="button" aria-pressed={tab !== 'saved'} onClick={() => onView({}, true)}><Grid3x3 size={16} aria-hidden="true" />Publicações</button>
      <button type="button" aria-pressed={tab === 'saved'} onClick={() => onView({ tab: 'saved' }, true)}><Bookmark size={16} aria-hidden="true" />Salvos</button>
    </div> : <h3 className="nw-profile-tab">Publicações</h3>}
    {showSaved ? saved === null ? <p role="status" className="loading-panel">Abrindo…</p>
      : saved.length ? <>
        <p className="muted small nw-saved-note"><LockKeyhole size={12} aria-hidden="true" />Só você vê seus salvos. Quem publicou não fica sabendo.</p>
        <div className="nw-grid">{saved.map(item => <PostTile key={item.id} post={item} onOpen={() => onView({ tab: 'saved', post: item.id })} />)}</div>
        {more && <button type="button" className="button outline" onClick={() => void loadSaved(saved[saved.length - 1]?.saved_at)}>Ver mais</button>}
      </> : <div className="empty-inline"><Bookmark size={22} aria-hidden="true" /><p>Toque em Salvar numa publicação para guardar aqui. Só você vê seus salvos.</p></div>
    : posts.length ? <div className="nw-grid">{posts.map(item => <PostTile key={item.id} post={item} onOpen={() => onView({ as, post: item.id })} />)}</div>
      : <div className="empty-inline"><LockKeyhole size={22} aria-hidden="true" /><p>{person.is_me && !viewer ? 'Você ainda não publicou. Toque em Publicar na aba Networking.'
        : person.closed && (viewer === 'visitor' || (!person.is_me && person.status !== 'following')) ? 'Perfil fechado: as publicações aparecem quando o pedido para seguir for aceito.'
        : 'Nenhuma publicação para você ver.'}</p></div>}
    {list && <Modal title={list.which === 'followers' ? 'Seguidores' : 'Seguindo'} onClose={() => setList(null)}>
      {list.people.length ? <ul className="cm-people">{list.people.map(item => <li key={item.id}>
        <button type="button" className="nw-post-author" onClick={() => { setList(null); onOpenPerson(item.id); }}><PersonAvatar name={item.name} avatar={item.avatar} /><span><strong>{item.name}</strong></span></button>
        {person.is_me && !viewer && list.which === 'followers' && <button className="text-button" disabled={busy} onClick={async () => { await run({ action: 'remove_follower', person: item.id }, 'Seguidor removido.'); setList(value => value && { ...value, people: value.people.filter(p => p.id !== item.id) }); }}>Remover</button>}
      </li>)}</ul> : <p className="muted">Ninguém por aqui ainda.</p>}
    </Modal>}
    {watching && <StoryViewer groups={[watching]} start={0} me={me} titles={titles} onSeen={seenNow}
      onChanged={() => { void load(); void loadStories(); }} onClose={() => setWatching(null)} />}
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
