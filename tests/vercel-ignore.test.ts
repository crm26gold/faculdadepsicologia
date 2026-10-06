import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { decide } from '../scripts/vercel-ignore-build.mjs';

const production = { VERCEL_ENV: 'production', VERCEL_GIT_PREVIOUS_SHA: 'a'.repeat(40) };
const listing = (files: string[]) => () => files;

test('Vercel: pula só build de produção que mudou apenas documentação', () => {
  assert.equal(decide(production, listing(['docs/DEPLOYMENT.md', '.claude/skills/pr/SKILL.md', 'README.md', 'supabase/tests/whatsapp_bridge.sql']))[0], true);
  for (const files of [['docs/x.md', 'src/app/page.tsx'], ['supabase/migrations/x.sql'], ['vercel.json'], ['.vercelignore'], ['docs-novos/x.ts']]) {
    assert.equal(decide(production, listing(files))[0], false, files.join(', '));
  }
});

test('Vercel: na dúvida, publica', () => {
  assert.equal(decide({ VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: 'a'.repeat(40) }, listing(['docs/x.md']))[0], false);
  assert.equal(decide({}, listing(['docs/x.md']))[0], false);
  assert.equal(decide(production, listing([]))[0], false, 'diff vazio, como uma nova publicação para aplicar variáveis');
  assert.equal(decide(production, () => { throw new Error('fatal: bad object'); })[0], false);
  let called = false;
  assert.equal(decide({ ...production, VERCEL_GIT_PREVIOUS_SHA: '--output=/tmp/x' }, () => { called = true; return ['docs/x.md']; })[0], false);
  assert.equal(called, false, 'SHA inesperado não chega ao git');
});

test('Vercel: compara com a última publicação bem-sucedida, ou com HEAD^ sem ela', () => {
  const bases: string[] = [];
  const spy = (base: string) => { bases.push(base); return ['docs/x.md']; };
  decide(production, spy);
  decide({ VERCEL_ENV: 'production', VERCEL_GIT_PREVIOUS_SHA: '' }, spy);
  assert.deepEqual(bases, ['a'.repeat(40), 'HEAD^']);
});

test('Vercel: o comando configurado existe e o clone mantém o .git', () => {
  const command = JSON.parse(readFileSync('vercel.json', 'utf8')).ignoreCommand as string;
  assert.ok(command.length <= 256, 'limite do vercel.json');
  assert.ok(existsSync(command.replace(/^node /, '')));
  // A Vercel aplica o .vercelignore logo depois do clone, antes do Ignored Build Step.
  assert.doesNotMatch(readFileSync('.vercelignore', 'utf8'), /^\/?\.git\/?$/m);
});

test('Vercel: diff real considera o caminho antigo de um arquivo movido', () => {
  const script = resolve('scripts/vercel-ignore-build.mjs');
  const root = mkdtempSync(join(tmpdir(), 'jornada-ignore-'));
  const repo = join(root, 'repo');
  // Repositório descartável, isolado da configuração Git de quem roda o teste.
  writeFileSync(join(root, 'gitconfig'), '[user]\n\tname = Teste\n\temail = teste@example.invalid\n');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: join(root, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1' };
  const git = (...args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', env }).stdout.trim();
  const commit = (message: string) => { git('add', '-A'); git('commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
  const run = (previous: string) => spawnSync(process.execPath, [script], { cwd: repo, encoding: 'utf8', env: { ...env, VERCEL_ENV: 'production', VERCEL_GIT_PREVIOUS_SHA: previous } }).status;
  try {
    mkdirSync(repo);
    git('init', '-q');
    mkdirSync(join(repo, 'src')); mkdirSync(join(repo, 'docs'));
    writeFileSync(join(repo, 'src', 'app.ts'), 'export {};\n');
    const deployed = commit('código');
    writeFileSync(join(repo, 'docs', 'guia de publicação.md'), '# Guia\n');
    commit('documentação');
    assert.equal(run(deployed), 0, 'só documentação desde a publicação');
    renameSync(join(repo, 'src', 'app.ts'), join(repo, 'docs', 'app.md'));
    commit('código movido para docs');
    assert.equal(run(deployed), 1, 'remover código publica');
    assert.equal(run('b'.repeat(40)), 1, 'commit fora do clone publica');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
