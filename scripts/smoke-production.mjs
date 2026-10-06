#!/usr/bin/env node
// Smoke de produção, só leitura: confere o site publicado como um visitante sem conta.
// Não envia cookies nem credenciais e nunca imprime o corpo das respostas. Sai com código 1 se algo falhar.
// Uso: npm run smoke [-- https://outra-origem]
const DEFAULT_ORIGIN = 'https://faculdadepsicologia.vercel.app';
const TIMEOUT_MS = 15_000;
// Mesmos valores de next.config.ts.
const securityHeaders = {
  'x-content-type-options': value => value === 'nosniff',
  'x-frame-options': value => value?.toUpperCase() === 'DENY',
  'referrer-policy': value => value === 'strict-origin-when-cross-origin',
  'x-robots-tag': value => /\bnoindex\b/.test(value ?? ''),
};

let origin;
try {
  const url = new URL(process.argv[2] ?? DEFAULT_ORIGIN);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error();
  origin = url.origin;
} catch {
  console.error('Informe só a origem, em http(s), sem caminho, usuário ou senha. Exemplo: npm run smoke -- https://exemplo.vercel.app');
  process.exit(1);
}

const json = { 'content-type': 'application/json' };
const checks = [
  { name: 'GET /', path: '/', status: 200 },
  { name: 'GET /login', path: '/login', status: 200 },
  { name: 'GET /api/me sem sessão', path: '/api/me', status: 401, api: true },
  { name: 'POST /api/assistant/jobs sem sessão', path: '/api/assistant/jobs', method: 'POST', headers: { ...json, origin }, status: 401, api: true },
  { name: 'POST /api/assistant/jobs com origem indevida', path: '/api/assistant/jobs', method: 'POST', headers: { ...json, origin: 'https://origem-indevida.invalid' }, status: 403, api: true },
];

console.log(`Smoke de produção (só leitura) em ${origin}`);
let failures = 0;
for (const check of checks) {
  const problems = [];
  let status = 'ERR';
  try {
    const response = await fetch(origin + check.path, {
      method: check.method ?? 'GET', redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'jornada-plena-smoke', ...check.headers },
      body: check.method === 'POST' ? '{}' : undefined,
    });
    await response.body?.cancel();
    status = response.status;
    if (status !== check.status) problems.push(`esperado ${check.status}`);
    for (const [name, valid] of Object.entries(securityHeaders)) if (!valid(response.headers.get(name))) problems.push(`${name} ausente ou diferente`);
    if (check.api && !/no-store/.test(response.headers.get('cache-control') ?? '')) problems.push('API sem cache-control no-store');
  } catch (error) {
    problems.push(error?.name === 'TimeoutError' ? `sem resposta em ${TIMEOUT_MS / 1000} s` : `falha de rede (${error?.cause?.code ?? error?.cause?.message ?? error?.name ?? 'desconhecida'})`);
  }
  if (problems.length) failures++;
  console.log(`${problems.length ? 'FALHA' : 'OK   '} ${check.name.padEnd(46)} HTTP ${String(status).padEnd(3)} ${problems.join('; ')}`.trimEnd());
}

console.log(failures ? `Smoke reprovado: ${failures} de ${checks.length} verificações falharam.` : `Smoke aprovado: ${checks.length} verificações.`);
process.exitCode = failures ? 1 : 0;
