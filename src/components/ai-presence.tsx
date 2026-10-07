'use client';
import { useEffect, useRef, useState } from 'react';
import { touchedLabel, type Touched } from '@/lib/live-follow';

// Shows, on the open screen, what an assistant just changed elsewhere: a pointer glides to the item, the
// item is outlined for a moment and a short notice says what happened. Reading the notice never moves focus.
const anchors: Partial<Record<Touched['view'], string>> = { finances: '.fin-balance' };

function findTarget(item: Touched): HTMLElement | null {
  const root = document.querySelector<HTMLElement>('main') ?? document.body;
  if (item.kind === 'setting' && anchors[item.view]) return root.querySelector<HTMLElement>(anchors[item.view]!);
  if (item.kind === 'removed') return root.querySelector<HTMLElement>('h1, h2');
  const wanted = item.title.trim().toLocaleLowerCase('pt-BR');
  if (!wanted) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let best: HTMLElement | null = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim().toLocaleLowerCase('pt-BR') ?? '';
    if (!text || (text !== wanted && !(wanted.length >= 6 && text.includes(wanted)))) continue;
    const element = node.parentElement;
    if (!element || element.closest('.ai-presence')) continue;
    best = element.closest<HTMLElement>('li, article, [class*="row"], [class*="card"], button, tr') ?? element;
    if (text === wanted) break;
  }
  return best;
}

export function AiPresence({ touch, onPause }: { touch: Touched | null; onPause: () => void }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState('');
  const marked = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!touch) return;
    setNotice(touchedLabel(touch));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let attempts = 0, timer = 0;
    // The screen opens first; the item may take a moment to render.
    const seek = () => {
      const target = findTarget(touch);
      if (!target && attempts++ < 12) { timer = window.setTimeout(seek, 150); return; }
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      window.setTimeout(() => {
        const box = target.getBoundingClientRect();
        setPoint({ x: Math.round(box.left + Math.min(box.width - 12, 48)), y: Math.round(box.top + box.height / 2) });
        marked.current?.classList.remove('ai-touched');
        target.classList.add('ai-touched'); marked.current = target;
      }, reduce ? 0 : 350);
    };
    seek();
    const clear = window.setTimeout(() => { marked.current?.classList.remove('ai-touched'); setPoint(null); setNotice(''); }, 4200);
    return () => { window.clearTimeout(timer); window.clearTimeout(clear); };
  }, [touch]);
  if (!touch && !notice) return null;
  return <div className="ai-presence">
    {point && <span className="ai-pointer" aria-hidden="true" style={{ transform: `translate(${point.x}px, ${point.y}px)` }}>
      <svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 3l15 7-6.5 2L10 19z" /></svg>
    </span>}
    {notice && <div className="ai-presence-notice" role="status">
      <span>{notice}</span>
      <button type="button" className="text-button" onClick={onPause}>Pausar acompanhamento</button>
    </div>}
  </div>;
}
