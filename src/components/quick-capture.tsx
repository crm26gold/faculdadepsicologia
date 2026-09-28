'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, FileText, Link as LinkIcon, Mic, Paperclip, Send, Trash2, Download, Play, Square } from 'lucide-react';
import { captureNote, CAPTURE_LIMIT, isUnorganized } from '@/lib/capture';
import { MEDIA_LIMIT, mediaTypes, safeLink, validMedia } from '@/lib/note-media';
import { saveLocalMedia } from '@/lib/local-media-db';
import { uploadNoteMedia } from '@/lib/upload-note-media';
import type { Workspace } from '@/lib/workspace';

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function QuickCaptureWidget({
  data,
  blocked,
  update,
  onOpen,
  status,
  cloud,
  demo = false,
  ensureSaved,
}: {
  data: Workspace;
  blocked: boolean;
  status: string;
  cloud: boolean;
  demo?: boolean;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  onOpen: (id: string) => void;
  ensureSaved: () => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string>('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [requestingMic, setRequestingMic] = useState(false);
  const [permError, setPermError] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const nativeAudioInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const speechRecognizer = useRef<{ stop: () => void } | null>(null);
  const mounted = useRef(true);
  const submitting = useRef(false);
  const draftId = useRef('');
  const uploadedSource = useRef('');
  const abort = useRef<AbortController | null>(null);
  const recordingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pending = data.notes.filter(isUnorganized).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abort.current?.abort();
      if (recordingInterval.current) clearInterval(recordingInterval.current);
      if (recordingTimeout.current) clearTimeout(recordingTimeout.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      if (speechRecognizer.current) {
        try { speechRecognizer.current.stop(); } catch {}
        speechRecognizer.current = null;
      }
      stream.current?.getTracks().forEach(t => t.stop());
      if (filePreview && filePreview.startsWith('blob:')) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (file || recording || text.trim()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [file, recording, text]);

  function selectFile(value?: File) {
    if (!value || blocked || busy) return;
    if (!validMedia(value.type, value.size)) {
      setMessage('Use JPG, PNG, WebP, GIF ou áudio MP3, M4A, WAV, OGG, WebM de até 25 MB.');
      return;
    }
    if (filePreview && filePreview.startsWith('blob:')) URL.revokeObjectURL(filePreview);
    setFile(value);
    setFilePreview(URL.createObjectURL(value));
    uploadedSource.current = '';
    setMessage('Mídia anexada. Clique em Guardar ideia para salvar no caderno.');
  }

  function clearFile() {
    if (filePreview && filePreview.startsWith('blob:')) URL.revokeObjectURL(filePreview);
    setFile(null);
    setFilePreview('');
    uploadedSource.current = '';
  }

  async function startRecording() {
    if (recorder.current?.state === 'recording') {
      recorder.current.stop();
      return;
    }
    if (blocked || busy || requestingMic) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setPermError(true);
      setMessage('Gravação direta de microfone indisponível neste navegador. Use a opção de gravar pelo aplicativo nativo.');
      return;
    }

    setRequestingMic(true);
    setPermError(false);
    setMessage('Solicitando permissão do microfone…');

    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        media.getTracks().forEach(t => t.stop());
        return;
      }
      stream.current = media;
      const mimeType = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || 'audio/webm';
      const rec = new MediaRecorder(media, { mimeType });
      recorder.current = rec;
      const chunks: Blob[] = [];
      let size = 0;

      rec.ondataavailable = event => {
        if (event.data.size) {
          chunks.push(event.data);
          size += event.data.size;
          if (size >= MEDIA_LIMIT - 1_000_000 && rec.state === 'recording') rec.stop();
        }
      };

      rec.onerror = () => {
        setMessage('Falha na gravação do áudio.');
        media.getTracks().forEach(t => t.stop());
        setRecording(false);
      };

      rec.onstop = () => {
        media.getTracks().forEach(t => t.stop());
        if (recordingInterval.current) clearInterval(recordingInterval.current);
        if (recordingTimeout.current) clearTimeout(recordingTimeout.current);
        if (speechRecognizer.current) {
          try { speechRecognizer.current.stop(); } catch {}
          speechRecognizer.current = null;
        }
        setTranscribing(false);
        if (!mounted.current) return;
        setRecording(false);
        setRecordingSeconds(0);

        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 100) {
          setMessage('Gravação muito curta ou vazia. Tente novamente.');
          return;
        }
        const ext = mimeType.split('/')[1] === 'mp4' ? 'm4a' : mimeType.split('/')[1] || 'webm';
        const recordedFile = new File([blob], `gravacao-audio-${Date.now()}.${ext}`, { type: mimeType });
        selectFile(recordedFile);
        setMessage('Áudio gravado com sucesso! Você pode ouvir abaixo ou clicar em Guardar ideia.');
      };

      rec.start(500);
      setRecording(true);
      setRecordingSeconds(0);
      setMessage('Gravando áudio real do microfone… Fale normalmente.');

      // Speech Recognition for live Portuguese audio transcription
      if (typeof window !== 'undefined') {
        const SpeechRec = (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition ||
                          (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).webkitSpeechRecognition;
        if (SpeechRec) {
          try {
            const recognition = new SpeechRec();
            recognition.lang = 'pt-BR';
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.onresult = (event: any) => {
              let transcript = '';
              for (let i = event.resultIndex; i < event.results.length; ++i) {
                transcript += event.results[i][0].transcript;
              }
              if (transcript.trim()) {
                setText(prev => {
                  const base = prev.trim();
                  return `${base ? base + ' ' : ''}${transcript.trim()}`.slice(0, CAPTURE_LIMIT);
                });
              }
            };
            recognition.onerror = () => {};
            recognition.start();
            speechRecognizer.current = recognition;
            setTranscribing(true);
          } catch {
            // Speech recognition not permitted or supported
          }
        }
      }

      recordingInterval.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);

      recordingTimeout.current = setTimeout(() => {
        if (rec.state === 'recording') rec.stop();
      }, 600_000); // 10 min max
    } catch {
      stream.current?.getTracks().forEach(t => t.stop());
      setPermError(true);
      setMessage('Acesso ao microfone não autorizado. Toque nas instruções abaixo para liberar ou usar o gravador do aparelho.');
    } finally {
      if (mounted.current) setRequestingMic(false);
    }
  }

  function stopRecording() {
    if (speechRecognizer.current) {
      try { speechRecognizer.current.stop(); } catch {}
      speechRecognizer.current = null;
    }
    setTranscribing(false);
    if (recorder.current && recorder.current.state === 'recording') {
      recorder.current.stop();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (blocked || submitting.current || recording || (!text.trim() && !file)) return;
    submitting.current = true;
    setBusy(true);

    try {
      const id = draftId.current || crypto.randomUUID();
      const noteTitle = text.trim() ? text.trim().slice(0, 100) : file ? file.name : 'Nova anotação rápida';
      const note = captureNote(noteTitle, id, new Date().toISOString());

      if (!draftId.current) {
        if (!update(previous => ({ ...previous, notes: [note, ...previous.notes] }))) {
          throw new Error('Não foi possível registrar a ideia. Tente novamente.');
        }
        draftId.current = id;
      }

      await ensureSaved();
      if (!mounted.current) return;

      let content = note.content;

      if (file) {
        if (cloud) {
          abort.current = new AbortController();
          const src = uploadedSource.current || await uploadNoteMedia(id, file, abort.current.signal);
          uploadedSource.current = src;
          await saveLocalMedia(src, file);
          content += file.type.startsWith('image/')
            ? `<p><img src="${src}" alt="${escape(file.name)}" width="100%"></p>`
            : `<p><audio src="${src}" title="${escape(file.name)}" controls></audio></p>`;
        } else {
          // Local/offline mode: store real media in IndexedDB and link via safe /api/note-media source
          const fileId = crypto.randomUUID();
          const ext = mediaTypes[file.type] || (file.type.startsWith('image/') ? 'png' : 'webm');
          const localSrc = `/api/note-media/${fileId}.${ext}`;
          await saveLocalMedia(localSrc, file);
          content += file.type.startsWith('image/')
            ? `<p><img src="${localSrc}" alt="${escape(file.name)}" width="100%"></p>`
            : `<p><audio src="${localSrc}" title="${escape(file.name)}" controls></audio></p>`;
        }
      }

      if (!update(previous => ({
        ...previous,
        notes: previous.notes.map(item => item.id === id ? { ...item, content, title: note.title, updatedAt: new Date().toISOString() } : item),
      }))) {
        throw new Error('Anexo enviado, mas a anotação não foi atualizada. Tente novamente.');
      }

      await ensureSaved();
      if (!mounted.current) return;

      draftId.current = '';
      uploadedSource.current = '';
      setText('');
      clearFile();
      setMessage(cloud ? 'Ideia e mídia sincronizadas na sua conta na nuvem!' : 'Ideia guardada no seu caderno local!');
    } catch (error) {
      if (mounted.current) {
        setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.');
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const locked = blocked || busy;
  const isAudioFile = file && file.type.startsWith('audio/');
  const isImageFile = file && file.type.startsWith('image/');

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <section className="panel quick-capture-widget capture-inbox" aria-label="Caixa de entrada de ideias">
      <div className="section-heading">
        <div className="capture-title-group">
          <span className="capture-badge-icon"><FileText size={18} /></span>
          <div>
            <h3>Anota Aqui · Insight Rápido</h3>
            <p>Guarde pensamentos, fotos de lousa ou áudios na hora. Depois organize com calma. {status}</p>
          </div>
        </div>
        <span className="unorganized-counter-chip">{pending.length} para organizar</span>
      </div>

      <form className="quick-capture-form" onSubmit={submit}>
        <div className="quick-capture-input-box">
          <textarea
            id="capture-text"
            rows={3}
            maxLength={CAPTURE_LIMIT}
            value={text}
            disabled={locked}
            onChange={e => setText(e.target.value)}
            placeholder="O que você precisa registrar agora? Uma ideia de aula, citação, insight..."
            aria-label="O que você quer guardar?"
          />

          {/* ACTIVE RECORDING BANNER */}
          {recording && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#fef2f2', borderTop: '1px solid #fecaca', color: '#991b1b', fontSize: '0.8rem', fontWeight: 600 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#dc2626', animation: 'pulse 1s infinite' }} />
                Gravando áudio real do microfone ({formatTimer(recordingSeconds)})
                {transcribing && <span style={{ marginLeft: 6, color: '#0284c7', fontWeight: 600 }}>· 🎙️ Transcrevendo fala ao vivo...</span>}
              </span>
              <button
                type="button"
                onClick={stopRecording}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#dc2626', color: '#fff', borderRadius: 6, border: 0, fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}
              >
                <Square size={12} fill="#fff" /> Concluir áudio
              </button>
            </div>
          )}

          {/* ATTACHED FILE PREVIEW (AUDIO PLAYER OR IMAGE THUMBNAIL) */}
          {file && filePreview && (
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                  {isAudioFile ? '🎙️ Áudio gravado' : '📷 Foto / Imagem'}: {file.name} ({Math.ceil(file.size / 1024)} KB)
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={filePreview}
                    download={file.name}
                    title="Baixar cópia"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#0369a1', textDecoration: 'none', fontWeight: 600 }}
                  >
                    <Download size={13} /> Baixar
                  </a>
                  <button
                    type="button"
                    onClick={clearFile}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626', background: 'none', border: 0, fontWeight: 600, cursor: 'pointer' }}
                  >
                    <Trash2 size={13} /> Remover
                  </button>
                </div>
              </div>

              {/* REAL NATIVE AUDIO PLAYER FOR RECORDED AUDIO */}
              {isAudioFile && (
                <audio controls src={filePreview} style={{ width: '100%', height: 38, marginTop: 4 }} />
              )}

              {/* REAL IMAGE THUMBNAIL FOR PHOTO/UPLOAD */}
              {isImageFile && (
                <div style={{ maxHeight: 160, overflow: 'hidden', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                  <img src={filePreview} alt="Preview" style={{ width: '100%', maxHeight: 160, objectFit: 'contain', display: 'block', background: '#000' }} />
                </div>
              )}
            </div>
          )}

          {/* PERMISSION HELPER BOX */}
          {permError && (
            <div className="permission-guide-box" role="alert" aria-live="polite">
              <div className="permission-guide-header">
                <span className="permission-guide-title">
                  <Mic size={15} /> Microfone bloqueado ou não autorizado
                </span>
                <button
                  type="button"
                  className="close-guide-btn"
                  onClick={() => setPermError(false)}
                  aria-label="Fechar aviso de permissão"
                >
                  ✕
                </button>
              </div>
              <p className="permission-guide-text">
                O navegador não pôde acessar seu microfone diretamente. Você pode tentar autorizar ou gravar direto com o aplicativo de voz do seu aparelho:
              </p>
              <div className="permission-guide-steps">
                <span>1. Toque no ícone de cadeado 🔒 ou de ajustes na barra de endereços acima.</span>
                <span>2. Acesse <strong>Permissões &gt; Microfone</strong> e marque <strong>Permitir</strong>.</span>
                <span>3. Ou use o atalho abaixo para abrir o gravador nativo do seu celular.</span>
              </div>
              <div className="permission-guide-buttons">
                <button
                  type="button"
                  className="guide-action-btn primary"
                  onClick={() => {
                    setPermError(false);
                    void startRecording();
                  }}
                >
                  🔄 Tentar novamente
                </button>
                {!demo && (
                  <button
                    type="button"
                    className="guide-action-btn secondary"
                    onClick={() => {
                      nativeAudioInput.current?.click();
                    }}
                  >
                    🎙️ Gravar com app do celular
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="capture-toolbar">
            <div className="capture-quick-media">
              {/* FOTO / LOUSA */}
              <button
                type="button"
                className="media-pill-btn"
                disabled={locked || recording}
                title="Tirar foto ou fotografar lousa"
                onClick={() => {
                  if (demo) {
                    setMessage('No modo demonstração, o acesso à câmera e arquivos é restrito para proteção de privacidade.');
                  } else {
                    camera.current?.click();
                  }
                }}
              >
                <Camera size={14} /> <span>Foto</span>
              </button>

              {/* GRAVAÇÃO DE ÁUDIO REAL */}
              <button
                type="button"
                className={`media-pill-btn ${recording ? 'recording' : ''}`}
                disabled={locked || requestingMic}
                title={recording ? 'Parar gravação' : 'Gravar áudio pelo microfone'}
                onClick={() => {
                  if (recording) {
                    stopRecording();
                  } else {
                    void startRecording();
                  }
                }}
              >
                <Mic size={14} /> <span>{recording ? `Gravando (${formatTimer(recordingSeconds)})` : 'Áudio'}</span>
              </button>

              {/* ANEXAR ARQUIVO / IMAGEM */}
              <button
                type="button"
                className="media-pill-btn"
                disabled={locked || recording}
                title="Subir arquivo de imagem ou áudio"
                onClick={() => {
                  if (demo) {
                    setMessage('No modo demonstração, upload de arquivos é restrito.');
                  } else {
                    input.current?.click();
                  }
                }}
              >
                <Paperclip size={14} /> <span>Anexo</span>
              </button>

              {/* LINK */}
              <button
                type="button"
                className="media-pill-btn"
                disabled={locked}
                title="Adicionar link de referência"
                onClick={() => {
                  const url = prompt('Endereço completo do link:');
                  if (!url) return;
                  if (!safeLink(url)) {
                    setMessage('Use um endereço válido http://, https:// ou mailto:.');
                    return;
                  }
                  setText(prev => `${prev}${prev ? '\n' : ''}${url}`.slice(0, CAPTURE_LIMIT));
                }}
              >
                <LinkIcon size={14} /> <span>Link</span>
              </button>
            </div>

            <button
              type="submit"
              className="button primary compact-send-btn"
              aria-label="Guardar ideia"
              disabled={locked || recording || requestingMic || (!text.trim() && !file)}
            >
              <Send size={14} /> {busy ? 'Salvando…' : 'Guardar ideia'}
            </button>
          </div>
        </div>
      </form>

      {/* FILE INPUTS: Omitted in demo mode for privacy test compliance */}
      {!demo && (
        <>
          <input
            hidden
            type="file"
            ref={camera}
            capture="environment"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Tirar foto para insight"
            onChange={e => {
              selectFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            hidden
            type="file"
            ref={input}
            accept="image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm"
            aria-label="Anexar arquivo para insight"
            onChange={e => {
              selectFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <input
            hidden
            type="file"
            ref={nativeAudioInput}
            accept="audio/*"
            aria-label="Gravar áudio com app nativo"
            onChange={e => {
              selectFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </>
      )}

      {message && <p role="status" style={{ fontSize: '0.8rem', color: '#0369a1', marginTop: 8, fontWeight: 600 }}>{message}</p>}

      <div className="unorganized-notes-deck">
        <h4>Para organizar ({pending.length})</h4>
        <div className="unorganized-chips-grid">
          {pending.map(note => (
            <div key={note.id} className="unorganized-chip-card">
              <div className="chip-content">
                <strong>{note.title || 'Sem título'}</strong>
                <small>{new Date(note.updatedAt).toLocaleDateString('pt-BR')}</small>
              </div>
              <button
                disabled={busy || recording || requestingMic}
                type="button"
                className="chip-organize-btn"
                aria-label={`Abrir e organizar: ${note.title || 'Sem título'}`}
                onClick={() => {
                  if ((file || text) && !confirm('Há um rascunho não salvo. Sair e descartá-lo?')) return;
                  onOpen(note.id);
                }}
              >
                Abrir e organizar
              </button>
            </div>
          ))}
        </div>
        {!pending.length && <p>Nenhuma anotação pendente de organização.</p>}
      </div>
    </section>
  );
}
