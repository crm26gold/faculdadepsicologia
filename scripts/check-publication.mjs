import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Brand images visually reviewed on 2026-09-28. Any changed bytes require a new review.
const reviewedAssets = new Map([
  ['public/jornalogoplena369.png', '306000dfba0ac562fd77e167f863cbc3824f2477fa4f06a191d8c9eeba992189'],
  ['public/logopleno9.png', '2ef299c5d80f0432cbb753528b8b4f01b124e9f0601f25f38bf4fd8849b56c70'],
]);

// Audit the exact Git index, not ignored local files or environment values.
const paths = execFileSync('git', ['ls-files', '--cached', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
if (!paths.length) throw new Error('Nenhum arquivo no índice Git para revisar.');
const allowedRoot = new Set(['.env.example', '.gitignore', '.nvmrc', '.vercelignore', 'AGENTS.md', 'README.md', 'CONTRIBUTING.md', 'next-env.d.ts', 'next.config.ts', 'package.json', 'package-lock.json', 'playwright.config.ts', 'tsconfig.json', 'vercel.json']);
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
  if (!allowedRoot.has(path) && !/^(?:src|tests|supabase|scripts|docs|\.github)\//.test(path)) problems.push(`${path}: fora da lista de publicação`);
  if (/\.(?:zip|png|jpg|jpeg|pdf|pem|key|p12|db|sqlite|csv)$/i.test(path)) problems.push(`${path}: arquivo requer revisão manual antes de publicar`);
  const content = execFileSync('git', ['show', `:${path}`], { encoding: 'utf8', maxBuffer: 5_000_000 });
  if (signatures.some(pattern => pattern.test(content))) problems.push(`${path}: possível credencial ou identificação pessoal (valor omitido)`);
  if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== content.replaceAll('\r\n', '\n')) problems.push(`${path}: difere do índice; prepare novamente antes de publicar`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else console.log(`Revisados ${paths.length} arquivos do índice: nenhum alerta automático. Isso não substitui revisão humana.`);
