'use client';

import { useState, useRef, type FormEvent } from 'react';
import { Camera, FileText, Link as LinkIcon, Mic, Paperclip, Plus, Send, Check } from 'lucide-react';
import { captureNote, CAPTURE_LIMIT, isUnorganized } from '@/lib/capture';
import type { Workspace } from '@/lib/workspace';

export function QuickCaptureWidget({
  data,
  blocked,
  update,
  onOpen,
  status,
  demo = false,
}: {
  data: Workspace;
  blocked: boolean;
  status: string;
  demo?: boolean;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  onOpen: (id: string) => void;
}) {
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const pendingNotes = data.notes
    .filter(isUnorganized)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function submit(event?: FormEvent) {
    if (event) event.preventDefault();
    if (!text.trim()) return;

    try {
      const note = captureNote(text, crypto.randomUUID(), new Date().toISOString());
      if (
        !update(previous => ({
          ...previous,
          notes: [note, ...previous.notes],
        }))
      ) {
        setMessage('Não foi possível adicionar. Seu texto continua salvo no campo.');
        return;
      }
      setText('');
      setMessage('Ideia guardada no caderno! Organize quando quiser.');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível capturar.');
    }
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const photoNoteText = `📸 Foto da Lousa / Registro (${new Date().toLocaleDateString('pt-BR')})\nArquivo: ${file.name}\n${text}`;
    setText(photoNoteText);
  }

  function handleAddLink() {
    const url = prompt('Cole o endereço do link ou artigo de estudo:');
    if (url) {
      setText(prev => (prev ? `${prev}\n🔗 Link: ${url}` : `🔗 Link: ${url}`));
    }
  }

  function handleToggleAudio() {
    setIsRecording(!isRecording);
    if (!isRecording) {
      setText(prev => (prev ? `${prev}\n🎙️ [Nota de áudio gravada em ${new Date().toLocaleTimeString('pt-BR')}]` : `🎙️ [Nota de áudio gravada em ${new Date().toLocaleTimeString('pt-BR')}]`));
    }
  }

  return (
    <section className="panel quick-capture-widget capture-inbox" aria-label="Caixa de entrada de ideias">
      <div className="section-heading">
        <div className="capture-title-group">
          <span className="capture-badge-icon"><FileText size={18} /></span>
          <div>
            <h3>Anota Aqui · Insight Rápido</h3>
            <p>Guarde pensamentos, dúvidas ou fotos de lousa na hora. Depois organize com calma.</p>
          </div>
        </div>
        {pendingNotes.length > 0 && (
          <span className="unorganized-counter-chip">
            {pendingNotes.length} para organizar
          </span>
        )}
      </div>

      <form className="quick-capture-form" onSubmit={submit}>
        <div className="quick-capture-input-box">
          <textarea
            id="capture-text"
            name="capture"
            rows={3}
            required
            maxLength={CAPTURE_LIMIT}
            value={text}
            disabled={blocked}
            onChange={e => setText(e.target.value)}
            placeholder="O que você precisa registrar agora? Uma ideia de aula, citação, insight..."
            aria-label="O que você quer guardar?"
          />

          <div className="capture-toolbar">
            <div className="capture-quick-media">
              {/* CÂMERA / FOTO */}
              {!demo && (
                <input
                  type="file"
                  ref={cameraInputRef}
                  capture="environment"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                  aria-label="Fotografar lousa na hora"
                />
              )}
              <button
                type="button"
                className="media-pill-btn"
                title="Tirar foto na hora"
                onClick={() => {
                  if (demo) {
                    setText(prev => (prev ? `${prev}\n📸 [Foto da Lousa simulada na demo]` : '📸 [Foto da Lousa simulada na demo]'));
                  } else {
                    cameraInputRef.current?.click();
                  }
                }}
              >
                <Camera size={14} />
                <span>Foto / Lousa</span>
              </button>

              {/* ÁUDIO */}
              <button
                type="button"
                className={`media-pill-btn ${isRecording ? 'recording' : ''}`}
                title="Gravar nota de voz rápida"
                onClick={handleToggleAudio}
              >
                <Mic size={14} />
                <span>{isRecording ? 'Gravando…' : 'Áudio'}</span>
              </button>

              {/* LINK */}
              <button
                type="button"
                className="media-pill-btn"
                title="Adicionar link de referência"
                onClick={handleAddLink}
              >
                <LinkIcon size={14} />
                <span>Link</span>
              </button>

              {/* ANEXAR ARQUIVO */}
              {!demo && (
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                  aria-label="Subir arquivo de mídia"
                />
              )}
              <button
                type="button"
                className="media-pill-btn"
                title="Subir arquivo ou imagem"
                onClick={() => {
                  if (demo) {
                    setText(prev => (prev ? `${prev}\n📎 [Arquivo anexado simulado na demo]` : '📎 [Arquivo anexado simulado na demo]'));
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
              >
                <Paperclip size={14} />
                <span>Arquivo</span>
              </button>
            </div>

            <button
              type="submit"
              className="button primary compact-send-btn"
              disabled={blocked || !text.trim()}
              aria-label="Guardar ideia"
            >
              <Send size={14} aria-hidden="true" />
              Guardar ideia
            </button>
          </div>
        </div>

        {message && (
          <p role="status" className="capture-success-msg">
            <Check size={14} /> {message}
          </p>
        )}
      </form>

      {/* RECENT CAPTURES */}
      <div className="unorganized-notes-deck">
        <h4 className="unorganized-deck-title">Para organizar ({pendingNotes.length})</h4>
        {pendingNotes.length > 0 ? (
          <div className="unorganized-chips-grid">
            {pendingNotes.slice(0, 4).map(note => (
              <div key={note.id} className="unorganized-chip-card">
                <div className="chip-content">
                  <strong>{note.title || 'Sem título'}</strong>
                  <small>{new Date(note.updatedAt).toLocaleDateString('pt-BR')}</small>
                </div>
                <button
                  type="button"
                  className="chip-organize-btn"
                  onClick={() => onOpen(note.id)}
                  aria-label={`Abrir e organizar: ${note.title || 'Sem título'}`}
                >
                  Abrir e organizar
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-unorganized-msg">Nenhuma anotação pendente de organização.</p>
        )}
      </div>
    </section>
  );
}
