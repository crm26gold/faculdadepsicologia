// AudioWorklet keeps microphone encoding off the UI thread. No recording is written to disk.
class JornadaVoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(Math.round(sampleRate / 10));
    this.offset = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (const sample of channel) {
      this.samples[this.offset++] = sample;
      if (this.offset !== this.samples.length) continue;
      const bytes = new ArrayBuffer(1600 * 2);
      const pcm = new DataView(bytes);
      let energy = 0;
      for (let index = 0; index < 1600; index++) {
        const position = index * this.samples.length / 1600;
        const first = Math.floor(position), fraction = position - first;
        const sample = Math.max(-1, Math.min(1, this.samples[first] * (1 - fraction) + this.samples[Math.min(first + 1, this.samples.length - 1)] * fraction));
        pcm.setInt16(index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
        energy += sample * sample;
      }
      this.port.postMessage({ pcm: bytes, level: Math.sqrt(energy / 1600) }, [bytes]);
      this.offset = 0;
    }
    return true;
  }
}
registerProcessor('jornada-voice-capture', JornadaVoiceCapture);
