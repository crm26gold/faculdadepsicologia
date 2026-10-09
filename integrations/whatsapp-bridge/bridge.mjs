import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import wwebjs from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { validConfig, privatePeer, linkCode, canRetryDelivery, withRetry, reconnectPlan, spoken, outboxItem } from './protocol.mjs';
import { synthesize } from './speech.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const stateDir = join(root, '.state'); mkdirSync(stateDir, { recursive: true, mode: 0o700 });
const config = validConfig(JSON.parse(readFileSync(join(stateDir, 'config.json'), 'utf8')));
const ledgerFile = join(stateDir, 'delivery.json');
let ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : {};
const persist = () => {
  const temp = `${ledgerFile}.tmp`; writeFileSync(temp, JSON.stringify(ledger), { mode: 0o600 }); renameSync(temp, ledgerFile);
};
let phase = 'offline'; let relay = ''; let qr = null; let stopping = false; let delivering = false;
let voice = 'pt-BR-AntonioNeural'; let heartbeatBusy = false;
let reconnectTimer = null; let reconnects = 0; let session = 0; let halted = false;
const { Client, LocalAuth, MessageMedia } = wwebjs;
const client = new Client({ authStrategy: new LocalAuth({ clientId: 'jornada', dataPath: join(stateDir, 'auth') }),
  webVersionCache: { type: 'local', path: join(stateDir, 'web-cache') },
  puppeteer: { headless: true }, deviceName: 'Jornada Plena', browserName: 'Chrome' });

async function call(body) {
  const response = await fetch(`${config.origin}/api/whatsapp/bridge`, { method: 'POST', redirect: 'error',
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'Servidor indisponível.'); error.status = response.status; throw error; }
  return data.data;
}
async function heartbeat() {
  if (heartbeatBusy || stopping) return; heartbeatBusy = true;
  try { const data = await call({ action: 'heartbeat', state: phase, relay, qr }); voice = data.voice; if (data.outbox?.length) void sendOutbox(data.outbox); }
  catch (error) { if (error.status === 401) console.warn('Ponte pausada ou credencial revogada. Nenhum pedido será executado.'); else console.warn('Sem resposta da Jornada. Aguardando reconexão.'); }
  finally { heartbeatBusy = false; }
}
client.on('qr', async value => { phase = 'qr'; qr = await QRCode.toDataURL(value, { width: 280, margin: 2 }); void heartbeat(); });
client.on('authenticated', () => { phase = 'connecting'; qr = null; void heartbeat(); });
client.on('ready', () => {
  relay = client.info?.wid?.user ?? ''; phase = 'ready'; qr = null;
  console.info('WhatsApp conectado. Gere o código do seu telefone em Administração › WhatsApp.');
  reconnects = 0; halted = false;
  // Do not download media from unknown senders automatically.
  void Promise.allSettled([client.setAutoDownloadAudio(false), client.setAutoDownloadPhotos(false), client.setAutoDownloadVideos(false), client.setAutoDownloadDocuments(false)]);
  void heartbeat();
});
client.on('auth_failure', () => { phase = 'offline'; qr = null; console.warn('Falha na sessão do WhatsApp. Reinicie a ponte e conecte novamente.'); void heartbeat(); });
client.on('disconnected', reason => lost(reason));
// Reconnects with growing waits up to 5 minutes. Logs carry only a library state code, never message content.
function lost(reason, what = 'WhatsApp desconectado') {
  if (stopping || halted || reconnectTimer) return;
  const plan = reconnectPlan(reason, reconnects); qr = null;
  if (plan.stop) { halted = true; phase = 'offline'; console.warn(plan.stop); void heartbeat(); return; }
  phase = 'connecting'; reconnects++;
  console.warn(`${what}${plan.code ? ` (${plan.code})` : ''}. Nova tentativa em ${plan.wait / 1000} s.`);
  void heartbeat();
  reconnectTimer = setTimeout(() => { reconnectTimer = null; void start(); }, plan.wait);
}
async function start() {
  // Closes the previous attempt's browser (harmless when none). A stale initialize() failing later schedules nothing.
  const current = ++session;
  await client.destroy().catch(() => {});
  try { await client.initialize(); }
  catch { if (current === session) lost(undefined, 'Não consegui abrir o WhatsApp Web'); }
}

