import { LIVE_SOCKET, liveClientSetup, type CallState, type LiveCredentials, type VoiceTool, type VoiceTranscript } from './protocol';
import { GptLivePeer } from './gpt-live';
import { liveCloseFailure, liveSocketFailure } from './socket-failure';
import { XAI_LIVE_SOCKET, xaiClientSetup, xaiFailureMessage } from './xai-protocol';
import { ELEVENLABS_AUDIO_FORMAT, ELEVENLABS_PROTOCOL, elevenLabsCloseMessage, elevenLabsErrorMessage, elevenLabsSocket, elevenLabsToolResult, pcmRate } from './elevenlabs-protocol';

export type VoiceOptions = {
  context?: () => { context: string; history: { role: 'user' | 'assistant'; text: string }[] };
  credentials: (signal: AbortSignal, skip?: string[]) => Promise<LiveCredentials>;
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
type ElevenLabsMessage = {
  type?: string;
  conversation_initiation_metadata_event?: { user_input_audio_format?: string; agent_output_audio_format?: string };
  ping_event?: { event_id?: number }; audio_event?: { audio_base_64?: string; event_id?: number }; interruption_event?: { event_id?: number };
  user_transcription_event?: { user_transcript?: string }; tentative_user_transcription_event?: { user_transcript?: string };
  agent_response_event?: { agent_response?: string }; agent_response_correction_event?: { corrected_agent_response?: string };
  client_tool_call?: { tool_name?: string; tool_call_id?: string; parameters?: unknown }; error_event?: { error_type?: string };
};
type XaiMessage = { type?:string; delta?:string; transcript?:string; item_id?:string; response_id?:string; call_id?:string; name?:string; arguments?:string;
  response?:{id?:string;status?:string}; error?:{code?:string;type?:string}; };
const providerNames: Record<string, string> = { gemini: 'O Gemini', elevenlabs: 'O ElevenLabs', openai: 'A OpenAI', xai: 'A xAI' };
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
  private skipped = new Set<string>(); private connected = false; private limited = false; private setupTimer: ReturnType<typeof setTimeout> | undefined;
  // ElevenLabs Agents: audio events carry the response id; anything older than an interruption is dropped.
  private eleven = false; private elevenStarted = false; private outputRate = 16_000;
  private interruptedAt = 0; private lastAudioEvent = 0; private assistantId = '';
  private xai = false; private xaiResponse = ''; private xaiAudioItem = ''; private xaiAudioStarted = 0;
  private xaiCancelled = new Set<string>();
  private xaiToolResponse = new Map<string,string>();
  private xaiBatches = new Map<string,{pending:Set<string>;done:boolean;continued:boolean}>();

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
      await this.connect();
    } catch (error) { if (!this.ended) this.fail(microphoneError(error)); }
  }

  /** Asks the server for the next transport; automatic routing skips the ones that already failed. */
  private async connect() {
    this.state('connecting');
    this.ready = false;
    this.credentials = await this.options.credentials(this.abort.signal, [...this.skipped]);
    if (this.ended) return;
    if (!this.limited) {
      this.limited = true;
      this.later(() => { this.options.notice('Chamada encerrada após 20 minutos. Inicie outra para continuar.'); this.end(); }, this.credentials.maxSeconds * 1000);
    }
    if (this.credentials.provider === 'openai') {
      if (!window.RTCPeerConnection) { this.fallback('Este navegador não oferece a conexão de áudio da OpenAI. Abra no Chrome, Edge ou Safari atualizado.'); return; }
      const rtc = this.rtc = new GptLivePeer({ ...this.options, state: value => {
        if (value === 'listening' || value === 'speaking' || value === 'working') this.connected = true;
        if (value === 'ended' || value === 'error') this.end(value); else this.state(value);
      } }, this.stream!, this.abort.signal, message => this.fallback(message));
      try { await rtc.start(); }
      catch (error) {
        if (this.ended || this.rtc !== rtc) return;
        if ((error as Error & { doNotRetry?: boolean })?.doNotRetry) this.fail(microphoneError(error));
        else this.fallback(microphoneError(error));
      }
      return;
    }
    this.eleven = this.credentials.provider === 'elevenlabs';
    this.xai = this.credentials.provider === 'xai';
    this.elevenStarted = false; this.interruptedAt = 0; this.lastAudioEvent = 0; this.handle = '';
    if (!this.capture) {
      if (!window.AudioWorkletNode || !this.audio?.audioWorklet) throw new Error(`Este navegador não oferece a captura de áudio ${this.eleven ? 'da chamada' : 'do Gemini'}. Abra no Chrome, Edge ou Safari atualizado.`);
      await this.audio!.audioWorklet.addModule('/voice-capture.worklet.js');
      if (this.ended) return;
      this.capture = new AudioWorkletNode(this.audio!, 'jornada-voice-capture');
      const source = this.audio!.createMediaStreamSource(this.stream!);
      const silence = this.audio!.createGain(); silence.gain.value = 0;
      source.connect(this.capture); this.capture.connect(silence); silence.connect(this.audio!.destination);
      this.output = this.audio!.createGain(); this.output.connect(this.audio!.destination);
      this.capture.port.onmessage = ({ data }: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
        // ElevenLabs keeps receiving the (silent) stream while muted, so its turn detection never stalls.
        if (this.ended || !this.ready || (this.muted && !this.eleven)) return;
        this.options.level(this.muted ? 0 : Math.min(1, data.level * 7));
        // A disconnected or congested socket must never accumulate microphone data.
        if (this.socket!.bufferedAmount > 256_000) { this.fail('A conexão está lenta demais para o áudio. Confira a internet e inicie outra chamada.'); return; }
        if (this.xai) this.send({type:'input_audio_buffer.append',audio:pcmBase64(data.pcm)});
        else if (this.eleven) this.send({ user_audio_chunk: pcmBase64(data.pcm) });
        else this.send({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: pcmBase64(data.pcm) } } });
      };
    }
    this.open();
  }

  /** Before any audio was exchanged, an automatic route moves to the next company instead of failing. */
  private fallback(message: string) {
    const provider = this.credentials?.provider ?? 'gemini';
    if (this.ended || this.connected || !this.credentials?.fallback || this.skipped.has(provider)) { this.fail(message); return; }
    this.skipped.add(provider);
    const rtc = this.rtc; this.rtc = null; rtc?.dispose();
    clearTimeout(this.setupTimer); if (this.setupTimer) this.timers.delete(this.setupTimer);
    const socket = this.socket; this.socket = null; this.credentials = null;
    if (socket) { socket.onclose = null; socket.onmessage = null; try { socket.close(); } catch {} }
    this.options.notice(`${providerNames[provider]} não aceitou a chamada agora. Tentando a próxima opção configurada…`);
    this.connect().catch(error => { if (!this.ended) this.fail(microphoneError(error)); });
  }

  private open(resuming = false) {
    if (this.ended || !this.credentials) return;
    if (this.xai) { this.openXai(); return; }
    if (this.eleven) { this.openElevenLabs(); return; }
    this.ready = false;
    this.state(resuming ? 'reconnecting' : 'connecting');
    const socket = new WebSocket(`${LIVE_SOCKET}?access_token=${encodeURIComponent(this.credentials.token)}`);
    this.socket = socket;
    const timeout = this.setupTimer = this.later(() => this.fallback('A chamada não respondeu a tempo. Confira a conexão e a configuração do Gemini e tente novamente.'), 20_000);
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
          clearTimeout(timeout); this.timers.delete(timeout); this.ready = true; this.connected = true; this.reconnects = 0; this.state('listening');
          if (!resuming) this.send({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'A chamada começou. Cumprimente brevemente e pergunte como pode me ajudar.' }] }], turnComplete: true } });
        }
        await this.receive(message);
      }).catch(() => { if (!this.ended) this.fail('Não consegui interpretar o áudio recebido. Inicie outra chamada para continuar.'); });
    };
    socket.onerror = () => { /* onclose carries the retry decision; never expose a token-bearing URL. */ };
    socket.onclose = async event => {
      clearTimeout(timeout); this.timers.delete(timeout);
      if (this.ended || socket !== this.socket) return;
      this.ready = false; this.stopPlayback();
      if (this.handle && !this.tools.size && this.reconnects < 2 && Date.now() < Date.parse(this.credentials!.expiresAt) && event.code !== 1008) {
        this.reconnects++; this.state('reconnecting'); this.later(() => this.open(true), 1000 * this.reconnects);
      } else { const safe = await liveCloseFailure(event.code, event.reason); if (!this.ended && socket === this.socket) this.fallback(safe.message); }
    };
  }

  private async receive(message: LiveMessage) {
    if (message.error) { const safe = await liveSocketFailure(message.error); if (!this.ended) this.fallback(safe.message); return; }
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

  private openXai() {
    this.ready=false;this.state('connecting');
    const socket=new WebSocket(`${XAI_LIVE_SOCKET}?model=${encodeURIComponent(this.credentials!.model)}`,[`xai-client-secret.${this.credentials!.token}`]);
    this.socket=socket;
    const timeout=this.setupTimer=this.later(()=>this.fallback('A xAI não iniciou a conversa a tempo. Confira o acesso à API Grok.'),20_000);
    socket.onopen=()=>{if(this.ended||socket!==this.socket){socket.close();return;} const context=this.options.context?.();this.send(xaiClientSetup(this.credentials!.model,context?.context,context?.history));};
    socket.onmessage=event=>{
      this.incoming=this.incoming.then(async()=>{
        if(this.ended||socket!==this.socket)return;
        const raw=typeof event.data==='string'?event.data:event.data instanceof Blob?await event.data.text():new TextDecoder().decode(event.data);
        const message:XaiMessage=JSON.parse(raw);
        if(message.type==='session.updated'){clearTimeout(timeout);this.timers.delete(timeout);}
        this.receiveXai(message);
      }).catch(()=>{if(!this.ended)this.fail('Não consegui interpretar a resposta de voz Grok. Inicie outra chamada.');});
    };
    socket.onerror=()=>{/* Do not disclose the client secret from the socket's protocol. */};
    socket.onclose=()=>{clearTimeout(timeout);this.timers.delete(timeout);if(this.ended||socket!==this.socket)return;this.ready=false;this.stopPlayback();this.fallback(xaiFailureMessage());};
  }
  private receiveXai(message:XaiMessage) {
    switch(message.type){
      case 'session.updated':
        if(this.ready)return;
        this.ready=true;this.connected=true;this.state('listening');
        this.send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text:'A chamada começou. Cumprimente brevemente em português do Brasil e pergunte como pode ajudar.'}]}});
        this.send({type:'response.create'});return;
      case 'input_audio_buffer.speech_started':
        this.inputAt=Date.now();this.cancelXaiAudio(false);this.state(this.tools.size?'working':'listening');return;
      case 'conversation.item.input_audio_transcription.updated':
      case 'conversation.item.input_audio_transcription.completed':{
        const text=message.transcript?.trim();if(!text||!message.item_id)return;
        const startedAt=this.inputAt||Date.now();this.options.transcript(`xai-input-${message.item_id}`,'me',text);
        this.lastInput={text,startedAt};return;
      }
      case 'response.created':
        this.xaiResponse=message.response?.id??'';this.xaiAudioItem='';this.xaiAudioStarted=0;return;
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        if(!message.delta||this.xaiCancelled.has(message.response_id??this.xaiResponse))return;
        if(!this.xaiAudioItem){this.xaiAudioItem=message.item_id??'';this.xaiAudioStarted=this.audio?Math.max(this.audio.currentTime+0.025,this.scheduledAt):0;}
        this.play(message.delta,24_000);return;
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        if(!message.delta||this.xaiCancelled.has(message.response_id??this.xaiResponse))return;
        if(this.outputId!==message.item_id){this.outputId=message.item_id??crypto.randomUUID();this.outputText='';}
        this.outputText+=message.delta;this.options.transcript(`xai-output-${this.outputId}`,'assistant',this.outputText);return;
      case 'response.function_call_arguments.done':{
        if(!message.call_id||!message.name||this.xaiToolResponse.has(message.call_id))return;
        const response=message.response_id??this.xaiResponse;
        const batch=this.xaiBatches.get(response)??{pending:new Set<string>(),done:false,continued:false};
        batch.pending.add(message.call_id);this.xaiBatches.set(response,batch);this.xaiToolResponse.set(message.call_id,response);
        let args:unknown;try{args=JSON.parse(message.arguments??'{}');}catch{this.fail('A xAI enviou uma ação com formato inválido. Inicie outra chamada.');return;}
        this.queueTool({id:message.call_id,name:message.name,args});return;
      }
      case 'response.done':{
        const id=message.response?.id??message.response_id??this.xaiResponse;
        const batch=this.xaiBatches.get(id);if(batch){batch.done=true;this.continueXai(id);}
        if(!this.sources.size)this.state(this.tools.size?'working':'listening');return;
      }
      case 'error':this.fallback(xaiFailureMessage(message.error?.code??message.error?.type));return;
    }
  }
  /** Wait for the complete function-call batch and every saved result before requesting speech. */
  private continueXai(response:string) {
    const batch=this.xaiBatches.get(response);
    if(!batch?.done||batch.pending.size||batch.continued||this.ended)return;
    batch.continued=true;
    if(!this.xaiCancelled.has(response))this.send({type:'response.create'});
    this.xaiBatches.delete(response);
  }
  private cancelXaiAudio(manual:boolean) {
    if(this.xaiResponse){this.xaiCancelled.add(this.xaiResponse);if(this.xaiCancelled.size>20)this.xaiCancelled.delete(this.xaiCancelled.values().next().value!);}
    if(manual)this.send({type:'response.cancel'});
    if(this.xaiAudioItem&&this.audio)this.send({type:'conversation.item.truncate',item_id:this.xaiAudioItem,content_index:0,audio_end_ms:Math.max(0,Math.floor((this.audio.currentTime-this.xaiAudioStarted)*1000))});
    this.stopPlayback();this.xaiAudioItem='';
  }

  private openElevenLabs() {
    const url = elevenLabsSocket(this.credentials!.token);
    if (!url) { this.fallback('A autorização da chamada do ElevenLabs é inválida. Inicie outra chamada.'); return; }
    this.ready = false; this.state('connecting');
    const socket = new WebSocket(url, [ELEVENLABS_PROTOCOL]);
    this.socket = socket;
    const timeout = this.setupTimer = this.later(() => this.fallback('O ElevenLabs não iniciou a conversa a tempo. Confira a conexão e tente novamente.'), 20_000);
    socket.onopen = () => {
      if (this.ended || socket !== this.socket) { socket.close(); return; }
      this.send({ type: 'conversation_initiation_client_data', dynamic_variables: this.credentials!.variables ?? {} });
    };
    socket.onmessage = event => {
      this.incoming = this.incoming.then(async () => {
        if (this.ended || socket !== this.socket) return;
        const raw = typeof event.data === 'string' ? event.data : event.data instanceof Blob ? await event.data.text() : new TextDecoder().decode(event.data);
        const message: ElevenLabsMessage = JSON.parse(raw);
        if (message.type === 'conversation_initiation_metadata') { clearTimeout(timeout); this.timers.delete(timeout); }
        this.receiveElevenLabs(message);
      }).catch(() => { if (!this.ended) this.fail('Não consegui interpretar a resposta do ElevenLabs. Inicie outra chamada para continuar.'); });
    };
    socket.onerror = () => { /* onclose explains the outcome; never expose the signed URL. */ };
    socket.onclose = event => {
      clearTimeout(timeout); this.timers.delete(timeout);
      if (this.ended || socket !== this.socket) return;
      this.ready = false; this.stopPlayback();
      if (event.code === 1000 && this.elevenStarted) {
        if (/duration/i.test(event.reason)) this.options.notice(elevenLabsCloseMessage(event.code, event.reason, true));
        this.end();
      } else this.fallback(elevenLabsCloseMessage(event.code, event.reason, this.elevenStarted));
    };
  }

  private receiveElevenLabs(message: ElevenLabsMessage) {
    switch (message.type) {
      case 'conversation_initiation_metadata': {
        const metadata = message.conversation_initiation_metadata_event ?? {};
        const rate = pcmRate(metadata.agent_output_audio_format ?? ELEVENLABS_AUDIO_FORMAT);
        if ((metadata.user_input_audio_format ?? ELEVENLABS_AUDIO_FORMAT) !== ELEVENLABS_AUDIO_FORMAT || !rate) {
          this.fallback('O agente no ElevenLabs usa um formato de áudio incompatível. Em Administração, teste a conexão de voz para restaurar a configuração.'); return;
        }
        this.outputRate = rate; this.ready = true; this.elevenStarted = true; this.connected = true; this.state('listening');
        return;
      }
      case 'ping': if (typeof message.ping_event?.event_id === 'number') this.send({ type: 'pong', event_id: message.ping_event.event_id }); return;
      case 'audio': {
        const event = message.audio_event, id = Number(event?.event_id ?? 0);
        if (!event?.audio_base_64 || id < this.interruptedAt) return;
        this.lastAudioEvent = Math.max(this.lastAudioEvent, id);
        this.play(event.audio_base_64, this.outputRate);
        return;
      }
      case 'interruption':
        this.interruptedAt = Math.max(this.interruptedAt, Number(message.interruption_event?.event_id ?? this.lastAudioEvent + 1));
        this.stopPlayback(); this.state(this.tools.size ? 'working' : 'listening');
        return;
      case 'tentative_user_transcript':
      case 'user_transcript': {
        const text = (message.type === 'user_transcript' ? message.user_transcription_event : message.tentative_user_transcription_event)?.user_transcript?.trim();
        if (!text) return;
        if (!this.inputId) { this.inputId = crypto.randomUUID(); this.inputAt = Date.now(); }
        this.options.transcript(this.inputId, 'me', text);
        if (message.type === 'user_transcript') { this.lastInput = { text, startedAt: this.inputAt }; this.inputId = ''; }
        return;
      }
      case 'agent_response': {
        const text = message.agent_response_event?.agent_response?.trim();
        if (!text) return;
        this.assistantId = crypto.randomUUID();
        this.options.transcript(this.assistantId, 'assistant', text);
        return;
      }
      case 'agent_response_correction': {
        // After an interruption the agent's turn is cut to what was actually heard.
        const text = message.agent_response_correction_event?.corrected_agent_response?.trim();
        if (text && this.assistantId) this.options.transcript(this.assistantId, 'assistant', text);
        return;
      }
      case 'client_tool_call': {
        const call = message.client_tool_call;
        if (typeof call?.tool_call_id === 'string' && typeof call.tool_name === 'string') this.queueTool({ id: call.tool_call_id, name: call.tool_name, args: call.parameters ?? {} });
        return;
      }
      case 'error':
        this.options.notice(elevenLabsErrorMessage(message.error_event?.error_type));
        if (message.error_event?.error_type === 'max_duration_exceeded') this.end();
        return;
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
    if(this.xai){
      this.send({type:'conversation.item.create',item:{type:'function_call_output',call_id:call.id,output:elevenLabsToolResult(result)}});
      const response=this.xaiToolResponse.get(call.id);if(response!==undefined){this.xaiBatches.get(response)?.pending.delete(call.id);this.continueXai(response);}return;
    }
    if (this.eleven) { this.send({ type: 'client_tool_result', tool_call_id: call.id, result: elevenLabsToolResult(result), is_error: false }); return; }
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
    if(this.xai){this.cancelXaiAudio(true);this.state(this.tools.size?'working':'listening');return;}
    this.stopPlayback(); this.state(this.tools.size ? 'working' : 'listening');
    if (this.eleven) {
      // No client command stops an ElevenLabs turn: drop its remaining audio and tell the agent why.
      this.interruptedAt = Math.max(this.interruptedAt, this.lastAudioEvent + 1);
      this.send({ type: 'contextual_update', text: 'A pessoa tocou em Interromper e não ouviu o restante da sua última fala. Não repita; aguarde o próximo pedido.' });
      return;
    }
    // Gemini 3.8 interrupts active generation only on a completed client turn.
    // Stopping local playback alone lets subsequent server chunks play again.
    this.send({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'Pare de falar e aguarde meu próximo pedido.' }] }], turnComplete: true } });
  }
  mute(value: boolean) {
    this.muted = value; this.options.level(0);
    this.stream?.getAudioTracks().forEach(track => { track.enabled = !value; });
    if(value&&this.xai)this.send({type:'input_audio_buffer.clear'});
    else if (value && !this.eleven) this.send({ realtimeInput: { audioStreamEnd: true } });
  }
  volume(value: boolean) { if (this.rtc) this.rtc.volume(value); if (this.output) this.output.gain.value = value ? 1 : 0; }
  notify(text: string) { if (this.rtc) this.rtc.notify(text); else if(this.xai){this.send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});this.send({type:'response.create'});} else if (this.eleven) this.send({ type: 'user_message', text }); else this.send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }); }
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
