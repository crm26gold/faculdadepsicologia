import type { AiProviderId } from './catalog';

// "auto:*" is stored as the task's model and resolved on every call against the account's current list,
// so a new release (Gemini 3.9, Claude 6…) is picked up without touching the panel.
export const autoModes = {
  'auto:melhor': { label: 'Automático · o melhor disponível', hint: 'Sempre o modelo mais forte e mais novo da família.' },
  'auto:rapido': { label: 'Automático · rápido e atual', hint: 'O mais novo da linha rápida: bom equilíbrio entre qualidade e custo.' },
  'auto:economico': { label: 'Automático · mais econômico', hint: 'O mais novo da linha leve: o menor custo por uso.' },
} as const;
export type AutoMode = keyof typeof autoModes;
export const isAuto = (model: string): model is AutoMode => model in autoModes;
export const autoCapable: AiProviderId[] = ['gemini', 'openai', 'anthropic'];

type Tier = 'best' | 'fast' | 'light';
type Parsed = { id: string; version: number; tier: Tier; preview: boolean };
const NOT_TEXT = /(tts|image|imagen|vision-preview|embed|audio|live|realtime|transcribe|search|moderation|dall-e|whisper|babbage|davinci|computer-use|robotics|codex|instruct|nano-banana|veo|lyria|aqa|learnlm|gemma)/i;

function parse(provider: AiProviderId, id: string): Parsed | null {
  if (NOT_TEXT.test(id)) return null;
  const preview = /(preview|exp|experimental|beta)/i.test(id);
  if (provider === 'gemini' || provider === 'vertex') {
    const match = id.match(/^gemini-(\d+(?:\.\d+)?)-(pro|flash-lite|flash)(?:-|$)/);
    if (!match) return null;
    return { id, version: Number(match[1]), tier: match[2] === 'pro' ? 'best' : match[2] === 'flash' ? 'fast' : 'light', preview };
  }
  if (provider === 'openai') {
    const match = id.match(/^gpt-(\d+(?:\.\d+)?)(?:-(mini|nano))?$/);
    if (!match) return null;
    return { id, version: Number(match[1]), tier: match[2] === 'mini' ? 'fast' : match[2] === 'nano' ? 'light' : 'best', preview };
  }
  if (provider === 'anthropic') {
    const match = id.match(/^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d))?(?:-\d{8})?$/);
    if (!match) return null;
    return { id, version: Number(`${match[2]}.${match[3] ?? 0}`), tier: match[1] === 'opus' ? 'best' : match[1] === 'sonnet' ? 'fast' : 'light', preview };
  }
  return null;
}

const wanted: Record<AutoMode, Tier[]> = { 'auto:melhor': ['best', 'fast', 'light'], 'auto:rapido': ['fast', 'light', 'best'], 'auto:economico': ['light', 'fast', 'best'] };
/** Newest stable model of the wanted line; previews only when nothing stable exists; shortest id wins ties (the alias). */
export function pickModel(provider: AiProviderId, ids: string[], mode: AutoMode): string | null {
  const parsed = ids.map(id => parse(provider, id)).filter((item): item is Parsed => !!item);
  for (const tier of wanted[mode]) {
    const line = parsed.filter(item => item.tier === tier);
    if (!line.length) continue;
    const pool = line.some(item => !item.preview) ? line.filter(item => !item.preview) : line;
    return pool.toSorted((a, b) => b.version - a.version || a.id.length - b.id.length || a.id.localeCompare(b.id))[0].id;
  }
  return null;
}

/** Text models first and newest first; everything else after, alphabetically. */
export function sortModels(provider: AiProviderId, ids: string[]) {
  const known = ids.map(id => ({ id, info: parse(provider, id) }));
  const rank: Record<Tier, number> = { best: 0, fast: 1, light: 2 };
  return [
    ...known.filter(item => item.info).toSorted((a, b) => b.info!.version - a.info!.version || rank[a.info!.tier] - rank[b.info!.tier] || Number(a.info!.preview) - Number(b.info!.preview) || a.id.localeCompare(b.id)).map(item => item.id),
    ...known.filter(item => !item.info && !NOT_TEXT.test(item.id)).map(item => item.id).toSorted(),
  ];
}

export function modelNote(provider: AiProviderId, id: string) {
  const info = parse(provider, id);
  if (!info) return '';
  const tier = info.tier === 'best' ? 'mais forte' : info.tier === 'fast' ? 'rápido' : 'leve';
  return [tier, info.preview ? 'prévia' : ''].filter(Boolean).join(' · ');
}
