import { createHash, randomInt } from 'node:crypto';
import { z } from 'zod';
import { dbError, readSession, reply, rpc, writeRequest } from '@/lib/api-route';
import { keyHint, openKey, sealKey } from '@/lib/ai/crypto';
import { applicationOrigin } from '@/lib/auth-input';
import { botServerHash, botServerSecret, telegramWebhookSecret } from '@/lib/bot/secrets';
import { deleteWebhook, getMe, setWebhook, TelegramError } from '@/lib/bot/telegram';

export const dynamic = 'force-dynamic';
const messengerAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save_telegram'), enabled: z.boolean(), token: z.string().trim().max(200).nullable() }),
  z.object({ action: z.literal('link_code'), channel: z.literal('telegram') }),
  z.object({ action: z.literal('unlink'), channel: z.literal('telegram') }),
]);
type Status = { channels: { channel: string; enabled: boolean; bot_username: string; linked: boolean }[]; owner: boolean };

// GET: what this person sees (is the bot on, is my chat linked); ?admin=1: the owner's panel.
export async function GET(request: Request) {
  const session = await readSession();
  if (session instanceof Response) return session;
  return rpc(session, new URL(request.url).searchParams.get('admin') === '1' ? 'messenger_admin_state' : 'messenger_status');
}

export async function POST(request: Request) {
  const input = await writeRequest(request, messengerAction, 4_000);
  if (input instanceof Response) return input;
  const { session, body } = input;
  if (body.action === 'unlink') return rpc(session, 'messenger_unlink', { channel_id: body.channel });

  if (body.action === 'link_code') {
    const status = await session.client.rpc('messenger_status');
    if (status.error) return dbError(status.error);
    const telegram = (status.data as Status).channels.find(item => item.channel === 'telegram');
    if (!telegram?.enabled || !telegram.bot_username) return reply({ error: 'O robô do Telegram ainda não foi configurado.' }, 409);
    // 8 characters without look-alikes; the database keeps only the hash, valid for 15 minutes and once.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join('');
    const saved = await session.client.rpc('messenger_create_code', { channel_id: 'telegram', code_hash: createHash('sha256').update(code).digest('hex') });
    if (saved.error) return dbError(saved.error);
    return reply({ ok: true, data: { code, link: `https://t.me/${telegram.bot_username}?start=${code}` } });
  }

  // Owner: save the token, register the webhook with its secret and record the server secret's hash.
  let hash: string;
  try { hash = botServerHash(); } catch (error) { return reply({ error: error instanceof Error ? error.message : 'Segredo do servidor ausente.' }, 503); }
  const origin = applicationOrigin(process.env);
  if (!origin) return reply({ error: 'Endereço do aplicativo não configurado.' }, 503);
  let token = body.token || '';
  let username: string | null = null;
  let ciphertext: string | null = null;
  try {
    if (token) {
      const me = await getMe(token);
      username = me.username; ciphertext = sealKey(token);
    } else {
      // No new token: use the saved one (read through the bot function, which needs the server secret).
      const current = await session.client.rpc('bot_settings', { server_secret: botServerSecret(), channel_id: 'telegram' });
      if (current.error || !current.data?.token_ciphertext) return reply({ error: 'Cole o token do robô (BotFather) antes de ligar.' }, 409);
      token = openKey(current.data.token_ciphertext);
    }
    if (body.enabled) await setWebhook(token, `${origin}/api/telegram/webhook`, telegramWebhookSecret());
    else await deleteWebhook(token);
  } catch (error) {
    return reply({ error: error instanceof TelegramError ? error.message : error instanceof Error ? error.message : 'Não foi possível falar com o Telegram.' }, 502);
  }
  const saved = await session.client.rpc('messenger_save', { channel_id: 'telegram', next_enabled: body.enabled, next_username: username,
    next_ciphertext: ciphertext, next_hint: ciphertext ? keyHint(token) : null, server_hash: hash });
  if (saved.error) return dbError(saved.error);
  return reply({ ok: true, data: { bot_username: username } });
}
