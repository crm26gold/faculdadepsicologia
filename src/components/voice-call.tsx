'use client';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AudioLines, Check, ChevronDown, Mic, MicOff, Phone, PhoneOff, RotateCcw, Square, Volume2, VolumeX, X } from 'lucide-react';
import { LiveVoiceConnection } from '@/lib/voice/client';
import type { CallState, LiveCredentials, VoiceTool, VoiceTranscript } from '@/lib/voice/protocol';
import type { PendingCommand } from '@/lib/commands';

type Caption = { id: string; from: 'me' | 'assistant'; text: string };
type Props = {
  available: boolean; blocked: boolean; pending: PendingCommand[]; executing: boolean;
  onClose: () => void;
  credentials: (signal: AbortSignal) => Promise<LiveCredentials>;
  onTranscript: (id: string, from: Caption['from'], text: string) => void;
  onTool: (tool: VoiceTool, signal: AbortSignal, transcript: VoiceTranscript) => Promise<unknown>;
  onConfirm: () => Promise<string>; onCancel: () => void;
};
const states: Record<CallState, string> = { idle: 'Sua jornada, em uma conversa', permission: 'Autorize o microfone', connecting: 'Conectando a chamada…',
  listening: 'Pode falar. Estou ouvindo.', speaking: 'Pode me interromper a qualquer momento', working: 'Organizando e salvando seu pedido…', reconnecting: 'Reconectando a chamada…', ended: 'Chamada encerrada', error: 'A chamada foi interrompida' };

