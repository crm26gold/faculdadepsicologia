'use client';
import { useState, type FormEvent } from 'react';
import { captureNote, CAPTURE_LIMIT, isUnorganized } from '@/lib/capture';
import type { Workspace } from '@/lib/workspace';

export function CaptureInbox({ data, blocked, update, onOpen, status }: {
  data: Workspace; blocked: boolean; status: string;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  onOpen: (id: string) => void;
}) {
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const notes = data.notes.filter(isUnorganized).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const note = captureNote(text, crypto.randomUUID(), new Date().toISOString());
      if (!update(previous => ({ ...previous, notes: [note, ...previous.notes] }))) {
        setMessage('Não foi possível adicionar. Seu texto continua no campo; confira o aviso de salvamento.'); return;
      }
      setText(''); setMessage('Ideia adicionada à lista. Confira o indicador de salvamento antes de sair.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível capturar.'); }
  }
  return <section className="panel capture-inbox" aria-label="Caixa de entrada de ideias">
    <h2>Capture agora. Organize no seu tempo.</h2>
    <p>Uma ideia, uma preocupação, algo para lembrar. Não precisa escolher área, matéria ou caderno agora.</p>
    <form className="entry-form" onSubmit={submit}>
      <label htmlFor="capture-text">O que você quer guardar?</label>
      <textarea id="capture-text" name="capture" rows={5} required maxLength={CAPTURE_LIMIT} value={text} disabled={blocked} onChange={event => setText(event.target.value)} aria-describedby="capture-help" />
      <small id="capture-help">Texto simples, até 10.000 caracteres. A primeira linha será o título. O rascunho só é salvo ao clicar em Guardar ideia.</small>
      <div className="button-row"><button className="button primary" disabled={blocked}>Guardar ideia</button><span>{status}</span></div>
      <p role="status">{message}</p>
    </form>
    <div className="section-heading"><h3>Para organizar ({notes.length})</h3></div>
    <p>Esta lista reúne anotações sem área, matéria ou caderno — incluindo as antigas. Organizar não cria uma cópia nem apaga o conteúdo.</p>
    <ul className="organization-list">{notes.map(note => <li key={note.id}><span><strong>{note.title || 'Sem título'}</strong><small> · {new Date(note.updatedAt).toLocaleDateString('pt-BR')}</small></span><button onClick={() => onOpen(note.id)} aria-label={`Abrir e organizar: ${note.title || 'Sem título'}`}>Abrir e organizar</button></li>)}</ul>
    {!notes.length && <p>Nenhuma anotação pendente de organização.</p>}
  </section>;
}