async function canonicalPeer(message) {
  const direct = privatePeer(message.from); if (direct) return direct;
  if (!/^[0-9]+@lid$/.test(message.from)) return null;
  const entries = await client.getContactLidAndPhone([message.from]);
  return privatePeer(entries.find(item => item.lid === message.from)?.pn);
}
let receiving = Promise.resolve(); let incomingCount = 0; let dropped = 0;
client.on('message', message => {
  if (phase !== 'ready' || message.fromMe || !/@(?:c\.us|lid)$/.test(message.from)) return;
  if (incomingCount >= 20) { dropped++; console.warn(`Muitas mensagens ao mesmo tempo: ${dropped} descartada(s) desde que a ponte iniciou. Peça para reenviar.`); return; }
  incomingCount++;
  receiving = receiving.then(() => receive(message)).catch(() => console.warn('Não consegui receber uma mensagem. Confira a conexão no painel.')).finally(() => { incomingCount--; });
});
// The Jornada deduplicates by message id and link codes are single use, so a repeated call adds no new effect.
const send = body => withRetry(() => call(body));
async function receive(message) {
  const peer = await canonicalPeer(message); if (!peer || peer === relay) return;
  const code = linkCode(message.body);
  if (code) {
    const linked = await send({ action: 'link', peer, code });
    if (linked.linked) await client.sendMessage(message.from, 'Telefone vinculado à sua Jornada. Envie texto ou áudio para organizar seu espaço. Exclusões pedem confirmação.');
    return;
  }
  // Check account authorization BEFORE downloading or sending any media to an AI.
  await send({ action: 'check', peer });
  const message_id = createHash('sha256').update(message.id._serialized).digest('hex');
  if (ledger[message_id]) return;
  let media;
  if (message.hasMedia) {
    if (!['ptt', 'audio', 'image'].includes(message.type) || Number(message._data?.size || 0) > 2_000_000 || Number(message.duration || 0) > 180) return;
    const downloaded = await message.downloadMedia(); if (!downloaded || downloaded.data.length > 2_666_668) return;
    media = { mimeType: downloaded.mimetype, base64: downloaded.data, ...(message.duration ? { seconds: message.duration } : {}) };
  }
  if (!message.body?.trim() && !media) return;
  const result = await send({ action: 'message', peer, message_id, timestamp: message.timestamp, text: (message.body || '').slice(0, 2400), ...(media ? { media } : {}) });
  ledger[message_id] = { peer, chat: message.from, id: result.id, phase: 'waiting', created: Date.now() }; persist();
  void deliver();
}
// Reminders the Jornada asked to send (the person asked for them). One attempt per heartbeat; a send that failed returns
// to the queue, a confirmed one is never repeated.
let sendingOutbox = false;
async function sendOutbox(items) {
  if (sendingOutbox || phase !== 'ready' || stopping) return; sendingOutbox = true;
  try {
    for (const raw of items) {
      const item = outboxItem(raw); if (!item) continue;
      const key = `out:${item.id}`;
      if (ledger[key]?.phase === 'sent') { await call({ action: 'sent', id: item.id }).catch(() => {}); continue; }
      if (ledger[key]?.phase === 'sending') continue;
      ledger[key] = { phase: 'sending', created: Date.now() }; persist();
      try {
        const sent = await client.sendMessage(item.chat, item.text);
        if (!sent?.id?._serialized) throw new Error('Entrega não confirmada.');
        ledger[key].phase = 'sent'; persist();
        await call({ action: 'sent', id: item.id }).catch(() => {});
      } catch { delete ledger[key]; persist(); console.warn('Não consegui entregar um lembrete no WhatsApp. Nova tentativa no próximo batimento.'); }
    }
  } finally { sendingOutbox = false; }
}
async function voiceMedia(text, selectedVoice) {
  const bytes = await synthesize(text, selectedVoice, stateDir);
  return new MessageMedia('audio/ogg; codecs=opus', bytes.toString('base64'), 'jornada.ogg');
}
async function deliver() {
  if (delivering || phase !== 'ready' || stopping) return; delivering = true;
  try {
    for (const [key, item] of Object.entries(ledger)) {
      if (!canRetryDelivery(item)) continue;
      try {
        const receipt = await call({ action: 'result', peer: item.peer, id: item.id });
        if (!['done', 'failed'].includes(receipt.status) || !receipt.result?.reply) continue;
        if (receipt.delivered) { item.phase = 'sent'; persist(); continue; }
        let audio;
        if (spoken(receipt.result)) {
          try { audio = await voiceMedia(receipt.result.reply, receipt.voice || voice); }
          catch { console.warn('Voz indisponível nesta resposta. Enviando o texto confirmado.'); }
        }
        // Re-check revocation after the potentially slow speech request.
        await call({ action: 'check', peer: item.peer });
        // Sending has no provider-side idempotency key. On a crash, do not blindly send twice.
        item.phase = 'sending'; persist();
        const sent = await client.sendMessage(item.chat, audio || receipt.result.reply, audio ? { sendAudioAsVoice: true } : {});
        if (!sent?.id?._serialized) throw new Error('Entrega não confirmada.');
        item.phase = 'sent'; item.sentId = sent.id._serialized; persist();
        await call({ action: 'ack', peer: item.peer, id: item.id });
      } catch (error) {
        if (error.status === 403 || error.status === 404) { item.phase = 'revoked'; persist(); }
        else if (item.phase === 'sending') console.warn('Entrega incerta. Confira a conversa antes de reenviar. O comando não será executado novamente.');
      }
    }
    for (const [key, item] of Object.entries(ledger)) if (item.created < Date.now() - 31 * 86_400_000 && item.phase !== 'waiting') delete ledger[key];
    persist();
  } finally { delivering = false; }
}
for (const item of Object.values(ledger)) if (item.phase === 'sending') console.warn('Há uma resposta com entrega incerta. Confira o WhatsApp; ela não será reenviada automaticamente.');
const heartbeatTimer = setInterval(() => void heartbeat(), 30_000);
const deliveryTimer = setInterval(() => void deliver(), 5000);
async function stop() {
  if (stopping) return; stopping = true; clearInterval(heartbeatTimer); clearInterval(deliveryTimer); clearTimeout(reconnectTimer);
  const forceClose = setTimeout(() => { client.pupBrowser?.process()?.kill(); process.exit(0); }, 25_000);
  try { await call({ action: 'heartbeat', state: 'offline', relay, qr: null }); } catch {}
  await client.destroy().catch(() => {}); clearTimeout(forceClose); process.exit(0);
}
process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
console.info('Iniciando a ponte exclusiva da Jornada. O QR aparecerá em Administração › WhatsApp.');
await start();
