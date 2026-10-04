import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  return isIP(address) === 6 && /^[23]/.test(address) && !/^2002:/i.test(address)
    && !/^2001:(?:0{0,3}[012]:|0?db8:)/i.test(address);
}

/** Custom API endpoints must resolve publicly. Pin the validated address to prevent DNS rebinding. */
export async function publicHttps(url: string, init: RequestInit): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password || target.hash || (target.port && target.port !== '443')) throw new Error('Use um endpoint HTTPS público na porta 443.');
  const hostname = target.hostname.replace(/^\[|\]$/g, '');
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
  signal.throwIfAborted();
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await new Promise<Awaited<ReturnType<typeof lookup>>[]>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    lookup(hostname, { all: true }).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
  if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('Endereços internos ou reservados não são permitidos.');
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const address = addresses[0];
    const req = httpsRequest(target, { method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers)), signal,
      lookup: (_host, options, callback) => {
        if (typeof options === 'object' && options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      }, timeout: 30_000,
    }, response => {
      const chunks: Buffer[] = []; let bytes = 0;
      response.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 2_000_000) req.destroy(new Error('Resposta excede o limite.')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        const status = response.statusCode ?? 502;
        // Never forward a saved credential to a redirect destination.
        if (status >= 300 && status < 400) { reject(new Error('Redirecionamentos não são permitidos.')); return; }
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) if (value) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
        resolve(new Response([204,205,304].includes(status) ? null : Buffer.concat(chunks).toString('utf8'), { status, headers }));
      });
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(new Error('Tempo esgotado.')));
    req.end(typeof init.body === 'string' ? init.body : undefined);
  });
}
