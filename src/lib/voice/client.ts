import { LIVE_SOCKET, liveClientSetup, type CallState, type LiveCredentials, type VoiceTool, type VoiceTranscript } from './protocol';
import { GptLivePeer } from './gpt-live';

export type VoiceOptions = {
  context?: () => { context: string; history: { role: 'user' | 'assistant'; text: string }[] };
  credentials: (signal: AbortSignal) => Promise<LiveCredentials>;
  state: (state: CallState) => void; level: (level: number) => void;
  transcript: (id: string, from: 'me' | 'assistant', text: string) => void;
  tool: (call: VoiceTool, signal: AbortSignal, transcript: VoiceTranscript) => Promise<unknown>;
  notice: (message: string) => void;
};
type LiveMessage = {
  setupComplete?: object;
  serverContent?: { interrupted?: boolean; turnComplete?: boolean; inputTranscription?: { text?: string; finished?: boolean }; outputTranscription?: { text?: string }; modelTurn?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } };
  toolCall?: { functionCalls?: VoiceTool[] }; toolCallCancellation?: { ids?: string[] };
  sessionResumptionUpdate?: { resumable?: boolean; newHandle?: string }; goAway?: object; error?: unknown;
};
export function pcmBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index++) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}
export function pcmSamples(base64: string) {
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  const view = new DataView(buffer), samples = new Float32Array(Math.floor(binary.length / 2));
  for (let index = 0; index < samples.length; index++) samples[index] = view.getInt16(index * 2, true) / 32768;
  return samples;
}
export function microphoneError(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  return name === 'NotAllowedError' || name === 'SecurityError' ? 'O microfone não foi autorizado. No cadeado do navegador, permita o microfone para este site e tente novamente.'
    : name === 'NotFoundError' ? 'Nenhum microfone foi encontrado neste aparelho.'
    : name === 'NotReadableError' ? 'O microfone está ocupado. Feche outra chamada ou aplicativo que esteja usando o microfone e tente novamente.'
    : error instanceof Error ? error.message : 'Não consegui iniciar a chamada. Tente novamente.';
}

/** Owns every call resource. Ending/unmounting releases the microphone, socket and audio graph. */
export class LiveVoiceConnection {
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audio: AudioContext | null = null;
  private capture: AudioWorkletNode | null = null;
  private output: GainNode | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private scheduledAt = 0;
  private ended = false;
  private ready = false;
  private muted = false;
  private credentials: LiveCredentials | null = null;
  private handle = '';
  private reconnects = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private abort = new AbortController();
  private tools = new Map<string, AbortController>();
  private toolResults = new Map<string, Promise<unknown>>();
  private toolQueue: Promise<void> = Promise.resolve();
  private incoming: Promise<void> = Promise.resolve();
  private inputId = ''; private inputText = ''; private inputAt = 0;
  private outputId = ''; private outputText = '';
  private lastInput: VoiceTranscript = { text: '', startedAt: 0 };
  private callState: CallState = 'idle';
  private rtc: GptLivePeer | null = null;

  constructor(private options: VoiceOptions) {}
  private state(state: CallState) { this.callState = state; this.options.state(state); }
  private later(action: () => void, milliseconds: number) {
    const timer = setTimeout(() => { this.timers.delete(timer); if (!this.ended) action(); }, milliseconds);
    this.timers.add(timer); return timer;
  }
  private send(value: unknown) { if (!this.ended && this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(value)); }

