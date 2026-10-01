// Jornada Plena symbol: one geometric master, every version derived from these numbers.
// Run `node scripts/brand-symbol.cjs` after changing it, then review the files and update the hashes in check-publication.mjs.
const fs = require('fs');
const nodePath = require("path");
const dir = nodePath.join(__dirname, "..", "public", "brand") + nodePath.sep;
const scratch = require("os").tmpdir() + nodePath.sep;
const C = { forest: '#0F3D2E', sage: '#8CA88A', gold: '#D4AF6B', ivory: '#FAF7ED', goldLine: '#C49A48', mist: '#C5D3BF' };
const R = 212, g = 12; // outer circle radius and half-gap (degrees) at each cardinal point
const pt = (deg, r = R) => [256 + r * Math.cos(deg * Math.PI / 180), 256 + r * Math.sin(deg * Math.PI / 180)].map(v => +v.toFixed(1));
const arcs = r => [0, 90, 180, 270].map(a => { const [x1, y1] = pt(a + g, r), [x2, y2] = pt(a + 90 - g, r); return `M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}`; });
const star = 'M0 -1C.07 -.3 .3 -.07 1 0C.3 .07 .07 .3 0 1C-.07 .3 -.3 .07 -1 0C-.3 -.07 -.07 -.3 0 -1Z';
const path = 'M246 362C226 380 300 398 270 422C228 450 176 460 172 500H306C300 460 356 438 312 414C284 398 266 382 266 362Z';

function full({ ring, stars, sky, glow, far, mid, ground, arch, road, roadEdge, leaf, vein, sunTop, sunBottom, title }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${title}">
  <defs>
    <clipPath id="jp-inner"><circle cx="256" cy="256" r="188"/></clipPath>
    <radialGradient id="jp-glow" cx="256" cy="172" r="170" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.gold}" stop-opacity="${glow}"/><stop offset=".55" stop-color="${C.gold}" stop-opacity="${(glow / 3.5).toFixed(2)}"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient>
    <linearGradient id="jp-sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sunTop}"/><stop offset="1" stop-color="${sunBottom}"/></linearGradient>
    <path id="jp-star" d="${star}"/>
  </defs>
  <g fill="none" stroke="${ring}" stroke-width="11" stroke-linecap="round">${arcs(R).map(d => `<path d="${d}"/>`).join('')}</g>
  <g fill="${stars}"><use href="#jp-star" transform="translate(256 44) scale(30)"/><use href="#jp-star" transform="translate(468 256) scale(21)"/><use href="#jp-star" transform="translate(256 468) scale(21)"/><use href="#jp-star" transform="translate(44 256) scale(21)"/></g>
  <g clip-path="url(#jp-inner)">
    ${sky ? `<circle cx="256" cy="256" r="188" fill="${sky}"/>` : ''}
    <rect x="68" y="68" width="376" height="376" fill="url(#jp-glow)"/>
    <circle cx="256" cy="172" r="40" fill="url(#jp-sun)"/>
    <path fill="${far}" d="M60 308Q150 198 236 294H276Q362 198 452 308V470H60Z"/>
    <path fill="${mid}" d="M60 340C120 294 186 296 256 328C326 296 392 294 452 340V470H60Z"/>
    <path fill="none" stroke="${arch}" stroke-width="9" d="M190 366V184A66 66 0 0 1 322 184V366"/>
    <path fill="${ground}" d="M60 378C130 346 200 346 256 358C312 346 382 346 452 378V470H60Z"/>
    <path fill="${road}" stroke="${roadEdge}" stroke-width="3" stroke-linejoin="round" d="${path}"/>
  </g>
  <path d="M256 362C257 338 255 316 256 292" fill="none" stroke="${leaf}" stroke-width="8" stroke-linecap="round"/>
  <path fill="${leaf}" d="M256 306C236 310 206 298 204 270C232 266 252 282 256 306Z"/>
  <path fill="${leaf}" d="M256 296C278 302 308 290 310 262C282 258 260 274 256 296Z"/>
  <g fill="none" stroke="${vein}" stroke-width="2.4" stroke-linecap="round"><path d="M252 302Q232 288 211 274"/><path d="M260 292Q282 278 303 266"/></g>
