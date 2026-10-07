'use client';
import { useEffect, useRef } from 'react';
import { touchedItems, type Touched } from '@/lib/live-follow';
import type { Workspace } from '@/lib/workspace';

type Options = {
  enabled: boolean; accountId?: string;
  revision: () => number; snapshot: () => Workspace; refresh: (accountId?: string) => Promise<Workspace>;
  onTouched: (items: Touched[]) => void;
};
const EVERY_MS = 4000;

// While the app is visible, it asks only for the space's revision every few seconds. A newer revision made
// elsewhere (an assistant, a bot, another device) is loaded and compared, and the change is shown on screen.
// Local edits are never overwritten: refresh refuses while this device has unsaved changes.
export function useLiveFollow(options: Options) {
  const latest = useRef(options); latest.current = options;
  useEffect(() => {
    if (!options.enabled) return;
    let busy = false, stopped = false;
    const tick = async () => {
      if (busy || stopped || document.hidden) return;
      busy = true;
      try {
        const { accountId, revision, snapshot, refresh, onTouched } = latest.current;
        const response = await fetch(`/api/workspace?only=revision${accountId ? `&accountId=${encodeURIComponent(accountId)}` : ''}`, { cache: 'no-store' });
        if (!response.ok) return;
        const remote = await response.json() as { revision?: number };
        if (typeof remote.revision !== 'number' || remote.revision <= revision()) return;
        const before = snapshot();
        const after = await refresh(accountId);
        if (stopped) return;
        const items = touchedItems(before, after);
        if (items.length) onTouched(items);
      } catch { /* Unsaved local changes or a network hiccup: try again on the next tick. */ }
      finally { busy = false; }
    };
    const timer = window.setInterval(() => { void tick(); }, EVERY_MS);
    const visible = () => { if (!document.hidden) void tick(); };
    document.addEventListener('visibilitychange', visible);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [options.enabled]);
}
