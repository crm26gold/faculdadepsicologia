import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Brand files (owner's Jornada Plena identity, vector master) visually reviewed on 2026-10-01. Any changed bytes require a new review.
const reviewedAssets = new Map([
  ['public/brand/simbolo.svg', 'cba66f8a8dc232d25844873ec2850fde1c0b21bafe4462b08bb78f767aab48a0'],
  ['public/brand/simbolo-revertido.svg', '0cb2f1c76ac9843d3ce059d9b76f3d0fa488188668c7ae0ba432fb49459e70ad'],
  ['public/brand/simbolo-reduzido.svg', '185ff2cd60f0b97765cd7abc9d3a8dc9352ee092043952076fe01c3f21572130'],
  ['public/brand/icone-180.png', 'bddea385fc2b78fe84e2420693fb905dcf693ec0d5bb63515ef6bbd5182bdf4d'],
  ['public/brand/icone-192.png', 'c73a86436045ade131a533ed5651a54a535a96f8170d316a39212b240cd8671b'],
  ['public/brand/icone-512.png', '5d2940c0b952c59571567980f4e6671a757f0370bfc4476edaffefe99c25cf1d'],
]);

// Audit the exact Git index, not ignored local files or environment values.
const paths = execFileSync('git', ['ls-files', '--cached', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
if (!paths.length) throw new Error('Nenhum arquivo no índice Git para revisar.');
const allowedRoot = new Set(['.env.example', '.gitignore', '.nvmrc', '.vercelignore', 'AGENTS.md', 'README.md', 'CONTRIBUTING.md', 'next-env.d.ts', 'next.config.ts', 'package.json', 'package-lock.json', 'postcss.config.mjs', 'playwright.config.ts', 'tsconfig.json', 'vercel.json', 'public/voice-capture.worklet.js']);
const signatures = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:sb_secret_|sbp_|gh[pousr]_|github_pat_|sk-proj-)[A-Za-z0-9_-]{20,}/,
  /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/,
  /[A-Z0-9._%+-]+@(?:gmail|hotmail|outlook|yahoo)\.com\b/i,
];
const problems = [];
for (const path of paths) {
  if (reviewedAssets.has(path)) {
    const bytes = execFileSync('git', ['show', `:${path}`], { maxBuffer: 5_000_000 });
    if (createHash('sha256').update(bytes).digest('hex') !== reviewedAssets.get(path)) problems.push(`${path}: imagem alterada; requer nova revisão manual`);
    if (!readFileSync(path).equals(bytes)) problems.push(`${path}: difere do índice; prepare novamente antes de publicar`);
    continue;
  }
  const bridgeSource = /^integrations\/whatsapp-bridge\/(?:package(?:-lock)?\.json|(?:bridge|protocol|protocol\.test|speech|smoke)\.mjs)$/.test(path);
  if (!allowedRoot.has(path) && !bridgeSource && !/^(?:src|tests|supabase|scripts|docs|\.github|\.claude\/skills)\//.test(path)) problems.push(`${path}: fora da lista de publicação`);
  if (/\.(?:zip|png|jpg|jpeg|pdf|pem|key|p12|db|sqlite|csv)$/i.test(path)) problems.push(`${path}: arquivo requer revisão manual antes de publicar`);
  const content = execFileSync('git', ['show', `:${path}`], { encoding: 'utf8', maxBuffer: 5_000_000 });
  if (signatures.some(pattern => pattern.test(content))) problems.push(`${path}: possível credencial ou identificação pessoal (valor omitido)`);
  if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== content.replaceAll('\r\n', '\n')) problems.push(`${path}: difere do índice; prepare novamente antes de publicar`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else console.log(`Revisados ${paths.length} arquivos do índice: nenhum alerta automático. Isso não substitui revisão humana.`);
