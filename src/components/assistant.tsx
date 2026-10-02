'use client';
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { ArrowRight, AudioLines, Check, History, MessageSquarePlus, Mic, Paperclip, RotateCcw, Send, Square, Trash2, Undo2, X } from 'lucide-react';
import { validMedia } from '@/lib/note-media';
import { api } from './community/client';
import { saveCapture, type CaptureDraft } from '@/lib/save-capture';
import { dateKey, type Workspace } from '@/lib/workspace';
import { applyCommands, commandContext, undoApplied, type Applied, type CommandAction } from '@/lib/commands';
import { Modal } from './modal';

export type AssistantMessage = { id: string; from: 'me' | 'assistant'; text: string; noteId?: string; applied?: Applied[]; retry?: string };
// Past conversations stay on this device only (the AI provider sees each message when it is sent; nothing is kept on our servers).
const ARCHIVE_KEY = 'jornada-assistente-historico';
type Archived = { id: string; title: string; updatedAt: string; messages: AssistantMessage[] };
function readArchive(): Archived[] {
  try { const value = JSON.parse(localStorage.getItem(ARCHIVE_KEY) ?? '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
}
function writeArchive(list: Archived[]) { try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list.slice(0, 30))); } catch {} }
const conversationTitle = (messages: AssistantMessage[]) => (messages.find(item => item.from === 'me')?.text ?? 'Conversa').slice(0, 70);
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
  // chosen: the person dragged it there; otherwise it follows the window and stays at the bottom edge.
  const [position, setPosition] = useState<{ side: 'left' | 'right'; top: number; chosen?: boolean } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [intro, setIntro] = useState(false);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  useEffect(() => {
    const place = () => setPosition(previous => {
      let saved = previous;
      if (!saved && persist) try { saved = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null'); } catch {}
      const { min, max } = limits();
      const chosen = typeof saved?.top === 'number' && saved.chosen !== false;
      return { side: saved?.side === 'left' ? 'left' : 'right', top: chosen ? Math.min(max, Math.max(min, saved!.top)) : max, chosen };
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
    const next = { side: event.clientX < window.innerWidth / 2 ? 'left' as const : 'right' as const, top: Math.min(max, Math.max(min, event.clientY - 28)), chosen: true };
    setPosition(next); setDrag(null);
    if (persist) try { localStorage.setItem(POSITION_KEY, JSON.stringify(next)); } catch {}
  }
  if (!position) return null;
  const style = drag ? { left: drag.x - 28, top: drag.y - 28 } : position.side === 'left' ? { left: 18, top: position.top } : { right: 18, top: position.top };
  return <div className={`assistant-dock side-${drag ? (drag.x < window.innerWidth / 2 ? 'left' : 'right') : position.side} ${intro ? 'introducing' : ''} ${drag ? 'dragging' : ''}`} style={style}>
    {intro && <div className={`assistant-intro${position.top < window.innerHeight / 2 ? ' below' : ''}`} role="status">
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
  cloud: boolean; blocked: boolean; demo: boolean; data: Workspace;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  ensureSaved: () => Promise<void>;
  messages: AssistantMessage[]; setMessages: (change: (previous: AssistantMessage[]) => AssistantMessage[]) => void;
  onOpenNote: (id: string) => void; onNavigate: (view: Applied['view']) => void;
};
type CommandReply = { configured: boolean; reply?: string; actions?: CommandAction[]; model?: string };
// The same conversation lives in the computer's bubble and in the Assistente tab (the phone's way in).
// With AI connected it understands and acts (and can undo); without it, nothing is lost: it goes to "Para organizar".
export function AssistantChat({ cloud, blocked, demo, data, update, ensureSaved, messages, setMessages, onOpenNote, onNavigate }: ChatProps) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [talking, setTalking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [heard, setHeard] = useState('');
  const [problem, setProblem] = useState('');
  const [ai, setAi] = useState<{ ready: boolean; model?: string } | null>(null);
  const [history, setHistory] = useState<Archived[] | null>(null);
  function stopVoice() { conversation.current = false; setTalking(false); try { recognizer.current?.stop(); } catch {} window.speechSynthesis?.cancel(); setSpeaking(false); }
  // "Nova conversa" archives the current one instead of throwing it away.
  function archiveCurrent() {
    if (demo || !messages.length) return readArchive();
    const list = [{ id: crypto.randomUUID(), title: conversationTitle(messages), updatedAt: new Date().toISOString(), messages }, ...readArchive()];
    writeArchive(list);
    return list;
  }
  function startNew() { stopVoice(); const list = archiveCurrent(); setMessages(() => []); if (history) setHistory(list); }
  function reopen(item: Archived) {
    stopVoice();
    const list = [...(messages.length ? [{ id: crypto.randomUUID(), title: conversationTitle(messages), updatedAt: new Date().toISOString(), messages }] : []), ...readArchive().filter(entry => entry.id !== item.id)];
    writeArchive(list); setMessages(() => item.messages); setHistory(null);
  }
  function forget(id: string) { const list = readArchive().filter(entry => entry.id !== id); writeArchive(list); setHistory(list); }
  const recognizer = useRef<Recognition | null>(null);
  const conversation = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const draft = useRef<CaptureDraft>({ id: '', src: '' });
  const latest = useRef(data);
  useEffect(() => { latest.current = data; }, [data]);
  const [voice] = useState(() => !!recognition());
  useEffect(() => () => { conversation.current = false; try { recognizer.current?.stop(); } catch {} window.speechSynthesis?.cancel(); }, []);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, heard]);

  // Speaks the answer; in conversation mode, listening starts again only after the voice finishes.
  function speak(value: string) {
    if (!('speechSynthesis' in window) || !value) { if (conversation.current) listen(); return; }
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = 'pt-BR';
    const next = () => { setSpeaking(false); if (conversation.current) listen(); };
    utterance.onend = next; utterance.onerror = next;
    window.speechSynthesis.cancel(); setSpeaking(true); window.speechSynthesis.speak(utterance);
  }
  function attach(value?: File) {
    if (!value) return;
    if (!validMedia(value.type, value.size)) { setProblem('Anexe uma foto, um áudio ou um vídeo curto de até 25 MB.'); return; }
    setProblem(''); setFile(value); draft.current.src = '';
  }
  async function capture(said: string, id: string, note: string) {
    const saved = await saveCapture({ text: said, file, cloud, draft: draft.current, update, ensureSaved });
    draft.current = { id: '', src: '' };
    setMessages(previous => [...previous, { id, from: 'assistant', text: `${note}Guardei em Para organizar: “${saved.title}”${file ? ', com o anexo' : ''}.`, noteId: saved.id }]);
    return 'Guardei em Para organizar.';
  }
  async function send(value: string, spoken = false) {
    const said = value.trim();
    if ((!said && !file) || blocked || busy) return;
    setBusy(true); setProblem('');
    const id = crypto.randomUUID();
    setMessages(previous => [...previous, { id: `${id}:eu`, from: 'me', text: said || `Anexo: ${file!.name}` }]);
    setText('');
    let voiceAnswer = '';
    try {
      let result: CommandReply = { configured: false };
      if (cloud && said && !file) {
        // The last exchanges go along, so "e aquela de ontem?" or "muda para as 16h" make sense to the model.
        const history = messages.slice(-12).map(item => ({ role: item.from === 'me' ? 'user' as const : 'assistant' as const, text: item.text.slice(0, 3000) }));
        try { result = await api<CommandReply>('/api/ai/command', { message: said, context: commandContext(latest.current, dateKey()), history }); }
        catch (error) {
          // A question must never turn into a note: offer to try again, and saving only if the person wants.
          setAi(previous => previous ?? { ready: true });
          setMessages(previous => [...previous, { id, from: 'assistant', text: `Não consegui responder agora. ${error instanceof Error ? error.message : ''}`.trim(), retry: said }]);
          voiceAnswer = 'Não consegui responder agora. Tente de novo em instantes.';
          return;
        }
      }
      setAi(result.configured ? { ready: true, model: result.model } : cloud ? { ready: false } : null);
      if (!result.configured) { voiceAnswer = await capture(said, id, ''); return; }
      const actions = result.actions ?? [];
      if (!actions.length && !result.reply) {
        setMessages(previous => [...previous, { id, from: 'assistant', text: 'Não entendi bem. Pode dizer de outro jeito?', retry: said }]);
        voiceAnswer = 'Não entendi bem. Pode dizer de outro jeito?';
        return;
      }
      let outcome: ReturnType<typeof applyCommands> | null = null;
      const saved = !actions.length || update(previous => { outcome = applyCommands(previous, actions, { today: dateKey(), now: Date.now() }); return outcome.data; });
      const done = saved ? (outcome as ReturnType<typeof applyCommands> | null) : null;
      const failed = !saved ? 'Não consegui salvar agora. Confira o aviso de salvamento.' : done?.failed.length ? `Não consegui: ${done.failed.join('; ')}.` : '';
      const reply = [result.reply, failed].filter(Boolean).join(' ');
      setMessages(previous => [...previous, { id, from: 'assistant', text: reply || 'Feito.', applied: done?.applied.length ? done.applied : undefined }]);
      voiceAnswer = reply || 'Feito.';
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Não consegui agora. Confira o aviso de salvamento e tente de novo.');
    } finally {
      setFile(null); setBusy(false);
      if (spoken) speak(voiceAnswer);
    }
  }
  function undo(message: AssistantMessage) {
    if (!message.applied?.length || blocked) return;
    if (update(previous => undoApplied(previous, message.applied!))) setMessages(previous => previous.map(item => item.id === message.id ? { ...item, applied: undefined, text: `${item.text} (desfeito)` } : item));
  }
  function listen() {
    const recognize = recognition();
    if (!recognize) { setProblem('Este navegador não reconhece fala. Escreva sua mensagem ou use o Áudio do Registro rápido.'); conversation.current = false; setTalking(false); return; }
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
    recognize.onerror = event => {
      if (event.error === 'no-speech' && conversation.current) return;
      conversation.current = false; setTalking(false);
      setProblem(event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'O microfone não foi autorizado. Toque em Permitir quando o navegador perguntar, ou libere em Configurações do site › Microfone.'
        : event.error === 'no-speech' ? 'Não ouvi nada. Toque no microfone e fale de novo.' : 'Não consegui ouvir agora. Tente de novo ou escreva.');
    };
    recognize.onend = () => {
      setListening(false); setHeard(''); recognizer.current = null;
      if (final.trim()) void send(final, true);
      else if (conversation.current) listen();
    };
    recognizer.current = recognize;
    setProblem(''); setHeard(''); setListening(true);
    try { recognize.start(); } catch { setListening(false); setProblem('Não consegui abrir o microfone. Tente de novo.'); }
  }
  function toggleOnce() { if (listening) { recognizer.current?.stop(); return; } listen(); }
  function toggleConversation() {
    if (talking) { conversation.current = false; setTalking(false); try { recognizer.current?.stop(); } catch {} window.speechSynthesis?.cancel(); setSpeaking(false); return; }
    conversation.current = true; setTalking(true); listen();
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(text); }
  const locked = blocked || busy;
  const state = talking ? speaking ? 'Respondendo…' : busy ? 'Executando…' : listening ? 'Ouvindo… pode falar' : 'Um instante…' : '';

  return <div className="assistant-panel">
    <div className="assistant-top">
      <p className={`assistant-status${ai?.ready ? ' on' : ''}`}><span className="assistant-status-dot" aria-hidden="true" />{ai?.ready ? `Inteligência artificial ligada${ai.model ? ` · ${ai.model}` : ''}` : ai ? 'IA ainda não ligada: guardo tudo em Para organizar' : cloud ? 'Converse comigo: eu respondo e organizo' : 'Neste modo, guardo tudo em Para organizar'}</p>
      <span className="assistant-top-actions">
        {!demo && <button type="button" className="text-button" aria-expanded={history !== null} onClick={() => setHistory(history ? null : readArchive())}><History size={15} aria-hidden="true" />Conversas anteriores</button>}
        {messages.length > 0 && <button type="button" className="text-button" disabled={busy} onClick={startNew}><MessageSquarePlus size={15} aria-hidden="true" />Nova conversa</button>}
      </span>
    </div>
    {history && <div className="assistant-history" role="region" aria-label="Conversas anteriores">
      {history.length ? <ul>{history.map(item => <li key={item.id}>
        <button type="button" className="assistant-history-open" onClick={() => reopen(item)}><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {item.messages.length} mensagens</small></button>
        <button type="button" className="icon-button" aria-label={`Apagar conversa: ${item.title}`} onClick={() => forget(item.id)}><Trash2 size={15} aria-hidden="true" /></button>
      </li>)}</ul> : <p className="muted">Nenhuma conversa arquivada. Ao tocar em “Nova conversa”, a atual fica guardada aqui.</p>}
      <p className="assistant-history-note">As conversas ficam só neste aparelho. O provedor de IA recebe cada mensagem no momento em que você envia.</p>
    </div>}
    {ai && !ai.ready && <p className="assistant-setup">Para eu conversar e organizar sozinho, a IA precisa estar ligada: em <strong>Administração › Inteligência artificial</strong>, na tarefa “Conversa do assistente”, escolha o provedor e um modelo (o “Automático · rápido” serve) e toque em Salvar.</p>}
    <div className="assistant-messages" ref={list} aria-live="polite">
      {!messages.length && <div className="assistant-message assistant">
        <p>Olá! Diga, por exemplo: “amanhã às 15h dentista”, “gastei 32 reais no mercado”, “conta de luz de 210 vence dia 10”, “começa um foco de 25 minutos em leitura” ou “o que eu tenho hoje?”.</p>
        <p>Toque em <strong>Conversar</strong> para falar à vontade: eu executo, respondo e volto a ouvir. O que eu não souber organizar fica em <strong>Para organizar</strong>.</p>
      </div>}
      {messages.map(message => <div key={message.id} className={`assistant-message ${message.from}`}>
        <p>{message.text}</p>
        {message.applied?.length ? <ul className="assistant-applied">{message.applied.map((item, index) => <li key={index}><Check size={14} aria-hidden="true" /><span>{item.label}</span><button type="button" className="text-button" onClick={() => onNavigate(item.view)}>Ver</button></li>)}</ul> : null}
        {message.applied?.length ? <button type="button" className="text-button assistant-undo" disabled={blocked} onClick={() => undo(message)}><Undo2 size={14} aria-hidden="true" />Desfazer</button> : null}
        {message.noteId && <button type="button" className="text-button" onClick={() => onOpenNote(message.noteId!)}>Ver anotação <ArrowRight size={13} aria-hidden="true" /></button>}
        {message.retry && <span className="assistant-retry">
          <button type="button" className="button primary" disabled={locked} onClick={() => { const again = message.retry!; setMessages(previous => previous.filter(item => item.id !== message.id && item.id !== `${message.id}:eu`)); void send(again); }}><RotateCcw size={14} aria-hidden="true" />Tentar de novo</button>
          <button type="button" className="text-button" disabled={locked} onClick={() => { const text = message.retry!; setMessages(previous => previous.map(item => item.id === message.id ? { ...item, retry: undefined } : item)); void capture(text, `${message.id}:guardado`, ''); }}>Guardar em Para organizar</button>
        </span>}
      </div>)}
      {listening && <div className="assistant-message me listening"><p>{heard || 'Ouvindo…'}</p></div>}
    </div>
    {problem && <p className="assistant-problem" role="alert">{problem}</p>}
    <div className="assistant-voice">
      <button type="button" className={`assistant-mic ${talking ? 'listening' : ''}`} disabled={blocked || !voice || (listening && !talking)} aria-pressed={talking} onClick={toggleConversation}>
        {talking ? <Square size={22} fill="currentColor" aria-hidden="true" /> : <AudioLines size={24} aria-hidden="true" />}
        <span>{talking ? 'Encerrar conversa' : voice ? 'Conversar' : 'Voz indisponível neste navegador'}</span>
      </button>
      {!talking && voice && <button type="button" className={`assistant-once ${listening ? 'listening' : ''}`} disabled={locked} aria-pressed={listening} onClick={toggleOnce} aria-label={listening ? 'Parar e enviar' : 'Falar uma vez'}>{listening ? <Square size={18} fill="currentColor" aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}</button>}
    </div>
    {state && <p className="assistant-live" role="status">{state}</p>}
    {file && <p className="assistant-attachment"><Paperclip size={14} aria-hidden="true" /><span>{file.name} ({Math.ceil(file.size / 1024)} KB)</span><button type="button" className="text-button" disabled={locked} onClick={() => setFile(null)}>Remover</button></p>}
    <form className="assistant-form" onSubmit={submit}>
      {!demo && <button type="button" className="icon-button assistant-clip" aria-label="Anexar foto, áudio ou vídeo" disabled={locked || listening} onClick={() => fileInput.current?.click()}><Paperclip size={18} aria-hidden="true" /></button>}
      <label className="sr-only" htmlFor="assistant-text">Mensagem para o assistente</label>
      <input id="assistant-text" value={text} maxLength={2000} disabled={locked || listening} onChange={event => setText(event.target.value)} placeholder="Ou escreva aqui…" />
      <button className="button primary" aria-label="Enviar mensagem" disabled={locked || listening || (!text.trim() && !file)}><Send size={16} aria-hidden="true" /></button>
    </form>
    {!demo && <input hidden ref={fileInput} type="file" aria-label="Anexar arquivo ao assistente" accept="image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,video/mp4,video/webm,video/quicktime" onChange={event => { attach(event.target.files?.[0]); event.target.value = ''; }} />}
    <p className="assistant-privacy">{demo ? 'Demonstração: nada é guardado de verdade.' : busy ? 'Guardando… aguarde antes de fechar.' : 'A voz usa o reconhecimento de fala do navegador (no Chrome, processado pelo Google). O que você diz vai para o provedor de IA escolhido no painel.'}</p>
  </div>;
}

export function AssistantPanel({ onClose, ...chat }: ChatProps & { onClose: () => void }) {
  return <Modal title="Assistente Jornada Plena" onClose={onClose}><AssistantChat {...chat} /></Modal>;
}
