export const NOTE_BUCKET = 'note-attachments';
export const MEDIA_LIMIT = 25 * 1024 * 1024;
export const mediaTypes: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
};
export const mediaKind = (type: string) => type.startsWith('image/') ? 'image' : type.startsWith('video/') ? 'video' : 'audio';
export function validMedia(type: string, size: number) {
  return typeof type === 'string' && Object.hasOwn(mediaTypes, type) && Number.isSafeInteger(size) && size > 0 && size <= MEDIA_LIMIT;
}
export function safeLink(value: string) {
  try {
    if (/\s/.test(value)) return false;
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}
export function safeMediaSource(value: unknown): string {
  return typeof value === 'string' && /^\/api\/note-media\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp3|m4a|wav|ogg|webm|mp4|mov)$/.test(value) ? value : '';
}
