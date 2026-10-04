import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { settleAnimations } from './axe-ready';

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Abrir navegação', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name, exact: true }).click();
}

test('navegação agrupada funciona recolhida e por teclado no desktop', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  const group = nav.getByRole('button', { name: 'Aprender e criar', exact: true });
  await group.focus();
  await page.keyboard.press('Enter');
  await expect(group).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('button', { name: 'Caderno', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Recolher navegação' }).click();
  await expect(page.getByRole('button', { name: 'Expandir navegação' })).toBeVisible();
  await nav.getByRole('button', { name: 'Caderno', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meu caderno', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Caderno', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Expandir navegação' }).click();
  await expect(group).toHaveAttribute('aria-expanded', 'true');
  await expect(nav.getByRole('button', { name: 'Caderno', exact: true })).toBeVisible();
});

test('gaveta mobile fecha por Escape e devolve o foco ao menu', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Abrir navegação', exact: true });
  await menu.click();
  const drawer = page.getByRole('dialog', { name: 'Seu espaço', exact: true });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Agenda', exact: true })).toBeVisible();
  await settleAnimations(page);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(menu).toBeFocused();
});

test('mensagens do assistente podem ser roladas por teclado numa tela estreita', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await navigate(page, 'Assistente');
  const messages = page.getByRole('region', { name: 'Mensagens da conversa', exact: true });
  await messages.focus();
  await expect(messages).toBeFocused();
  await page.keyboard.press('End');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
});

test('atalhos mobile têm área de toque e indicadores em duas colunas', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.goto('/');
  const shortcuts = page.getByRole('navigation', { name: 'Atalhos mobile' });
  await expect(shortcuts).toBeVisible();
  for (const button of await shortcuts.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  const cards = page.locator('.bento-metric-card');
  await expect(cards).toHaveCount(2);
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(first!.y).toBe(second!.y);
  await page.screenshot({ path: 'test-results/mobile-home-viewport.png', scale: 'css' });
  await expect(shortcuts.getByRole('button')).toHaveText(['Hoje', 'Agenda', 'Registrar', 'Estudos', 'Mais']);
  await shortcuts.getByRole('button', { name: 'Ver todas as áreas' }).click();
  await page.getByLabel('Atalho da barra inferior').selectOption('notes');
  await page.getByRole('button', { name: 'Fechar janela' }).click();
  await expect.poll(() => page.evaluate(() => history.state?.modal ?? null)).toBeNull();
  await shortcuts.getByRole('button', { name: 'Ir para Caderno', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meu caderno', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Para organizar/ })).toBeVisible();
  await page.getByRole('button', { name: /Um novo jeito de aprender/ }).first().click();
  await expect(page.getByLabel('Onde fica', { exact: true })).toBeVisible();
  await page.locator('#note-editor-area').getByRole('button', { name: /^Voltar para/ }).click();
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(shortcuts.getByRole('button', { name: 'Ir para Caderno', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: 'test-results/mobile-notes-viewport.png', scale: 'css' });
  await shortcuts.getByRole('button', { name: 'Ver todas as áreas' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Finanças', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Finanças', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('demo acessível e responsiva, sem API ou armazenamento pessoal', async ({ page }, info) => {
  const errors: string[] = [], requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes('/api/') || request.url().includes('supabase.co')) requests.push(request.url()); });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Demo must not access localStorage'); } });
    Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Demo must not access sessionStorage'); } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Um passo de cada vez.', exact: true })).toBeVisible();
  await expect(page.getByText('Demonstração — dados fictícios. Não insira informações pessoais.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Psicologia', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.screenshot({ path: `test-results/demo-${info.project.name}.png`, fullPage: true });
  await navigate(page, 'Caderno');
  await page.getByRole('button', { name: /Um novo jeito de aprender/ }).first().click();
  await expect(page.getByRole('textbox', { name: 'Conteúdo da anotação' })).toBeVisible();
  await page.getByLabel('Título da anotação', { exact: true }).fill('Teste temporário');
  await navigate(page, 'Foco');
  await page.getByRole('button', { name: 'Começar foco', exact: true }).click();
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.getByRole('button', { name: 'Ajuda e configurações' }).click();
  await expect(page.getByRole('button', { name: 'Importar backup', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Webhook|Número Próprio|Supabase|Conexões & Serviços/)).toHaveCount(0);
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});

test('edições da demo são descartadas e dados antigos não são lidos ou apagados', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('faculdade-psi:personal:v1', 'private-sentinel'));
  await page.goto('/');
  await navigate(page, 'Estudos');
  await page.getByRole('heading', { name: 'Psicologia', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar matéria', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Teste descartável');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Teste descartável', exact: true })).toBeVisible();
  await expect(page.getByText('4 matérias', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restaurar exemplos', exact: true }).click();
  await page.getByRole('heading', { name: 'Psicologia', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Introdução à Psicologia', exact: true })).toBeVisible();
  await expect(page.getByText('3 matérias', { exact: true })).toBeVisible();
  await expect(page.getByText('Teste descartável', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('faculdade-psi:personal:v1'))).toBe('private-sentinel');
  expect(await page.evaluate(() => localStorage.length)).toBe(1);
});

test('demo não expõe endpoints de autenticação ou banco', async ({ request }) => {
  for (const path of ['/api/workspace', '/auth/callback?code=fake']) expect((await request.get(path)).status()).toBe(404);
  for (const path of ['/auth/google', '/auth/login', '/auth/logout']) expect((await request.post(path)).status()).toBe(404);
  expect((await request.put('/api/workspace', { data: {} })).status()).toBe(404);
});
