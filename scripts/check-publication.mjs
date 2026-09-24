import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
