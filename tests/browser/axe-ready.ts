import type { Page } from '@playwright/test';

// Axe measures colors as rendered. Wait for finite CSS transitions and animations
// (theme switch, drawer entrance) so contrast is checked on the final frame.
export async function settleAnimations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().endTime !== Infinity)
    .map(animation => animation.finished.catch(() => undefined))));
}
