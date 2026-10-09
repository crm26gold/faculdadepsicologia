import { reply } from '@/lib/api-route';
import { botServerSecret } from '@/lib/bot/secrets';
import { demoRequested } from '@/lib/config';
import { dispatchReminders } from '@/lib/reminders-server';
import { botDatabase } from '@/lib/supabase/bot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The database clock (pg_cron) calls this only when a reminder is due. Its code lives in the database vault;
// the database checks it, together with this server's own secret.
export async function POST(request: Request) {
  if (demoRequested(process.env)) return reply({ error: 'Indisponível.' }, 404);
  const token = request.headers.get('x-jornada-clock') ?? '';
  const db = botDatabase();
  if (!db) return reply({ error: 'Indisponível.' }, 503);
  if (!/^[0-9a-f]{64}$/.test(token)) return reply({ error: 'Relógio não autorizado.' }, 401);
  let secret: string;
  try { secret = botServerSecret(); } catch { return reply({ error: 'Indisponível.' }, 503); }
  const clock = await db.rpc('reminders_clock_ok', { server_secret: secret, token });
  if (clock.error || clock.data !== true) return reply({ error: 'Relógio não autorizado.' }, 401);
  try { return reply({ ok: true, data: { sent: (await dispatchReminders()).length } }); }
  catch { return reply({ error: 'Não consegui enviar os lembretes agora.' }, 503); }
}
