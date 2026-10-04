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