export function VoiceCall(props: Props) {
  const current = useRef(props); current.current = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const inlineRegion = useRef<HTMLElement>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const [inline, setInline] = useState(false);
  const id = useId();
  const connection = useRef<LiveVoiceConnection | null>(null);
  const [state, setState] = useState<CallState>('idle');
  const [problem, setProblem] = useState('');
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [captionsOpen, setCaptionsOpen] = useState(true);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const transcriptList = useRef<HTMLDivElement>(null);
  const startedAt = useRef(0);
  const active = !['idle', 'ended', 'error'].includes(state);
  const connected = ['listening', 'speaking', 'working'].includes(state);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    setPortal(document.body);
    const unload = () => connection.current?.end();
    window.addEventListener('pagehide', unload);
    return () => { connection.current?.end(); window.removeEventListener('pagehide', unload); previous?.focus(); };
  }, []);
  useEffect(() => {
    if (!portal || inline || !dialog.current) return;
    try {
      dialog.current.showModal();
      if (!dialog.current.open) setInline(true);
    } catch { setInline(true); }
  }, [portal, inline]);
  useEffect(() => {
    if (!inline) return;
    inlineRegion.current?.scrollIntoView({ block: 'start' });
    inlineRegion.current?.focus();
  }, [inline]);
  useEffect(() => { if (props.blocked) connection.current?.end(); }, [props.blocked]);
  useEffect(() => {
    if (!active) return;
    const tick = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => window.clearInterval(tick);
  }, [active]);
  useEffect(() => { transcriptList.current?.scrollTo({ top: transcriptList.current.scrollHeight }); }, [captions]);

  function close() { connection.current?.end(); props.onClose(); }
  function start() {
    if (active || !props.available || props.blocked) return;
    connection.current?.end(); setProblem(''); setMuted(false); setSpeaker(true); setCaptions([]); setSeconds(0); startedAt.current = Date.now();
    const call = new LiveVoiceConnection({
      credentials: signal => current.current.credentials(signal), state: setState, level: setLevel, notice: setProblem,
      transcript: (id, from, text) => {
        setCaptions(previous => {
          const existing = previous.some(item => item.id === id);
          return (existing ? previous.map(item => item.id === id ? { id, from, text } : item) : [...previous, { id, from, text }]).slice(-40);
        });
        current.current.onTranscript(id, from, text);
      },
      tool: (tool, signal, transcript) => current.current.onTool(tool, signal, transcript),
    });
    connection.current = call; void call.start();
  }
  async function confirm() {
    if (confirmBusy || props.executing) return;
    setConfirmBusy(true);
    try { const result = await props.onConfirm(); connection.current?.notify(`Resultado da confirmação feita no aplicativo: ${result}. Informe esse resultado de forma breve, sem executar novamente.`); }
    catch (error) { setProblem(error instanceof Error ? error.message : 'Não consegui confirmar a alteração.'); }
    finally { setConfirmBusy(false); }
  }
  function cancel() { props.onCancel(); connection.current?.notify('A pessoa cancelou a alteração pendente no aplicativo. Nenhum item dessa confirmação foi removido.'); }

  const content = <>
    <header className="voice-call-header">
      <span className="voice-call-brand"><img src="/brand/simbolo-revertido.svg" width={32} height={32} alt="" /><span>Jornada Plena<small>Assistente de voz</small></span></span>
      <button type="button" className="icon-button" onClick={close} aria-label="Fechar chamada"><X size={21} aria-hidden="true" /></button>
    </header>
    <div className="voice-call-body" tabIndex={0}>
      <div className="voice-call-meta"><span className={`voice-call-dot ${active ? 'on' : ''}`} aria-hidden="true" /><span>{active ? 'Ao vivo' : 'Conversa por voz'}</span><time aria-label="Duração da chamada">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</time></div>
      <div className={`voice-orb ${state} ${muted ? 'muted' : ''}`} style={{ '--voice-level': level } as CSSProperties} aria-hidden="true">
        <div className="voice-orb-halo" /><div className="voice-orb-core"><AudioLines size={48} strokeWidth={1.5} /></div>
      </div>
      <h2 id={id}>{state === 'idle' ? 'Vamos conversar?' : state === 'speaking' ? 'Estou com você' : state === 'working' ? 'Cuidando da sua jornada' : state === 'listening' ? 'Estou ouvindo' : state === 'reconnecting' ? 'Só um instante' : state === 'ended' ? 'Até a próxima conversa' : state === 'error' ? 'Vamos tentar novamente?' : 'Preparando sua chamada'}</h2>
      <p className="voice-call-status" role="status">{muted && connected ? 'Microfone desligado. Toque para voltar a falar.' : states[state]}</p>
      {!active && !captions.length && <div className="voice-call-examples"><p>“Reagende o dentista para amanhã às 15h.”</p><p>“Crie uma rotina de leitura e organize meus estudos.”</p><p>“O que tenho esta semana? Quanto falta pagar?”</p></div>}
      {problem && <p className="voice-call-problem" role="alert">{problem}</p>}
      {!props.available && <p className="voice-call-problem">A chamada ao vivo está disponível ao entrar com sua conta. Neste modo você pode experimentar os registros pelo chat.</p>}
      {props.blocked && <p className="voice-call-problem" role="alert">A sincronização do seu espaço precisa ser resolvida antes da chamada. Feche esta tela e confira o aviso no topo da página.</p>}
      {props.pending.length > 0 && <section className="assistant-confirmation" aria-label="Confirmar alteração">
        <strong>Confirme antes de continuar</strong><ul>{props.pending.map((item, index) => <li key={index}>{item.label}</li>)}</ul>
        <p>Diga “confirmo a exclusão” ou “confirmo a substituição”. Você também pode tocar abaixo.</p>
        <div><button type="button" className="button danger" disabled={props.blocked || props.executing || confirmBusy} onClick={() => void confirm()}><Check size={16} aria-hidden="true" />Confirmar</button><button type="button" className="button outline" disabled={confirmBusy || props.executing} onClick={cancel}>Cancelar</button></div>
      </section>}
      {captions.length > 0 && <section className="voice-captions">
        <button type="button" className="text-button" aria-expanded={captionsOpen} aria-controls={`${id}-captions`} onClick={() => setCaptionsOpen(value => !value)}>Transcrição da conversa<ChevronDown size={16} aria-hidden="true" /></button>
        <div id={`${id}-captions`} hidden={!captionsOpen} ref={transcriptList} className="voice-captions-list" role="log" aria-live="off">{captions.map(item => <p key={item.id} className={item.from}><strong>{item.from === 'me' ? 'Você' : 'Jornada'}</strong><span>{item.text}</span></p>)}</div>
      </section>}
    </div>
    <footer className="voice-call-footer">
      {active ? <>
        <div className="voice-controls">
          <button type="button" aria-label={muted ? 'Ligar microfone' : 'Desligar microfone'} aria-pressed={muted} disabled={!connected} onClick={() => { const value = !muted; connection.current?.mute(value); setMuted(value); }}>{muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}<span>{muted ? 'Ligar mic.' : 'Microfone'}</span></button>
          <button type="button" aria-label={speaker ? 'Silenciar voz do assistente' : 'Ouvir voz do assistente'} aria-pressed={!speaker} disabled={!connected} onClick={() => { const value = !speaker; connection.current?.volume(value); setSpeaker(value); }}>{speaker ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}<span>Áudio</span></button>
          <button type="button" aria-label="Interromper fala do assistente" disabled={state !== 'speaking'} onClick={() => connection.current?.interrupt()}><Square size={20} aria-hidden="true" /><span>Interromper</span></button>
          <button type="button" className="voice-hangup" aria-label="Encerrar chamada" onClick={() => connection.current?.end()}><PhoneOff aria-hidden="true" /><span>Encerrar</span></button>
        </div>
        <p>Fale naturalmente. Você pode interromper e mudar de assunto.</p>
      </> : <>
        <button type="button" className="button primary voice-start" disabled={!props.available || props.blocked} onClick={start}>{state === 'error' ? <RotateCcw size={20} aria-hidden="true" /> : <Phone size={20} aria-hidden="true" />}{state === 'idle' ? 'Iniciar chamada' : 'Conversar novamente'}</button>
        <p>Ao iniciar, seu áudio será enviado ao Gemini para responder e executar seus pedidos. A Jornada não guarda a gravação. A transcrição fica nesta conversa. Cada chamada dura até 20 minutos.</p>
      </>}
    </footer>
  </>;
  // Native dialogs escape scrolling containers through the top layer. If opening fails,
  // keep the same call in the document flow so the person can still start and close it.
  if (inline) return <section ref={inlineRegion} className="voice-call voice-call-inline" aria-labelledby={id} tabIndex={-1}>{content}</section>;
  return portal && createPortal(<dialog ref={dialog} className="voice-call" aria-labelledby={id} onClose={() => current.current.onClose()} onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}>{content}</dialog>, portal);
}
