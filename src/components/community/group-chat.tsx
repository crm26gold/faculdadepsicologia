'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bell, BellOff, Camera, Copy, CornerUpLeft, Flag, ImageOff, MoreHorizontal, RotateCcw, Send, Trash2, X } from 'lucide-react';
import { Modal } from '../modal';
import { api, ApiError } from './client';
import { PersonAvatar } from './avatar';
import { SafetyMenu } from './safety';
import { postPhoto, type PostPhoto } from '@/lib/image-shrink';
import type { ChatMessage, ChatPage, Person } from '@/lib/network';

// Com a conversa aberta e à vista, confere a cada 4 s logo depois de alguma mensagem e a cada 12 s quando está calma.
const FAST = 4000, SLOW = 12000, CALM_AFTER = 60_000, PAGE = 40;
const photoSrc = (id: string) => `/api/network/chat-photo/${id}`;
const byTime = (a: ChatMessage, b: ChatMessage) => Number(!!a.pending) - Number(!!b.pending) || (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
const newest = (items: ChatMessage[], from: string | null) => items.reduce((max, item) => !max || item.changed_at > max ? item.changed_at : max, from);
const clock = (value: string) => new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function dayLabel(value: string) {
  const day = new Date(value), today = new Date(), yesterday = new Date(today.getTime() - 86_400_000);
  if (day.toDateString() === today.toDateString()) return 'Hoje';
  if (day.toDateString() === yesterday.toDateString()) return 'Ontem';
  return day.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', ...(day.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }) });
}
// Links viram links; o resto continua texto.
const linkPattern = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
const linkify = (text: string) => text.split(linkPattern).map((part, index) => index % 2
  ? <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a> : part);

type Draft = { body: string; reply: string | null; photo: (PostPhoto & { alt: string }) | null };

/** Conversa do grupo: só as pessoas do grupo veem. Mensagem com resposta e foto; a foto fica no servidor pelo prazo
 * da configuração e continua no aparelho de quem já viu. */
export function GroupChat({ space, name, me, onOpenPerson, onRead }: {
  space: string; name: string; me: string; onOpenPerson: (id: string) => void; onRead: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [people, setPeople] = useState<Record<string, Person | null>>({});
  const [meta, setMeta] = useState<Omit<ChatPage, 'messages' | 'people'> | null>(null);
  const [older, setOlder] = useState(false);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<ChatMessage | null>(null);
  const [photo, setPhoto] = useState<Draft['photo']>(null);
  const [error, setError] = useState('');
  const [options, setOptions] = useState<ChatMessage | null>(null);
  const [report, setReport] = useState<ChatMessage | null>(null);
  const [viewing, setViewing] = useState<ChatMessage | null>(null);
  const [revealed, setRevealed] = useState<string[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [below, setBelow] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const placed = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cursor = useRef<string | null>(null);
  const activity = useRef(Date.now());
  const atBottom = useRef(true);
  const stick = useRef(true);
  const keepOffset = useRef<number | null>(null);
  const drafts = useRef(new Map<string, Draft>());
  const localPhotos = useRef(new Map<string, string>());

  // Junta o que chegou (novo, apagado) ao que já está na tela, sem repetir.
  const merge = useCallback((page: ChatPage) => {
    setPeople(current => ({ ...current, ...page.people }));
    setMeta(current => current && { ...current, moderator: page.moderator, open: page.open, muted: page.muted, photo_days: page.photo_days });
    if (!page.messages.length) return;
    cursor.current = newest(page.messages, cursor.current);
    // Lê a posição de agora: uma foto que terminou de carregar também muda a altura da conversa.
    const list = listRef.current;
    atBottom.current = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    setMessages(current => {
      const list = current ?? [];
      const known = new Map(list.map(item => [item.id, item]));
      const oldest = list.find(item => !item.pending)?.created_at;
      let arrived = 0;
      for (const item of page.messages) {
        if (known.has(item.id)) known.set(item.id, item);
        else if (!oldest || item.created_at >= oldest) { known.set(item.id, item); if (item.author !== me && item.kind !== 'joined') arrived++; }
      }
      if (arrived) { activity.current = Date.now(); if (!atBottom.current) setBelow(count => count + arrived); }
      stick.current = atBottom.current;
      return [...known.values()].sort(byTime);
    });
  }, [me]);

  useEffect(() => {
    let alive = true, timer: number | undefined;
    setMessages(null); setMeta(null); setPeople({}); cursor.current = null; stick.current = true; setBelow(0);
    api<ChatPage>(`/api/network?chat=${space}&seen=1`).then(page => {
      if (!alive) return;
      setPeople(page.people);
      setMeta({ read_at: page.read_at, moderator: page.moderator, open: page.open, muted: page.muted, photo_days: page.photo_days });
      setMessages(page.messages);
      setOlder(page.messages.length === PAGE);
      cursor.current = newest(page.messages, null);
      onRead();
    }, reason => { if (alive) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a conversa.'); });
    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState === 'visible') {
        const after = cursor.current ? `&after=${encodeURIComponent(cursor.current)}` : '';
        try { const page = await api<ChatPage>(`/api/network?chat=${space}&seen=1${after}`); if (alive) merge(page); }
        catch (reason) {
          // Saiu do grupo ou a conversa foi desligada: para de conferir. Outra falha tenta de novo na próxima volta.
          if (reason instanceof ApiError && reason.status === 403) { alive = false; setError('Você não tem mais acesso a esta conversa.'); return; }
        }
      }
      if (alive) timer = window.setTimeout(tick, Date.now() - activity.current < CALM_AFTER ? FAST : SLOW);
    };
    const wake = () => { if (document.visibilityState === 'visible') { window.clearTimeout(timer); void tick(); } };
    timer = window.setTimeout(tick, FAST);
    document.addEventListener('visibilitychange', wake);
    return () => { alive = false; window.clearTimeout(timer); document.removeEventListener('visibilitychange', wake); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [space, merge]);

  // Desce até a última mensagem quando a pessoa já estava lá embaixo; ao carregar as anteriores, mantém o lugar.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !messages) return;
    if (keepOffset.current !== null) { list.scrollTop = list.scrollHeight - keepOffset.current; keepOffset.current = null; }
    else if (stick.current) { list.scrollTop = list.scrollHeight; setBelow(0); }
  }, [messages]);
  useEffect(() => () => { for (const url of localPhotos.current.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url); }, []);
  // Ao abrir, se o campo de escrever ficou abaixo da tela (o cabeçalho do grupo é alto no celular), a conversa sobe.
  useEffect(() => {
    if (!messages || placed.current || !sectionRef.current) return;
    placed.current = true;
    const composer = sectionRef.current.querySelector('.chat-composer, .chat-closed');
    const bar = document.querySelector('.mobile-tabbar')?.getBoundingClientRect().height ?? 0;
    if (composer && composer.getBoundingClientRect().bottom > window.innerHeight - bar) sectionRef.current.scrollIntoView({ block: 'start' });
  }, [messages]);

  function scrolled() {
    const list = listRef.current;
    if (!list) return;
    atBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (atBottom.current && below) setBelow(0);
  }
  function toBottom() { const list = listRef.current; if (list) list.scrollTop = list.scrollHeight; setBelow(0); }

  async function loadOlder() {
    const first = messages?.find(item => !item.pending);
    if (!first) return;
    try {
      const page = await api<ChatPage>(`/api/network?chat=${space}&before=${encodeURIComponent(first.created_at)}`);
      const list = listRef.current;
      keepOffset.current = list ? list.scrollHeight - list.scrollTop : null;
      setPeople(current => ({ ...current, ...page.people }));
      setMessages(current => [...page.messages, ...(current ?? [])].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index).sort(byTime));
      setOlder(page.messages.length === PAGE);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar.'); }
  }

  async function deliver(localId: string, draft: Draft) {
    setMessages(current => (current ?? []).map(item => item.id === localId ? { ...item, pending: 'sending' } : item));
    try {
      const saved = await api<ChatMessage>('/api/network', { action: 'send_message', space, body: draft.body, reply: draft.reply,
        photo: draft.photo && { data: draft.photo.data, mime: draft.photo.mime, width: draft.photo.width, height: draft.photo.height, alt: draft.photo.alt } });
      drafts.current.delete(localId);
      if (draft.photo) localPhotos.current.set(saved.id, draft.photo.url);
      activity.current = Date.now(); stick.current = true;
      setMessages(current => (current ?? []).filter(item => item.id !== saved.id).map(item => item.id === localId ? saved : item).sort(byTime));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível enviar.');
      setMessages(current => (current ?? []).map(item => item.id === localId ? { ...item, pending: 'failed' } : item));
    }
  }
  function send() {
    const body = text.trim();
    if ((!body && !photo) || !meta?.open) return;
    const draft: Draft = { body, reply: reply?.id ?? null, photo };
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    drafts.current.set(localId, draft);
    if (photo) localPhotos.current.set(localId, photo.url);
    const now = new Date().toISOString();
    stick.current = true; setError('');
    setMessages(current => [...(current ?? []), { id: localId, author: me, body, created_at: now, changed_at: now, deleted: null, blocked: false, pending: 'sending',
      reply: reply && { id: reply.id, author: reply.author, excerpt: reply.body.slice(0, 120), photo: !!reply.photo, deleted: false },
      photo: photo && { width: photo.width, height: photo.height, alt: photo.alt, stored: true } }]);
    setText(''); setReply(null); setPhoto(null);
    if (inputRef.current) inputRef.current.style.height = '';
    void deliver(localId, draft);
  }
  async function pick(file: File | undefined) {
    if (!file) return;
    setError('');
    const shrunk = await postPhoto(file);
    if (shrunk) { setPhoto({ ...shrunk, alt: '' }); inputRef.current?.focus(); }
    else setError('Não consegui usar esta foto. Escolha uma foto JPG, PNG ou WebP.');
  }
  async function remove(item: ChatMessage) {
    setOptions(null);
    if (!window.confirm('Apagar esta mensagem para todo o grupo?')) return;
    try {
      await api('/api/network', { action: 'delete_message', message: item.id });
      const mine = item.author === me;
      setMessages(current => (current ?? []).map(other => other.id === item.id ? { ...other, body: '', photo: null, deleted: mine ? 'author' : 'moderation' } : other));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível apagar.'); }
  }
  async function mute() {
    if (!meta) return;
    try { await api('/api/network', { action: 'mute_group', space, muted: !meta.muted }); setMeta({ ...meta, muted: !meta.muted }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível mudar o aviso.'); }
  }
  function jump(id: string) {
    const target = document.getElementById(`chat-${id}`);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.add('chat-flash'); window.setTimeout(() => target.classList.remove('chat-flash'), 1600);
  }

  const nameOf = (id: string | null) => (id && people[id]?.name) || (id ? 'Pessoa do grupo' : 'Ex-membro');
  const first = (id: string | null) => nameOf(id).split(' ')[0];
  const enterSends = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;
  const unreadFrom = meta?.read_at ? messages?.find(item => !item.pending && item.kind !== 'joined' && item.author !== me && item.created_at > meta.read_at!)?.id : undefined;

  if (error && !messages) return <div className="error-banner" role="alert">{error}</div>;
  if (!messages || !meta) return <p role="status" className="loading-panel">Abrindo a conversa…</p>;

  return <section ref={sectionRef} className="chat" aria-label={`Conversa de ${name}`}>
    <div className="chat-head">
      <p className="muted small">Só quem está no grupo vê esta conversa.{meta.photo_days ? ` As fotos ficam ${meta.photo_days} dias no servidor e continuam no aparelho de quem já viu.` : ''}</p>
      <button type="button" className="text-button" aria-pressed={meta.muted} onClick={() => void mute()}>
        {meta.muted ? <><BellOff size={15} aria-hidden="true" />Silenciada</> : <><Bell size={15} aria-hidden="true" />Silenciar</>}</button>
    </div>
    <div ref={listRef} className="chat-thread" role="log" aria-label={`Mensagens de ${name}`} onScroll={scrolled}>
      {older && <button type="button" className="text-button chat-older" onClick={() => void loadOlder()}>Ver mensagens anteriores</button>}
      {!messages.some(item => item.kind !== 'joined') && <p className="chat-empty muted">Ninguém escreveu ainda. Comece a conversa: um oi, uma dúvida, o link da aula.</p>}
      <ol className="chat-list">{messages.map((item, index) => {
        const previous = messages[index - 1];
        const newDay = !previous || new Date(previous.created_at).toDateString() !== new Date(item.created_at).toDateString();
        const run = !newDay && previous && previous.author === item.author && !previous.deleted && previous.kind !== 'joined'
          && Date.parse(item.created_at) - Date.parse(previous.created_at) < 5 * 60_000;
        const mine = item.author === me;
        const person = item.author ? people[item.author] : null;
        const hidden = item.blocked && !revealed.includes(item.id);
        const src = localPhotos.current.get(item.id) ?? photoSrc(item.id);
        if (item.kind === 'joined') return <li key={item.id} id={`chat-${item.id}`} className="chat-row">
          {newDay && <p className="chat-day"><span>{dayLabel(item.created_at)}</span></p>}
          <p className="chat-day chat-joined"><span>{mine ? 'Você entrou no grupo' : `${nameOf(item.author)} entrou no grupo`} · {clock(item.created_at)}</span></p>
        </li>;
        return <li key={item.id} id={`chat-${item.id}`} className="chat-row">
          {newDay && <p className="chat-day"><span>{dayLabel(item.created_at)}</span></p>}
          {item.id === unreadFrom && <p className="chat-unread"><span>Mensagens novas</span></p>}
          <div className={`chat-msg${mine ? ' mine' : ''}${run ? ' run' : ''}`}>
            {!mine && (run ? <span className="chat-avatar-space" aria-hidden="true" />
              : <button type="button" className="chat-avatar" disabled={!item.author} aria-label={`Abrir o perfil de ${nameOf(item.author)}`}
                onClick={() => item.author && onOpenPerson(item.author)}><PersonAvatar name={nameOf(item.author)} avatar={person?.avatar} size={30} /></button>)}
            {item.deleted ? <p className="chat-bubble chat-gone">{item.deleted === 'author' ? 'Mensagem apagada' : 'Mensagem apagada pela moderação'}</p>
              : hidden ? <p className="chat-bubble chat-gone">Mensagem de alguém que você bloqueou · <button type="button" className="text-button" onClick={() => setRevealed(list => [...list, item.id])}>Mostrar</button></p>
              : <div className="chat-bubble">
                {!mine && !run && <strong className="chat-author">{nameOf(item.author)}</strong>}
                {item.reply && <button type="button" className="chat-quote" onClick={() => jump(item.reply!.id)}>
                  <strong>{nameOf(item.reply.author)}</strong><span>{item.reply.deleted ? 'Mensagem apagada' : item.reply.blocked ? 'Mensagem de alguém que você bloqueou'
                    : item.reply.excerpt || (item.reply.photo ? '📷 Foto' : '')}</span></button>}
                {item.photo && (missing.includes(item.id)
                  ? <span className="chat-photo-gone"><ImageOff size={18} aria-hidden="true" />{item.photo.stored ? 'Não consegui abrir a foto.' : `A foto saiu do servidor depois de ${meta.photo_days ?? 90} dias.`}</span>
                  : <button type="button" className="chat-photo" onClick={() => setViewing(item)} aria-label={item.photo.alt ? `Ampliar a foto: ${item.photo.alt}` : 'Ampliar a foto'}>
                    <img src={src} alt={item.photo.alt} width={item.photo.width} height={item.photo.height} loading="lazy"
                      onError={() => setMissing(list => list.includes(item.id) ? list : [...list, item.id])} /></button>)}
                {item.body && <p className="chat-text">{linkify(item.body)}</p>}
                <span className="chat-meta">{item.pending === 'sending' ? 'Enviando…' : item.pending === 'failed' ? 'Não enviada' : clock(item.created_at)}</span>
              </div>}
            {item.pending === 'failed' ? <button type="button" className="icon-button" aria-label="Tentar enviar de novo"
                onClick={() => { const draft = drafts.current.get(item.id); if (draft) void deliver(item.id, draft); }}><RotateCcw size={16} aria-hidden="true" /></button>
              : !item.pending && !item.deleted && !hidden && <button type="button" className="icon-button chat-more" aria-label={mine ? 'Opções da sua mensagem' : `Opções da mensagem de ${nameOf(item.author)}`}
                onClick={() => setOptions(item)}><MoreHorizontal size={16} aria-hidden="true" /></button>}
          </div>
        </li>;
      })}</ol>
    </div>
    {below > 0 && <button type="button" className="chat-below" onClick={toBottom}>{below} {below === 1 ? 'mensagem nova' : 'mensagens novas'} ↓</button>}
    {error && <p className="cm-message" role="alert">{error}</p>}

    {meta.open ? <form className="chat-composer" onSubmit={event => { event.preventDefault(); send(); }}>
      {reply && <div className="chat-replying"><CornerUpLeft size={15} aria-hidden="true" /><span>Respondendo a <strong>{first(reply.author)}</strong>: {reply.body.slice(0, 80) || (reply.photo ? '📷 Foto' : '')}</span>
        <button type="button" className="icon-button" aria-label="Cancelar a resposta" onClick={() => setReply(null)}><X size={15} aria-hidden="true" /></button></div>}
      {photo && <div className="chat-preview"><img src={photo.url} alt="" />
        <label className="sr-only" htmlFor="chat-alt">Descrição da foto</label>
        <input id="chat-alt" value={photo.alt} maxLength={300} placeholder="Descreva a foto (para quem usa leitor de tela) · opcional" onChange={event => setPhoto({ ...photo, alt: event.target.value })} />
        <button type="button" className="icon-button" aria-label="Tirar a foto" onClick={() => setPhoto(null)}><X size={15} aria-hidden="true" /></button></div>}
      <div className="chat-input">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={event => { void pick(event.target.files?.[0]); event.target.value = ''; }} />
        <button type="button" className="icon-button" aria-label="Enviar uma foto" onClick={() => fileRef.current?.click()}><Camera size={19} aria-hidden="true" /></button>
        <label className="sr-only" htmlFor="chat-text">Mensagem para {name}</label>
        <textarea ref={inputRef} id="chat-text" rows={1} maxLength={4000} value={text} placeholder="Mensagem"
          onChange={event => { setText(event.target.value); event.target.style.height = ''; event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`; }}
          onKeyDown={event => { if (enterSends && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
        <button type="submit" className="icon-button chat-send" aria-label="Enviar" disabled={!text.trim() && !photo}><Send size={18} aria-hidden="true" /></button>
      </div>
    </form> : <p className="chat-closed muted">Grupo arquivado: a conversa fica só para leitura.</p>}

    {options && <Modal title={options.author === me ? 'Sua mensagem' : `Mensagem de ${first(options.author)}`} onClose={() => setOptions(null)}>
      <div className="nw-safety-menu">
        {meta.open && <button type="button" className="nw-safety-option" onClick={() => { setReply(options); setOptions(null); inputRef.current?.focus(); }}><CornerUpLeft size={18} aria-hidden="true" />Responder</button>}
        {options.body && <button type="button" className="nw-safety-option" onClick={() => { void navigator.clipboard?.writeText(options.body).catch(() => null); setOptions(null); }}><Copy size={18} aria-hidden="true" />Copiar o texto</button>}
        {(options.author === me || meta.moderator) && <button type="button" className="nw-safety-option danger" onClick={() => void remove(options)}><Trash2 size={18} aria-hidden="true" />Apagar para todos</button>}
        {options.author && options.author !== me && <button type="button" className="nw-safety-option" onClick={() => { setReport(options); setOptions(null); }}><Flag size={18} aria-hidden="true" />Denunciar ou bloquear</button>}
      </div>
    </Modal>}
    {report?.author && <SafetyMenu person={people[report.author] ?? { id: report.author, name: nameOf(report.author), avatar: null }} message={report.id}
      onClose={() => setReport(null)} onBlocked={blocking => setMessages(current => (current ?? []).map(item => item.author === report.author ? { ...item, blocked: blocking } : item))} />}
    {viewing?.photo && <Modal title={`Foto de ${first(viewing.author)}`} className="chat-viewer" onClose={() => setViewing(null)}>
      <img src={localPhotos.current.get(viewing.id) ?? photoSrc(viewing.id)} alt={viewing.photo.alt} width={viewing.photo.width} height={viewing.photo.height} />
      {viewing.photo.alt && <p className="muted small">{viewing.photo.alt}</p>}
    </Modal>}
  </section>;
}
