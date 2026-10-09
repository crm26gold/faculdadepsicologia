export function validConfig(value) {
  const url = new URL(value.origin);
  if (!(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash || !/^jpwa_[A-Za-z0-9_-]{43}$/.test(value.token)) throw new Error('Configuração inválida. Baixe um novo arquivo pelo painel da Jornada.');
  return { origin: url.origin, token: value.token };
}
export function privatePeer(id) {
  return typeof id === 'string' && /^[0-9]{10,15}@c\.us$/.test(id) ? id.split('@')[0] : null;
}
export function linkCode(body) {
  return body?.trim().match(/^\/vincular\s+([A-HJ-NP-Z2-9]{8})$/i)?.[1]?.toUpperCase() ?? null;
}
export function speechText(text) {
  // Speech is literal text, never SSML supplied by a model or by a caller.
  return String(text).replace(/[<>]/g, '').replace(/https?:\/\/\S+/g, 'link disponível na Jornada').replace(/[*_`#]/g, '').slice(0, 4000);
}
export const canRetryDelivery = item => item.phase === 'waiting';
// Waits before each attempt. A network error has no status and is retried, like a 5xx; a 4xx is the Jornada's final answer.
const retryWaits = [0, 500, 2000, 5000];
export async function withRetry(task, sleep = wait => new Promise(done => setTimeout(done, wait))) {
  let failure;
  for (const wait of retryWaits) {
    if (wait) await sleep(wait);
    try { return await task(); } catch (error) { failure = error; if (error?.status < 500) break; }
  }
  throw failure;
}
// Retrying these would only fight another session, hammer a blocked number or wait for a QR nobody scans.
const loggedOut = 'A sessão do WhatsApp foi encerrada no celular. Escaneie o novo QR no painel; se ele não aparecer, reinicie a ponte.';
const blocked = 'O WhatsApp bloqueou este número. A ponte não vai tentar reconectar.';
const ownerSteps = new Map([['LOGOUT', loggedOut], ['UNPAIRED', loggedOut], ['UNPAIRED_IDLE', loggedOut], ['TOS_BLOCK', blocked], ['SMB_TOS_BLOCK', blocked],
  ['CONFLICT', 'A mesma sessão do WhatsApp foi aberta em outro lugar. Feche a outra ponte ou navegador e reinicie esta.']]);
export function reconnectPlan(reason, attempt) {
  const stop = ownerSteps.get(reason);
  return stop ? { stop, code: reason } : { wait: Math.min(300_000, 5000 * 2 ** attempt), code: /^[A-Z_]{1,32}$/.test(reason) ? reason : '' };
}
// The reply text reaches the online speech service only on an explicit request from the Jornada.
export const spoken = result => result?.speak === true;

/** A reminder from the Jornada outbox, or null when it does not have the expected shape. Sent only to a phone (c.us). */
export function outboxItem(item) {
  if (!item || typeof item.id !== 'string' || !/^[0-9a-f-]{36}$/.test(item.id) || typeof item.peer !== 'string' || !/^[0-9]{10,15}$/.test(item.peer)
    || typeof item.text !== 'string' || !item.text.trim()) return null;
  return { id: item.id, chat: `${item.peer}@c.us`, text: item.text.slice(0, 1000) };
}
