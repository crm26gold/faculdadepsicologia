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
