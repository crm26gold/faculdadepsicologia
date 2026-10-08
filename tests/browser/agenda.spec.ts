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
  await expect(page.getByRole('heading', { name: /^setembro de 2026$/i })).toBeVisible();
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
  await page.getByRole('button', { name: '15:30 · Compromisso Revisão de exemplo Sem área', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('15:30');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Google Agenda e arquivo', exact: true }).click();
  // A demonstração não tem contas: o painel diz que a conexão não está ativa e não oferece o botão.
  await expect(page.getByRole('dialog').getByRole('region', { name: 'Google Agenda' })).toContainText('ainda não foi ativado');
  await expect(page.getByRole('button', { name: 'Conectar Google Agenda' })).toHaveCount(0);
  await page.getByRole('dialog').screenshot({ path: `test-results/google-agenda-${test.info().project.name}.png` });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar arquivo .ics', exact: true }).click();
  expect((await pending).suggestedFilename()).toBe('jornada-plena-agenda.ics');
});

test('sugestões do Meu dia vêm da grade e dos prazos, sem prometer integrações que não existem', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Sugestões calculadas a partir da sua grade e dos prazos. Nada é aplicado sozinho.')).toBeVisible();
  await expect(page.getByText(/WhatsApp|Teams|UNIP|Supabase|API de IA/)).toHaveCount(0);
  const button = page.getByRole('button', { name: 'Adicionar à minha agenda', exact: false }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.getByRole('status').filter({ hasText: /adicionad/i })).toBeVisible();
});

test('criar e editar aula valida datas e mantém uma única ocorrência na grade', async ({ page }, info) => {
  await page.goto('/'); await navigate(page, 'Agenda');
  await page.getByRole('button', { name: 'Minha grade', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).not.toContainText('Transcrita da foto');
  await dialog.getByRole('button', { name: 'Adicionar horário', exact: true }).click();
  await page.getByLabel('Matéria da aula', { exact: true }).selectOption('intro');
  await page.getByLabel('Dia da semana', { exact: true }).selectOption('1');
  await page.getByLabel('Início', { exact: true }).fill('19:10');
  await page.getByLabel('Término (opcional)', { exact: true }).fill('18:00');
  await dialog.getByRole('button', { name: 'Salvar horário', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('O término deve ser depois do início.');
  await expect(page.getByLabel('Início', { exact: true })).toHaveValue('19:10');
  await page.getByLabel('Término (opcional)', { exact: true }).fill('');
  await page.getByLabel('Primeira aula (opcional)', { exact: true }).fill('2026-09-22');
  await dialog.getByRole('button', { name: 'Salvar horário', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('coincidir com o dia');
  await page.getByLabel('Primeira aula (opcional)', { exact: true }).fill('2026-09-21');
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(item => item.id)).toEqual([]);
  await page.screenshot({ path: `test-results/grade-${info.project.name}.png`, fullPage: true });
  await dialog.getByRole('button', { name: 'Salvar horário', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Horário incluído');
  const row = dialog.getByRole('button', { name: /19:10.*Introdução à Psicologia/ });
  await expect(row).toHaveCount(1);
  await row.click();
  await page.getByLabel('Início', { exact: true }).fill('19:20');
  await page.getByLabel('Mostrar esta aula na agenda', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Salvar horário', exact: true }).click();
  await expect(dialog.getByRole('button', { name: /19:20.*Introdução à Psicologia.*Pausada/ })).toHaveCount(1);
  await expect(row).toHaveCount(0);
});
