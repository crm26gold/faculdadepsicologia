// Ignored Build Step da Vercel (vercel.json → ignoreCommand): sair com 0 cancela o build; sair com 1 segue.
// Só pula o build de produção quando tudo o que mudou desde a última publicação bem-sucedida é documentação.
// Na dúvida (outro ambiente, SHA estranho, git indisponível, commit fora do clone raso ou diff vazio), publica.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const documentation = file => /^(?:docs|\.claude|supabase\/tests)\//.test(file) || file.endsWith('.md');

/** Devolve [pular, motivo]. `changes(base)` lista os arquivos alterados entre `base` e HEAD. */
export function decide(env, changes) {
  if (env.VERCEL_ENV !== 'production') return [false, 'não é produção'];
  const previous = env.VERCEL_GIT_PREVIOUS_SHA ?? '';
  if (previous && !/^[0-9a-f]{7,40}$/i.test(previous)) return [false, 'SHA anterior em formato inesperado'];
  const base = previous || 'HEAD^';
  let files;
  try { files = changes(base); } catch { return [false, `não foi possível comparar com ${base.slice(0, 12)}`]; }
  // Diff vazio: por exemplo, uma nova publicação do mesmo commit para aplicar variáveis de ambiente.
  if (!files.length) return [false, 'nenhum arquivo mudou'];
  const code = files.find(file => !documentation(file));
  return code ? [false, `${code} mudou`] : [true, `só documentação mudou desde ${base.slice(0, 12)}`];
}

// --no-renames lista também o caminho antigo; -z evita nomes entre aspas.
const gitChanges = base => execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  .split('\0').filter(Boolean);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [skip, reason] = decide(process.env, gitChanges);
  console.log(skip ? `Build ignorado: ${reason}.` : `Build segue: ${reason}.`);
  process.exit(skip ? 0 : 1);
}
