import 'server-only';
import webpush from 'web-push';
import { openKey } from '@/lib/ai/crypto';
import { botServerSecret, vapidKeys } from '@/lib/bot/secrets';
import { sendMessage } from '@/lib/bot/telegram';
import { botDatabase } from '@/lib/supabase/bot';
import { channelsFor, privateText, reminderLink, reminderText, type ClaimedReminder, type Delivery, type ReminderChannel } from './reminders';

type Env = Record<string, string | undefined>;
export const appOrigin = (env: Env = process.env) => (env.APP_ORIGIN || 'https://faculdadepsicologia.vercel.app').replace(/\/$/, '');
/** E-mail and call use the owner's own accounts (Resend, Twilio): on only when their keys exist on the server. */
export const extraChannels = (env: Env = process.env) => ({
  email: !!env.RESEND_API_KEY,
  call: !!env.TWILIO_ACCOUNT_SID && !!env.TWILIO_AUTH_TOKEN && /^\+[1-9][0-9]{9,14}$/.test(env.TWILIO_FROM ?? ''),
});
const TIMEOUT = 12_000;
const reason = (error: unknown) => (error instanceof Error ? error.message : 'falhou').slice(0, 120);
const xml = (text: string) => text.replace(/[<>&'"]/g, char => `&#${char.charCodeAt(0)};`);

async function push(reminder: ClaimedReminder, body: string, link: string, db: NonNullable<ReturnType<typeof botDatabase>>, secret: string) {
  const { publicKey, privateKey } = vapidKeys();
  const payload = JSON.stringify({ title: 'Jornada Plena', body, url: link, id: reminder.id, insist: reminder.level === 'insistente' });
  let delivered = 0;
  await Promise.all(reminder.push.map(async device => {
    try {
      await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload,
        { vapidDetails: { subject: appOrigin(), publicKey, privateKey }, TTL: 900, urgency: 'high', timeout: TIMEOUT });
      delivered++;
    } catch (error) {
      // 404/410: the device turned notifications off or the app was removed; it leaves the list.
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.rpc('push_drop', { server_secret: secret, old_endpoint: device.endpoint });
    }
  }));
  if (!delivered) throw new Error('nenhum aparelho aceitou');
  return delivered === 1 ? '1 aparelho' : `${delivered} aparelhos`;
}

async function email(to: string, link: string, idempotency: string, env: Env) {
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotency },
    body: JSON.stringify({ from: env.REMINDER_EMAIL_FROM || 'Jornada Plena <onboarding@resend.dev>', to: [to], subject: 'Lembrete da Jornada Plena',
      text: `${privateText}\n\nFeito ou adiar: ${link}` }) });
  if (!response.ok) throw new Error(`e-mail recusado (${response.status})`);
  return 'enviado';
}

async function call(to: string, env: Env) {
  const said = `<Say language="pt-BR" voice="${xml(env.TWILIO_VOICE || 'Polly.Camila')}">${xml(privateText)}</Say>`;
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID!)}/Calls.json`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT),
    headers: { Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: env.TWILIO_FROM!, Twiml: `<Response>${said}<Pause length="1"/>${said}</Response>`, Timeout: '30' }) });
  if (!response.ok) throw new Error(`ligação recusada (${response.status})`);
  return 'chamando';
}

/** Sends what is due (or only this person's, for the test) and records each channel's outcome. Message contents are
 * never logged: the record keeps channel, step, success and a short reason. */
export async function dispatchReminders(only?: string, env: Env = process.env) {
  const db = botDatabase();
  if (!db) return [];
  const secret = botServerSecret();
  const configured = extraChannels(env);
  const origin = appOrigin(env);
  let telegram: Promise<string | null> | null = null;
  const telegramToken = () => telegram ??= Promise.resolve(db.rpc('bot_settings', { server_secret: secret, channel_id: 'telegram' }))
    .then(({ data }) => data?.enabled && data.token_ciphertext ? openKey(data.token_ciphertext) : null).catch(() => null);
  const done: { id: string; deliveries: Delivery[] }[] = [];
  for (let round = 0; round < 3; round++) {
    const claimed = await db.rpc('reminders_claim', { server_secret: secret, only_owner: only ?? null, batch: 25 });
    if (claimed.error) throw new Error('Não consegui ler os lembretes.');
    const items = (claimed.data ?? []) as ClaimedReminder[];
    if (!items.length) break;
    await Promise.all(items.map(async reminder => {
      const text = reminderText(reminder);
      const link = reminderLink(origin, reminder.id);
      const senders: Record<ReminderChannel, () => Promise<string>> = {
        push: () => push(reminder, text, link, db, secret),
        telegram: async () => {
          const token = await telegramToken();
          if (!token) throw new Error('robô do Telegram desligado');
          await sendMessage(token, reminder.telegram!, `⏰ ${text}`, { text: 'Feito ou adiar', url: link });
          return 'enviado';
        },
        whatsapp: async () => {
          const queued = await db.rpc('reminder_outbox_add', { server_secret: secret, reminder: reminder.id, next_peer: reminder.whatsapp, next_body: `⏰ ${text}\nFeito ou adiar: ${link}` });
          if (queued.error) throw new Error('fila indisponível');
          if (!reminder.bridge_online) throw new Error('ponte desligada; sai quando ela ligar (até 30 min)');
          return 'na fila da ponte';
        },
        email: () => email(reminder.email!, link, `${reminder.id}-${reminder.step}`, env),
        call: () => call(reminder.phone!, env),
      };
      const deliveries = await Promise.all(channelsFor(reminder, configured).map(async (channel): Promise<Delivery> => {
        const at = new Date().toISOString();
        try { return { at, step: reminder.step, channel, ok: true, detail: await senders[channel]() }; }
        catch (error) { return { at, step: reminder.step, channel, ok: false, detail: reason(error) }; }
      }));
      if (!deliveries.length) deliveries.push({ at: new Date().toISOString(), step: reminder.step, channel: 'push', ok: false, detail: 'nenhum canal ligado' });
      await db.rpc('reminders_finish', { server_secret: secret, reminder: reminder.id, sent_step: reminder.step, entries: deliveries });
      done.push({ id: reminder.id, deliveries });
    }));
    if (items.length < 25) break;
  }
  if (done.some(item => item.deliveries.some(delivery => !delivery.ok)))
    console.warn('[lembretes]', { sent: done.length, failed: done.flatMap(item => item.deliveries.filter(delivery => !delivery.ok).map(delivery => `${delivery.channel}: ${delivery.detail}`)).slice(0, 10) });
  return done;
}
