/** Medalha desenhada no aparelho a partir do nome do desafio: a mesma conquista sai sempre igual e nenhuma imagem é guardada. */
const metals = [
  { edge: 'hsl(38 78% 38%)', face: 'hsl(44 88% 56%)', shine: 'hsl(48 96% 82%)' },
  { edge: 'hsl(212 14% 44%)', face: 'hsl(212 16% 70%)', shine: 'hsl(212 30% 93%)' },
  { edge: 'hsl(20 56% 34%)', face: 'hsl(24 62% 50%)', shine: 'hsl(30 80% 78%)' },
];
const ribbons = [212, 160, 340, 268, 196, 12];

function hash(text: string) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.codePointAt(0)!, 16777619) >>> 0;
  return value;
}

function star(points: number, cx: number, cy: number, outer: number, inner: number) {
  return Array.from({ length: points * 2 }, (_, index) => {
    const radius = index % 2 ? inner : outer, angle = Math.PI * index / points - Math.PI / 2;
    return `${index ? 'L' : 'M'}${(cx + radius * Math.cos(angle)).toFixed(2)} ${(cy + radius * Math.sin(angle)).toFixed(2)}`;
  }).join(' ') + 'Z';
}

/** Sem `label`, a medalha é enfeite (o texto ao lado já diz o que é). */
export function Medal({ title, size = 64, label }: { title: string; size?: number; label?: string }) {
  const seed = hash(title);
  const metal = metals[seed % metals.length], hue = ribbons[(seed >>> 4) % ribbons.length], points = 5 + (seed >>> 8) % 3;
  return <svg className="medal" viewBox="0 0 64 84" width={size} height={Math.round(size * 84 / 64)}
    {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
    <path d="M13 0h14l11 34H24z" fill={`hsl(${hue} 58% 40%)`} />
    <path d="M37 0h14L40 34H26z" fill={`hsl(${hue} 62% 54%)`} />
    <circle cx="32" cy="58" r="24" fill={metal.edge} />
    <circle cx="32" cy="58" r="20.5" fill={metal.face} />
    <circle cx="32" cy="58" r="16.5" fill="none" stroke={metal.shine} strokeWidth="1.4" opacity=".75" />
    <path d={star(points, 32, 58, 11, 4.8)} fill={metal.shine} stroke={metal.edge} strokeWidth=".8" strokeLinejoin="round" />
  </svg>;
}
