'use client';
import { useCallback, useEffect, useState } from 'react';
import { Bookmark, Globe2, Heart, LockKeyhole, MoreHorizontal, ThumbsUp, Trash2, Users } from 'lucide-react';
import { SafetyMenu } from './safety';
import { api, formatDay } from './client';
import { PersonAvatar } from './avatar';
import { audienceLabels, type NetworkPost, type Photo, type Reaction } from '@/lib/network';

export type FeedSource = { feed: 'following' | 'groups' } | { feed: 'space'; id: string } | { topic: string };
const query = (source: FeedSource) => 'topic' in source ? `topic=${encodeURIComponent(source.topic)}`
  : source.feed === 'space' ? `feed=space&id=${source.id}` : `feed=${source.feed}`;
const audienceIcon = { public: Globe2, followers: Users, group: Users, private: LockKeyhole } as const;

/** Fotos da publicação: uma ocupa a largura; várias deslizam para o lado. A foto só sai do servidor para quem pode ver.
 * A descrição escrita por quem publicou vale para o leitor de tela; sem ela, diz de quem é a foto. */
export function PostPhotos({ photos, author }: { photos: Photo[]; author: string }) {
  const image = (photo: Photo, index: number) => <img key={photo.id} className="nw-photo" src={`/api/network/photo/${photo.id}`} loading="lazy" decoding="async"
    width={photo.w} height={photo.h} style={{ aspectRatio: `${photo.w} / ${photo.h}` }}
    alt={photo.alt || (photos.length > 1 ? `Foto ${index + 1} de ${photos.length} de ${author}` : `Foto de ${author}`)} />;
  if (photos.length === 1) return image(photos[0], 0);
  return <div className="nw-photos" role="group" aria-label={`${photos.length} fotos, deslize para ver`} tabIndex={0}>{photos.map(image)}</div>;
}

/** Uma publicação: texto, card ou fotos, Gostei, Útil e Salvar. Quem escreveu (ou quem cuida do grupo) pode apagar. */
export function PostCard({ post, me, canManage, onOpenPerson, onRemoved }: {
  post: NetworkPost; me: string; canManage?: boolean; onOpenPerson: (id: string) => void; onRemoved: (id: string) => void;
}) {
  const [counts, setCounts] = useState(post.counts);
  const [mine, setMine] = useState(post.mine);
  const [saved, setSaved] = useState(!!post.saved);
  const [options, setOptions] = useState(false);
  const [message, setMessage] = useState('');
  const Icon = audienceIcon[post.audience];
  async function react(kind: Reaction) {
    const had = mine.includes(kind);
    setMine(list => had ? list.filter(item => item !== kind) : [...list, kind]);
    setCounts(value => ({ ...value, [kind]: value[kind] + (had ? -1 : 1) }));
    try { await api('/api/network', { action: 'react', post: post.id, kind }); }
    catch (reason) {
      setMine(post.mine); setCounts(post.counts);
      setMessage(reason instanceof Error ? reason.message : 'Não foi possível marcar.');
    }
  }
  // Salvos ficam só para você: quem publicou não fica sabendo.
  async function save() {
    setSaved(!saved);
    try { setSaved(await api<boolean>('/api/network', { action: 'save', post: post.id })); }
    catch (reason) { setSaved(saved); setMessage(reason instanceof Error ? reason.message : 'Não foi possível salvar.'); }
  }
  async function remove() {
    if (!window.confirm('Apagar esta publicação?')) return;
    try { await api('/api/network', { action: 'delete_post', post: post.id }); onRemoved(post.id); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível apagar.'); }
  }
  return <article className="panel nw-post" aria-label={`Publicação de ${post.author.name}`}>
    <header className="nw-post-head">
      <button type="button" className="nw-post-author" onClick={() => onOpenPerson(post.author.id)}>
        <PersonAvatar name={post.author.name} avatar={post.author.avatar} />
        <span><strong>{post.author.name}</strong><small>{formatDay(post.created_at)} · <Icon size={12} aria-hidden="true" /> {post.space ? post.space.name : audienceLabels[post.audience]}</small></span>
      </button>
      {(post.author.id === me || canManage) && <button type="button" className="icon-button" aria-label="Apagar publicação" onClick={remove}><Trash2 size={15} aria-hidden="true" /></button>}
      {post.author.id !== me && <button type="button" className="icon-button" aria-label="Mais opções da publicação" onClick={() => setOptions(true)}><MoreHorizontal size={18} aria-hidden="true" /></button>}
    </header>
    {options && <SafetyMenu person={post.author} post={post.id} onClose={() => setOptions(false)} onBlocked={blocking => { if (blocking) onRemoved(post.id); }} />}
    {post.photos.length > 0 && <PostPhotos photos={post.photos} author={post.author.name} />}
    {post.body && (post.style === 'text' ? <p className="nw-post-text">{post.body}</p> : <div className={`nw-card-text ${post.style}`}><p>{post.body}</p></div>)}
    <div className="nw-post-actions">
      <button type="button" className="nw-react" aria-pressed={mine.includes('gostei')} onClick={() => react('gostei')}><Heart size={17} aria-hidden="true" />Gostei{counts.gostei ? ` · ${counts.gostei}` : ''}</button>
      <button type="button" className="nw-react util" aria-pressed={mine.includes('util')} onClick={() => react('util')}><ThumbsUp size={17} aria-hidden="true" />Útil{counts.util ? ` · ${counts.util}` : ''}</button>
      <button type="button" className="nw-react save" aria-pressed={saved} onClick={save}><Bookmark size={17} aria-hidden="true" />{saved ? 'Salvo' : 'Salvar'}</button>
    </div>
    {message && <p className="cm-message" role="alert">{message}</p>}
  </article>;
}

/** Lista de publicações com "Ver mais" (30 por vez). */
export function Feed({ source, me, canManage, empty, refresh = 0, onOpenPerson }: {
  source: FeedSource; me: string; canManage?: boolean; empty: string; refresh?: number; onOpenPerson: (id: string) => void;
}) {
  const [posts, setPosts] = useState<NetworkPost[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const key = query(source);
  const load = useCallback(async (before?: string) => {
    try {
      const page = await api<NetworkPost[]>(`/api/network?${key}${before ? `&before=${encodeURIComponent(before)}` : ''}`) ?? [];
      setPosts(list => before && list ? [...list, ...page] : page); setMore(page.length === 30); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir.'); }
  }, [key]);
  useEffect(() => { void load(); }, [load, refresh]);
  if (error) return <div className="error-banner" role="alert">{error}</div>;
  if (!posts) return <p role="status" className="muted">Abrindo…</p>;
  if (!posts.length) return <div className="empty-inline"><Users size={22} aria-hidden="true" /><p>{empty}</p></div>;
  return <div className="nw-feed">
    {posts.map(post => <PostCard key={post.id} post={post} me={me} canManage={canManage} onOpenPerson={onOpenPerson}
      onRemoved={id => setPosts(list => list?.filter(item => item.id !== id) ?? null)} />)}
    {more && <button type="button" className="button outline" onClick={() => load(posts.at(-1)?.created_at)}>Ver mais</button>}
  </div>;
}
