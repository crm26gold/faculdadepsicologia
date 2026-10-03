import { createHash } from 'node:crypto';
import { MEDIA_LIMIT, mediaTypes } from './note-media';
import { imageMime } from './ai/media';

type Info = { id: string; version: string; size?: number; contentType?: string; etag?: string; lastModified?: string };
type Storage = {
  info(path: string): Promise<{ data: Info | null; error: unknown }>;
  createSignedUrl(path: string, seconds: number): Promise<{ data: { signedUrl: string } | null; error: unknown }>;
};
const noStore = { 'Cache-Control': 'private, no-store', 'CDN-Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const verified = new Map<string, number>(); // Format checks only; never skips authentication or Storage RLS.

export function mediaSignature(bytes: Uint8Array, extension: string): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  const mime = imageMime(bytes);
  if (['jpg', 'png', 'webp', 'gif'].includes(extension)) return !!mime && mediaTypes[mime] === extension;
  if (extension === 'wav') return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
  if (extension === 'ogg') return ascii(0, 4) === 'OggS';
  if (extension === 'mp3') return ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0);
  if (extension === 'webm') return [0x1a, 0x45, 0xdf, 0xa3].every((n, i) => bytes[i] === n);
  if (['mp4', 'm4a', 'mov'].includes(extension)) return ascii(4, 8) === 'ftyp' || (extension === 'mov' && ['moov', 'mdat', 'wide'].includes(ascii(4, 8)));
  return false;
}

export function mediaRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start || (!match[1] && Number(match[2]) <= 0)) return null;
  return { start, end };
}

/** Stable private URL: authorize every request, but transfer bytes only when the browser lacks this version. */
export async function privateMedia(request: Request, owner: string, file: string, storage: Storage, fetcher: typeof fetch = fetch,
  budget: (bytes: number) => Promise<Response | null> = async () => null): Promise<Response> {
  const failure = (status: number) => new Response(null, { status, headers: noStore });
  try {
    const path = `${owner}/${file}`;
    const { data, error } = await storage.info(path);
    if (error || !data) return failure(404);
    const size = data.size ?? 0, type = data.contentType?.split(';')[0].trim().toLowerCase() ?? '', extension = file.split('.').at(-1)!;
    if (!Number.isSafeInteger(size) || size <= 0 || size > MEDIA_LIMIT || mediaTypes[type] !== extension) return failure(415);
    const etag = `"${createHash('sha256').update(JSON.stringify([owner, file, data.id, data.version, data.etag, data.lastModified, size])).digest('hex')}"`;
    const headers = new Headers({ 'Cache-Control': 'private, no-cache', 'CDN-Cache-Control': 'no-store', 'Vary': 'Cookie',
      'ETag': etag, 'Accept-Ranges': 'bytes', 'Content-Type': type, 'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': `inline; filename="${file}"` });
    const modified = data.lastModified && Date.parse(data.lastModified);
    if (modified && Number.isFinite(modified)) headers.set('Last-Modified', new Date(modified).toUTCString());
    const matches = request.headers.get('if-none-match')?.split(',').some(value => value.trim().replace(/^W\//, '') === etag || value.trim() === '*');
    if (matches) return new Response(null, { status: 304, headers }); // Auth and existence were checked first.
    let range = request.method === 'HEAD' ? null : request.headers.get('range');
    const ifRange = request.headers.get('if-range');
    if (range && ifRange && ifRange !== etag && !(modified && Number.isFinite(Date.parse(ifRange)) && modified <= Date.parse(ifRange))) range = null;
    const slice = range ? mediaRange(range, size) : { start: 0, end: size - 1 };
    if (!slice) return new Response(null, { status: 416, headers: { ...noStore, 'Content-Range': `bytes */${size}` } });
    const length = slice.end - slice.start + 1;
    headers.set('Content-Length', String(length));
    if (request.method === 'HEAD') return new Response(null, { headers });
    const limited = await budget(length);
    if (limited) return limited;
    const signed = await storage.createSignedUrl(path, 120);
    if (signed.error || !signed.data) return failure(404);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
    const download = (requested?: string) => fetcher(signed.data!.signedUrl, { cache: 'no-store', redirect: 'error', signal,
      headers: { 'Accept-Encoding': 'identity', ...(requested ? { Range: requested } : {}) } });
    // Validate only a tiny prefix. This works for video seeks too, without buffering a whole file in Vercel.
    if ((verified.get(etag) ?? 0) < Date.now()) {
      const prefix = await download(`bytes=0-${Math.min(31, size - 1)}`);
      if (prefix.status !== 206 || !prefix.body || prefix.headers.get('content-range') !== `bytes 0-${Math.min(31, size - 1)}/${size}`) { await prefix.body?.cancel(); return failure(502); }
      const reader = prefix.body.getReader();
      const chunks: number[] = [];
      try { while (chunks.length < Math.min(16, size)) { const part = await reader.read(); if (part.done) break; chunks.push(...part.value.subarray(0, 32 - chunks.length)); } }
      finally { await reader.cancel(); }
      if (!mediaSignature(new Uint8Array(chunks), extension)) return failure(415);
      if (verified.size >= 500) verified.clear();
      verified.set(etag, Date.now() + 300_000);
    }
    const response = await download(range ? `bytes=${slice.start}-${slice.end}` : undefined);
    const expectedRange = `bytes ${slice.start}-${slice.end}/${size}`;
    if (response.status !== (range ? 206 : 200) || !response.body || (range && response.headers.get('content-range') !== expectedRange)) {
      await response.body?.cancel(); return failure(502);
    }
    // Refuse a version change between metadata and download rather than caching it under the old validator.
    if (data.etag && response.headers.get('etag') && data.etag.replaceAll('"', '') !== response.headers.get('etag')!.replaceAll('"', '')) {
      await response.body.cancel(); return failure(409);
    }
    const reader = response.body.getReader();
    let received = 0;
    if (range) headers.set('Content-Range', expectedRange);
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const part = await reader.read();
          if (part.done) { if (received !== length) throw new Error('Incomplete media'); controller.close(); return; }
          received += part.value.length;
          if (received > length) throw new Error('Oversized media');
          controller.enqueue(part.value);
        } catch (cause) { await reader.cancel(); controller.error(cause); }
      },
      cancel: () => reader.cancel(),
    });
    return new Response(body, { status: range ? 206 : 200, headers });
  } catch { return failure(503); }
}
