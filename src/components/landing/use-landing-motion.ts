'use client';

import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const preference = window.matchMedia(query);
  preference.addEventListener('change', onChange);
  return () => preference.removeEventListener('change', onChange);
}

function getSnapshot() { return window.matchMedia(query).matches; }
function getServerSnapshot() { return true; }

export function useLandingMotion() {
  // The server and the first hydration render both show static content.
  // Afterwards React subscribes to the actual, live browser preference.
  return !useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
