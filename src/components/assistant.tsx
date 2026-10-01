'use client';
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { ArrowRight, Mic, Send, Square } from 'lucide-react';
import { captureNote } from '@/lib/capture';
import type { Workspace } from '@/lib/workspace';
import { Modal } from './modal';

export type AssistantMessage = { id: string; from: 'me' | 'assistant'; text: string; noteId?: string };
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null };
const POSITION_KEY = 'jornada-assistente-posicao';
const recognition = () => {
  if (typeof window === 'undefined') return null;
  const Speech = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
  return Speech ? new Speech() : null;
};
const limits = () => ({ min: 72, max: window.innerHeight - (window.matchMedia('(max-width: 760px)').matches ? 150 : 84) });

// WhatsApp-style floating bubble: tap opens the assistant, drag moves it to either edge.
export function AssistantBubble({ onOpen, persist }: { onOpen: () => void; persist: boolean }) {
  const [position, setPosition] = useState<{ side: 'left' | 'right'; top: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
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
  const style = drag ? { left: drag.x - 28, top: drag.y - 28 } : position.side === 'left' ? { left: 14, top: position.top } : { right: 14, top: position.top };
  return <button type="button" className={`assistant-bubble ${drag ? 'dragging' : ''}`} style={style} aria-label="Abrir assistente"
    title="Assistente · toque para falar ou escrever; arraste para mudar de lugar"
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { start.current = null; setDrag(null); }}
    onClick={() => { if (dragged.current) { dragged.current = false; return; } onOpen(); }}>
    <img src="/brand/simbolo-revertido.svg" alt="" width={56} height={56} draggable={false} />
    <span className="assistant-bubble-mic" aria-hidden="true"><Mic size={11} /></span>
  </button>;
}

type PanelProps = {
  blocked: boolean; demo: boolean;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  messages: AssistantMessage[]; setMessages: (change: (previous: AssistantMessage[]) => AssistantMessage[]) => void;
  onClose: () => void; onOpenNote: (id: string) => void;
};
export function AssistantPanel({ blocked, demo, update, messages, setMessages, onClose, onOpenNote }: PanelProps) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [problem, setProblem] = useState('');
  const recognizer = useRef<Recognition | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const [voice] = useState(() => !!recognition());
  useEffect(() => () => { try { recognizer.current?.stop(); } catch {} window.speechSynthesis?.cancel(); }, []);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, heard]);

  function speak(value: string) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = 'pt-BR';
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  }
  // Until an AI provider is connected, nothing said here is lost: it becomes a capture in "Para organizar".
  function send(value: string, spoken = false) {
    const said = value.trim();
    if (!said || blocked) return;
    const id = crypto.randomUUID();
    let note;
    try { note = captureNote(said, id, new Date().toISOString()); } catch (error) { setProblem(error instanceof Error ? error.message : 'Não foi possível anotar.'); return; }
    setProblem('');
    const saved = update(previous => ({ ...previous, notes: [note, ...previous.notes] }));
    const answer = saved
      ? `Anotei em Para organizar: “${note.title}”. Quando a inteligência artificial estiver ligada, eu mesmo vou entender e organizar isso para você — por exemplo, criar o compromisso na agenda.`
      : 'Não consegui anotar agora. Confira o aviso de salvamento e tente de novo.';
    setMessages(previous => [...previous, { id: `${id}:eu`, from: 'me', text: said }, { id, from: 'assistant', text: answer, noteId: saved ? id : undefined }]);
    setText('');
    if (spoken) speak(saved ? 'Anotei. Está em Para organizar.' : answer);
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
    recognize.onend = () => { setListening(false); setHeard(''); recognizer.current = null; if (final.trim()) send(final, true); };
    recognizer.current = recognize;
    setProblem(''); setHeard(''); setListening(true);
    try { recognize.start(); } catch { setListening(false); setProblem('Não consegui abrir o microfone. Tente de novo.'); }
  }
  function submit(event: FormEvent) { event.preventDefault(); send(text); }

  return <Modal title="Assistente Jornada Plena" onClose={onClose}>
    <div className="assistant-panel">
      <p className="assistant-status"><span className="assistant-status-dot" aria-hidden="true" />Inteligência artificial em preparação</p>
      <div className="assistant-messages" ref={list} aria-live="polite">
        {!messages.length && <div className="assistant-message assistant">
          <p>Olá! Fale ou escreva o que precisa: uma ideia, um compromisso, uma tarefa.</p>
          <p>Por enquanto eu guardo tudo em <strong>Para organizar</strong>, sem perder nada. Quando a inteligência artificial for ligada, vou entender e organizar sozinho.</p>
        </div>}
        {messages.map(message => <div key={message.id} className={`assistant-message ${message.from}`}>
          <p>{message.text}</p>
          {message.noteId && <button type="button" className="text-button" onClick={() => onOpenNote(message.noteId!)}>Ver anotação <ArrowRight size={13} aria-hidden="true" /></button>}
        </div>)}
        {listening && <div className="assistant-message me listening"><p>{heard || 'Ouvindo…'}</p></div>}
      </div>
      {problem && <p className="assistant-problem" role="alert">{problem}</p>}
      <button type="button" className={`assistant-mic ${listening ? 'listening' : ''}`} disabled={blocked || (!voice && !listening)} aria-pressed={listening} onClick={listen}>
        {listening ? <Square size={22} fill="currentColor" aria-hidden="true" /> : <Mic size={26} aria-hidden="true" />}
        <span>{listening ? 'Parar e enviar' : voice ? 'Toque para falar' : 'Voz indisponível neste navegador'}</span>
      </button>
      <form className="assistant-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="assistant-text">Mensagem para o assistente</label>
        <input id="assistant-text" value={text} maxLength={2000} disabled={blocked || listening} onChange={event => setText(event.target.value)} placeholder="Ou escreva aqui…" />
        <button className="button primary" aria-label="Enviar mensagem" disabled={blocked || listening || !text.trim()}><Send size={16} aria-hidden="true" /></button>
      </form>
      <p className="assistant-privacy">{demo ? 'Demonstração: nada é guardado de verdade.' : 'A voz usa o reconhecimento de fala do navegador (no Chrome, processado pelo Google).'}</p>
    </div>
  </Modal>;
}
