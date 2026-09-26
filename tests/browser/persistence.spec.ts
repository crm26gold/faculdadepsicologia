import { test, expect } from '@playwright/test';

test('leitura preserva backup anterior sem adicionar uma grade automática', async ({ page }) => {
  const old = JSON.stringify({ version: 1, subjects: [], tasks: [], sessions: [], notes: [{ id: 'mine', title: 'Conteúdo anterior', subjectId: '', content: '<p><strong>Minha anotação</strong></p>', updatedAt: '2026-09-22T12:00:00Z' }] });
  await page.addInitScript(raw => { if (!localStorage.getItem('faculdade-psi:personal:v1')) localStorage.setItem('faculdade-psi:personal:v1', raw); }, old);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name: 'Caderno', exact: true }).click();
  await expect(page.getByLabel('Título da anotação', { exact: true })).toHaveValue('Conteúdo anterior');
  const editor = page.getByRole('textbox', { name: 'Conteúdo da anotação', exact: true });
  await expect(editor.locator('strong')).toHaveText('Minha anotação');
  expect(await page.evaluate(() => localStorage.getItem('faculdade-psi:personal:v1'))).toBe(old);
  await page.getByLabel('Título da anotação', { exact: true }).fill('Edição preservada');
  await expect(page.getByRole('status').filter({ hasText: 'Salvo neste navegador' })).toBeVisible();
  await page.reload();
  await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name: 'Caderno', exact: true }).click();
  await expect(page.getByLabel('Título da anotação', { exact: true })).toHaveValue('Edição preservada');
  await expect(editor.locator('strong')).toHaveText('Minha anotação');
});

test('dados corrompidos não são sobrescritos', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('faculdade-psi:personal:v1', '{invalid'));
  await page.goto('/');
  await expect(page.getByRole('alert').filter({ hasText: 'Nada foi substituído' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('faculdade-psi:personal:v1'))).toBe('{invalid');
});

test('espaço vazio cadastra a primeira matéria e aula e preserva após recarregar', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  await expect(page.getByRole('button', { name: 'Jornada Plena — início', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Minha grade', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Adicionar horário', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('Primeiro cadastre uma matéria');
  await page.keyboard.press('Escape');
  await nav.getByRole('button', { name: 'Matérias', exact: true }).click();
  await page.getByRole('button', { name: 'Nova matéria', exact: true }).click();
  await page.getByLabel('Nome da matéria').fill('Matéria particular de teste');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await nav.getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Minha grade', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Nenhum horário cadastrado');
  await page.getByRole('button', { name: 'Adicionar horário', exact: true }).click();
  await page.getByLabel('Dia da semana', { exact: true }).selectOption('3');
  await page.getByLabel('Início', { exact: true }).fill('18:10');
  await page.getByRole('button', { name: 'Salvar horário', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).classes.length)).toBe(1);
  await page.reload();
  await nav.getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Minha grade', exact: true }).click();
  await page.getByRole('button', { name: /18:10.*Matéria particular de teste/ }).click();
  await expect(page.getByLabel('Dia da semana', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('Início', { exact: true })).toHaveValue('18:10');
  await expect(page.getByLabel('Término (opcional)', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Primeira aula (opcional)', { exact: true })).toHaveValue('');
});
