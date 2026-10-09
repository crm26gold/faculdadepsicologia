import 'server-only';
import { z } from 'zod';
import { openKey, sealKey } from '@/lib/ai/crypto';
import { screens, type Screen } from './names';
import type { RecentChange } from './screen-model';

// The image of a screen, opened by a link that works without the Jornada login (inside ChatGPT, Claude or a phone's
// browser) and only for a few minutes. The link carries, sealed with the server's key (AES-256-GCM), the hash of the
// assistant key that asked for it: the image is drawn from that key's own account, and revoking the key ends its links.
// Nobody can read or forge the token; nothing in it is reusable after it expires.
export const SCREEN_LINK_MINUTES = 10;
const payload = z.object({ k: z.literal('tela'), h: z.string().regex(/^[a-f0-9]{64}$/), s: z.enum(screens), e: z.number().int(),
  r: z.object({ at: z.string().max(40), labels: z.array(z.string().max(120)).max(5), ids: z.array(z.string().max(100)).max(20) }).optional() }).strict();

export function screenLink(origin: string, tokenHash: string, screen: Screen, now: number, recent?: RecentChange) {
  const sealed = sealKey(JSON.stringify({ k: 'tela', h: tokenHash, s: screen, e: now + SCREEN_LINK_MINUTES * 60_000,
    ...(recent ? { r: { at: recent.at.slice(0, 40), labels: recent.labels.slice(0, 5).map(label => label.slice(0, 120)), ids: recent.ids.slice(0, 20) } } : {}) }));
  return `${origin.replace(/\/$/, '')}/api/tela/ver/${Buffer.from(sealed).toString('base64url')}.png`;
}

/** The link's contents, or null when it was altered, is not a screen link, or expired. */
export function readScreenLink(token: string, now: number) {
  try {
    const value = payload.parse(JSON.parse(openKey(Buffer.from(token.replace(/\.png$/, ''), 'base64url').toString('utf8'))));
    return value.e > now ? { tokenHash: value.h, screen: value.s, recent: value.r } : null;
  } catch { return null; }
}
