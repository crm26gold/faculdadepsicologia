'use client';
import { useState } from 'react';
import { Archive, Download, MessageSquarePlus, Pencil, Pin, Search, Trash2 } from 'lucide-react';
import { conversationText, sortConversations, type Conversation } from '@/lib/conversations';
import type { ConversationManager } from './use-conversations';
import { Modal } from './modal';

export function ConversationHistory({ manager, cloud, locked, onOpen, onNew, onClose }: {
  manager: ConversationManager; cloud: boolean; locked: boolean; onOpen: (item: Conversation) => Promise<void>; onNew: () => Promise<void>; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pinned' | 'archived'>('all');
  const [editing, setEditing] = useState('');
  const [title, setTitle] = useState('');
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const items = sortConversations(manager.items.filter(item => item.messages.length || item.pinned), search, filter);
  async function run(action: () => Promise<void>) {
    setBusy(true); setProblem('');
    try { await action(); } catch (error) { setProblem(error instanceof Error ? error.message : 'Não consegui concluir. Sua conversa foi preservada.'); }
    finally { setBusy(false); }
  }
  function download(item: Conversation) {
    const url = URL.createObjectURL(new Blob([conversationText(item)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `jornada-conversa-${item.id}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const disabled = locked || busy;
  return <Modal title="Suas conversas" onClose={onClose}>
    <div className="conversation-manager">
      <p className="muted">Retome uma conversa por voz ou por texto. Os registros que você criou continuam na Jornada.</p>
      {manager.hasLegacy && <section className="conversation-delete"><strong>Encontrei conversas antigas neste aparelho</strong><p>Recupere somente se esse histórico for seu. Ele continua neste aparelho até você escolher salvar cada conversa na sua conta.</p><button type="button" className="button outline" disabled={disabled} onClick={manager.recoverLegacy}>Recuperar histórico deste aparelho</button></section>}
      <div className="conversation-search"><Search size={18} aria-hidden="true" /><label className="sr-only" htmlFor="conversation-search">Buscar nas conversas</label><input id="conversation-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por assunto ou mensagem" /></div>
      <div className="conversation-filters" role="group" aria-label="Filtrar conversas">
        {([['all', 'Todas'], ['pinned', 'Fixadas'], ['archived', 'Arquivadas']] as const).map(([value, label]) => <button key={value} type="button" className={`button ${filter === value ? 'primary' : 'outline'}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
        <button type="button" className="button outline" disabled={disabled} onClick={() => void run(onNew)}><MessageSquarePlus size={16} aria-hidden="true" />Nova conversa</button>
      </div>
      {(problem || manager.error) && <div className="assistant-problem" role="alert"><p>{problem || manager.error}</p>{cloud && <button type="button" className="text-button" disabled={disabled} onClick={() => void run(manager.reload)}>Recarregar histórico da conta</button>}</div>}
      {deleting && <section className="conversation-delete" aria-label="Confirmar exclusão da conversa">
        <strong>Excluir “{deleting.title}”?</strong><p>O histórico desta conversa será removido. As anotações, compromissos e outros registros criados nela continuam no seu espaço.</p>
        <div className="button-row"><button type="button" className="button danger" disabled={disabled} onClick={() => void run(async () => { await manager.remove(deleting.id); setDeleting(null); })}>Excluir conversa</button><button type="button" className="button outline" onClick={() => setDeleting(null)}>Manter conversa</button></div>
      </section>}
      <ul className="conversation-list">{items.map(item => <li key={item.id} className={item.id === manager.active?.id ? 'current' : ''}>
        {editing === item.id ? <form className="conversation-rename" onSubmit={event => { event.preventDefault(); if (title.trim()) { manager.edit(item.id, { title: title.trim() }); setEditing(''); } }}>
          <label htmlFor={`title-${item.id}`}>Nome da conversa</label><input id={`title-${item.id}`} autoFocus value={title} maxLength={100} onChange={event => setTitle(event.target.value)} />
          <div className="button-row"><button className="button primary" disabled={disabled || !title.trim()}>Salvar nome</button><button type="button" className="text-button" onClick={() => setEditing('')}>Cancelar</button></div>
        </form> : <button type="button" className="conversation-open" disabled={disabled} onClick={() => void run(() => onOpen(item))}>
          <strong>{item.pinned && <Pin size={14} aria-label="Fixada" />}{item.title}</strong><small>{new Date(item.updatedAt).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {item.mode === 'voice' ? 'Voz' : item.mode === 'mixed' ? 'Voz e texto' : 'Texto'}{item.id === manager.active?.id ? ' · Atual' : ''}{item.archived ? ' · Arquivada' : ''}</small>
          <span>{item.messages.at(-1)?.text.slice(0, 120)}</span>
        </button>}
        <div className="conversation-actions">
          <button type="button" className="icon-button" disabled={disabled} aria-label={`Renomear: ${item.title}`} title="Renomear" onClick={() => { setEditing(item.id); setTitle(item.title); }}><Pencil size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-button" disabled={disabled} aria-label={`${item.pinned ? 'Desafixar' : 'Fixar'}: ${item.title}`} title={item.pinned ? 'Desafixar' : 'Fixar'} aria-pressed={item.pinned} onClick={() => manager.edit(item.id, { pinned: !item.pinned })}><Pin size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-button" disabled={disabled} aria-label={`${item.archived ? 'Desarquivar' : 'Arquivar'}: ${item.title}`} title={item.archived ? 'Desarquivar' : 'Arquivar'} onClick={() => manager.edit(item.id, { archived: !item.archived })}><Archive size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-button" aria-label={`Exportar: ${item.title}`} title="Exportar texto" onClick={() => download(item)}><Download size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-button" disabled={disabled} aria-label={`Excluir: ${item.title}`} title="Excluir conversa" onClick={() => setDeleting(item)}><Trash2 size={16} aria-hidden="true" /></button>
          <small>{item.synced ? item.dirty ? item.conflict ? 'Versões diferentes' : 'Aguardando sincronizar' : item.revision ? 'Guardada na conta' : 'Nova conversa' : 'Neste aparelho'}</small>
          {cloud && !item.synced && <button type="button" className="text-button" disabled={disabled} onClick={() => manager.edit(item.id, { synced: true })}>Salvar na minha conta</button>}
        </div>
      </li>)}</ul>
      {!items.length && <p className="conversation-empty">{search ? 'Nenhuma conversa corresponde à busca.' : filter === 'all' ? 'Suas conversas vão aparecer aqui. Comece por uma chamada ou uma mensagem.' : 'Nenhuma conversa neste filtro.'}</p>}
      {manager.hasMore && <button type="button" className="button outline" disabled={disabled} onClick={() => void run(manager.loadMore)}>Carregar mais conversas da conta</button>}
      {manager.hasMore && <p className="muted small">A busca considera as conversas carregadas. Carregue mais para encontrar outros assuntos.</p>}
      <p className="assistant-history-note">Conversas antigas deste aparelho só são enviadas para sua conta quando você toca em “Salvar na minha conta”. Novas conversas, com a conta conectada, são sincronizadas. O áudio da chamada não é gravado pela Jornada.</p>
    </div>
  </Modal>;
}
