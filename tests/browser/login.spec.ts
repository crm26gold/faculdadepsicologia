import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('espaço privado fechado e login Google sem campos de senha', async ({ page }, info) => {
  await page.goto('/login?error=access');
  await expect(page.getByRole('heading', { name: 'Seu espaço está aqui.', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar com Google', exact: true })).toBeDisabled();
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível concluir o acesso' })).toBeVisible();
  await expect(page.getByText('Sem cadastro público.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.screenshot({ path: `test-results/login-${info.project.name}.png`, fullPage: true });
});

test('API privada recusa anônimos e login antigo está desativado', async ({ request }) => {
  expect((await request.get('/api/workspace')).status()).toBe(401);
  expect((await request.post('/auth/login')).status()).toBe(410);
  expect((await request.post('/auth/google', { headers: { origin: 'https://other.example' } })).status()).toBe(403);
  expect((await request.get('/auth/callback?code=fake')).status()).toBe(503);
});
