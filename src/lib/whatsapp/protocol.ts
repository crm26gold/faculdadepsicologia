import { z } from 'zod';
import { imageMime } from '../ai/media';

export const WA_MEDIA_LIMIT = 2_000_000;
const peer = z.string().regex(/^[0-9]{10,15}$/);
const job = z.object({ peer, id: z.uuid() });
export const bridgeInput = z.discriminatedUnion('action', [
  z.object({ action: z.literal('heartbeat'), state: z.enum(['offline', 'qr', 'connecting', 'ready']), relay: z.string().regex(/^[0-9]{0,15}$/), qr: z.string().max(70_000).nullable().default(null) }).strict(),
  z.object({ action: z.literal('check'), peer }).strict(),
  z.object({ action: z.literal('link'), peer, code: z.string().regex(/^[A-HJ-NP-Z2-9]{8}$/) }).strict(),
  z.object({ action: z.literal('message'), peer, message_id: z.string().min(1).max(180), timestamp: z.number().int(), text: z.string().trim().max(2400),
    media: z.object({ mimeType: z.string().max(64), base64: z.string().max(2_666_668), seconds: z.number().min(0).max(180).optional() }).strict().optional() }).strict(),
  job.extend({ action: z.literal('result') }).strict(),
  job.extend({ action: z.literal('ack') }).strict(),
  // A reminder from the outbox reached WhatsApp.
  z.object({ action: z.literal('sent'), id: z.uuid() }).strict(),
]);
export type IncomingMessage = Extract<z.infer<typeof bridgeInput>, { action: 'message' }>;

/** No remote URLs, executable documents or filename-based trust in the bridge protocol. */
export function validatedMedia(media: IncomingMessage['media']) {
  if (!media) return undefined;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(media.base64)) throw new Error('Arquivo inválido.');
  const bytes = Buffer.from(media.base64, 'base64');
  if (bytes.length < 12 || bytes.length > WA_MEDIA_LIMIT) throw new Error('Envie um arquivo de até 2 MB.');
  const image = imageMime(bytes);
  if (image && image !== 'image/gif' && media.mimeType === image) return { kind: 'image' as const, mimeType: image, base64: media.base64 };
  const ascii = (a: number, b: number) => bytes.subarray(a, b).toString('ascii');
  const mime = ascii(0, 4) === 'OggS' ? 'audio/ogg' : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE' ? 'audio/wav'
    : ascii(4, 8) === 'ftyp' ? 'audio/mp4' : ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) ? 'audio/mpeg'
      : bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ? 'audio/webm' : null;
  if (!mime || media.mimeType.split(';')[0] !== mime) throw new Error('Formato não aceito. Envie áudio, JPEG, PNG ou WebP.');
  return { kind: 'audio' as const, mimeType: mime, base64: media.base64 };
}
export function freshMessage(timestamp: number, now = Date.now()) {
  return timestamp * 1000 <= now + 60_000 && timestamp * 1000 >= now - 86_400_000;
}
export function confirmationIntent(text: string, code: string) {
  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase().replace(/[.!?]+$/, '');
  return normalized.replace(/\s/g, '') === `confirmar${code}`;
}
