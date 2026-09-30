'use client';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Copy, ExternalLink, Link2, LogOut, Megaphone, Pin, Plus, Settings2, Trash2, UserPlus, Users } from 'lucide-react';
import { Modal } from '../modal';
import { api, formatDay } from './client';
import { AssignmentForm } from './assignment-view';
import { kindLabels, postKindLabels, roleLabels, spaceColors, type Role, type SpaceOverview } from '@/lib/community';

type Tab = 'board' | 'works' | 'groups' | 'people';
const colorNames: Record<string, string> = { sage: 'Azul claro', lavender: 'Lavanda', sand: 'Areia', blue: 'Azul', rose: 'Rosa' };

export function SpaceView({ id, me, onBack, onOpenSpace, onOpenWork, onChanged }: {
  id: string; me: string; onBack: () => void; onOpenSpace: (id: string) => void; onOpenWork: (id: string) => void; onChanged: () => void;
}) {
  const [data, setData] = useState<SpaceOverview | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('board');
  const [modal, setModal] = useState<'post' | 'poll' | 'work' | 'group' | 'member' | 'invite' | 'settings' | null>(null);
  const [link, setLink] = useState('');

  const load = useCallback(async () => {
    try { setData(await api<SpaceOverview>(`/api/spaces?id=${id}`)); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir.'); }
  }, [id]);
  useEffect(() => { setTab('board'); void load(); }, [load]);

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage('');
    try { const result = await api<unknown>('/api/spaces', body); setMessage(done); await load(); onChanged(); return result ?? true; }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível salvar.'); return null; }
    finally { setBusy(false); }
  }

  if (error) return <section className="cm-page"><button className="text-button" onClick={onBack}><ArrowLeft size={14} /> Voltar</button><div className="error-banner" role="alert">{error}</div></section>;
  if (!data) return <p role="status" className="loading-panel">Abrindo…</p>;
  const { space, access } = data;
  const names = new Map(data.people.map(person => [person.user_id, person.display_name || 'Sem nome']));
  const nameOf = (userId: string | null) => userId ? names.get(userId) ?? 'Equipe' : 'Ex-membro';
  const direct = data.people.filter(person => person.is_direct);
  const guides = data.people.filter(person => !person.is_direct && person.role !== 'master');
  const tabs: [Tab, string, number | null][] = [['board', 'Mural', data.posts.length + data.polls.length], ['works', 'Trabalhos', data.assignments.length],
    ...(space.kind === 'class' ? [['groups', 'Grupos', data.groups.length] as [Tab, string, number]] : []), ['people', 'Pessoas', direct.length]];

  return <section className="cm-page">
    <div className="cm-crumbs"><button className="text-button" onClick={onBack}><ArrowLeft size={14} aria-hidden="true" /> Voltar</button>
      <span>{data.path.map((item, index) => index < data.path.length - 1 && item.kind !== 'institution'
        ? <button key={item.id} className="cm-crumb" onClick={() => onOpenSpace(item.id)}>{item.name}</button>
        : <span key={item.id}>{item.name}</span>).reduce<React.ReactNode[]>((all, node, index) => index ? [...all, ' › ', node] : [node], [])}</span></div>
    <header className={`cm-hero ${space.color}`}>
      <div>
        <span className="eyebrow">{kindLabels[space.kind]}{data.my_role ? ` · você é ${roleLabels[data.my_role].toLowerCase()}` : access.is_master ? ' · administração' : ''}{space.archived_at ? ' · arquivado' : ''}</span>
        <h2>{space.name}</h2>
        {space.description && <p>{space.description}</p>}
      </div>
      <div className="button-row">
        {access.can_manage && <button className="button outline" onClick={() => setModal('settings')}><Settings2 size={16} aria-hidden="true" />Configurar</button>}
        {data.my_role && data.my_role !== 'owner' && <button className="button outline" disabled={busy} onClick={async () => {
          if (!window.confirm(`Sair de ${space.name}? Você deixa de ver o conteúdo, mas o que já entregou continua com o grupo.`)) return;
          if (await run({ action: 'remove_member', space: space.id, member: me }, 'Você saiu.')) onBack();
        }}><LogOut size={16} aria-hidden="true" />Sair</button>}
      </div>
    </header>
    {message && <p className="cm-message" role="status">{message}</p>}

    <div className="planning-nav-bar" role="tablist" aria-label={`Seções de ${space.name}`}>
      {tabs.map(([value, label, count]) => <button key={value} type="button" role="tab" aria-selected={tab === value} className={`planning-tab ${tab === value ? 'active' : ''}`} onClick={() => setTab(value)}>{label}{count !== null && <span className="count-pill">{count}</span>}</button>)}
    </div>

    {tab === 'board' && <div className="cm-stack">
      {access.can_lead && <div className="button-row"><button className="button primary" onClick={() => setModal('post')}><Megaphone size={16} aria-hidden="true" />Publicar no mural</button><button className="button outline" onClick={() => setModal('poll')}><BarChart3 size={16} aria-hidden="true" />Nova enquete</button></div>}
      {data.polls.map(poll => {
        const total = poll.results.reduce((sum, item) => sum + item.votes, 0);
        const closed = !!poll.closes_at && new Date(poll.closes_at) <= new Date();
        return <article key={poll.id} className="panel cm-poll">
          <div className="cm-post-head"><span className="cm-tag">Enquete</span><small>{nameOf(poll.author_id)} · {formatDay(poll.created_at)}</small>
            {(access.can_manage || poll.author_id === me) && <button className="icon-button" aria-label="Excluir enquete" disabled={busy} onClick={() => window.confirm('Excluir esta enquete e os votos?') && run({ action: 'delete_poll', poll: poll.id }, 'Enquete excluída.')}><Trash2 size={15} /></button>}</div>
          <h3>{poll.question}</h3>
          <div className="cm-poll-options">{poll.options.map((option, index) => {
            const votes = poll.results.find(item => item.option_index === index)?.votes ?? 0;
            const share = total ? Math.round(votes / total * 100) : 0;
            return <button key={index} className={`cm-poll-option ${poll.my_vote === index ? 'mine' : ''}`} disabled={busy || closed} aria-pressed={poll.my_vote === index} onClick={() => run({ action: 'vote', poll: poll.id, choice: index }, 'Voto registrado. Só você vê a sua escolha.')}>
              <span className="cm-poll-bar" style={{ inlineSize: `${share}%` }} /><span>{option}</span><strong>{share}%</strong>
            </button>;
          })}</div>
          <small className="muted">{total} {total === 1 ? 'voto' : 'votos'} · voto secreto{closed ? ' · encerrada' : ''}</small>
        </article>;
      })}
      {data.posts.map(post => <article key={post.id} className={`panel cm-post ${post.kind}`}>
        <div className="cm-post-head"><span className="cm-tag">{post.pinned && <Pin size={12} aria-hidden="true" />}{postKindLabels[post.kind]}</span><small>{nameOf(post.author_id)} · {formatDay(post.created_at)}</small>
          {(access.can_manage || post.author_id === me) && <button className="icon-button" aria-label="Excluir publicação" disabled={busy} onClick={() => window.confirm('Excluir esta publicação?') && run({ action: 'delete_post', post: post.id }, 'Publicação excluída.')}><Trash2 size={15} /></button>}</div>
        <h3>{post.title}</h3>
        {post.event_date && <p className="cm-date">📅 {formatDay(post.event_date, { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
        {post.body && <p className="cm-pre">{post.body}</p>}
        {post.link_url && <a className="cm-link" href={post.link_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" />{post.link_url.replace(/^https?:\/\//, '').slice(0, 60)}</a>}
      </article>)}
      {!data.posts.length && !data.polls.length && <div className="empty-inline"><Megaphone size={22} aria-hidden="true" /><p>Nada no mural ainda.{access.can_lead ? ' Publique avisos, datas, vídeos e materiais para todos.' : ' Avisos e materiais aparecem aqui.'}</p></div>}
    </div>}

    {tab === 'works' && <div className="cm-stack">
      {access.can_lead && <div className="button-row"><button className="button primary" onClick={() => setModal('work')}><Plus size={16} aria-hidden="true" />Novo trabalho em grupo</button></div>}
      <div className="cm-card-grid">{data.assignments.map(work => <button key={work.id} className="cm-work-card" onClick={() => onOpenWork(work.id)}>
        <span className="eyebrow">{work.subject_name || 'Trabalho'}{work.space_id !== space.id ? ` · ${work.space_name}` : ''}</span>
        <strong>{work.title}</strong>
        <small>{work.due_date ? `Entrega ${formatDay(work.due_date)}` : 'Sem data'} · {work.status === 'open' ? 'em produção' : work.status === 'delivered' ? 'entregue' : 'arquivado'}</small>
        <span className="cm-progress"><span style={{ inlineSize: `${work.parts_total ? Math.round(work.parts_submitted / work.parts_total * 100) : 0}%` }} /></span>
        <small>{work.parts_submitted}/{work.parts_total} partes entregues · {work.parts_approved} aprovadas</small>
      </button>)}</div>
      {!data.assignments.length && <div className="empty-inline"><Users size={22} aria-hidden="true" /><p>Nenhum trabalho ainda.{access.can_lead ? ' Crie um trabalho, divida em partes e cada pessoa entrega a sua.' : ''}</p></div>}
    </div>}

    {tab === 'groups' && <div className="cm-stack">
      {access.can_manage && <div className="button-row"><button className="button primary" onClick={() => setModal('group')}><Plus size={16} aria-hidden="true" />Novo grupo</button></div>}
      <div className="cm-card-grid">{data.groups.map(group => <button key={group.id} className={`cm-space-card ${group.color}`} onClick={() => onOpenSpace(group.id)}>
        <strong>{group.name}</strong><small>{group.members} {group.members === 1 ? 'pessoa' : 'pessoas'}{group.archived_at ? ' · arquivado' : ''}</small>{group.description && <span>{group.description}</span>}
      </button>)}</div>
      {!data.groups.length && <div className="empty-inline"><Users size={22} aria-hidden="true" /><p>{access.can_manage ? 'Crie grupos de trabalho. Cada grupo só vê o próprio conteúdo.' : 'Você verá aqui o seu grupo quando for incluído(a).'}</p></div>}
    </div>}

    {tab === 'people' && <div className="cm-stack">
      {access.can_lead && <div className="button-row">
        {access.can_manage && <button className="button primary" onClick={() => setModal('member')}><UserPlus size={16} aria-hidden="true" />Adicionar por e-mail</button>}
        <button className="button outline" onClick={() => { setLink(''); setModal('invite'); }}><Link2 size={16} aria-hidden="true" />Link de convite</button>
      </div>}
      <ul className="cm-people">{direct.map(person => <li key={person.user_id}>
        <span className="cm-avatar" aria-hidden="true">{(person.display_name || '?').slice(0, 1).toUpperCase()}</span>
        <span className="cm-person"><strong>{person.display_name || 'Sem nome'}{person.user_id === me ? ' (você)' : ''}</strong><small>{roleLabels[person.role]}{person.email ? ` · ${person.email}` : ''}</small></span>
        {access.can_manage && person.user_id !== me && person.role !== 'master' && <span className="cm-person-tools">
          <label className="sr-only" htmlFor={`role-${person.user_id}`}>Papel de {person.display_name}</label>
          <select id={`role-${person.user_id}`} value={person.role} disabled={busy || ((person.role === 'teacher' || person.role === 'owner') && !access.is_master)} onChange={event => run({ action: 'set_role', space: space.id, member: person.user_id, role: event.target.value }, 'Papel atualizado.')}>
            {(['student', 'leader', 'assistant', ...(access.is_master ? ['teacher', 'owner'] : person.role === 'teacher' || person.role === 'owner' ? [person.role] : [])] as Role[]).map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
          </select>
          <button className="icon-button" aria-label={`Remover ${person.display_name}`} disabled={busy || ((person.role === 'teacher' || person.role === 'owner') && !access.is_master)} onClick={() => window.confirm(`Remover ${person.display_name}${space.kind === 'class' ? ' da sala e dos grupos dela' : ''}?`) && run({ action: 'remove_member', space: space.id, member: person.user_id }, 'Pessoa removida.')}><Trash2 size={15} /></button>
        </span>}
      </li>)}</ul>
      {guides.length > 0 && <><h3 className="small-heading">Quem acompanha</h3><ul className="cm-people">{guides.map(person => <li key={person.user_id}><span className="cm-avatar" aria-hidden="true">{(person.display_name || '?').slice(0, 1).toUpperCase()}</span><span className="cm-person"><strong>{person.display_name}</strong><small>{roleLabels[person.role]}</small></span></li>)}</ul></>}
      {access.can_lead && data.invitations.length > 0 && <><h3 className="small-heading">Convites</h3><ul className="cm-people">{data.invitations.map(invite => {
        const active = !invite.revoked_at && new Date(invite.expires_at) > new Date() && invite.uses < invite.max_uses;
        return <li key={invite.id}><span className="cm-person"><strong>Convite de {roleLabels[invite.role].toLowerCase()} · {invite.uses}/{invite.max_uses} usos</strong><small>{active ? `Válido até ${formatDay(invite.expires_at)}` : invite.revoked_at ? 'Cancelado' : 'Encerrado'}</small></span>
          {active && <button className="text-button" disabled={busy} onClick={() => run({ action: 'revoke_invitation', invitation: invite.id }, 'Convite cancelado.')}>Cancelar</button>}</li>;
      })}</ul></>}
    </div>}

    {modal === 'post' && <Modal title="Publicar no mural" onClose={() => setModal(null)}><form className="entry-form" onSubmit={async event => {
      event.preventDefault(); const f = new FormData(event.currentTarget);
      if (await run({ action: 'create_post', space: space.id, kind: f.get('kind'), title: f.get('title'), body: f.get('body'), link: f.get('link'), date: f.get('date') || null, pinned: f.get('pinned') === 'on' }, 'Publicado.')) setModal(null);
    }}>
      <label htmlFor="post-kind">Tipo</label><select id="post-kind" name="kind"><option value="announcement">Aviso</option><option value="material">Material (link, vídeo, arquivo no Drive)</option><option value="event">Data importante (prova, entrega)</option></select>
      <label htmlFor="post-title">Título</label><input id="post-title" name="title" required maxLength={160} />
      <label htmlFor="post-body">Mensagem</label><textarea id="post-body" name="body" rows={4} maxLength={10000} />
      <label htmlFor="post-link">Link (opcional)</label><input id="post-link" name="link" type="url" placeholder="https://" maxLength={2000} />
      <label htmlFor="post-date">Data (opcional)</label><input id="post-date" name="date" type="date" />
      <label className="cm-check"><input type="checkbox" name="pinned" /> Fixar no topo</label>
      <div className="form-footer"><button className="button primary" disabled={busy}>Publicar</button></div>
    </form></Modal>}

    {modal === 'poll' && <Modal title="Nova enquete" onClose={() => setModal(null)}><form className="entry-form" onSubmit={async event => {
      event.preventDefault(); const f = new FormData(event.currentTarget);
      const options = String(f.get('options') ?? '').split('\n').map(line => line.trim()).filter(Boolean);
      if (options.length < 2) { setMessage('A enquete precisa de pelo menos duas opções.'); return; }
      if (await run({ action: 'create_poll', space: space.id, question: f.get('question'), options: options.slice(0, 10) }, 'Enquete criada.')) setModal(null);
    }}>
      <label htmlFor="poll-question">Pergunta</label><input id="poll-question" name="question" required maxLength={300} />
      <label htmlFor="poll-options">Opções (uma por linha, até 10)</label><textarea id="poll-options" name="options" rows={4} required placeholder={'Segunda\nQuarta'} />
      <p className="muted small">O voto é secreto: cada pessoa vê só o próprio voto e o total.</p>
      <div className="form-footer"><button className="button primary" disabled={busy}>Criar enquete</button></div>
    </form></Modal>}

    {modal === 'work' && <NewWork overview={data} busy={busy} onClose={() => setModal(null)} onCreated={async ids => { setModal(null); await load(); onChanged(); if (ids.length === 1) onOpenWork(ids[0]); }} setBusy={setBusy} setMessage={setMessage} />}

    {modal === 'group' && <Modal title="Novo grupo" onClose={() => setModal(null)}><form className="entry-form" onSubmit={async event => {
      event.preventDefault(); const f = new FormData(event.currentTarget);
      if (await run({ action: 'create_space', kind: 'group', name: f.get('name'), parent: space.id, description: f.get('description') ?? '', color: f.get('color') }, 'Grupo criado.')) setModal(null);
    }}>
      <label htmlFor="group-name">Nome do grupo</label><input id="group-name" name="name" required maxLength={160} placeholder="Ex.: Ética · Grupo 1" />
      <label htmlFor="group-description">Descrição (opcional)</label><input id="group-description" name="description" maxLength={2000} />
      <label htmlFor="group-color">Cor</label><select id="group-color" name="color">{spaceColors.map(color => <option key={color} value={color}>{colorNames[color]}</option>)}</select>
      <div className="form-footer"><button className="button primary" disabled={busy}>Criar grupo</button></div>
    </form></Modal>}

    {modal === 'member' && <Modal title={`Adicionar a ${space.name}`} onClose={() => setModal(null)}><form className="entry-form" onSubmit={async event => {
      event.preventDefault(); const f = new FormData(event.currentTarget);
      if (await run({ action: 'add_member', space: space.id, email: String(f.get('email') ?? '').trim(), role: f.get('role') }, 'Pessoa adicionada.')) setModal(null);
    }}>
      <p className="muted small">A pessoa precisa ter entrado no Jornada Plena pelo menos uma vez com este e-mail. Se ainda não entrou, use o link de convite.</p>
      <label htmlFor="member-email">E-mail da conta Google</label><input id="member-email" name="email" type="email" required maxLength={254} />
      <label htmlFor="member-role">Papel</label><select id="member-role" name="role"><option value="student">Aluno(a)</option><option value="leader">Líder</option><option value="assistant">Professor(a) auxiliar</option>{access.is_master && <><option value="teacher">Professor(a)</option><option value="owner">Responsável</option></>}</select>
      <div className="form-footer"><button className="button primary" disabled={busy}>Adicionar</button></div>
    </form></Modal>}

    {modal === 'invite' && <Modal title="Link de convite" onClose={() => setModal(null)}>
      {link ? <div className="entry-form"><p>Envie este link no grupo da turma. Quem entrar pelo link cai direto em <strong>{space.name}</strong>{space.kind === 'group' ? ' (e na sala)' : ''}.</p>
        <label htmlFor="invite-link">Link</label><input id="invite-link" readOnly value={link} onFocus={event => event.currentTarget.select()} />
        <div className="form-footer"><button className="button primary" onClick={() => navigator.clipboard.writeText(link).then(() => setMessage('Link copiado.'), () => setMessage('Copie o link manualmente.'))}><Copy size={16} aria-hidden="true" />Copiar link</button></div></div>
        : <form className="entry-form" onSubmit={async event => {
          event.preventDefault(); const f = new FormData(event.currentTarget);
          const result = await run({ action: 'create_invitation', space: space.id, role: f.get('role') ?? 'student', days: Number(f.get('days')), uses: Number(f.get('uses')) }, 'Convite criado.');
          if (result && typeof result === 'object' && 'link' in result) setLink(String((result as { link: string }).link));
        }}>
          <label htmlFor="invite-role">Quem entra vira</label><select id="invite-role" name="role"><option value="student">Aluno(a)</option>{access.can_manage && <option value="leader">Líder</option>}</select>
          <div className="form-grid"><div><label htmlFor="invite-days">Válido por (dias)</label><input id="invite-days" name="days" type="number" min={1} max={60} defaultValue={7} /></div>
            <div><label htmlFor="invite-uses">Máximo de pessoas</label><input id="invite-uses" name="uses" type="number" min={1} max={500} defaultValue={60} /></div></div>
          <div className="form-footer"><button className="button primary" disabled={busy}>Gerar link</button></div>
        </form>}
    </Modal>}

    {modal === 'settings' && <Modal title={`Configurar ${kindLabels[space.kind].toLowerCase()}`} onClose={() => setModal(null)}><form className="entry-form" onSubmit={async event => {
      event.preventDefault(); const f = new FormData(event.currentTarget);
      if (await run({ action: 'update_space', space: space.id, name: f.get('name'), description: f.get('description') ?? '', color: f.get('color') }, 'Configuração salva.')) setModal(null);
    }}>
      <label htmlFor="space-name">Nome</label><input id="space-name" name="name" required maxLength={160} defaultValue={space.name} />
      <label htmlFor="space-description">Descrição</label><textarea id="space-description" name="description" rows={3} maxLength={2000} defaultValue={space.description} />
      <label htmlFor="space-color">Cor</label><select id="space-color" name="color" defaultValue={space.color}>{spaceColors.map(color => <option key={color} value={color}>{colorNames[color]}</option>)}</select>
      <div className="form-footer">
        <button type="button" className="button outline" disabled={busy} onClick={async () => { if (await run({ action: 'archive_space', space: space.id, archived: !space.archived_at }, space.archived_at ? 'Reaberto.' : 'Arquivado.')) setModal(null); }}>{space.archived_at ? 'Reabrir' : 'Arquivar'}</button>
        <button className="button primary" disabled={busy}>Salvar</button>
      </div>
    </form></Modal>}
  </section>;
}

function NewWork({ overview, busy, onClose, onCreated, setBusy, setMessage }: {
  overview: SpaceOverview; busy: boolean; onClose: () => void; onCreated: (ids: string[]) => void;
  setBusy: (value: boolean) => void; setMessage: (value: string) => void;
}) {
  const isClass = overview.space.kind === 'class';
  const [targets, setTargets] = useState<string[]>(isClass && overview.groups.length ? overview.groups.filter(group => !group.archived_at).map(group => group.id) : [overview.space.id]);
  return <AssignmentForm title="Novo trabalho em grupo" busy={busy} withParts onClose={onClose} onSubmit={async values => {
    if (!targets.length) { setMessage('Escolha pelo menos um grupo.'); return; }
    setBusy(true);
    try {
      const ids = await api<string[]>('/api/work', { action: 'create_assignments', spaces: targets, title: values.title, subject: values.subject, instructions: values.instructions, rules: values.rules, style: values.style, due: values.due, parts: values.parts ?? [] });
      setMessage(targets.length > 1 ? `Trabalho criado para ${targets.length} grupos.` : 'Trabalho criado.');
      onCreated(ids ?? []);
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível criar.'); }
    finally { setBusy(false); }
  }}>
    {isClass && <fieldset className="cm-targets"><legend>Para quem</legend>
      <label className="cm-check"><input type="checkbox" checked={targets.includes(overview.space.id)} onChange={event => setTargets(list => event.target.checked ? [...list, overview.space.id] : list.filter(item => item !== overview.space.id))} /> A sala toda ({overview.space.name})</label>
      {overview.groups.filter(group => !group.archived_at).map(group => <label key={group.id} className="cm-check"><input type="checkbox" checked={targets.includes(group.id)} onChange={event => setTargets(list => event.target.checked ? [...list, group.id] : list.filter(item => item !== group.id))} /> {group.name}</label>)}
      <p className="muted small">Cada grupo recebe a sua cópia do trabalho e só enxerga a própria.</p>
    </fieldset>}
  </AssignmentForm>;
}