  async start() {
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.AudioContext) throw new Error('Este navegador não oferece áudio ao vivo. Abra o site em uma versão atual do Chrome, Edge ou Safari, usando HTTPS.');
      this.state('permission');
      // Created/resumed in the click gesture, before awaiting permission or the network.
      this.audio = new AudioContext({ latencyHint: 'interactive' });
      await this.audio.resume();
      if (this.ended) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
      if (this.ended) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      stream.getAudioTracks().forEach(track => { track.onended = () => this.fail('O microfone foi desconectado. Inicie outra chamada para continuar.'); });
      this.state('connecting');
      this.credentials = await this.options.credentials(this.abort.signal);
      if (this.ended) return;
      if (this.credentials.provider === 'openai') {
        if (!window.RTCPeerConnection) throw new Error('Este navegador não oferece a conexão de áudio da OpenAI. Abra no Chrome, Edge ou Safari atualizado.');
        this.rtc = new GptLivePeer({ ...this.options, state: value => { if (value === 'ended' || value === 'error') this.end(value); else this.state(value); } }, stream, this.abort.signal);
        await this.rtc.start();
        this.later(() => this.end(), this.credentials.maxSeconds * 1000);
        return;
      }
      if (!window.AudioWorkletNode || !this.audio?.audioWorklet) throw new Error('Este navegador não oferece a captura de áudio do Gemini. Abra no Chrome, Edge ou Safari atualizado.');
      await this.audio!.audioWorklet.addModule('/voice-capture.worklet.js');
      if (this.ended) return;
      this.capture = new AudioWorkletNode(this.audio!, 'jornada-voice-capture');
      const source = this.audio!.createMediaStreamSource(stream);
      const silence = this.audio!.createGain(); silence.gain.value = 0;
      source.connect(this.capture); this.capture.connect(silence); silence.connect(this.audio!.destination);
      this.output = this.audio!.createGain(); this.output.connect(this.audio!.destination);
      this.capture.port.onmessage = ({ data }: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
        if (this.ended || this.muted || !this.ready) return;
        this.options.level(Math.min(1, data.level * 7));
        // A disconnected or congested socket must never accumulate microphone data.
        if (this.socket!.bufferedAmount > 256_000) { this.fail('A conexão está lenta demais para o áudio. Confira a internet e inicie outra chamada.'); return; }
        this.send({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: pcmBase64(data.pcm) } } });
      };
      this.later(() => { this.options.notice('Chamada encerrada após 20 minutos. Inicie outra para continuar.'); this.end(); }, this.credentials.maxSeconds * 1000);
      this.open();
    } catch (error) { if (!this.ended) this.fail(microphoneError(error)); }
  }

  private open(resuming = false) {
    if (this.ended || !this.credentials) return;
    this.ready = false;
    this.state(resuming ? 'reconnecting' : 'connecting');
    const socket = new WebSocket(`${LIVE_SOCKET}?access_token=${encodeURIComponent(this.credentials.token)}`);
    this.socket = socket;
    const timeout = this.later(() => this.fail('A chamada não respondeu a tempo. Confira a conexão e a configuração do Gemini e tente novamente.'), 20_000);
    socket.onopen = () => {
      if (this.ended || socket !== this.socket) { socket.close(); return; }
      this.send({ setup: liveClientSetup(this.credentials!.model, resuming ? this.handle : undefined) });
    };
    socket.onmessage = event => {
      // Blob decoding is asynchronous; preserve packet order without blocking cancellation/tool results.
      this.incoming = this.incoming.then(async () => {
        if (this.ended || socket !== this.socket) return;
        const raw = typeof event.data === 'string' ? event.data : event.data instanceof Blob ? await event.data.text() : new TextDecoder().decode(event.data);
        const message: LiveMessage = JSON.parse(raw);
        if (message.setupComplete) {
          clearTimeout(timeout); this.timers.delete(timeout); this.ready = true; this.reconnects = 0; this.state('listening');
          if (!resuming) this.send({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'A chamada começou. Cumprimente brevemente e pergunte como pode me ajudar.' }] }], turnComplete: true } });
        }
        this.receive(message);
      }).catch(() => { if (!this.ended) this.fail('Não consegui interpretar o áudio recebido. Inicie outra chamada para continuar.'); });
    };
    socket.onerror = () => { /* onclose carries the retry decision; never expose a token-bearing URL. */ };
    socket.onclose = event => {
      clearTimeout(timeout); this.timers.delete(timeout);
      if (this.ended || socket !== this.socket) return;
      this.ready = false; this.stopPlayback();
      if (this.handle && !this.tools.size && this.reconnects < 2 && Date.now() < Date.parse(this.credentials!.expiresAt) && event.code !== 1008) {
        this.reconnects++; this.state('reconnecting'); this.later(() => this.open(true), 1000 * this.reconnects);
      } else this.fail(event.code === 1008 ? 'O Gemini recusou a sessão de voz. Confira o modelo, a cota e o acesso à Live API em Administração.' : 'A conexão da chamada caiu. As ações já salvas continuam guardadas. Inicie outra chamada para continuar.');
    };
  }

  private receive(message: LiveMessage) {
    if (message.error) { this.fail('O provedor de voz recusou a chamada. Confira o acesso à Live API e a cota do Gemini.'); return; }
    if (message.sessionResumptionUpdate) this.handle = message.sessionResumptionUpdate.resumable ? message.sessionResumptionUpdate.newHandle ?? '' : '';
    for (const id of message.toolCallCancellation?.ids ?? []) this.tools.get(id)?.abort();
    const content = message.serverContent;
    if (content?.interrupted) { this.stopPlayback(); this.outputId = ''; this.outputText = ''; this.state(this.tools.size ? 'working' : 'listening'); }
    if (content?.inputTranscription?.text) {
      if (!this.inputId) { this.inputId = crypto.randomUUID(); this.inputText = ''; this.inputAt = Date.now(); }
      this.inputText += content.inputTranscription.text;
      this.lastInput = { text: this.inputText, startedAt: this.inputAt };
      this.options.transcript(this.inputId, 'me', this.inputText);
    }
    if (content?.outputTranscription?.text) {
      if (!this.outputId) { this.outputId = crypto.randomUUID(); this.outputText = ''; }
      this.outputText += content.outputTranscription.text;
      this.options.transcript(this.outputId, 'assistant', this.outputText);
    }
    for (const part of content?.modelTurn?.parts ?? []) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('audio/pcm')) this.play(part.inlineData.data, Number(part.inlineData.mimeType.match(/rate=(\d+)/)?.[1] ?? 24_000));
    }
    if (content?.turnComplete) {
      this.inputId = ''; this.outputId = ''; this.outputText = '';
      if (!this.sources.size) this.state(this.tools.size ? 'working' : 'listening');
    }
    const calls = message.toolCall?.functionCalls ?? [];
    for (const call of calls.slice(0, 8)) this.queueTool(call);
    if (message.goAway) {
      // The service periodically rotates a connection. A resumable session keeps the same call.
      if (this.handle && !this.tools.size) this.socket?.close();
      else this.options.notice('A conexão de voz será renovada. Se a chamada encerrar, inicie outra; os registros salvos permanecem.');
    }
  }

  private queueTool(call: VoiceTool) {
    if (!call.id || typeof call.name !== 'string') return;
    const duplicate = this.toolResults.get(call.id);
    if (duplicate) { void duplicate.then(result => this.respond(call, result)); return; }
    if (this.toolResults.size >= 100) { this.fail('Esta chamada atingiu o limite de ações. Inicie outra para continuar.'); return; }
    const controller = new AbortController(); this.tools.set(call.id, controller);
    const transcript = { ...this.lastInput };
    const result = this.toolQueue.then(async () => {
      if (this.ended || controller.signal.aborted) { this.tools.delete(call.id); return { cancelled: true }; }
      this.state('working');
      try { return await this.options.tool(call, controller.signal, transcript); }
      catch (error) { return { saved: false, error: controller.signal.aborted ? 'Pedido interrompido antes da execução.' : error instanceof Error ? error.message : 'Não consegui executar o pedido.' }; }
      finally { this.tools.delete(call.id); if (!this.ended && !this.sources.size) this.state(this.tools.size ? 'working' : 'listening'); }
    });
    this.toolResults.set(call.id, result);
    this.toolQueue = result.then(() => undefined);
    void result.then(value => { if (!controller.signal.aborted) this.respond(call, value); });
  }
  private respond(call: VoiceTool, result: unknown) {
    this.send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result } }] } });
  }

  private play(base64: string, rate: number) {
    if (!this.audio || !this.output || this.ended) return;
    const samples = pcmSamples(base64);
    if (!samples.length || rate < 8000 || rate > 48000) return;
    const buffer = this.audio.createBuffer(1, samples.length, rate); buffer.copyToChannel(samples, 0);
    const source = this.audio.createBufferSource(); source.buffer = buffer; source.connect(this.output);
    const start = Math.max(this.audio.currentTime + 0.025, this.scheduledAt);
    this.scheduledAt = start + buffer.duration;
    this.sources.add(source); this.state('speaking');
    source.onended = () => { this.sources.delete(source); source.disconnect(); if (!this.ended && !this.sources.size && this.callState !== 'reconnecting') this.state(this.tools.size ? 'working' : 'listening'); };
    source.start(start);
  }
  private stopPlayback() {
    for (const source of this.sources) { source.onended = null; try { source.stop(); } catch {} source.disconnect(); }
    this.sources.clear(); this.scheduledAt = 0;
  }
  interrupt() {
    if (this.rtc) { this.rtc.interrupt(); return; }
    this.stopPlayback(); this.state(this.tools.size ? 'working' : 'listening');
    // Gemini 3.8 interrupts active generation only on a completed client turn.
    // Stopping local playback alone lets subsequent server chunks play again.
    this.send({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'Pare de falar e aguarde meu próximo pedido.' }] }], turnComplete: true } });
  }
  mute(value: boolean) {
    this.muted = value; this.options.level(0);
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !value; });
    if (value) this.send({ realtimeInput: { audioStreamEnd: true } });
  }
  volume(value: boolean) { if (this.rtc) this.rtc.volume(value); if (this.output) this.output.gain.value = value ? 1 : 0; }
  notify(text: string) { if (this.rtc) this.rtc.notify(text); else this.send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }); }
  private fail(message: string) { this.options.notice(message); this.end('error'); }
  end(state: CallState = 'ended') {
    if (this.ended) return;
    this.ended = true; this.ready = false; this.abort.abort();
    this.rtc?.end(state); this.rtc = null;
    this.timers.forEach(clearTimeout); this.timers.clear();
    for (const controller of this.tools.values()) controller.abort(); this.tools.clear();
    this.capture?.disconnect(); if (this.capture) this.capture.port.onmessage = null;
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); this.stream = null;
    this.socket?.close(); this.socket = null; this.credentials = null; this.handle = '';
    this.stopPlayback(); this.output?.disconnect(); void this.audio?.close().catch(() => {}); this.audio = null;
    this.options.level(0); this.state(state);
  }
}
