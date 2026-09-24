import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Abrir navegação', exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name, exact: true }).click();
}
test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(new Date('2026-09-23T12:00:00-03:00')); });

test('agenda mensal, semanal e acessibilidade com exemplos', async ({ page }, info) => {
  await page.goto('/'); await navigate(page, 'Agenda');
  await expect(page.getByRole('heading', { name: 'setembro de 2026', exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByLabel('Filtrar matéria', { exact: true }).selectOption('neuro');
  await page.getByLabel('Filtrar matéria', { exact: true }).selectOption('');
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(audit.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: `test-results/agenda-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Semana', exact: true }).click();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /18:00 · Aula Bases Biológicas/ }).first()).toBeVisible();
});

test('compromisso com horário e arquivo ICS', async ({ page }) => {
  await page.goto('/'); await navigate(page, 'Agenda');
  await page.getByRole('button', { name: 'Novo compromisso', exact: true }).click();
  await page.getByLabel('O que você quer fazer?', { exact: true }).fill('Revisão de exemplo');
  await page.getByLabel('Horário · opcional', { exact: true }).fill('15:30');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByRole('button', { name: '15:30 · Estudo Revisão de exemplo', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('15:30');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Exportar agenda', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar arquivo .ics', exact: true }).click();
  expect((await pending).suggestedFilename()).toBe('faculdade-psi-agenda.ics');
});

test('planejador distingue regras locais de IA generativa', async ({ page }) => {
  await page.goto('/'); await navigate(page, 'Assistente IA');
  await expect(page.getByText('IA generativa ainda não conectada.', { exact: true })).toBeVisible();
  const button = page.getByRole('button', { name: 'Adicionar à minha agenda', exact: false }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole('status').filter({ hasText: /adicionad/i })).toBeVisible();
});
