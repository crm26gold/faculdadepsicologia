import { z } from 'zod';
import { dbError, readSession, reply, writeRequest } from '@/lib/api-route';
import { vapidKeys } from '@/lib/bot/secrets';
import { reminderLevels } from '@/lib/reminders';
import { dispatchReminders, extraChannels } from '@/lib/reminders-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const action = z.discriminatedUnion('action', [
  z.object({ action: z.literal('subscribe'), endpoint: z.url().startsWith('https://').max(1000), p256dh: z.string().regex(/^[A-Za-z0-9_-]{40,200}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{10,100}$/), label: z.string().trim().max(80) }).strict(),
  z.object({ action: z.literal('unsubscribe'), endpoint: z.string().max(1000) }).strict(),
  z.object({ action: z.literal('prefs'), phone: z.string().trim().regex(/^(\+[1-9][0-9]{9,14})?$/, 'Use o formato +55 com DDD, só números.'), call: z.boolean(), email: z.boolean() }).strict(),
  z.object({ action: z.literal('test'), level: z.enum(reminderLevels) }).strict(),
  z.object({ action: z.literal('ack'), id: z.uuid(), choice: z.enum(['feito', 'adiar']) }).strict(),
  z.object({ action: z.literal('get'), id: z.uuid() }).strict(),
]);

export async function GET() {
  const session = await readSession();
  if (session instanceof Response) return session;
  const { data, error } = await session.client.rpc('reminders_state');
  if (error) return dbError(error);
  let vapid = '';
  try { vapid = vapidKeys().publicKey; } catch { /* server secret missing: notifications stay off */ }
  return reply({ ok: true, data: { ...data, vapid, extra: extraChannels() } });
}

export async function POST(request: Request) {
  const input = await writeRequest(request, action, 4_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  const call = (name: string, params: Record<string, unknown>) => session.client.rpc(name, params);
  switch (body.action) {
    case 'subscribe': {
      const { error } = await call('push_subscribe', { next_endpoint: body.endpoint, next_p256dh: body.p256dh, next_auth: body.auth, next_label: body.label });
      return error ? dbError(error) : reply({ ok: true, data: null });
    }
    case 'unsubscribe': {
      const { error } = await call('push_unsubscribe', { old_endpoint: body.endpoint });
      return error ? dbError(error) : reply({ ok: true, data: null });
    }
    case 'prefs': {
      const { error } = await call('reminder_prefs_save', { next_phone: body.phone, next_call: body.call, next_email: body.email });
      return error ? dbError(error) : reply({ ok: true, data: null });
    }
    case 'test': {
      const created = await call('reminder_test', { next_level: body.level });
      if (created.error?.code === 'PT429') return reply({ error: 'Aguarde um minuto entre um teste e outro.' }, 429);
      if (created.error) return dbError(created.error);
      // Sent right away, only this person's: the answer shows what each channel did.
      const sent = await dispatchReminders(session.user.id).catch(() => []);
      return reply({ ok: true, data: { id: created.data, deliveries: sent.find(item => item.id === created.data)?.deliveries ?? [] } });
    }
    case 'ack': {
      const { data, error } = await call('reminder_ack', { reminder: body.id, choice: body.choice });
      return error ? dbError(error) : reply({ ok: true, data });
    }
    case 'get': {
      const { data, error } = await call('reminder_get', { reminder: body.id });
      return error ? dbError(error) : data ? reply({ ok: true, data }) : reply({ error: 'Lembrete não encontrado nesta conta.' }, 404);
    }
  }
}
