import 'server-only';
import { createECDH, createHash, createHmac } from 'node:crypto';

// Both secrets derive from AI_KEYS_SECRET, so there is no new variable to configure. Rotating that
// secret means saving the Telegram token again in the panel (which also re-encrypts it).
function base() {
  const value = process.env.AI_KEYS_SECRET ?? '';
  if (Buffer.from(value, 'base64').length !== 32) throw new Error('Segredo do servidor (AI_KEYS_SECRET) não configurado.');
  return value;
}
const derive = (purpose: string) => createHmac('sha256', base()).update(purpose).digest('hex');

/** Proves to the database that the caller is this server (the database stores only its hash). */
export const botServerSecret = () => derive('jornada-bot-db-v1');
export const botServerHash = () => createHash('sha256').update(botServerSecret()).digest('hex');
/** Telegram repeats it in every webhook call (header X-Telegram-Bot-Api-Secret-Token). */
export const telegramWebhookSecret = () => derive('jornada-telegram-webhook-v1');
/** Different scope: the relay never receives this database credential. */
export const whatsappServerSecret = () => derive('jornada-whatsapp-db-v1');
/** Web Push (VAPID) key pair, also derived: nothing to configure. Rotating AI_KEYS_SECRET asks each device to turn
 * notifications on again (the push services refuse the old subscriptions and they leave the list). */
export function vapidKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(Buffer.from(derive('jornada-vapid-v1'), 'hex'));
  return { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: ecdh.getPrivateKey().toString('base64url') };
}
