import type { CallState } from './protocol';
import type { VoiceOptions } from './client';
import { boundedLiveText, DelegationInput, liveResultText } from './transcripts';

type LiveEvent = { type?: string; delta?: string; start_ms?: number; end_ms?: number; offset_ms?: number; delegation?: { id?: string; target?: string }; };
/** Native GPT-Live over WebRTC; audio transport and delegation are separate from Jornada domain rules. */
export class GptLivePeer {
  private peer = new RTCPeerConnection();
  private channel: RTCDataChannel | null = null;
  private audio = new Audio();
  private closed = false;
  private ready = false;
  private tasks = new Map<string, Promise<unknown>>();
  private queue = Promise.resolve();
  private state: CallState = 'connecting';
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private input = { id: '', text: '', end: -1, startedAt: 0 };
  private output = { id: '', text: '', end: -1 };
  private pendingInput = new DelegationInput();
  private lastResult: Promise<unknown> | null = null;
  private speechTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(private options: VoiceOptions, private stream: MediaStream, private signal: AbortSignal) {}
  private setState(value: CallState) { this.state = value; this.options.state(value); }
  private send(value: object) { if (!this.closed && this.ready && this.channel?.readyState === 'open') this.channel.send(JSON.stringify(value)); }
  async start() {
    this.audio.autoplay = true;
    this.audio.setAttribute('playsinline', '');
    this.peer.ontrack = event => {
      this.audio.srcObject = new MediaStream([event.track]);
      void this.audio.play().catch(() => this.options.notice('Toque no controle de áudio para ouvir a resposta.'));
    };
    this.peer.onconnectionstatechange = () => {
      if (this.closed) return;
      if (this.peer.connectionState === 'failed') this.fail('A conexão de voz caiu. Os registros já salvos continuam na Jornada.');
      if (this.peer.connectionState === 'disconnected') {
        this.setState('reconnecting'); clearTimeout(this.timeout);
        this.timeout = setTimeout(() => { if (this.peer.connectionState === 'disconnected') this.fail('Não consegui reconectar a chamada. Inicie outra para continuar.'); }, 8000);
      } else if (this.peer.connectionState === 'connected' && this.state === 'reconnecting') { clearTimeout(this.timeout); this.setState('listening'); }
    };
    this.stream.getAudioTracks().forEach(track => this.peer.addTrack(track, this.stream));
    this.channel = this.peer.createDataChannel('oai-events');
    this.channel.onmessage = event => {
      if (this.closed) return;
      try { this.receive(JSON.parse(event.data) as LiveEvent); } catch { this.fail('Não consegui interpretar a resposta da chamada.'); }
    };
    this.channel.onclose = () => { if (!this.closed) this.fail('A chamada foi desconectada. Você pode retomar esta conversa em outra chamada.'); };
    await this.peer.setLocalDescription(await this.peer.createOffer());
    if (this.peer.iceGatheringState !== 'complete') await new Promise<void>((resolve, reject) => {
      const done = () => { clearTimeout(timer); this.peer.removeEventListener('icegatheringstatechange', changed); this.signal.removeEventListener('abort', aborted); };
      const changed = () => { if (this.peer.iceGatheringState === 'complete') { done(); resolve(); } };
      const aborted = () => { done(); reject(new DOMException('Cancelled', 'AbortError')); };
      const timer = setTimeout(() => { done(); reject(new Error('A conexão de áudio não respondeu a tempo.')); }, 10_000);
      this.peer.addEventListener('icegatheringstatechange', changed); this.signal.addEventListener('abort', aborted, { once: true }); changed();
    });
    this.signal.throwIfAborted();
    const context = this.options.context?.() ?? { context: '', history: [] };
    const response = await fetch('/api/ai/live/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: this.signal,
      body: JSON.stringify({ sdp: this.peer.localDescription?.sdp, ...context }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não consegui preparar a chamada na OpenAI.');
    this.signal.throwIfAborted();
    await this.peer.setRemoteDescription({ type: 'answer', sdp: result.data.sdp });
    this.timeout = setTimeout(() => { if (!this.ready) this.fail('A OpenAI não iniciou o áudio a tempo. Inicie outra chamada.'); }, 20_000);
  }
  private receive(event: LiveEvent) {
    if (event.type === 'session.started') {
      clearTimeout(this.timeout); this.ready = true; this.setState('listening');
      this.send({ type: 'session.instructions.append', event_id: crypto.randomUUID(), delegation_id: null, content: 'A chamada começou. Cumprimente brevemente e pergunte como pode ajudar.' });
    } else if (event.type === 'session.closed') this.end();
    else if (event.type === 'error' || event.type === 'session.failed') this.fail('A OpenAI interrompeu a sessão. Confira o acesso e a cota da API.');
    else if (event.type === 'session.input_transcript.delta' && event.delta) {
      const start = event.start_ms ?? 0, end = event.end_ms ?? start;
      if (!this.input.id || start - this.input.end > 1500) this.input = { id: crypto.randomUUID(), text: '', end, startedAt: Date.now() };
      this.input.text += event.delta; this.input.end = end;
      this.pendingInput.add(event.delta, start, end);
      this.options.transcript(this.input.id, 'me', this.input.text);
    } else if (event.type === 'session.output_transcript.delta' && event.delta) {
      const start = event.start_ms ?? 0, end = event.end_ms ?? start;
      if (!this.output.id || start - this.output.end > 1500) this.output = { id: crypto.randomUUID(), text: '', end };
      this.output.text += event.delta; this.output.end = end;
      this.options.transcript(this.output.id, 'assistant', this.output.text);
      this.setState('speaking'); clearTimeout(this.speechTimer);
      this.speechTimer = setTimeout(() => { if (!this.closed && this.state === 'speaking') this.setState('listening'); }, Math.max(1000, end - start));
    } else if (event.type === 'session.delegation.created' && event.delegation?.target === 'client' && event.delegation.id) this.delegate(event.delegation.id, event.offset_ms);
  }
  private delegate(id: string, offset?: number) {
    const existing = this.tasks.get(id);
    if (existing) return; // A replayed delegation must never create the same record twice.
    if (this.tasks.size >= 100) { this.fail('Esta chamada atingiu o limite de pedidos. Inicie outra para continuar.'); return; }
    // Capture at dispatch, before another utterance can arrive while a previous task is running.
    const request = this.pendingInput.take(offset);
    const result = !request && this.lastResult ? this.lastResult : this.queue.then(async () => {
      if (this.closed || this.signal.aborted) return;
      const transcript = request?.transcript ?? { text: '', startedAt: 0 };
      if (!transcript.text.trim()) return { saved: false, reply: 'Não recebi a transcrição do pedido. Peça à pessoa que repita.' };
      this.setState('working');
      try { return await this.options.tool({ id, name: 'organizar_jornada', args: { instruction: transcript.text.slice(-2000) } }, this.signal, transcript); }
      catch (error) { return { saved: false, reply: error instanceof Error ? error.message : 'Não consegui concluir esse pedido.' }; }
      finally { if (!this.closed) this.setState('listening'); }
    });
    this.tasks.set(id, result); this.lastResult = result; this.queue = result.then(() => undefined);
    void result.then(value => { if (value !== undefined) this.send({ type: 'session.commentary.append', event_id: crypto.randomUUID(), delegation_id: id, content: liveResultText(value) }); });
  }
  volume(on: boolean) { this.audio.muted = !on; if (on) void this.audio.play().catch(() => {}); }
  notify(content: string) { this.send({ type: 'session.commentary.append', event_id: crypto.randomUUID(), delegation_id: null, content: boundedLiveText(content) }); }
  interrupt() { this.send({ type: 'session.instructions.append', event_id: crypto.randomUUID(), delegation_id: null, content: 'Pare de falar e escute o próximo pedido. Essa interrupção não cancela registros já autorizados.' }); }
  private fail(message: string) { this.options.notice(message); this.end('error'); }
  end(state: CallState = 'ended') {
    if (this.closed) return;
    if (this.ready && this.channel?.readyState === 'open') this.channel.send(JSON.stringify({ type: 'session.close' }));
    this.closed = true; this.ready = false; clearTimeout(this.timeout); clearTimeout(this.speechTimer);
    this.audio.pause(); this.audio.srcObject = null;
    // Give the close command a chance to reach the provider while releasing microphone/audio immediately.
    const peer = this.peer, channel = this.channel;
    const cleanup = () => { clearTimeout(grace); channel?.close(); peer.close(); };
    if (channel) { channel.onclose = null; channel.onmessage = event => { try { if (JSON.parse(event.data).type === 'session.closed') cleanup(); } catch {} }; }
    this.peer.onconnectionstatechange = null;
    this.stream.getTracks().forEach(track => track.stop());
    const grace = setTimeout(cleanup, 15_000);
    this.setState(state);
  }
}
