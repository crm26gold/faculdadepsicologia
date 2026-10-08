'use client';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, CalendarPlus, Check, ClipboardCopy, FileText, MessageSquare, Pencil, Plus, Printer, RotateCcw, Send, Trash2, UserRound } from 'lucide-react';
import { Modal } from '../modal';
import { api, formatDay } from './client';
import { DocView } from './doc-view';
import { docFonts, statusLabels, type AssignmentDetail, type DocStyle, type Part } from '@/lib/community';
import { docIsEmpty, docToHtml, escapeHtml, sanitizeDoc, wordCount, type PartDoc } from '@/lib/doc';
import type { AgendaAssignment, AgendaLink } from '@/lib/assignment-agenda';

const PartEditor = dynamic(() => import('./part-editor'), { ssr: false, loading: () => <p className="muted">Abrindo editor…</p> });

export function styleOf(style: DocStyle) {
  return { font: style.font ?? 'Arial', size: style.size ?? 12, spacing: style.spacing ?? 1.5, align: style.align ?? 'justify' };
}

export function AssignmentView({ id, me, onBack, onChanged, onAddToAgenda, onMoveAgendaTask }: {
  id: string; me: string; onBack: () => void; onChanged: () => void;
  onAddToAgenda?: (assignment: AgendaAssignment) => AgendaLink | null;
  onMoveAgendaTask?: (taskId: string, due: string) => boolean;
}) {
  const [detail, setDetail] = useState<AssignmentDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [agendaMove, setAgendaMove] = useState<{ taskId: string; due: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'parts' | 'final' | 'about'>('parts');
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<PartDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<'assignment' | 'new-part' | Part | null>(null);

  const load = useCallback(async () => {
    try { setDetail(await api<AssignmentDetail>(`/api/work?id=${id}`)); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o trabalho.'); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const names = useMemo(() => new Map((detail?.people ?? []).map(person => [person.user_id, person.display_name || 'Sem nome'])), [detail]);
  const nameOf = (userId: string | null) => userId ? names.get(userId) ?? 'Alguém da equipe' : 'Ex-membro';
  const assigneeName = (part: Part) => part.assignee_id ? nameOf(part.assignee_id) : part.assignee_label || 'Sem responsável';
  const members = (detail?.people ?? []).filter(person => person.is_direct);
  const part = detail?.parts.find(item => item.id === selected) ?? null;
  const canLead = !!detail?.access.can_lead;
  const canEdit = !!part && (canLead || part.assignee_id === me);

  function open(next: Part | null) {
    if (dirty && !window.confirm('Há alterações não salvas nesta parte. Descartar?')) return;
    setSelected(next?.id ?? ''); setDraft(next ? sanitizeDoc(next.content) : null); setDirty(false); setMessage('');
    if (next && window.matchMedia('(max-width: 900px)').matches) requestAnimationFrame(() => document.querySelector('.cm-part-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage('');
    try { await api('/api/work', body); setMessage(done); await load(); onChanged(); return true; }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Falha ao salvar.'); return false; }
    finally { setBusy(false); }
  }

  async function savePart(status: Part['status'] | null, done: string) {
    if (!part) return;
    const body: Record<string, unknown> = { action: 'save_part', part: part.id, status };
    if (draft && canEdit) body.content = draft;
    // Counted as saved from the moment it is sent, so opening another part meanwhile does not ask to discard;
    // a failed save marks it unsaved again.
    setDirty(false);
    if (!(await run(body, done))) setDirty(true);
  }

  const commentBox = useRef<HTMLTextAreaElement>(null);
  async function comment(kind: 'comment' | 'revision_request') {
    if (!part || !commentBox.current) return;
    const body = commentBox.current.value.trim();
    if (!body) { setMessage(kind === 'revision_request' ? 'Explique o que precisa ser revisado.' : 'Escreva o comentário antes de enviar.'); return; }
    if (await run({ action: 'add_comment', part: part.id, kind, body }, kind === 'revision_request' ? 'Revisão pedida. A parte voltou para ajustes.' : 'Comentário enviado.') && commentBox.current) commentBox.current.value = '';
  }

  async function move(index: number, step: -1 | 1) {
    if (!detail) return;
    const item = detail.parts[index], other = detail.parts[index + step];
    if (!item || !other) return;
    // Troca as posições das duas partes (normaliza empates usando o índice).
    const a = Math.min(1000, index + step), b = Math.min(1000, index);
    await run({ action: 'update_part', part: item.id, title: item.title, assignee: item.assignee_id, label: item.assignee_label, position: a }, 'Ordem atualizada.');
    await run({ action: 'update_part', part: other.id, title: other.title, assignee: other.assignee_id, label: other.assignee_label, position: b }, 'Ordem atualizada.');
  }

  if (error) return <section className="cm-page"><button className="text-button" onClick={onBack}><ArrowLeft size={14} /> Voltar</button><div className="error-banner" role="alert">{error}</div></section>;
  if (!detail) return <p role="status" className="loading-panel">Abrindo trabalho…</p>;
  const { assignment } = detail;
  const done = detail.parts.filter(item => item.status === 'submitted' || item.status === 'approved').length;
  const progress = detail.parts.length ? Math.round(done / detail.parts.length * 100) : 0;
  const style = styleOf(assignment.doc_style);
  const partComments = detail.comments.filter(item => item.part_id === selected);

  return <section className="cm-page">
    <div className="cm-crumbs"><button className="text-button" onClick={() => { if (!dirty || window.confirm('Há alterações não salvas. Sair mesmo assim?')) onBack(); }}><ArrowLeft size={14} aria-hidden="true" /> Voltar</button>
      <span>{detail.path.map(item => item.name).join(' › ')}</span></div>
    <header className="cm-hero">
      <div>
        <span className="eyebrow">Trabalho em grupo{assignment.subject_name ? ` · ${assignment.subject_name}` : ''}</span>
        <h2>{assignment.title}</h2>
        <p>{assignment.due_date ? `Entrega: ${formatDay(assignment.due_date, { weekday: 'long', day: 'numeric', month: 'long' })}` : 'Sem data de entrega'} · {assignment.status === 'open' ? 'Em produção' : assignment.status === 'delivered' ? 'Entregue' : 'Arquivado'}</p>
        <div className="cm-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={`${done} de ${detail.parts.length} partes entregues`}><span style={{ inlineSize: `${progress}%` }} /></div>
        <small>{done} de {detail.parts.length} partes entregues</small>
      </div>
      <div className="button-row">
        {assignment.due_date && onAddToAgenda && <button className="button outline" onClick={() => {
          const link = onAddToAgenda({ id: assignment.id, title: assignment.title, due: assignment.due_date! });
          setAgendaMove(link?.status === 'moved' ? { taskId: link.task.id, due: link.due } : null);
          setMessage(!link ? 'Não foi possível adicionar à agenda agora.'
            : link.status === 'added' ? 'Entrega adicionada à sua agenda pessoal.'
            : link.status === 'exists' ? `Já está na sua agenda (${formatDay(link.task.date, { day: '2-digit', month: '2-digit' })}${link.task.done ? ', concluída' : ''}).`
            : `Já está na sua agenda para ${formatDay(link.task.date, { day: '2-digit', month: '2-digit' })}, mas a entrega agora é ${formatDay(link.due, { day: '2-digit', month: '2-digit' })}.`);
        }}><CalendarPlus size={16} aria-hidden="true" />Na minha agenda</button>}
        {canLead && <button className="button outline" onClick={() => setEditing('assignment')}><Pencil size={16} aria-hidden="true" />Editar trabalho</button>}
      </div>
    </header>
    {message && <p className="cm-message" role="status">{message}
      {agendaMove && onMoveAgendaTask && <> <button type="button" className="text-button" onClick={() => {
        const moved = onMoveAgendaTask(agendaMove.taskId, agendaMove.due);
        setAgendaMove(null);
        setMessage(moved ? `Data da entrega atualizada na sua agenda: ${formatDay(agendaMove.due, { day: '2-digit', month: '2-digit' })}.` : 'Não foi possível atualizar a data agora.');
      }}>Mudar para {formatDay(agendaMove.due, { day: '2-digit', month: '2-digit' })}</button></>}</p>}

    <div className="planning-nav-bar" role="tablist" aria-label="Seções do trabalho">
      <button type="button" role="tab" aria-selected={tab === 'parts'} className={`planning-tab ${tab === 'parts' ? 'active' : ''}`} onClick={() => setTab('parts')}>Partes <span className="count-pill">{detail.parts.length}</span></button>
      <button type="button" role="tab" aria-selected={tab === 'about'} className={`planning-tab ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>Instruções</button>
      <button type="button" role="tab" aria-selected={tab === 'final'} className={`planning-tab ${tab === 'final' ? 'active' : ''}`} onClick={() => setTab('final')}>Documento final</button>
    </div>

    {tab === 'about' && <div className="cm-grid-2">
      <article className="panel"><h3>Instruções</h3>{assignment.instructions ? <p className="cm-pre">{assignment.instructions}</p> : <p className="muted">Sem instruções registradas.</p>}</article>
      <article className="panel"><h3>Normas de formatação</h3>{assignment.format_rules && <p className="cm-pre">{assignment.format_rules}</p>}
        <ul className="cm-style-list"><li>Fonte: <strong>{style.font}</strong></li><li>Tamanho: <strong>{style.size}</strong></li><li>Espaçamento: <strong>{String(style.spacing).replace('.', ',')}</strong></li><li>Alinhamento: <strong>{style.align === 'justify' ? 'justificado' : 'à esquerda'}</strong></li></ul>
        <p className="muted small">O documento final segue este padrão automaticamente, para todas as partes.</p></article>
    </div>}

    {tab === 'parts' && <div className="cm-work-layout">
      <aside className="cm-part-list" aria-label="Partes do trabalho">
        {detail.parts.map((item, index) => <div key={item.id} className={`cm-part-item ${item.id === selected ? 'selected' : ''}`}>
          <button className="cm-part-open" onClick={() => open(item)}>
            <span className={`cm-status ${item.status}`}>{statusLabels[item.status]}</span>
            <strong>{item.title}</strong>
            <small><UserRound size={12} aria-hidden="true" />{assigneeName(item)}{item.assignee_id === me ? ' · você' : ''}</small>
            {item.submitted_by && item.submitted_by !== item.assignee_id && <small className="cm-behalf">Enviada por {nameOf(item.submitted_by)} em nome de {assigneeName(item)}</small>}
          </button>
          {canLead && <div className="cm-part-tools">
            <button className="icon-button" aria-label={`Subir ${item.title}`} disabled={busy || index === 0} onClick={() => void move(index, -1)}><ArrowUp size={15} /></button>
            <button className="icon-button" aria-label={`Descer ${item.title}`} disabled={busy || index === detail.parts.length - 1} onClick={() => void move(index, 1)}><ArrowDown size={15} /></button>
            <button className="icon-button" aria-label={`Editar ${item.title}`} disabled={busy} onClick={() => setEditing(item)}><Pencil size={15} /></button>
          </div>}
        </div>)}
        {!detail.parts.length && <p className="muted">Nenhuma parte ainda.{canLead ? ' Divida o trabalho em partes e escolha quem faz cada uma.' : ''}</p>}
        {canLead && <button className="button outline full-width" onClick={() => setEditing('new-part')}><Plus size={16} aria-hidden="true" />Nova parte</button>}
      </aside>

      <div className="cm-part-panel">
        {!part ? <div className="empty-state compact"><FileText size={34} aria-hidden="true" /><h3>Escolha uma parte</h3><p>Abra a sua parte para escrever. Quando terminar, entregue: o grupo e a professora acompanham aqui.</p></div> : <>
          <div className="cm-part-head">
            <div><span className={`cm-status ${part.status}`}>{statusLabels[part.status]}</span><h3>{part.title}</h3><small>Responsável: {assigneeName(part)}{part.submitted_at ? ` · entregue em ${formatDay(part.submitted_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</small></div>
          </div>
          {canEdit && assignment.status === 'open'
            ? <PartEditor key={part.id} value={draft ?? sanitizeDoc(part.content)} disabled={busy} label={`Texto da parte ${part.title}`} onChange={doc => { setDraft(doc); setDirty(true); }} />
            : <article className="cm-doc-read"><DocView doc={sanitizeDoc(part.content)} /></article>}
          <div className="button-row cm-part-actions">
            {canEdit && assignment.status === 'open' && <>
              <button className="button outline" disabled={busy || !dirty} onClick={() => savePart(null, 'Rascunho salvo.')}>Salvar rascunho</button>
              <button className="button primary" disabled={busy || docIsEmpty(draft ?? sanitizeDoc(part.content))} onClick={() => savePart('submitted', part.assignee_id === me || !part.assignee_id ? 'Parte entregue. Obrigado!' : `Parte entregue em nome de ${assigneeName(part)}.`)}><Send size={16} aria-hidden="true" />{part.assignee_id && part.assignee_id !== me ? 'Entregar em nome' : 'Entregar'}</button>
              {(part.status === 'submitted' || part.status === 'approved') && (canLead || part.status === 'submitted') && <button className="button outline" disabled={busy} onClick={() => savePart('pending', 'A parte voltou para rascunho.')}><RotateCcw size={16} aria-hidden="true" />Voltar a rascunho</button>}
            </>}
            {canLead && part.status === 'submitted' && <button className="button primary" disabled={busy} onClick={() => savePart('approved', 'Parte aprovada.')}><Check size={16} aria-hidden="true" />Aprovar</button>}
            {!(canEdit && assignment.status === 'open') && <span className="muted small">{wordCount(sanitizeDoc(part.content))} palavras</span>}
          </div>
          <section className="cm-comments" aria-label="Conversa sobre esta parte">
            <h4><MessageSquare size={15} aria-hidden="true" />Conversa</h4>
            {partComments.map(item => <div key={item.id} className={`cm-comment ${item.kind === 'revision_request' ? 'revision' : ''} ${item.resolved_at ? 'resolved' : ''}`}>
              <strong>{nameOf(item.author_id)}{item.kind === 'revision_request' ? ' · pediu revisão' : ''}</strong>
              <p className="cm-pre">{item.body}</p>
              <small>{formatDay(item.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{item.resolved_at ? ' · resolvido' : ''}</small>
              {!item.resolved_at && (canLead || item.author_id === me) && <button className="text-button" disabled={busy} onClick={() => run({ action: 'resolve_comment', comment: item.id }, 'Marcado como resolvido.')}>Marcar como resolvido</button>}
            </div>)}
            {!partComments.length && <p className="muted small">Nenhuma mensagem sobre esta parte ainda.</p>}
            <div className="cm-comment-form">
              <label htmlFor="part-comment" className="sr-only">Escrever comentário</label>
              <textarea id="part-comment" ref={commentBox} rows={2} maxLength={4000} placeholder="Escreva uma mensagem para o grupo sobre esta parte…" />
              <div className="button-row"><button type="button" className="button outline" disabled={busy} onClick={() => comment('comment')}>Comentar</button>
                {canLead && <button type="button" className="button outline" disabled={busy} onClick={() => comment('revision_request')}>Pedir revisão</button>}</div>
            </div>
          </section>
        </>}
      </div>
    </div>}

    {tab === 'final' && <FinalDocument detail={detail} assigneeName={assigneeName} />}

    {editing === 'assignment' && <AssignmentForm title="Editar trabalho" initial={assignment} busy={busy} onClose={() => setEditing(null)} onDelete={async () => {
      if (!window.confirm('Excluir este trabalho, todas as partes e comentários? Isso não pode ser desfeito.')) return;
      if (await run({ action: 'delete_assignment', assignment: assignment.id }, 'Trabalho excluído.')) { setEditing(null); onBack(); }
    }} onSubmit={async values => { if (await run({ action: 'update_assignment', assignment: assignment.id, ...values, status: values.status ?? assignment.status }, 'Trabalho atualizado.')) setEditing(null); }} />}
    {editing && editing !== 'assignment' && <Modal title={editing === 'new-part' ? 'Nova parte' : 'Editar parte'} onClose={() => setEditing(null)}>
      <PartMetaForm part={editing === 'new-part' ? null : editing} members={members.map(person => ({ id: person.user_id, name: person.display_name || 'Sem nome' }))} busy={busy}
        onDelete={editing === 'new-part' ? undefined : async () => {
          if (!window.confirm('Excluir esta parte e o texto dela?')) return;
          if (await run({ action: 'delete_part', part: (editing as Part).id }, 'Parte excluída.')) { setEditing(null); open(null); }
        }}
        onSubmit={async values => {
          const ok = editing === 'new-part'
            ? await run({ action: 'add_part', assignment: assignment.id, ...values }, 'Parte criada.')
            : await run({ action: 'update_part', part: (editing as Part).id, position: (editing as Part).position, ...values }, 'Parte atualizada.');
          if (ok) setEditing(null);
        }} />
    </Modal>}
  </section>;
}

function PartMetaForm({ part, members, busy, onSubmit, onDelete }: {
  part: Part | null; members: { id: string; name: string }[]; busy: boolean;
  onSubmit: (values: { title: string; assignee: string | null; label: string }) => void; onDelete?: () => void;
}) {
  const [who, setWho] = useState(part?.assignee_id ?? (part?.assignee_label ? '__label' : ''));
  return <form className="entry-form" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSubmit({ title: String(data.get('title') ?? ''), assignee: who && who !== '__label' ? who : null, label: who === '__label' ? String(data.get('label') ?? '') : '' });
  }}>
    <label htmlFor="part-title">Nome da parte</label>
    <input id="part-title" name="title" required maxLength={160} defaultValue={part?.title ?? ''} placeholder="Ex.: Introdução" />
    <label htmlFor="part-who">Quem faz</label>
    <select id="part-who" value={who} onChange={event => setWho(event.target.value)}>
      <option value="">Ainda sem responsável</option>
      {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
      <option value="__label">Pessoa que não usa o sistema…</option>
    </select>
    {who === '__label' && <><label htmlFor="part-label">Nome da pessoa</label><input id="part-label" name="label" required maxLength={120} defaultValue={part?.assignee_label ?? ''} placeholder="A parte dela pode ser entregue pelo líder" /></>}
    <div className="form-footer">{onDelete && <button type="button" className="button outline" disabled={busy} onClick={onDelete}><Trash2 size={16} aria-hidden="true" />Excluir parte</button>}<button className="button primary" disabled={busy}>Salvar</button></div>
  </form>;
}

export type AssignmentValues = { title: string; subject: string; instructions: string; rules: string; style: DocStyle; due: string | null; parts?: string[]; status?: 'open' | 'delivered' | 'archived' };

export function AssignmentForm({ title, initial, busy, onClose, onSubmit, onDelete, withParts = false, children }: {
  title: string; initial?: AssignmentDetail['assignment']; busy: boolean; onClose: () => void;
  onSubmit: (values: AssignmentValues) => void; onDelete?: () => void; withParts?: boolean; children?: React.ReactNode;
}) {
  const style = styleOf(initial?.doc_style ?? {});
  return <Modal title={title} onClose={onClose}><form className="entry-form" onSubmit={event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    onSubmit({
      title: text('title'), subject: text('subject'), instructions: text('instructions'), rules: text('rules'),
      due: text('due') || null,
      style: { font: text('font') as DocStyle['font'], size: Number(text('size')) as DocStyle['size'], spacing: Number(text('spacing')) as DocStyle['spacing'], align: text('align') as DocStyle['align'] },
      parts: withParts ? text('parts').split('\n').map(line => line.trim()).filter(Boolean).slice(0, 40) : undefined,
      status: initial ? text('status') as AssignmentValues['status'] : undefined,
    });
  }}>
    {children}
    <label htmlFor="work-title">Título do trabalho</label>
    <input id="work-title" name="title" required maxLength={160} defaultValue={initial?.title ?? ''} placeholder="Ex.: Direitos Humanos" />
    <div className="form-grid"><div><label htmlFor="work-subject">Matéria</label><input id="work-subject" name="subject" maxLength={160} defaultValue={initial?.subject_name ?? ''} placeholder="Ex.: Ética" /></div>
      <div><label htmlFor="work-due">Entrega</label><input id="work-due" name="due" type="date" defaultValue={initial?.due_date ?? ''} /></div></div>
    <label htmlFor="work-instructions">Instruções da professora</label>
    <textarea id="work-instructions" name="instructions" rows={5} maxLength={20000} defaultValue={initial?.instructions ?? ''} placeholder="Cole aqui o enunciado, o modelo e o que cada parte deve conter." />
    <label htmlFor="work-rules">Normas (ABNT, capa, referências…)</label>
    <textarea id="work-rules" name="rules" rows={3} maxLength={5000} defaultValue={initial?.format_rules ?? ''} />
    <div className="form-grid">
      <div><label htmlFor="work-font">Fonte</label><select id="work-font" name="font" defaultValue={style.font}>{docFonts.map(font => <option key={font}>{font}</option>)}</select></div>
      <div><label htmlFor="work-size">Tamanho</label><select id="work-size" name="size" defaultValue={String(style.size)}>{[11, 12, 14].map(size => <option key={size} value={size}>{size}</option>)}</select></div>
      <div><label htmlFor="work-spacing">Espaçamento</label><select id="work-spacing" name="spacing" defaultValue={String(style.spacing)}>{[1, 1.15, 1.5, 2].map(value => <option key={value} value={value}>{String(value).replace('.', ',')}</option>)}</select></div>
      <div><label htmlFor="work-align">Alinhamento</label><select id="work-align" name="align" defaultValue={style.align}><option value="justify">Justificado</option><option value="left">À esquerda</option></select></div>
    </div>
    {withParts && <><label htmlFor="work-parts">Partes (uma por linha)</label><textarea id="work-parts" name="parts" rows={4} placeholder={'Introdução\nDesenvolvimento\nConclusão'} /></>}
    {initial && <><label htmlFor="work-status">Situação</label><select id="work-status" name="status" defaultValue={initial.status}><option value="open">Em produção</option><option value="delivered">Entregue</option><option value="archived">Arquivado</option></select></>}
    <div className="form-footer">{onDelete && <button type="button" className="button outline" disabled={busy} onClick={onDelete}><Trash2 size={16} aria-hidden="true" />Excluir</button>}<button className="button primary" disabled={busy}>Salvar</button></div>
  </form></Modal>;
}

function FinalDocument({ detail, assigneeName }: { detail: AssignmentDetail; assigneeName: (part: Part) => string }) {
  const [note, setNote] = useState('');
  const { assignment } = detail;
  const style = styleOf(assignment.doc_style);
  const group = detail.space.name;
  const context = detail.path.slice(0, -1).map(item => item.name).join(' · ');
  const members = [...new Set([
    ...detail.people.filter(person => person.is_direct && person.role !== 'teacher' && person.role !== 'assistant' && person.role !== 'owner').map(person => person.display_name),
    ...detail.parts.filter(part => !part.assignee_id && part.assignee_label && part.assignee_label !== 'Ex-membro').map(part => part.assignee_label),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const missing = detail.parts.filter(part => part.status === 'pending' || part.status === 'needs_revision');
  const date = assignment.due_date ? formatDay(assignment.due_date, { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  function html() {
    const css = `body{font-family:'${style.font}',Arial,sans-serif;font-size:${style.size}pt;line-height:${style.spacing};color:#000;margin:2.5cm 2cm;text-align:${style.align}}h1{font-size:${style.size + 4}pt;text-align:center;margin:0 0 6pt}h2{font-size:${style.size + 2}pt;margin:18pt 0 6pt;text-align:left}h3{font-size:${style.size + 1}pt;margin:12pt 0 4pt;text-align:left}p{margin:0 0 8pt}.cover{text-align:center;margin-bottom:24pt}.cover p{margin:2pt 0}blockquote{margin:6pt 0 6pt 4cm;font-size:${Math.max(10, style.size - 2)}pt}@page{margin:0}`;
    const cover = `<div class="cover">${context ? `<p>${escapeHtml(context)}</p>` : ''}<h1>${escapeHtml(assignment.title)}</h1>${assignment.subject_name ? `<p>${escapeHtml(assignment.subject_name)}</p>` : ''}<p>${escapeHtml(group)}</p>${members.length ? `<p>Integrantes: ${escapeHtml(members.join(', '))}</p>` : ''}<p>${escapeHtml(date)}</p></div>`;
    const body = detail.parts.map(part => `<h2>${escapeHtml(part.title)}</h2>${docToHtml(sanitizeDoc(part.content), 1)}`).join('');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(assignment.title)}</title><style>${css}</style></head><body>${cover}${body}</body></html>`;
  }

  async function copy() {
    const content = html();
    const plain = detail.parts.map(part => part.title).join('\n');
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([content], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
      setNote('Copiado! Abra um documento no Google Docs e cole (Ctrl+V). A formatação vem junto.');
    } catch { setNote('Seu navegador bloqueou a cópia. Use "Baixar PDF" ou selecione o texto abaixo e copie.'); }
  }
  function print() {
    const view = window.open('', '_blank');
    if (!view) { setNote('Permita janelas pop-up para gerar o PDF.'); return; }
    view.document.open(); view.document.write(html()); view.document.close();
    view.focus(); setTimeout(() => view.print(), 300);
  }

  return <div className="cm-final">
    <div className="cm-final-bar">
      <p>Tudo junto, na ordem das partes e no padrão definido: <strong>{style.font} {style.size}</strong>, espaçamento {String(style.spacing).replace('.', ',')}.</p>
      <div className="button-row"><button className="button primary" onClick={copy}><ClipboardCopy size={16} aria-hidden="true" />Copiar para o Google Docs</button><button className="button outline" onClick={print}><Printer size={16} aria-hidden="true" />Baixar PDF</button></div>
    </div>
    {note && <p className="cm-message" role="status">{note}</p>}
    {missing.length > 0 && <p className="cm-warning" role="note">Ainda faltam: {missing.map(part => `${part.title} (${assigneeName(part)})`).join(', ')}. O documento mostra o que já existe.</p>}
    <article className="cm-paper" style={{ fontFamily: `'${style.font}', Arial, sans-serif`, fontSize: `${style.size + 3}px`, lineHeight: style.spacing, textAlign: style.align }}>
      <div className="cm-paper-cover">{context && <p>{context}</p>}<h1>{assignment.title}</h1>{assignment.subject_name && <p>{assignment.subject_name}</p>}<p>{group}</p>{members.length > 0 && <p>Integrantes: {members.join(', ')}</p>}<p>{date}</p></div>
      {detail.parts.map(part => <section key={part.id}><h2>{part.title}</h2><DocView doc={sanitizeDoc(part.content)} offset={1} empty="(parte ainda sem texto)" /></section>)}
    </article>
  </div>;
}
