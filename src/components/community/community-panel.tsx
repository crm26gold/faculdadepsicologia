'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, BadgeCheck, ClipboardCheck, GraduationCap, Link2, MessageCircle, PenLine, Plus, Send, Users } from 'lucide-react';
import { api, formatDay, PENDING_INVITE_KEY } from './client';
import { SpaceView, type SpaceTab } from './space-view';
import { AssignmentView } from './assignment-view';
import { ProfileEditor } from './profile-editor';
import { CreateGroup } from './group-form';
import { Discover } from './discover';
import { Feed } from './feed';
import { Composer } from './composer';
import { PersonView, UpdatesView, type ProfileView } from './person-view';
import { StoriesBar } from './stories';
import { roleLabels, statusLabels, templateLabels, type Home, type SpaceSummary } from '@/lib/community';
import type { AgendaAssignment, AgendaLink } from '@/lib/assignment-agenda';
import type { Workspace } from '@/lib/workspace';

export type CommunityTab = 'feed' | 'mine' | 'discover';
export type CommunityRoute = { kind: 'list'; tab?: CommunityTab } | { kind: 'space'; id: string; tab?: SpaceTab; start?: 'challenge' | 'poll' } | { kind: 'work'; id: string; from?: string }
  | { kind: 'create'; parent?: { id: string; name: string } } | { kind: 'profile' } | ({ kind: 'person'; id: string } & ProfileView)
  | { kind: 'updates' } | { kind: 'compose'; space?: { id: string; name: string }; story?: boolean };

/** Cada passo dentro do Networking vira uma entrada do histórico: o Voltar (do app ou do celular) desfaz um passo.
 * `replace` troca a entrada atual (aba, ou a tela que acabou de cumprir seu papel); `onBack` volta um passo. */
export function CommunityPanel({ home, workspace, route, onRoute, onBack, onOpenSettings, refreshHome, onAddToAgenda, onMoveAgendaTask }: {
  home: Home; workspace: Workspace; route: CommunityRoute; onRoute: (route: CommunityRoute, replace?: boolean) => void; onBack: () => void;
  onOpenSettings: () => void; refreshHome: () => void;
  onAddToAgenda?: (assignment: AgendaAssignment) => AgendaLink | null;
  onMoveAgendaTask?: (taskId: string, due: string) => boolean;
}) {
  const me = home.account.user_id;
  const personalPhoto = workspace.profile?.photoUrl || undefined;
  // Perfil primeiro: nos grupos, as pessoas veem nome e avatar.
  if (!home.profile) return <ProfileEditor first name={home.account.display_name} personalPhoto={personalPhoto} onSaved={refreshHome} />;
  if (route.kind === 'profile') return <ProfileEditor name={home.account.display_name} profile={home.profile} personalPhoto={personalPhoto}
    onSaved={() => { refreshHome(); onBack(); }} onCancel={onBack} />;
  if (route.kind === 'create') return <CreateGroup data={workspace} parent={route.parent} onCancel={onBack}
    onCreated={id => { refreshHome(); onRoute({ kind: 'space', id }, true); }} />;
  if (route.kind === 'space') return <SpaceView key={route.id} id={route.id} tab={route.tab} start={route.start} me={me} workspace={workspace} onBack={onBack} onChanged={refreshHome}
    onOpenSpace={id => onRoute({ kind: 'space', id })} onOpenWork={id => onRoute({ kind: 'work', id, from: route.id })}
    onCreateGroup={parent => onRoute({ kind: 'create', parent })} onCompose={space => onRoute({ kind: 'compose', space })}
    onOpenPerson={id => onRoute({ kind: 'person', id })} />;
  if (route.kind === 'person') return <PersonView key={route.id} id={route.id} me={me} post={route.post} tab={route.tab} as={route.as} onChanged={refreshHome}
    onOpenPerson={id => onRoute({ kind: 'person', id })} onView={(next, replace) => onRoute({ kind: 'person', id: route.id, ...next }, replace)} onBack={onBack}
    onEditProfile={() => onRoute({ kind: 'profile' })} onNewStory={() => onRoute({ kind: 'compose', story: true })} onOpenSettings={onOpenSettings} />;
  if (route.kind === 'updates') return <UpdatesView onChanged={refreshHome} onOpenAchievements={() => onRoute({ kind: 'person', id: me, tab: 'conquistas' })}
    onOpenPerson={id => onRoute({ kind: 'person', id })} onOpenSpace={id => onRoute({ kind: 'space', id })} />;
  if (route.kind === 'compose') return <Composer home={home} space={route.space} story={route.story} onCancel={onBack} onPosted={onBack} />;
  if (route.kind === 'work') return <AssignmentView key={route.id} id={route.id} me={me} onChanged={refreshHome} onAddToAgenda={onAddToAgenda} onMoveAgendaTask={onMoveAgendaTask}
    onBack={onBack} />;
  // Quem tem parte de trabalho esperando abre em Meus grupos; os outros, no que as pessoas compartilham.
  const tab = route.tab ?? (home.my_parts.length || home.to_review.length ? 'mine' : 'feed');
  return <NetworkingHome home={home} tab={tab} onRoute={onRoute} refreshHome={refreshHome} />;
}

