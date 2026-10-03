import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { privateMedia, mediaRange, mediaSignature } from '../src/lib/private-media';
import { imageReview } from '../src/lib/ai/image-review';
import { parseCommand } from '../src/lib/commands';

function fixture() {
  const file = `${randomUUID()}.png`, owner = randomUUID();
  const bytes = new Uint8Array(100); bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const info = { id: randomUUID(), version: '1', size: bytes.length, contentType: 'image/png', etag: 'original', lastModified: '2026-10-03T12:00:00Z' };
  let downloads = 0, checks = 0, transferred = 0;
  const storage = {
    async info(path: string) { checks++; return path === `${owner}/${file}` ? { data: info, error: null } : { data: null, error: new Error('Denied') }; },
    async createSignedUrl(path: string) { assert.equal(path, `${owner}/${file}`); return { data: { signedUrl: 'https://storage.example.invalid/private' }, error: null }; },
  };
  const fetcher: typeof fetch = async (_, init) => {
    downloads++;
    const range = new Headers(init?.headers).get('range');
    const slice = range ? mediaRange(range, bytes.length)! : { start: 0, end: bytes.length - 1 };
    const result = bytes.slice(slice.start, slice.end + 1); transferred += result.length;
    return new Response(result, { status: range ? 206 : 200, headers: { 'ETag': 'original', ...(range ? { 'Content-Range': `bytes ${slice.start}-${slice.end}/${bytes.length}` } : {}) } });
  };
  const get = (headers: HeadersInit = {}, method = 'GET', account = owner) => privateMedia(new Request('https://jornada.example.invalid/api/note-media/' + file, { method, headers }), account, file, storage, fetcher);
  return { info, bytes, get, storage, fetcher, owner, file, counters: () => ({ downloads, checks, transferred }) };
}

test('mídia privada revalida acesso e retorna 304 sem novo download; outra conta não reutiliza cache', async () => {
  const f = fixture();
  const first = await f.get(); assert.equal(first.status, 200); assert.deepEqual(new Uint8Array(await first.arrayBuffer()), f.bytes);
  assert.equal(first.headers.get('cache-control'), 'private, no-cache'); assert.equal(first.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(first.headers.get('vary'), 'Cookie'); assert.equal(first.headers.get('location'), null);
  const after = f.counters();
  const unchanged = await f.get({ 'If-None-Match': first.headers.get('etag')! });
  assert.equal(unchanged.status, 304); assert.equal((await unchanged.arrayBuffer()).byteLength, 0);
  assert.equal(f.counters().downloads, after.downloads); assert.equal(f.counters().checks, after.checks + 1);
  const other = await f.get({ 'If-None-Match': first.headers.get('etag')! }, 'GET', randomUUID());
  assert.equal(other.status, 404); assert.match(other.headers.get('cache-control')!, /no-store/); assert.equal(f.counters().downloads, after.downloads);
  f.info.version = '2';
  const changed = await f.get({ 'If-None-Match': first.headers.get('etag')! });
  assert.equal(changed.status, 200); assert.notEqual(changed.headers.get('etag'), first.headers.get('etag')); await changed.arrayBuffer();
});

test('HEAD e byte ranges preservam busca e reprodução sem baixar o arquivo todo', async () => {
  const f = fixture();
  const head = await f.get({}, 'HEAD'); assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), '100'); assert.equal(f.counters().downloads, 0);
  const seek = await f.get({ Range: 'bytes=70-79', 'If-Range': head.headers.get('etag')! });
  assert.equal(seek.status, 206); assert.equal(seek.headers.get('content-range'), 'bytes 70-79/100');
  assert.deepEqual(new Uint8Array(await seek.arrayBuffer()), f.bytes.slice(70, 80)); assert.equal(f.counters().transferred, 42);
  const changed = await f.get({ Range: 'bytes=70-79', 'If-Range': '"old-version"' });
  assert.equal(changed.status, 200); assert.equal((await changed.arrayBuffer()).byteLength, 100);
  const invalid = await f.get({ Range: 'bytes=100-200' }); assert.equal(invalid.status, 416); assert.equal(invalid.headers.get('content-range'), 'bytes */100');
});

test('texto disfarçado de foto, MIME ativo e arquivo grande são rejeitados antes de servir conteúdo', async () => {
  const fake = fixture(); fake.bytes.set(new TextEncoder().encode('<p>Este arquivo só contém texto.</p>'));
  const rejected = await fake.get(); assert.equal(rejected.status, 415); assert.equal(fake.counters().downloads, 1); assert.equal((await rejected.arrayBuffer()).byteLength, 0);
  const html = fixture(); html.info.contentType = 'text/html'; assert.equal((await html.get()).status, 415); assert.equal(html.counters().downloads, 0);
  const large = fixture(); large.info.size = 100_000_000; assert.equal((await large.get()).status, 415); assert.equal(large.counters().downloads, 0);
});

test('limite de download considera o trecho solicitado antes de transferir bytes', async () => {
  const f = fixture(); const charged: number[] = [];
  const response = await privateMedia(new Request('https://jornada.example.invalid', { headers: { Range: 'bytes=50-59' } }), f.owner, f.file, f.storage, f.fetcher,
    async length => { charged.push(length); return new Response(null, { status: 429 }); });
  assert.equal(response.status, 429); assert.deepEqual(charged, [10]); assert.equal(f.counters().downloads, 0);
});

test('ranges múltiplos/invalidos são recusados e texto comum não é uma assinatura de mídia', () => {
  for (const value of ['bytes=0-1,4-8', 'bytes=-0', 'bytes=4-2', 'bytes=-', 'bytes=999-', 'bytes=NaN-']) assert.equal(mediaRange(value, 100), null);
  assert.deepEqual(mediaRange('bytes=-10', 100), { start: 90, end: 99 }); assert.deepEqual(mediaRange('bytes=10-', 100), { start: 10, end: 99 });
  for (const extension of ['jpg', 'png', 'gif', 'webp', 'mp3', 'wav', 'ogg', 'mp4', 'webm', 'mov', 'm4a']) assert.equal(mediaSignature(new TextEncoder().encode('Arquivo de texto inofensivo'), extension), false);
});

test('foto não pode produzir ações mesmo quando o modelo devolve um plano aceito pelo executor', () => {
  const raw = JSON.stringify({ reply: 'Total legível: R$50.', actions: [{ type: 'financeiro', description: 'Não autorizado pela foto', amount: 500, flow: 'expense', date: '2026-10-03' }] });
  assert.equal(parseCommand(raw).actions.length, 1);
  const result = imageReview(raw); assert.deepEqual(result.actions, []); assert.equal(result.reply, 'Total legível: R$50.');
});
