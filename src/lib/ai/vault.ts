import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Provider keys are stored only as AES-256-GCM ciphertext. The secret lives in the server
// environment (AI_KEYS_SECRET, 32 random bytes in base64), never in the database or the browser.
function secret() {
  const value = Buffer.from(process.env.AI_KEYS_SECRET ?? '', 'base64');
  if (value.length !== 32) throw new Error('Segredo de cifragem da IA não configurado no servidor.');
  return value;
}
export const aiSecretReady = () => { try { secret(); return true; } catch { return false; } };

export function sealKey(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function openKey(sealed: string) {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Chave guardada em formato desconhecido.');
  const decipher = createDecipheriv('aes-256-gcm', secret(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// What the panel may show: never the key, only a hint to recognize it.
export const keyHint = (plain: string) => plain.trim().startsWith('{') ? 'JSON' : plain.trim().slice(-4);