const unreadText = (count: number) => `${count >= 100 ? '99+' : count} ${count === 1 ? 'mensagem nova' : 'mensagens novas'}`;

function NetworkingHome({ home, tab, onRoute, refreshHome }: { home: Home; tab: CommunityTab; onRoute: (route: CommunityRoute, replace?: boolean) => void; refreshHome: () => void }) {
  const me = home.account.user_id;
  const openPerson = (id: string) => onRoute({ kind: 'person', id });
  const stories = (feed: 'following' | 'groups') => <StoriesBar feed={feed} me={me} myName={home.account.display_name} myAvatar={home.profile ?? null}
    onCompose={() => onRoute({ kind: 'compose', story: true })} />;
  const [invite, setInvite] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const active = home.spaces.filter(space => !space.archived_at);
  const classes = active.filter(space => space.kind === 'class');
  const groupsOf = (id: string) => active.filter(space => space.kind === 'group' && space.parent_id === id);
  const otherGroups = active.filter(space => space.kind === 'group' && !classes.some(item => item.id === space.parent_id));
  const institutions = active.filter(space => space.kind === 'institution');
  const teaching = active.filter(space => space.my_role === 'teacher' || (space.my_role === 'owner' && space.kind !== 'group') || space.my_role === 'assistant');
  const chats = active.filter(space => home.chat?.[space.id]);
  const chatTotal = chats.reduce((sum, space) => sum + (home.chat?.[space.id] ?? 0), 0);

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
    <span className="eyebrow">{space.kind === 'group' ? space.template && space.template !== 'livre' ? templateLabels[space.template] : 'Grupo' : space.kind === 'class' ? 'Sala' : 'Instituição'}{space.my_role ? ` · ${space.kind === 'group' && !space.parent_id && space.my_role === 'student' ? 'Membro' : roleLabels[space.my_role]}` : ''}</span>
    <strong>{space.name}{space.official && <BadgeCheck className="nw-seal" size={16} aria-label="Oficial" />}</strong>
    {space.origin ? <span>{space.origin}</span> : space.description && <span>{space.description}</span>}
    {!!space.requests && <span className="nw-badge">{space.requests} {space.requests === 1 ? 'pedido para entrar' : 'pedidos para entrar'}</span>}
    {!!home.chat?.[space.id] && <span className="nw-badge chat">{unreadText(home.chat[space.id])}</span>}
    <small className="cm-open">Abrir <ArrowRight size={13} aria-hidden="true" /></small>
  </button>;

  return <div className="cm-stack">
    <div className="nw-head-actions">
      <button type="button" className="button primary" onClick={() => onRoute({ kind: 'compose' })}><Plus size={16} aria-hidden="true" />Publicar</button>
      <button type="button" className="button outline" onClick={() => onRoute({ kind: 'create' })}>Criar grupo</button>
    </div>
    <div className="planning-nav-bar" role="tablist" aria-label="Networking">
      {([['feed', 'Seguindo'], ['mine', 'Meus grupos'], ['discover', 'Descobrir']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value}
        className={`planning-tab ${tab === value ? 'active' : ''}`} onClick={() => onRoute({ kind: 'list', tab: value }, true)}>{label}{value === 'mine' && !!(home.join_requests || chatTotal) && <span className="count-pill">{(home.join_requests ?? 0) + chatTotal}</span>}</button>)}
    </div>

    {tab === 'feed' && stories('following')}
    {tab === 'feed' && <Feed source={{ feed: 'following' }} me={me} onOpenPerson={openPerson}
      empty="Aqui aparece o que as pessoas que você segue compartilham. Procure pessoas e #temas em Descobrir, ou publique o primeiro resumo." />}
    {tab === 'discover' && <Discover me={me} email={home.account.email} onOpen={id => onRoute({ kind: 'space', id })} onOpenPerson={openPerson} onJoined={refreshHome} />}
    {tab === 'mine' && <>
      {(home.my_parts.length > 0 || home.to_review.length > 0) && <div className="cm-grid-2">
        {home.my_parts.length > 0 && <section className="panel"><div className="section-heading"><h2><PenLine size={16} aria-hidden="true" /> Minhas partes</h2></div>
          <ul className="cm-todo">{home.my_parts.map(part => <li key={part.id}><button onClick={() => onRoute({ kind: 'work', id: part.assignment_id })}>
            <span className={`cm-status ${part.status}`}>{statusLabels[part.status]}</span><strong>{part.title}</strong><small>{part.assignment_title}{part.due_date ? ` · entrega ${formatDay(part.due_date)}` : ''}</small></button></li>)}</ul></section>}
        {home.to_review.length > 0 && <section className="panel"><div className="section-heading"><h2><ClipboardCheck size={16} aria-hidden="true" /> Para revisar</h2></div>
          <ul className="cm-todo">{home.to_review.map(part => <li key={part.id}><button onClick={() => onRoute({ kind: 'work', id: part.assignment_id })}>
            <span className="cm-status submitted">Entregue</span><strong>{part.title}</strong><small>{part.assignment_title} · {formatDay(part.submitted_at)}</small></button></li>)}</ul></section>}
      </div>}

      {chats.length > 0 && <section className="panel nw-chats" aria-labelledby="nw-chats-title"><h2 id="nw-chats-title"><MessageCircle size={16} aria-hidden="true" /> Conversas com mensagens novas</h2>
        <ul>{chats.map(space => <li key={space.id}><button type="button" onClick={() => onRoute({ kind: 'space', id: space.id })}>
          <strong>{space.name}</strong><span className="nw-badge chat">{unreadText(home.chat![space.id])}</span></button></li>)}</ul></section>}

      {active.length > 0 && stories('groups')}
      {active.length > 0 && <section aria-labelledby="nw-group-posts"><div className="section-heading"><h2 id="nw-group-posts"><Send size={16} aria-hidden="true" /> Publicações dos seus grupos</h2></div>
        <Feed source={{ feed: 'groups' }} me={me} onOpenPerson={openPerson} empty="Nada publicado nos seus grupos ainda." /></section>}

      {teaching.length > 0 && <section><div className="section-heading"><h2><GraduationCap size={17} aria-hidden="true" /> Onde você ensina ou orienta</h2></div><div className="cm-card-grid">{teaching.map(card)}</div></section>}

      <section><div className="section-heading"><h2><Users size={17} aria-hidden="true" /> Meus grupos e salas</h2></div>
        {otherGroups.length > 0 && <div className="cm-card-grid">{otherGroups.map(card)}</div>}
        {classes.map(item => <div key={item.id} className="cm-class-block">
          {card(item)}
          {groupsOf(item.id).length > 0 && <div className="cm-card-grid nested">{groupsOf(item.id).map(card)}</div>}
        </div>)}
        {institutions.length > 0 && <div className="cm-card-grid">{institutions.map(card)}</div>}
        {!active.length && <div className="panel cm-empty"><Users size={30} aria-hidden="true" /><h3>Você ainda não está em nenhum grupo.</h3>
          <p>Crie um grupo de estudo, de desafio ou de qualquer assunto, procure um em Descobrir ou cole abaixo o convite que recebeu. Sua vida pessoal no app continua só sua.</p>
          <div className="button-row"><button type="button" className="button primary" onClick={() => onRoute({ kind: 'create' })}><Plus size={16} aria-hidden="true" />Criar grupo</button>
            <button type="button" className="button outline" onClick={() => onRoute({ kind: 'list', tab: 'discover' }, true)}>Descobrir grupos</button></div></div>}
      </section>

      <section className="panel cm-join"><h2><Link2 size={16} aria-hidden="true" /> Entrar com um convite</h2>
        <form onSubmit={event => { event.preventDefault(); void join(invite); }} className="cm-inline-form">
          <label htmlFor="invite-input" className="sr-only">Link de convite</label>
          <input id="invite-input" value={invite} onChange={event => setInvite(event.target.value)} placeholder="Cole aqui o link de convite" maxLength={400} />
          <button className="button primary" disabled={busy || !invite.trim()}>Entrar</button>
        </form>
        {message && <p className="cm-message" role="status">{message}</p>}
      </section>
    </>}
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
