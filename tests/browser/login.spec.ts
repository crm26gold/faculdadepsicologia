import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { settleAnimations } from './axe-ready';

test('landing hidrata sem divergência e acompanha redução de movimento', async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && /hydrat|Minified React error #418/i.test(message.text())) hydrationErrors.push(message.text());
  });
  page.on('pageerror', error => hydrationErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/jornada');
  const title = page.getByRole('heading', { name: 'Mais vida. Menos ruído.', exact: true });
  await expect(title).toBeVisible();
  // Catch preference changes during an active entrance animation.
  await expect.poll(() => title.evaluate(element => getComputedStyle(element).transform)).not.toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(title).toHaveCSS('transform', 'none');
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation =>
    animation.playState === 'running' && animation.effect?.getComputedTiming().endTime !== Infinity).length)).toBe(0);
  expect(hydrationErrors).toEqual([]);
  await page.reload();
  await expect(title).toBeVisible();
  await settleAnimations(page);
  expect(hydrationErrors).toEqual([]);
});

test('espaço privado fechado e login Google sem campos de senha', async ({ page }, info) => {
  await page.goto('/login?error=access');
  await expect(page.getByRole('heading', { name: 'Seu espaço está aqui.', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar com Google', exact: true })).toBeDisabled();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível concluir o acesso' })).toBeVisible();
  await expect(page.getByText('Seu espaço pessoal é só seu.', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacidade' })).toHaveAttribute('href', '/privacidade');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.screenshot({ path: `test-results/login-${info.project.name}.png`, fullPage: true });
});

test('entrada permanece legível em 320px com movimento reduzido', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/jornada');

  await expect(page.getByRole('heading', { name: 'Mais vida. Menos ruído.', exact: true })).toBeVisible();
  const start = page.getByRole('main').getByRole('link', { name: 'Começar minha jornada', exact: true });
  await expect(start).toBeVisible();
  await expect(start).toHaveAttribute('href', '/login');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('menu da entrada fecha por teclado, fora, âncora e mudança para desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/jornada');

  const menu = page.getByLabel('Menu de navegação', { exact: true });
  const navigation = page.getByRole('navigation', { name: 'Navegação móvel', exact: true });
  await menu.focus();
  await menu.press('Enter');
  await expect(navigation).toBeVisible();
  const essence = navigation.getByRole('link', { name: 'A essência', exact: true });
  await essence.focus();
  await essence.press('Escape');
  await expect(navigation).toBeHidden();
  await expect(menu).toBeFocused();

  await menu.click();
  await expect(navigation).toBeVisible();
  await page.getByText('Sem pressa. Com intenção. Do seu jeito.', { exact: true }).click();
  await expect(navigation).toBeHidden();

  await menu.click();
  await navigation.getByRole('link', { name: 'Seu espaço', exact: true }).click();
  await expect(page).toHaveURL(/#possibilidades$/);
  await expect(navigation).toBeHidden();

  await menu.click();
  await expect(navigation).toBeVisible();
  await page.setViewportSize({ width: 900, height: 844 });
  await expect(navigation).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(navigation).toBeHidden();
});

test('API privada recusa anônimos e login antigo está desativado', async ({ request }) => {
  expect((await request.get('/api/workspace')).status()).toBe(401);
  expect((await request.get('/api/note-media/11111111-1111-4111-8111-111111111111.png')).status()).toBe(401);
  expect((await request.post('/api/note-media', { headers: { origin: 'http://127.0.0.1:3005' }, data: {} })).status()).toBe(401);
  expect((await request.post('/api/note-media', { headers: { origin: 'https://other.example' }, data: {} })).status()).toBe(403);
  for (const path of ['/api/ai/admin', '/api/ai/assistant']) expect((await request.post(path, { headers: { origin: 'http://127.0.0.1:3005' }, data: {} })).status(), path).toBe(401);
  expect((await request.post('/auth/login')).status()).toBe(410);
  expect((await request.post('/auth/google', { headers: { origin: 'https://other.example' } })).status()).toBe(403);
  expect((await request.get('/auth/callback?code=fake')).status()).toBe(503);
  for (const path of ['/api/me', '/api/spaces?id=11111111-1111-4111-8111-111111111111', '/api/work?id=11111111-1111-4111-8111-111111111111', '/api/admin', '/api/contacts', '/api/ai/admin']) {
    expect((await request.get(path)).status(), path).toBe(401);
  }
  for (const path of ['/api/me', '/api/spaces', '/api/work', '/api/admin', '/api/contacts', '/api/ai/admin', '/api/ai/assistant']) {
    expect((await request.post(path, { headers: { origin: 'https://other.example' }, data: {} })).status(), path).toBe(403);
  }
});
