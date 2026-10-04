'use client';

import { useEffect } from 'react';

export function SmoothScroll() {
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const desktop = window.matchMedia('(hover: hover) and (pointer: fine)');
    let dispose: (() => void) | undefined;
    let generation = 0;

    async function configure() {
      const current = ++generation;
      dispose?.();
      dispose = undefined;
      if (preference.matches || !desktop.matches) return;

      const { default: Lenis } = await import('lenis');
      if (current !== generation) return;
      const lenis = new Lenis({ autoRaf: true, duration: 1.05, anchors: true });
      const visibility = () => document.hidden ? lenis.stop() : lenis.start();
      document.addEventListener('visibilitychange', visibility);
      visibility();
      dispose = () => {
        document.removeEventListener('visibilitychange', visibility);
        lenis.destroy();
      };
    }

    void configure();
    preference.addEventListener('change', configure);
    desktop.addEventListener('change', configure);
    return () => {
      generation++;
      preference.removeEventListener('change', configure);
      desktop.removeEventListener('change', configure);
      dispose?.();
    };
  }, []);

  return null;
}
