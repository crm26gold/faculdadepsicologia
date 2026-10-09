import 'server-only';
import webpush from 'web-push';
import { openKey } from '@/lib/ai/crypto';
import { botServerSecret, vapidKeys } from '@/lib/bot/secrets';
import { sendMessage } from '@/lib/bot/telegram';
import { botDatabase } from '@/lib/supabase/bot';
import { channelsFor, focusStopLink, reminderLink, reminderText, type ClaimedReminder, type Delivery, type ReminderChannel } from './reminders';

type Env = Record<string, string | undefined>;
export const appOrigin = (env: Env = process.env) => (env.APP_ORIGIN || 'https://faculdadepsicologia.vercel.app').replace(/\/$/, '');
const TIMEOUT = 12_000;
// What the link button says, by kind of reminder.
const action = (reminder: ClaimedReminder) => reminder.forgotten ? 'Encerrar ou continuar' : reminder.focus ? 'Continuar ou pausar' : 'Feito ou adiar';
const reason = (error: unknown) => (error instanceof Error ? error.message : 'falhou').slice(0, 120);

async function push(reminder: ClaimedReminder, body: string, link: string, db: NonNullable<ReturnType<typeof botDatabase>>, secret: string) {
  const { publicKey, privateKey } = vapidKeys();
  const payload = JSON.stringify({ title: reminder.forgotten ? 'O foco ficou ligado?' : reminder.focus ? 'Ainda em foco?' : 'Jornada Plena', body, url: link, id: reminder.id,
    insist: reminder.level === 'insistente' || !!reminder.focus || !!reminder.forgotten, focus: !!reminder.focus, forgotten: !!reminder.forgotten,
    ...(reminder.forgotten ? { stop: focusStopLink(appOrigin(), reminder) } : {}) });
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

/** Sends what is due (or only this person's, for the test) and records each channel's outcome. Message contents are
 * never logged: the record keeps channel, step, success and a short reason. */
export async function dispatchReminders(only?: string, env: Env = process.env) {
  const db = botDatabase();
  if (!db) return [];
  const secret = botServerSecret();
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
          await sendMessage(token, reminder.telegram!, `⏰ ${text}`, { text: action(reminder), url: link });
          return 'enviado';
        },
        whatsapp: async () => {
          const queued = await db.rpc('reminder_outbox_add', { server_secret: secret, reminder: reminder.id, next_peer: reminder.whatsapp, next_body: `⏰ ${text}\n${action(reminder)}: ${link}` });
          if (queued.error) throw new Error('fila indisponível');
          if (!reminder.bridge_online) throw new Error('ponte desligada; sai quando ela ligar (até 30 min)');
          return 'na fila da ponte';
        },
      };
      const deliveries = await Promise.all(channelsFor(reminder).map(async (channel): Promise<Delivery> => {
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
