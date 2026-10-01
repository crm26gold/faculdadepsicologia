'use client';
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { ArrowRight, Mic, Paperclip, Send, Square, X } from 'lucide-react';
import { validMedia } from '@/lib/note-media';
import { saveCapture, type CaptureDraft } from '@/lib/save-capture';
import type { Workspace } from '@/lib/workspace';
import { Modal } from './modal';

export type AssistantMessage = { id: string; from: 'me' | 'assistant'; text: string; noteId?: string };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null };
const POSITION_KEY = 'jornada-assistente-posicao';
const INTRO_KEY = 'jornada-assistente-apresentado';
const recognition = () => {
  if (typeof window === 'undefined') return null;
  const Speech = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
  return Speech ? new Speech() : null;
};
const limits = () => ({ min: 72, max: window.innerHeight - 84 });

// Computer only (hidden on phones, where the center Registrar button already does this job).
// A WhatsApp-style bubble: tap opens the assistant, drag moves it to either edge, × hides it.
export function AssistantBubble({ onOpen, onHide, persist }: { onOpen: () => void; onHide: () => void; persist: boolean }) {
  const [position, setPosition] = useState<{ side: 'left' | 'right'; top: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [intro, setIntro] = useState(false);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  useEffect(() => {
    const place = () => setPosition(previous => {
      let saved = previous;
      if (!saved && persist) try { saved = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null'); } catch {}
      const { min, max } = limits();
      return { side: saved?.side === 'left' ? 'left' : 'right', top: Math.min(max, Math.max(min, typeof saved?.top === 'number' ? saved.top : max)) };
    });
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [persist]);
  // First visit: the bubble introduces itself once.
  useEffect(() => {
    let seen = false;
    if (persist) try { seen = localStorage.getItem(INTRO_KEY) === '1'; } catch {}
    if (seen) return;
    const timer = window.setTimeout(() => setIntro(true), 900);
    return () => window.clearTimeout(timer);
  }, [persist]);
  function introDone() {
    setIntro(false);
    if (persist) try { localStorage.setItem(INTRO_KEY, '1'); } catch {}
  }
  function down(event: PointerEvent<HTMLButtonElement>) {
    start.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const origin = start.current;
    if (!origin) return;
    if (!origin.moved && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 8) return;
    origin.moved = true;
    setDrag({ x: event.clientX, y: event.clientY });
  }
  function up(event: PointerEvent<HTMLButtonElement>) {
    const origin = start.current;
    start.current = null;
    if (!origin?.moved) return;
    dragged.current = true;
    const { min, max } = limits();
    const next = { side: event.clientX < window.innerWidth / 2 ? 'left' as const : 'right' as const, top: Math.min(max, Math.max(min, event.clientY - 28)) };
    setPosition(next); setDrag(null);
    if (persist) try { localStorage.setItem(POSITION_KEY, JSON.stringify(next)); } catch {}
  }
  if (!position) return null;
  const style = drag ? { left: drag.x - 28, top: drag.y - 28 } : position.side === 'left' ? { left: 18, top: position.top } : { right: 18, top: position.top };
  return <div className={`assistant-dock side-${drag ? (drag.x < window.innerWidth / 2 ? 'left' : 'right') : position.side} ${intro ? 'introducing' : ''} ${drag ? 'dragging' : ''}`} style={style}>
    {intro && <div className="assistant-intro" role="status">
      <p><strong>Oi! Eu sou o assistente da Jornada Plena.</strong> Fale ou escreva o que precisa: uma ideia, um compromisso, uma foto da lousa. Eu guardo em Para organizar e, em breve, vou organizar tudo sozinho.</p>
      <button type="button" className="button primary" onClick={introDone}>Entendi</button>
    </div>}
    <button type="button" className={`assistant-bubble ${drag ? 'dragging' : ''}`} aria-label="Abrir assistente"
      title="Assistente · clique para falar ou escrever; arraste para mudar de lugar"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setDrag(null); }}
      onClick={() => { if (dragged.current) { dragged.current = false; return; } introDone(); onOpen(); }}>
      <img src="/brand/simbolo-revertido.svg" alt="" width={56} height={56} draggable={false} />
      <span className="assistant-bubble-mic" aria-hidden="true"><Mic size={11} /></span>
    </button>
    <button type="button" className="assistant-hide" aria-label="Esconder assistente" title="Esconder a bolinha (volta pela aba Assistente)" onClick={() => { introDone(); onHide(); }}><X size={12} aria-hidden="true" /></button>
  </div>;
}

type ChatProps = {
  cloud: boolean; blocked: boolean; demo: boolean;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  ensureSaved: () => Promise<void>;
  messages: AssistantMessage[]; setMessages: (change: (previous: AssistantMessage[]) => AssistantMessage[]) => void;
  onOpenNote: (id: string) => void;
};
// The same conversation lives in the computer's bubble and in the Assistente tab (the phone's way in).
export function AssistantChat({ cloud, blocked, demo, update, ensureSaved, messages, setMessages, onOpenNote }: ChatProps) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [problem, setProblem] = useState('');
  const recognizer = useRef<Recognition | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const draft = useRef<CaptureDraft>({ id: '', src: '' });
  const [voice] = useState(() => !!recognition());
  useEffect(() => () => { try { recognizer.current?.stop(); } catch {} window.speechSynthesis?.cancel(); }, []);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, heard]);

  function speak(value: string) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = 'pt-BR';
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  }
  function attach(value?: File) {
    if (!value) return;
    if (!validMedia(value.type, value.size)) { setProblem('Anexe uma foto, um áudio ou um vídeo curto de até 25 MB.'); return; }
    setProblem(''); setFile(value); draft.current.src = '';
  }
  // Until an AI provider is connected, nothing said here is lost: it becomes a capture in "Para organizar".
  async function send(value: string, spoken = false) {
    const said = value.trim();
    if ((!said && !file) || blocked || busy) return;
    setBusy(true); setProblem('');
    const id = crypto.randomUUID();
    try {
      const saved = await saveCapture({ text: said, file, cloud, draft: draft.current, update, ensureSaved });
      draft.current = { id: '', src: '' };
      const answer = `Anotei em Para organizar: “${saved.title}”${file ? ', com o anexo' : ''}. Quando a inteligência artificial estiver ligada, eu mesmo vou entender e organizar isso para você — por exemplo, criar o compromisso na agenda.`;
      setMessages(previous => [...previous, { id: `${id}:eu`, from: 'me', text: said || `Anexo: ${file!.name}` }, { id, from: 'assistant', text: answer, noteId: saved.id }]);
      setText(''); setFile(null);
      if (spoken) speak('Anotei. Está em Para organizar.');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Não consegui anotar agora. Confira o aviso de salvamento e tente de novo.');
    } finally { setBusy(false); }
  }
  function listen() {
    if (listening) { recognizer.current?.stop(); return; }
    const recognize = recognition();
    if (!recognize) { setProblem('Este navegador não reconhece fala. Escreva sua mensagem ou use o Áudio do Registro rápido.'); return; }
    recognize.lang = 'pt-BR'; recognize.interimResults = true; recognize.continuous = false;
    let final = '';
    recognize.onresult = event => {
      let partial = '';
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        if (result.isFinal) final += result[0].transcript; else partial += result[0].transcript;
      }
      setHeard(`${final} ${partial}`.trim());
    };
    recognize.onerror = event => setProblem(event.error === 'not-allowed' || event.error === 'service-not-allowed'
      ? 'O microfone não foi autorizado. Toque em Permitir quando o navegador perguntar, ou libere em Configurações do site › Microfone.'
      : event.error === 'no-speech' ? 'Não ouvi nada. Toque no microfone e fale de novo.' : 'Não consegui ouvir agora. Tente de novo ou escreva.');
    recognize.onend = () => { setListening(false); setHeard(''); recognizer.current = null; if (final.trim()) void send(final, true); };
    recognizer.current = recognize;
    setProblem(''); setHeard(''); setListening(true);
    try { recognize.start(); } catch { setListening(false); setProblem('Não consegui abrir o microfone. Tente de novo.'); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(text); }
  const locked = blocked || busy;

  return <div className="assistant-panel">
    <p className="assistant-status"><span className="assistant-status-dot" aria-hidden="true" />Inteligência artificial em preparação</p>
    <div className="assistant-messages" ref={list} aria-live="polite">
      {!messages.length && <div className="assistant-message assistant">
        <p>Olá! Fale ou escreva o que precisa: uma ideia, um compromisso, uma tarefa. Também dá para anexar uma foto, um áudio ou um vídeo.</p>
        <p>Por enquanto eu guardo tudo em <strong>Para organizar</strong>, sem perder nada. Quando a inteligência artificial for ligada, vou entender e organizar sozinho.</p>
      </div>}
      {messages.map(message => <div key={message.id} className={`assistant-message ${message.from}`}>
        <p>{message.text}</p>
        {message.noteId && <button type="button" className="text-button" onClick={() => onOpenNote(message.noteId!)}>Ver anotação <ArrowRight size={13} aria-hidden="true" /></button>}
      </div>)}
      {listening && <div className="assistant-message me listening"><p>{heard || 'Ouvindo…'}</p></div>}
    </div>
    {problem && <p className="assistant-problem" role="alert">{problem}</p>}
    <button type="button" className={`assistant-mic ${listening ? 'listening' : ''}`} disabled={locked || (!voice && !listening)} aria-pressed={listening} onClick={listen}>
      {listening ? <Square size={22} fill="currentColor" aria-hidden="true" /> : <Mic size={26} aria-hidden="true" />}
      <span>{listening ? 'Parar e enviar' : voice ? 'Toque para falar' : 'Voz indisponível neste navegador'}</span>
    </button>
    {file && <p className="assistant-attachment"><Paperclip size={14} aria-hidden="true" /><span>{file.name} ({Math.ceil(file.size / 1024)} KB)</span><button type="button" className="text-button" disabled={locked} onClick={() => setFile(null)}>Remover</button></p>}
    <form className="assistant-form" onSubmit={submit}>
      {!demo && <button type="button" className="icon-button assistant-clip" aria-label="Anexar foto, áudio ou vídeo" disabled={locked || listening} onClick={() => fileInput.current?.click()}><Paperclip size={18} aria-hidden="true" /></button>}
      <label className="sr-only" htmlFor="assistant-text">Mensagem para o assistente</label>
      <input id="assistant-text" value={text} maxLength={2000} disabled={locked || listening} onChange={event => setText(event.target.value)} placeholder="Ou escreva aqui…" />
      <button className="button primary" aria-label="Enviar mensagem" disabled={locked || listening || (!text.trim() && !file)}><Send size={16} aria-hidden="true" /></button>
    </form>
    {!demo && <input hidden ref={fileInput} type="file" aria-label="Anexar arquivo ao assistente" accept="image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,video/mp4,video/webm,video/quicktime" onChange={event => { attach(event.target.files?.[0]); event.target.value = ''; }} />}
    <p className="assistant-privacy">{demo ? 'Demonstração: nada é guardado de verdade.' : busy ? 'Guardando… aguarde antes de fechar.' : 'A voz usa o reconhecimento de fala do navegador (no Chrome, processado pelo Google).'}</p>
  </div>;
}

export function AssistantPanel({ onClose, ...chat }: ChatProps & { onClose: () => void }) {
  return <Modal title="Assistente Jornada Plena" onClose={onClose}><AssistantChat {...chat} /></Modal>;
}
