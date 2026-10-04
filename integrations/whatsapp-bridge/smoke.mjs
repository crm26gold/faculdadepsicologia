// Explicit transport check, no account pairing, credentials or outgoing messages.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import wwebjs from 'whatsapp-web.js';
import { synthesize } from './speech.mjs';

const state = fileURLToPath(new URL('./.state/smoke/', import.meta.url)); mkdirSync(state, { recursive: true });
if (process.argv.includes('--speech')) {
  const bytes = await synthesize('Olá. Vamos organizar sua jornada com calma, um passo de cada vez.', 'pt-BR-AntonioNeural', state);
  if (bytes.subarray(0, 4).toString() !== 'OggS' || !bytes.includes(Buffer.from('OpusHead'))) throw new Error('Invalid Ogg Opus output');
  console.info(JSON.stringify({ speech: 'ok', encoding: 'ogg/opus', bytes: bytes.length }));
} else {
  const client = new wwebjs.Client({ authStrategy: new wwebjs.LocalAuth({ clientId: 'smoke', dataPath: join(state, 'auth') }),
    webVersionCache: { type: 'none' }, puppeteer: { headless: true } });
  let timer; let succeeded = false;
  try {
    const qr = new Promise((resolve, reject) => { client.once('qr', () => resolve(true)); timer = setTimeout(() => reject(new Error('QR timeout')), 60_000); });
    const initialization = client.initialize(); initialization.catch(() => {});
    await Promise.race([qr, initialization.then(() => { throw new Error('Unexpected authenticated session'); })]);
    console.info(JSON.stringify({ browser: 'ok', whatsappQr: true, accountPaired: false }));
    succeeded = true;
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : 'QR failed');
  } finally {
    clearTimeout(timer);
    const forceClose = setTimeout(() => { client.pupBrowser?.process()?.kill(); process.exit(succeeded ? 0 : 1); }, 10_000);
    await client.destroy().catch(() => {}); clearTimeout(forceClose);
    // initialize() can retain authentication timers after an intentionally unpaired QR.
    process.exit(succeeded ? 0 : 1);
  }
}