</svg>
`;
}
// Small sizes (≤ 48 px): circle, portal, light, sprout and path only — the rest is suggested.
function reduced({ ring, sky, ground, arch, road, leaf, sun, title }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${title}">
  <defs><clipPath id="jp-r"><circle cx="256" cy="256" r="172"/></clipPath></defs>
  <g fill="none" stroke="${ring}" stroke-width="34" stroke-linecap="round">${arcs(220).map(d => `<path d="${d}"/>`).join('')}</g>
  <g clip-path="url(#jp-r)">
    ${sky ? `<circle cx="256" cy="256" r="172" fill="${sky}"/>` : ''}
    <circle cx="256" cy="176" r="50" fill="${sun}"/>
    <path fill="none" stroke="${arch}" stroke-width="26" d="M176 380V196A80 80 0 0 1 336 196V380"/>
    <path fill="${ground}" d="M60 362C140 330 200 330 256 342C312 330 372 330 452 362V470H60Z"/>
    <path fill="${road}" d="M242 344C218 370 316 394 276 424C232 456 164 466 160 504H324C316 466 380 440 324 410C290 392 268 372 270 344Z"/>
  </g>
  <path d="M257 350C258 330 256 312 257 294" fill="none" stroke="${leaf}" stroke-width="22" stroke-linecap="round"/>
  <path fill="${leaf}" d="M257 318C228 324 186 304 184 262C226 256 254 284 257 318Z"/>
  <path fill="${leaf}" d="M257 300C290 306 330 286 332 244C288 238 260 266 257 300Z"/>
</svg>
`;
}
const light = { ring: C.forest, stars: C.goldLine, sky: '', glow: .42, far: C.mist, mid: C.sage, ground: C.forest, arch: C.goldLine, road: C.ivory, roadEdge: C.gold, leaf: C.forest, vein: C.sage, sunTop: '#EFD69C', sunBottom: C.gold, title: 'Jornada Plena' };
const dark = { ring: C.ivory, stars: C.gold, sky: '#14503C', glow: .55, far: '#2E6A53', mid: '#4C8268', ground: '#0A2A20', arch: C.gold, road: C.ivory, roadEdge: C.gold, leaf: C.ivory, vein: C.sage, sunTop: '#F3DDA6', sunBottom: C.gold, title: 'Jornada Plena' };
fs.writeFileSync(dir + 'simbolo.svg', full(light));
fs.writeFileSync(dir + 'simbolo-revertido.svg', full(dark));
fs.writeFileSync(dir + 'simbolo-reduzido.svg', reduced({ ring: C.forest, sky: '', ground: C.forest, arch: C.goldLine, road: C.ivory, leaf: C.forest, sun: C.gold, title: 'Jornada Plena' }));
fs.writeFileSync(scratch + 'simbolo-reduzido-revertido.svg', reduced({ ring: C.ivory, sky: '#14503C', ground: '#0A2A20', arch: C.gold, road: C.ivory, leaf: C.ivory, sun: C.gold, title: 'Jornada Plena' }));
console.log('ok');
// App icon and favicon: the reversed symbol on Verde Floresta, inside the maskable safe zone, no extra closed ring.
const inner = svg => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const tile = (svg, scale) => { const size = 512 * scale, at = (512 - size) / 2; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Jornada Plena"><rect width="512" height="512" fill="${C.forest}"/><svg x="${at}" y="${at}" width="${size}" height="${size}" viewBox="0 0 512 512">${inner(svg)}</svg></svg>\n`; };
const appIcon = tile(full(dark), .8);
const sharp = require("sharp");
for (const [name, size] of [['icone-512.png', 512], ['icone-192.png', 192], ['icone-180.png', 180]]) sharp(Buffer.from(appIcon), { density: 72 * size / 512 * 3 }).resize(size, size).png({ compressionLevel: 9 }).toFile(dir + name);
fs.writeFileSync(nodePath.join(__dirname, "..", "src", "app", "icon.svg"), tile(reduced({ ring: C.ivory, sky: '#14503C', ground: '#0A2A20', arch: C.gold, road: C.ivory, leaf: C.ivory, sun: C.gold, title: 'Jornada Plena' }), .9));
console.log('icons ok');
