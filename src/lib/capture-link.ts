import { parsePlace, placeKey, type Place } from './notebooks';

// "Manda o arquivo": an assistant cannot pass the bytes it sees to a tool, so it hands the person a short-lived
// link that opens Registro rápido already pointing at the destination. The upload itself is the app's own private
// upload, with the person's login; the link carries only where to save and until when.
export const CAPTURE_LINK_MINUTES = 10;

export function captureLink(origin: string, place: Place, now: number) {
  const url = new URL('/', origin);
  url.searchParams.set('capturar', placeKey(place));
  url.searchParams.set('ate', String(now + CAPTURE_LINK_MINUTES * 60_000));
  return url.toString();
}

/** What a capture link in the address asks for; null when there is none. */
export function readCaptureLink(search: string, now: number): { place: Place } | { expired: true } | null {
  const params = new URLSearchParams(search);
  const key = params.get('capturar');
  if (!key) return null;
  const until = Number(params.get('ate'));
  if (!Number.isFinite(until) || until < now || until > now + (CAPTURE_LINK_MINUTES + 5) * 60_000) return { expired: true };
  return { place: parsePlace(key) };
}
