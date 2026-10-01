'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, FileText, Link as LinkIcon, Mic, Paperclip, Send, Trash2, Download, Square, Video, RefreshCw, X } from 'lucide-react';
import { CAPTURE_LIMIT, isUnorganized } from '@/lib/capture';
import { MEDIA_LIMIT, mediaTypes, safeLink, validMedia } from '@/lib/note-media';
import { saveCapture } from '@/lib/save-capture';
import type { Workspace } from '@/lib/workspace';

const VIDEO_SECONDS = 180; // ~0,7 Mbps keeps three minutes well under the 25 MB attachment limit
const videoMime = () => ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type)) ?? '';

export function QuickCaptureWidget({
  data,
  blocked,
  update,
  onOpen,
  status,
  cloud,
  demo = false,
  ensureSaved,
  variant = 'panel',
  onSaved,
}: {
  data: Workspace;
  blocked: boolean;
  status: string;
  cloud: boolean;
  demo?: boolean;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  onOpen: (id: string) => void;
  ensureSaved: () => Promise<void>;
  variant?: 'panel' | 'sheet';
  onSaved?: (id: string) => void;
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
  const [speechConsent, setSpeechConsent] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');

  const input = useRef<HTMLInputElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const nativeAudioInput = useRef<HTMLInputElement>(null);
  const nativeVideoInput = useRef<HTMLInputElement>(null);
  const videoPreview = useRef<HTMLVideoElement>(null);
  const videoStream = useRef<MediaStream | null>(null);
  const videoRecorder = useRef<MediaRecorder | null>(null);
  const videoDiscard = useRef(false);
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
      videoDiscard.current = true;
      if (videoRecorder.current?.state === 'recording') videoRecorder.current.stop();
      videoStream.current?.getTracks().forEach(t => t.stop());
    };
  }, []);
  useEffect(() => () => { if (filePreview.startsWith('blob:')) URL.revokeObjectURL(filePreview); }, [filePreview]);
  // In the sheet, type right away on desktop; on touch screens keep the keyboard closed so photo, audio and video stay in view.
  useEffect(() => { if (variant === 'sheet' && window.matchMedia('(pointer: fine)').matches) requestAnimationFrame(() => textArea.current?.focus()); }, [variant]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (file || recording || videoRecording || text.trim()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [file, recording, videoRecording, text]);

  function selectFile(value?: File) {
    if (!value || blocked || busy) return;
    if (!validMedia(value.type, value.size)) {
      setMessage(value.type.startsWith('video/') && value.size > MEDIA_LIMIT
        ? 'Este vídeo passa de 25 MB. Grave pelo botão Vídeo do Jornada Plena (o vídeo já sai leve) ou envie um trecho menor.'
        : 'Use foto (JPG, PNG, WebP, GIF), áudio (MP3, M4A, WAV, OGG, WebM) ou vídeo (MP4, WebM, MOV) de até 25 MB.');
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
    if (demo || blocked || busy || requestingMic) return;
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
      if (speechConsent && typeof window !== 'undefined') {
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
                if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
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

  async function openVideo(mode = facing) {
    if (demo) { setMessage('No modo demonstração, o acesso à câmera é restrito para proteção de privacidade.'); return; }
    if (blocked || busy || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' || !videoMime()) { nativeVideoInput.current?.click(); return; }
    videoStream.current?.getTracks().forEach(t => t.stop());
    setMessage('Abrindo a câmera… se o navegador perguntar, toque em Permitir.');
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } });
      if (!mounted.current) { media.getTracks().forEach(t => t.stop()); return; }
      videoStream.current = media; setFacing(mode); setVideoOpen(true); setMessage('');
      requestAnimationFrame(() => { if (videoPreview.current) { videoPreview.current.srcObject = media; void videoPreview.current.play().catch(() => {}); } });
    } catch {
      setMessage('Câmera ou microfone não autorizados. Toque em Permitir quando o navegador perguntar, ou grave com o app da câmera.');
      nativeVideoInput.current?.click();
    }
  }

  function recordVideo() {
    const media = videoStream.current;
    if (!media || videoRecorder.current?.state === 'recording') return;
    const mimeType = videoMime();
    const rec = new MediaRecorder(media, { mimeType, videoBitsPerSecond: 700_000, audioBitsPerSecond: 64_000 });
    const chunks: Blob[] = [];
    let size = 0;
    videoDiscard.current = false;
    rec.ondataavailable = event => {
      if (!event.data.size) return;
      chunks.push(event.data); size += event.data.size;
      if (size >= MEDIA_LIMIT - 1_000_000 && rec.state === 'recording') rec.stop();
    };
    rec.onstop = () => {
      if (recordingInterval.current) clearInterval(recordingInterval.current);
      if (recordingTimeout.current) clearTimeout(recordingTimeout.current);
      media.getTracks().forEach(t => t.stop()); videoStream.current = null;
      if (!mounted.current) return;
      setVideoRecording(false); setVideoOpen(false); setRecordingSeconds(0);
      if (videoDiscard.current) return;
      const type = mimeType.split(';')[0];
      const blob = new Blob(chunks, { type });
      if (blob.size < 1000) { setMessage('Vídeo muito curto ou vazio. Tente novamente.'); return; }
      selectFile(new File([blob], `video-${Date.now()}.${mediaTypes[type] ?? 'webm'}`, { type }));
      setMessage('Vídeo gravado! Confira abaixo e toque em Guardar ideia.');
    };
    videoRecorder.current = rec;
    rec.start(1000);
    setVideoRecording(true); setRecordingSeconds(0);
    recordingInterval.current = setInterval(() => setRecordingSeconds(prev => prev + 1), 1000);
    recordingTimeout.current = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, VIDEO_SECONDS * 1000);
  }

  function closeVideo() {
    videoDiscard.current = true;
    if (videoRecorder.current?.state === 'recording') videoRecorder.current.stop();
    else { videoStream.current?.getTracks().forEach(t => t.stop()); videoStream.current = null; setVideoOpen(false); }
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
      abort.current = new AbortController();
      const draft = { id: draftId.current, src: uploadedSource.current };
      let saved;
      try { saved = await saveCapture({ text, file, cloud, draft, signal: abort.current.signal, update, ensureSaved }); }
      finally { draftId.current = draft.id; uploadedSource.current = draft.src; }
      if (!mounted.current) return;

      draftId.current = '';
      uploadedSource.current = '';
      setText('');
      clearFile();
      setMessage(cloud ? 'Ideia e mídia sincronizadas na sua conta na nuvem!' : 'Ideia guardada no seu caderno local!');
      onSaved?.(saved.id);
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
  const isVideoFile = file && file.type.startsWith('video/');
  const sheet = variant === 'sheet';

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <section className={`panel quick-capture-widget capture-inbox ${sheet ? 'capture-sheet-body' : ''}`} aria-label={sheet ? 'Registro rápido' : 'Caixa de entrada de ideias'}>
      {!sheet && <div className="section-heading">
        <div className="capture-title-group">
          <span className="capture-badge-icon"><FileText size={18} /></span>
          <div>
            <h3>Anota Aqui · Insight Rápido</h3>
            <p>Guarde pensamentos, fotos de lousa ou áudios na hora. Depois organize com calma. {status}</p>
          </div>
        </div>
        <span className="unorganized-counter-chip">{pending.length} para organizar</span>
      </div>}

      {!demo && <label className="capture-consent"><input type="checkbox" checked={speechConsent} disabled={recording || requestingMic} onChange={e => setSpeechConsent(e.target.checked)} /><span>Transcrever a fala do áudio em texto<small>Opcional. Usa o serviço de voz do navegador, que pode enviar o áudio a um serviço externo.</small></span></label>}
      <form className="quick-capture-form" onSubmit={submit}>
        <div className="quick-capture-input-box">
          <textarea
            id="capture-text"
            rows={3}
            maxLength={CAPTURE_LIMIT}
            value={text}
            disabled={locked}
            ref={textArea}
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
                {transcribing && <span style={{ marginLeft: 6, color: '#3E7A62', fontWeight: 600 }}>· 🎙️ Transcrevendo fala ao vivo...</span>}
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

          {videoOpen && (
            <div className="video-recorder" role="group" aria-label="Gravar vídeo">
              <video ref={videoPreview} className="video-recorder-preview" muted playsInline autoPlay aria-label="Prévia da câmera" />
              <div className="video-recorder-bar">
                {videoRecording
                  ? <button type="button" className="button video-stop" onClick={() => videoRecorder.current?.stop()}><Square size={14} fill="currentColor" aria-hidden="true" />Parar ({formatTimer(recordingSeconds)} de {formatTimer(VIDEO_SECONDS)})</button>
                  : <button type="button" className="button video-record" onClick={recordVideo}><span className="video-dot" aria-hidden="true" />Gravar vídeo</button>}
                <button type="button" className="icon-button" aria-label="Trocar câmera" disabled={videoRecording} onClick={() => void openVideo(facing === 'environment' ? 'user' : 'environment')}><RefreshCw size={18} aria-hidden="true" /></button>
                <button type="button" className="icon-button" aria-label="Cancelar vídeo" onClick={closeVideo}><X size={18} aria-hidden="true" /></button>
              </div>
            </div>
          )}

          {/* ATTACHED FILE PREVIEW (AUDIO PLAYER OR IMAGE THUMBNAIL) */}
          {file && filePreview && (
            <div style={{ padding: '10px 14px', background: '#FBF9F3', borderTop: '1px solid #E6E0D0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <span style={{ fontWeight: 600, color: '#10231C' }}>
                  {isAudioFile ? '🎙️ Áudio gravado' : isVideoFile ? '🎬 Vídeo' : '📷 Foto / Imagem'}: {file.name} ({Math.ceil(file.size / 1024)} KB)
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={filePreview}
                    download={file.name}
                    title="Baixar cópia"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2F6B55', textDecoration: 'none', fontWeight: 600 }}
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

              {isVideoFile && <video controls playsInline src={filePreview} className="capture-video-preview" aria-label="Prévia do vídeo" />}

              {/* REAL IMAGE THUMBNAIL FOR PHOTO/UPLOAD */}
              {isImageFile && (
                <div style={{ maxHeight: 160, overflow: 'hidden', borderRadius: 6, border: '1px solid #D3CCBA' }}>
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
                disabled={locked || recording || videoOpen}
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
                disabled={locked || requestingMic || videoOpen}
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

              <button
                type="button"
                className={`media-pill-btn ${videoRecording ? 'recording' : ''}`}
                disabled={locked || recording || videoOpen}
                title="Gravar um vídeo curto"
                onClick={() => void openVideo()}
              >
                <Video size={14} /> <span>Vídeo</span>
              </button>

              {/* ANEXAR ARQUIVO / IMAGEM */}
              <button
                type="button"
                className="media-pill-btn"
                disabled={locked || recording || videoOpen}
                title="Subir foto, áudio ou vídeo"
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
              disabled={locked || recording || requestingMic || videoOpen || (!text.trim() && !file)}
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
            accept="image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,video/mp4,video/webm,video/quicktime"
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
          <input
            hidden
            type="file"
            ref={nativeVideoInput}
            accept="video/*"
            capture="environment"
            aria-label="Gravar vídeo com app da câmera"
            onChange={e => {
              selectFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </>
      )}

      {message && <p role="status" style={{ fontSize: '0.8rem', color: '#2F6B55', marginTop: 8, fontWeight: 600 }}>{message}</p>}

      {!sheet && <div className="unorganized-notes-deck">
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
      </div>}
    </section>
  );
}
