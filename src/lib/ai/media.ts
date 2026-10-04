export const AI_IMAGE_LIMIT = 4_000_000;
export type AiImage = { mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; base64: string };
/** Validate the file bytes, rather than trusting a filename or a submitted Content-Type. */
export function imageMime(bytes: Uint8Array): AiImage['mimeType'] | null {
  const starts = (header: number[]) => header.every((value, index) => bytes[index] === value);
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  return null;
}
export function chatImageContent(text: string, image?: AiImage) {
  return image ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}`, detail: 'auto' } }] : text;
}
export function claudeImageContent(text: string, image?: AiImage) {
  return image ? [{ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64 } }, { type: 'text', text }] : text;
}
export function responsesImageContent(text: string, image?: AiImage) {
  return image ? [{ type: 'input_text', text }, { type: 'input_image', image_url: `data:${image.mimeType};base64,${image.base64}`, detail: 'auto' }] : text;
}
