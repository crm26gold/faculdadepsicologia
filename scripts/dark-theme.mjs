// Gera o modo escuro a partir das cores fixas do CSS claro: fundos claros viram superfícies escuras
// do mesmo tom, textos escuros viram claros e bordas claras escurecem. Regras escritas à mão em
// [data-theme='dark'] continuam valendo: este arquivo entra antes delas e só cobre o que faltou.
// Uso: node scripts/dark-theme.mjs  (rode de novo sempre que mudar cores no CSS)
import { readFileSync, writeFileSync } from 'node:fs';
import postcss from 'postcss';

const sources = ['src/app/globals.css', 'src/app/focus-responsive.css', 'src/app/finance.css', 'src/app/notes.css'];
const moduleFile = 'src/components/academic.module.css';
const MODULE_START = '/* modo escuro gerado: scripts/dark-theme.mjs */';

const named = { white: '#ffffff', black: '#000000' };
function parse(token) {
  const raw = (named[token.toLowerCase()] ?? token).toLowerCase();
  let m = raw.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let hex = m[1];
    if (hex.length <= 4) hex = [...hex].map(c => c + c).join('');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  m = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  return null;
}
function hsl({ r, g, b }) {
  const [R, G, B] = [r, g, b].map(v => v / 255);
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}
const css = (h, s, l, a = 1) => a < 1 ? `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}% / ${a.toFixed(2)})` : `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;

// kind: 'bg' | 'border' | 'text'
function darken(token, kind) {
  if (darkVars[token] && kind !== 'text') return null;
  const color = parse(darkVars[token] ?? token);
  if (!color) return null;
  const { h, s, l } = hsl(color);
  const neutral = s < 0.3;
  if (kind === 'text') {
    if (l >= 0.45 && !(color.a < 1)) return null;
    return neutral ? css(45, 0.2, 0.9, color.a) : css(h, Math.min(s, 0.7), 0.78, color.a);
  }
  if (l < 0.82) return null;
  if (kind === 'border') return neutral ? css(152, 0.2, 0.22, color.a) : css(h, 0.3, 0.3, color.a);
  if (neutral) return css(152, 0.27, l > 0.97 ? 0.12 : 0.15, color.a);
  return css(h, Math.min(s, 0.28), 0.17, color.a);
}

// Brand variables that are dark in both themes count as their color when used for text.
const darkVars = { 'var(--brand-forest)': '#0F3D2E', 'var(--green)': '#0F3D2E', 'var(--green-dark)': '#0A2A20' };
const colorToken = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b|var\(--(?:brand-forest|green|green-dark)\)/g;
function mapValue(value, kind) {
  let changed = false;
  const next = value.replace(colorToken, token => { const out = darken(token, kind); if (out) { changed = true; return out; } return token; });
  return changed ? next : null;
}
function kindOf(prop) {
  if (prop === 'background' || prop === 'background-color' || prop === 'background-image') return 'bg';
  if (prop === 'color' || prop === 'fill' || prop === 'stroke' || prop === '-webkit-text-fill-color') return 'text';
  if (prop.startsWith('border') || prop === 'outline-color' || prop === 'outline') return 'border';
  return null;
}

function generate(file, prefix, inline = false) {
  const root = postcss.parse(inline ? file : readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), { from: inline ? moduleFile : file });
  const out = postcss.root();
  root.walkRules(rule => {
    if (rule.selector.includes('data-theme') || rule.parent?.type === 'atrule' && /keyframes/.test(rule.parent.name)) return;
    if (rule.parent?.type === 'atrule' && rule.parent.name === 'media' && /prefers-color-scheme|print|prefers-contrast/.test(rule.parent.params)) return;
    // A rule that paints its own mid-tone background (gold, forest) keeps its text color: it stays readable on it.
    let keepsText = false;
    rule.walkDecls(decl => { if (kindOf(decl.prop) === 'bg') for (const token of decl.value.match(colorToken) ?? []) { const color = parse(darkVars[token] ?? token); if (color && color.a > 0.5 && hsl(color).l < 0.82) keepsText = true; } });
    const decls = [];
    rule.walkDecls(decl => {
      const kind = kindOf(decl.prop);
      if (!kind || (kind === 'text' && keepsText)) return;
      const value = mapValue(decl.value, kind);
      if (value) decls.push(postcss.decl({ prop: decl.prop, value, important: decl.important }));
    });
    if (!decls.length) return;
    const selector = rule.selectors.map(sel => sel.trim().startsWith(':root') || sel.trim() === 'html' ? null : sel.trim() === 'body' ? `${prefix} body` : `${prefix} ${sel}`).filter(Boolean).join(',\n');
    if (!selector) return;
    const copy = postcss.rule({ selector });
    decls.forEach(decl => copy.append(decl));
    if (rule.parent?.type === 'atrule') {
      const at = postcss.atRule({ name: rule.parent.name, params: rule.parent.params });
      at.append(copy);
      out.append(at);
    } else out.append(copy);
  });
  return out.toString();
}

const header = "/* Gerado por scripts/dark-theme.mjs — não edite à mão. Ajustes finos ficam nas regras [data-theme='dark'] escritas nos CSS. */\n";
const outputs = new Map([['src/app/dark-auto.css', header + sources.map(file => `/* ${file} */\n${generate(file, "[data-theme='dark']")}`).join('\n') + '\n']]);
const moduleCss = readFileSync(moduleFile, 'utf8').replace(/\r\n/g, '\n');
const base = moduleCss.includes(MODULE_START) ? moduleCss.slice(0, moduleCss.indexOf(MODULE_START)).trimEnd() : moduleCss.trimEnd();
outputs.set(moduleFile, `${base}\n\n${MODULE_START}\n${generate(base, ":global([data-theme='dark'])", true)}\n`);
// --check: falha se alguém mudou cores no CSS e esqueceu de gerar o modo escuro de novo.
const stale = [...outputs].filter(([file, content]) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== content);
if (process.argv.includes('--check')) {
  if (stale.length) { console.error(`Modo escuro desatualizado: ${stale.map(([file]) => file).join(', ')}. Rode node scripts/dark-theme.mjs`); process.exit(1); }
  console.log('Modo escuro em dia.');
} else {
  for (const [file, content] of outputs) writeFileSync(file, content);
  console.log('Modo escuro gerado.');
}
