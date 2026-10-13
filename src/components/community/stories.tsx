'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { api } from './client';
import { PersonAvatar } from './avatar';
import type { Avatar } from '@/lib/community';
import type { StoryGroup } from '@/lib/network';

const SEEN_KEY = 'jornada-plena:stories-seen';
const STORY_MS = 6000;
// Os stories já vistos ficam só neste aparelho: o app não registra quem viu o quê.
export function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]); } catch { return new Set(); }
}
export function markSeen(id: string) {
  const seen = readSeen();
  if (seen.has(id)) return;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id].slice(-300))); } catch { /* sem armazenamento */ }
}
const hoursLeft = (expires: string | null) => expires ? Math.max(1, Math.ceil((Date.parse(expires) - Date.now()) / 3_600_000)) : 0;

/** Barra de stories: o seu primeiro, depois quem publicou por último. Em "Seguindo", de quem você segue; em "Meus grupos", dos seus grupos. */
export function StoriesBar({ feed, me, myName, myAvatar, onCompose }: {
  feed: 'following' | 'groups'; me: string; myName: string; myAvatar: Avatar | null; onCompose: () => void;
}) {
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const load = useCallback(() => api<StoryGroup[]>(`/api/network?stories=${feed}`).then(list => setGroups(list ?? []), () => setGroups([])), [feed]);
  useEffect(() => { void load(); setSeen(readSeen()); }, [load]);
  const mine = groups.find(group => group.author.id === me);
  const others = groups.filter(group => group.author.id !== me);
  const unseen = (group: StoryGroup) => group.stories.some(story => !seen.has(story.id));
  const seenNow = useCallback((id: string) => { markSeen(id); setSeen(readSeen()); }, []);
  return <>
    <ul className="nw-stories" aria-label={feed === 'following' ? 'Stories de quem você segue' : 'Stories dos seus grupos'}>
      <li><button type="button" className="nw-story-bubble" onClick={() => mine ? setOpen(groups.indexOf(mine)) : onCompose()}
          aria-label={mine ? 'Ver seus stories' : 'Publicar um story'}>
        <span className={`nw-story-ring ${mine ? 'seen' : 'empty'}`}><PersonAvatar name={myName} avatar={myAvatar} size={56} /></span>
        <span className="nw-story-name">Seu story</span></button>
        {mine && <button type="button" className="nw-story-add" aria-label="Publicar outro story" onClick={onCompose}><Plus size={14} aria-hidden="true" /></button>}</li>
      {others.map(group => <li key={group.author.id}><button type="button" className="nw-story-bubble" onClick={() => setOpen(groups.indexOf(group))}
          aria-label={`Stories de ${group.author.name}${unseen(group) ? ', novos' : ''}`}>
        <span className={`nw-story-ring ${unseen(group) ? '' : 'seen'}`}><PersonAvatar name={group.author.name} avatar={group.author.avatar} size={56} /></span>
        <span className="nw-story-name">{group.author.name.split(' ')[0]}</span></button></li>)}
    </ul>
    {open !== null && groups[open] && <StoryViewer groups={groups} start={open} me={me}
      onSeen={seenNow} onRemoved={() => void load()} onClose={() => setOpen(null)} />}
  </>;
}

