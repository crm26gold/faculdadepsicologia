// Copy pinned, unmodified upstream runtime/dictionary assets for browser-only use.
// Generated assets are not committed; npm ci + prebuild reproduces them.
import { cp, mkdir } from 'node:fs/promises';
const root = new URL('../public/spelling/', import.meta.url);
await mkdir(root, { recursive: true });
for (const name of ['dist', 'wasm', 'COPYING', 'COPYING.LESSER', 'COPYING.MPL', 'README.md']) {
  await cp(new URL(`../node_modules/hunspell-wasm/${name}`, import.meta.url), new URL(`hunspell/${name}`, root), { recursive: true });
}
for (const name of ['index.aff', 'index.dic', 'license']) {
  await cp(new URL(`../node_modules/dictionary-pt/${name}`, import.meta.url), new URL(name, root));
}
await cp(new URL('../src/workers/spelling.js', import.meta.url), new URL('worker.js', root));
