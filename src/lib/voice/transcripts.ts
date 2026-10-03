import type { VoiceTranscript } from './protocol';

/** A delegation contains an offset, not a user utterance. Snapshot only unconsumed input. */
export class DelegationInput {
  private sequence = 0;
  private consumed = 0;
  private fragments: { sequence: number; text: string; start: number; end: number; at: number }[] = [];
  add(text: string, start: number, end: number, at = Date.now()) {
    this.fragments.push({ sequence: ++this.sequence, text, start, end, at });
    this.fragments = this.fragments.slice(-500);
  }
  take(offset = Infinity): { key: string; transcript: VoiceTranscript } | null {
    const fragments = this.fragments.filter(item => item.sequence > this.consumed && item.end <= offset);
    if (!fragments.length) return null;
    this.consumed = fragments.at(-1)!.sequence;
    return { key: String(this.consumed), transcript: { text: fragments.map(item => item.text).join('').slice(-2000), startedAt: fragments[0].at } };
  }
}
/** A conservative byte cap also bounds appended model tokens, including non-Latin text. */
export function boundedLiveText(text: string, maxBytes = 480) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  if (bytes.length <= maxBytes) return text;
  let end = maxBytes - 3;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return `${new TextDecoder().decode(bytes.slice(0, end))}…`;
}
export function liveResultText(value: unknown) {
  if (!value || typeof value !== 'object') return boundedLiveText('O núcleo não retornou um resultado confirmado. Peça à pessoa que confira o aplicativo.');
  const result = value as { saved?: boolean; reply?: string; error?: string };
  return boundedLiveText(`Salvamento ${result.saved === true ? 'confirmado' : 'não confirmado'}. ${result.reply || result.error || 'Confira o resultado no aplicativo.'}`);
}
