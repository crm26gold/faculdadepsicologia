import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Abrir navegação', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name, exact: true }).click();
}

test('demo acessível e responsiva, sem API ou armazenamento pessoal', async ({ page }, info) => {
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/') || request.url().includes('supabase.co')) requests.push(request.url()); });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Demo must not access localStorage'); } });
    Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Demo must not access sessionStorage'); } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Um novo dia, no seu ritmo.' })).toBeVisible();
  await expect(page.getByText('Demonstração — dados fictícios. Não insira informações pessoais.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Introdução à Psicologia', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.screenshot({ path: `test-results/demo-${info.project.name}.png`, fullPage: true });
  await navigate(page, 'Caderno');
  await expect(page.getByRole('textbox', { name: 'Conteúdo da anotação' })).toBeVisible();
  await page.getByLabel('Título da anotação', { exact: true }).fill('Teste temporário');
  await navigate(page, 'Meu dia');
  await page.getByRole('button', { name: 'Começar foco', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.getByRole('button', { name: 'Ajuda e configurações' }).click();
  await expect(page.getByRole('button', { name: 'Importar backup', exact: true })).toHaveCount(0);
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});

test('edições da demo são descartadas e dados antigos não são lidos ou apagados', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('faculdade-psi:personal:v1', 'private-sentinel'));
  await page.goto('/');
  await navigate(page, 'Matérias');
  await page.getByRole('button', { name: 'Nova matéria', exact: true }).click();
  await page.getByLabel('Nome da matéria').fill('Teste descartável');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Teste descartável', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restaurar exemplos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Introdução à Psicologia', exact: true })).toBeVisible();
  await expect(page.getByText('Teste descartável', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('faculdade-psi:personal:v1'))).toBe('private-sentinel');
  expect(await page.evaluate(() => localStorage.length)).toBe(1);
});

test('demo não expõe endpoints de autenticação ou banco', async ({ request }) => {
  for (const path of ['/api/workspace', '/auth/callback?code=fake']) expect((await request.get(path)).status()).toBe(404);
  for (const path of ['/auth/google', '/auth/login', '/auth/logout']) expect((await request.post(path)).status()).toBe(404);
  expect((await request.put('/api/workspace', { data: {} })).status()).toBe(404);
});