/** Tela cheia: avança sozinho a cada 6 segundos, com pausa, setas e teclado. */
export function StoryViewer({ groups, start, me, onSeen, onRemoved, onClose }: {
  groups: StoryGroup[]; start: number; me: string; onSeen: (id: string) => void; onRemoved: () => void; onClose: () => void;
}) {
  const [place, setPlace] = useState({ group: start, story: 0 });
  const [paused, setPaused] = useState(false);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const group = groups[place.group];
  const story = group?.stories[place.story];
  const next = useCallback(() => {
    if (place.story + 1 < groups[place.group].stories.length) setPlace({ ...place, story: place.story + 1 });
    else if (place.group + 1 < groups.length) setPlace({ group: place.group + 1, story: 0 });
    else onClose();
  }, [place, groups, onClose]);
  const previous = () => setPlace(place.story > 0 ? { ...place, story: place.story - 1 }
    : place.group > 0 ? { group: place.group - 1, story: groups[place.group - 1].stories.length - 1 } : place);
  // Pausar guarda o tempo que faltava, como a barra de progresso.
  const startedAt = useRef(0);
  const remaining = useRef(STORY_MS);
  const storyId = story?.id;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => before?.focus();
  }, []);
  useEffect(() => { remaining.current = STORY_MS; if (storyId) onSeen(storyId); }, [storyId, onSeen]);
  useEffect(() => {
    if (!storyId || paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(next, remaining.current);
    return () => { clearTimeout(timer); remaining.current -= Date.now() - startedAt.current; };
  }, [storyId, paused, next]);
  if (!group || !story) return null;
  const isLiked = liked[story.id] ?? story.mine.includes('gostei');

  async function like() {
    if (!story) return;
    setLiked(value => ({ ...value, [story.id]: !isLiked }));
    try { await api('/api/network', { action: 'react', post: story.id, kind: 'gostei' }); }
    catch (reason) { setLiked(value => ({ ...value, [story.id]: isLiked })); setMessage(reason instanceof Error ? reason.message : 'Não foi possível marcar.'); }
  }
  async function remove() {
    if (!story || !window.confirm('Apagar este story?')) return;
    try { await api('/api/network', { action: 'delete_post', post: story.id }); onRemoved(); onClose(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível apagar.'); }
  }
  return <dialog ref={dialog} className="nw-story-viewer" aria-label={`Story de ${group.author.name}`} onCancel={onClose}
    onKeyDown={event => { if (event.key === 'ArrowRight') next(); if (event.key === 'ArrowLeft') previous(); }}>
    <div className="nw-story-progress" aria-hidden="true">{group.stories.map((item, index) => <span key={item.id}>
      <i className={index < place.story ? 'done' : index === place.story ? paused ? 'now paused' : 'now' : ''} style={index === place.story ? { animationDuration: `${STORY_MS}ms` } : undefined} /></span>)}</div>
    <header className="nw-story-head">
      <PersonAvatar name={group.author.name} avatar={group.author.avatar} size={36} />
      <span className="nw-story-who"><strong>{group.author.name}</strong><small>{story.space ? `${story.space.name} · ` : ''}some em {hoursLeft(story.expires_at)} h</small></span>
      <button type="button" className="icon-button" aria-label={paused ? 'Continuar' : 'Pausar'} onClick={() => setPaused(value => !value)}>{paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}</button>
      <button type="button" className="icon-button" aria-label="Fechar stories" onClick={onClose}><X size={20} aria-hidden="true" /></button>
    </header>
    <div className="nw-story-body">
      {story.photos[0] ? <img src={`/api/network/photo/${story.photos[0].id}`} alt={story.body || `Story de ${group.author.name}`} />
        : <div className={`nw-card-text ${story.style === 'text' ? 'card_blue' : story.style}`}><p>{story.body}</p></div>}
      {story.photos[0] && story.body && <p className="nw-story-caption">{story.body}</p>}
      <button type="button" className="nw-story-nav prev" aria-label="Story anterior" onClick={previous}><ChevronLeft size={28} aria-hidden="true" /></button>
      <button type="button" className="nw-story-nav next" aria-label="Próximo story" onClick={next}><ChevronRight size={28} aria-hidden="true" /></button>
    </div>
    <footer className="nw-story-foot">
      {group.author.id === me ? <button type="button" className="nw-react" onClick={remove}><Trash2 size={17} aria-hidden="true" />Apagar</button>
        : <button type="button" className="nw-react" aria-pressed={isLiked} onClick={like}><Heart size={17} aria-hidden="true" />Gostei</button>}
      {message && <p className="cm-message" role="alert">{message}</p>}
    </footer>
  </dialog>;
}
