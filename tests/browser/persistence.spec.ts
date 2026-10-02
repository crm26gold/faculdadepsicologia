import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('edição do workspace preserva metas e projetos após recarregar', async ({ page }) => {
  const data = { version: 1, editorGeneration: 5, subjects: [], tasks: [], sessions: [],
    goals: [{ id: 'goal', title: 'Meta sintética', status: 'active' }],
    projects: [{ id: 'project', title: 'Projeto sintético', goalId: 'goal', status: 'active' }],
    notes: [{ id: 'note', title: 'Nota sintética', subjectId: '', content: '<p>Teste</p>', updatedAt: '2026-09-29T12:00:00Z' }] };
  await page.addInitScript(raw => { if (!localStorage.getItem('faculdade-psi:personal:v1')) localStorage.setItem('faculdade-psi:personal:v1', raw); }, JSON.stringify(data));
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name: 'Caderno', exact: true }).click();
  await page.getByLabel('Título da anotação', { exact: true }).fill('Nota editada');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).notes[0].title)).toBe('Nota editada');
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!));
  expect(saved.goals).toEqual(data.goals);
  expect(saved.projects).toEqual(data.projects);
  expect(saved.editorGeneration).toBe(8);
});

test('capturas longas não alargam a página nem cortam o menu Android', async ({ page }) => {
  const notes = Array.from({ length: 7 }, (_, index) => ({ id: `capture-${index}`, title: `${index} Aula de revisão - ${'conteúdo importante '.repeat(6)}`, subjectId: '', content: '<p>Teste sintético</p>', updatedAt: '2026-09-29T12:00:00Z' }));
  await page.addInitScript(raw => localStorage.setItem('faculdade-psi:personal:v1', raw), JSON.stringify({ version: 1, subjects: [], tasks: [], sessions: [], notes }));
  for (const width of [360, 393]) {
    await page.setViewportSize({ width, height: 740 });
    await page.goto('/');
    await page.getByRole('button', { name: /7 registros esperando organização/ }).click();
    await expect(page.getByRole('heading', { name: 'Para organizar (7)' })).toBeVisible();
    await expect(page.locator('.notes-inbox li')).toHaveCount(7);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const item of await page.locator('.notes-inbox li button').all()) {
      const box = await item.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: `test-results/android-captures-${width}.png`, scale: 'css' });
    await page.getByRole('button', { name: 'Ver todas as áreas' }).click();
    const dialog = page.getByRole('dialog');
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/android-menu-${width}.png`, scale: 'css' });
    await page.getByRole('button', { name: 'Fechar janela' }).click();
  }
});

test('cronômetro global preserva sessão ao reabrir página, pausa e registra tempo parcial', async ({ page, context }) => {
  await page.goto('/#focus');
  await page.getByRole('button', { name: 'Tempo e foco' }).click();
  await page.getByLabel('O que você vai fazer?').fill('Treino de teste');
  await page.getByLabel('Área do tempo').selectOption('health');
  await page.getByRole('button', { name: 'Começar foco', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await page.waitForTimeout(1200);
  const another = await context.newPage();
  await page.close();
  await another.goto('/#focus');
  await expect(another.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
  await another.getByRole('button', { name: 'Pausar', exact: true }).click();
  const time = await another.getByRole('timer').textContent();
  await another.reload();
  await expect(another.getByRole('timer')).toHaveText(time!);
  await another.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name: 'Finanças', exact: true }).click();
  await expect(another.getByRole('button', { name: 'Continuar', exact: true })).toBeVisible();
  await another.getByRole('button', { name: 'Encerrar e registrar', exact: true }).click();
  await expect(another.getByRole('region', { name: 'Registro de tempo e foco' })).toHaveCount(0);
  await another.goto('/#focus');
  await another.reload();
  await expect(another.locator('.focus-log')).toContainText('Treino de teste');
  await expect(another.locator('.focus-log .focus-history li')).toHaveCount(1);
});

test('todas as áreas cabem em telas pequenas sem rolagem horizontal', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const label of ['Meu dia', 'Estudos', 'Caderno', 'Agenda', 'Foco', 'Metas e projetos', 'Finanças', 'Minha rotina', 'Flashcards', 'Assistente Regras', 'Meu espaço']) {
      if (width <= 760) await page.getByRole('button', { name: 'Abrir navegação', exact: true }).click();
      const nav = width <= 760 ? page.getByRole('dialog') : page.locator('.sidebar');
      await nav.getByRole('button', { name: label, exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.screenshot({ path: 'test-results/mobile-responsive.png', fullPage: true });
});

test('captura preserva o texto inteiro além do título de 100 caracteres', async ({ page }) => {
  await page.goto('/');
  const text = 'Ideia longa para regressão\n' + 'conteúdo completo importante '.repeat(20) + 'FIM PRESERVADO';
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await page.getByLabel('O que você quer guardar?').fill(text);
  await page.getByRole('button', { name: 'Guardar ideia', exact: true }).click();
  await expect(page.getByText('Ideia guardada no seu caderno local!', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /1 registro esperando organização/ }).click();
  await page.getByRole('button', { name: 'Abrir e organizar: Ideia longa para regressão', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Conteúdo da anotação', exact: true })).toContainText('FIM PRESERVADO');
});

test('captura rápida persiste e sai da caixa ao organizar, sem perder texto', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  await nav.getByRole('button', { name: 'Meu dia', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await page.getByLabel('O que você quer guardar?').fill('Minha ideia capturada\n<script>texto, não código</script>');
  await page.getByRole('button', { name: 'Guardar ideia', exact: true }).click();
  await expect(page.getByText('Ideia guardada no seu caderno local!', { exact: true })).toBeVisible();
  const audit = await new AxeBuilder({ page }).include('.capture-inbox').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(item => item.id)).toEqual([]);
  await page.getByRole('button', { name: 'Fechar janela' }).click();
  await page.getByRole('button', { name: /1 registro esperando organização/ }).click();
  await expect(page.getByRole('button', { name: 'Abrir e organizar: Minha ideia capturada' })).toBeVisible();
  await page.screenshot({ path: 'test-results/inbox-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'test-results/inbox-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await nav.getByRole('button', { name: 'Meu dia', exact: true }).click();
  await page.getByRole('button', { name: /1 registro esperando organização/ }).click();
  await page.getByRole('button', { name: 'Abrir e organizar: Minha ideia capturada' }).click();
  await expect(page.getByRole('textbox', { name: 'Conteúdo da anotação', exact: true })).toContainText('<script>texto, não código</script>');
  await page.getByLabel('Área da anotação', { exact: true }).selectOption('emotional');
  await nav.getByRole('button', { name: 'Meu dia', exact: true }).click();
  await expect(page.getByRole('button', { name: /esperando organização/ })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Caderno', exact: true }).click();
  await expect(page.getByLabel('Título da anotação', { exact: true })).toHaveValue('Minha ideia capturada');
});

test('áreas e cadernos pessoais organizam notas e agenda sem exigir matéria', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Meu espaço', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar área Espiritualidade e propósito', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Nova área', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Criatividade');
  await page.getByRole('button', { name: 'Salvar organização', exact: true }).click();
  await page.getByRole('button', { name: 'Novo caderno', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Reflexões diárias');
  await page.getByLabel('Área do caderno').selectOption('emotional');
  await page.getByRole('button', { name: 'Salvar organização', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  await nav.getByRole('button', { name: 'Caderno', exact: true }).click();
  await page.getByRole('button', { name: 'Nova anotação', exact: true }).click();
  await page.getByLabel('Título da anotação', { exact: true }).fill('Minha reflexão');
  await page.getByLabel('Caderno · opcional', { exact: true }).selectOption({ label: 'Reflexões diárias' });
  await page.getByLabel('Área da vida · opcional', { exact: true }).selectOption('emotional');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByLabel('Filtrar caderno', { exact: true }).selectOption({ label: 'Reflexões diárias' });
  await expect(page.getByLabel('Título da anotação', { exact: true })).toHaveValue('Minha reflexão');
  await page.getByLabel('Filtrar caderno', { exact: true }).selectOption('__none');
  await expect(page.getByLabel('Título da anotação', { exact: true })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Novo compromisso', exact: true }).click();
  await page.getByLabel('O que você quer fazer?', { exact: true }).fill('Consulta de rotina');
  await page.getByLabel('Área da vida · opcional', { exact: true }).selectOption('health');
  await page.getByLabel('Tipo', { exact: true }).selectOption('Consulta');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await page.getByLabel('Filtrar área da vida', { exact: true }).selectOption('health');
  await expect(page.getByRole('button').filter({ hasText: 'Sem horário · Consulta' })).toContainText('Consulta de rotina');
  await page.getByLabel('Filtrar área da vida', { exact: true }).selectOption('work');
  await expect(page.getByRole('button').filter({ hasText: 'Sem horário · Consulta' })).toHaveCount(0);
  await page.reload();
  await nav.getByRole('button', { name: 'Caderno', exact: true }).click();
  await page.getByLabel('Filtrar caderno', { exact: true }).selectOption({ label: 'Reflexões diárias' });
  await expect(page.getByLabel('Título da anotação', { exact: true })).toHaveValue('Minha reflexão');
  await expect(page.getByLabel('Área da anotação', { exact: true })).toHaveValue('emotional');
  await page.getByRole('button', { name: 'Gerenciar áreas e cadernos', exact: true }).click();
  await page.getByRole('button', { name: 'Editar caderno Reflexões diárias', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Meu diário');
  await page.getByRole('button', { name: 'Salvar organização', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Editar caderno Meu diário', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ocultar Criatividade', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mostrar Criatividade', exact: true })).toBeVisible();
  const audit = await new AxeBuilder({ page }).include('.life-organization').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(item => item.id)).toEqual([]);
  await page.screenshot({ path: 'test-results/life-organization-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'test-results/life-organization-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('caderno completo preserva mídia, marcas e correções manuais ao reabrir', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const media = '/api/note-media/11111111-1111-4111-8111-111111111111';
  const raw = JSON.stringify({ version: 1, subjects: [], tasks: [], sessions: [], notes: [{ id: 'editor-test', title: 'Caderno de teste', subjectId: '', content: `<p><strong>imbigo</strong> para revisar.</p><p><span style="color: #123456; font-size: 24px">Texto colorido</span></p><img src="${media}.png" alt="Lousa de teste" width="75%"><audio src="${media}.mp3" title="Áudio de teste" controls></audio>`, updatedAt: '2026-09-22T12:00:00Z' }] });
  await page.route('**/api/note-media/*.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') }));
  await page.addInitScript(value => { if (!localStorage.getItem('faculdade-psi:personal:v1')) localStorage.setItem('faculdade-psi:personal:v1', value); }, raw);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name: 'Caderno', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Conteúdo da anotação', exact: true });
  await expect(editor.locator('img')).toHaveAttribute('src', `${media}.png`);
  await expect(editor.locator('audio')).toHaveAttribute('src', `${media}.mp3`);
  await expect(editor.locator('.spelling-issue').filter({ hasText: 'imbigo' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: /Ortografia · Português/ }).click();
  await page.getByRole('button', { name: 'imbigo', exact: true }).click();
  await page.getByRole('button', { name: 'umbigo', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('umbigo');
  await expect(editor.locator('span').filter({ hasText: 'Texto colorido' }).first()).toHaveCSS('color', 'rgb(18, 52, 86)');
  await editor.click(); await page.keyboard.press('Control+End'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByLabel('Endereço do link').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Salvar link', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Use um endereço completo' })).toBeVisible();
  await page.getByLabel('Endereço do link').fill('https://example.com/aula');
  await page.getByRole('button', { name: 'Salvar link', exact: true }).click();
  await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/aula');
  await page.getByRole('button', { name: 'Tabela', exact: true }).click();
  await expect(editor.locator('table')).toHaveCount(1);
  await page.getByLabel('Título da anotação', { exact: true }).fill('Caderno revisado');
  await page.reload();
  await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name: 'Caderno', exact: true }).click();
  await expect(editor.locator('strong')).toHaveText('umbigo');
  await expect(editor.locator('img')).toHaveAttribute('src', `${media}.png`);
  await expect(editor.locator('audio')).toHaveAttribute('controls', '');
  await expect(editor.locator('a')).toHaveAttribute('href', 'https://example.com/aula');
  await expect(editor.locator('table')).toHaveCount(1);
  await expect(editor).toHaveCSS('font-size', '18px');
  await expect(page.getByLabel('Fotografar lousa')).toHaveAttribute('capture', 'environment');
  const audit = await new AxeBuilder({ page }).include('.rich-notebook').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.screenshot({ path: 'test-results/notebook-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: 'test-results/notebook-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});

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

test('espaço vazio cadastra o primeiro curso, a primeira matéria e aula e preserva após recarregar', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  await expect(page.getByRole('button', { name: 'Jornada Plena — início', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Minha grade', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Adicionar horário', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('Primeiro cadastre um curso e uma matéria em Estudos.');
  await page.keyboard.press('Escape');
  await nav.getByRole('button', { name: 'Estudos', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cadastrar meu primeiro curso', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Novo curso', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Curso particular de teste');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Curso particular de teste', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar matéria', exact: true }).click();
  await expect(page.getByLabel('Curso', { exact: true })).toHaveValue(/.+/);
  await page.getByLabel('Nome', { exact: true }).fill('Matéria particular de teste');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Matéria particular de teste', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Minha grade', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Nenhum horário cadastrado');
  await page.getByRole('button', { name: 'Adicionar horário', exact: true }).click();
  await page.getByLabel('Dia da semana', { exact: true }).selectOption('3');
  await page.getByLabel('Início', { exact: true }).fill('18:10');
  await page.getByRole('button', { name: 'Salvar horário', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).classes.length)).toBe(1);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!));
  expect(saved.courses).toEqual([expect.objectContaining({ name: 'Curso particular de teste', kind: 'graduacao', status: 'active' })]);
  expect(saved.courses[0].units).toBeUndefined();
  expect(saved.subjects).toEqual([expect.objectContaining({ name: 'Matéria particular de teste', courseId: saved.courses[0].id })]);
  expect(saved.subjects[0].semester).toBeUndefined();
  await page.reload();
  await nav.getByRole('button', { name: 'Agenda', exact: true }).click();
  await page.getByRole('button', { name: 'Minha grade', exact: true }).click();
  // Restrito à grade: quando o teste roda numa quarta, a mesma aula também aparece no calendário.
  await page.getByRole('dialog').getByRole('button', { name: /18:10.*Matéria particular de teste/ }).click();
  await expect(page.getByLabel('Dia da semana', { exact: true })).toHaveValue('3');
  await expect(page.getByLabel('Início', { exact: true })).toHaveValue('18:10');
  await expect(page.getByLabel('Término (opcional)', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Primeira aula (opcional)', { exact: true })).toHaveValue('');
});

test('curso livre chama as partes de módulos e o nome personalizado troca os rótulos', async ({ page }) => {
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!));
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name: 'Estudos', exact: true }).click();
  await page.getByRole('button', { name: 'Novo curso', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Novo curso', exact: true })).toBeVisible();
  await dialog.getByLabel('Nome', { exact: true }).fill('Hipnose clínica');
  const units = dialog.getByLabel('Como chamar as partes do curso', { exact: true });
  await expect(units.locator('option:checked')).toHaveText('Automático · matérias');
  await dialog.getByLabel('Tipo', { exact: true }).selectOption('livre');
  await expect(units).toHaveValue('auto');
  await expect(units.locator('option:checked')).toHaveText('Automático · módulos');
  await expect(dialog.getByText('Vai aparecer como “Adicionar módulo” e “2 módulos”.', { exact: true })).toBeVisible();
  await dialog.getByLabel('Instituição · opcional', { exact: true }).fill('Instituto de teste');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hipnose clínica', level: 1 })).toBeVisible();
  await expect(page.getByText('Curso livre · Instituto de teste', { exact: true })).toBeVisible();
  await expect(page.getByText('0 módulos', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar módulo', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Adicionar módulo', exact: true })).toBeVisible();
  await dialog.getByLabel('Nome', { exact: true }).fill('Indução hipnótica');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Indução hipnótica', exact: true })).toBeVisible();
  await expect(page.getByText('1 módulo', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar módulo: Indução hipnótica', exact: true })).toBeVisible();
  const created = await stored();
  expect(created.courses).toEqual([expect.objectContaining({ name: 'Hipnose clínica', kind: 'livre', institution: 'Instituto de teste', status: 'active' })]);
  expect(created.courses[0].units).toBeUndefined();
  expect(created.editorGeneration).toBe(8);

  await page.getByRole('button', { name: 'Editar curso', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Editar curso', exact: true })).toBeVisible();
  await units.selectOption('custom');
  await dialog.getByLabel('No singular', { exact: true }).fill('encontro');
  await dialog.getByLabel('No plural', { exact: true }).fill('encontros');
  await expect(dialog.getByText('Vai aparecer como “Adicionar encontro” e “2 encontros”.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Adicionar encontro', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar módulo', exact: true })).toHaveCount(0);
  await expect(page.getByText('1 encontro', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar encontro: Indução hipnótica', exact: true })).toBeVisible();
  await expect.poll(async () => (await stored()).courses[0].units).toEqual({ singular: 'encontro', plural: 'encontros' });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hipnose clínica', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Todos os estudos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meus estudos', level: 1 })).toBeVisible();
  const card = page.locator('.course-card').filter({ hasText: 'Hipnose clínica' });
  await expect(card).toContainText('1 encontro');
  await card.getByRole('button', { name: 'Editar curso: Hipnose clínica', exact: true }).click();
  await expect(units).toHaveValue('custom');
  await expect(dialog.getByLabel('No plural', { exact: true })).toHaveValue('encontros');
  await units.selectOption({ label: 'Aulas' });
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(card).toContainText('1 aula');
  await card.getByRole('button', { name: 'Editar curso: Hipnose clínica', exact: true }).click();
  await units.selectOption('auto');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(card).toContainText('1 módulo');
  await expect.poll(async () => 'units' in (await stored()).courses[0]).toBe(false);
});

test('espaço antigo sem cursos abre Estudos em "Meu curso" e só grava a migração na próxima edição', async ({ page }) => {
  const legacy = { version: 1, editorGeneration: 5,
    subjects: [{ id: 'etica', name: 'Ética profissional', semester: 3, color: 'lavender' }, { id: 'social', name: 'Psicologia social', semester: 3, color: 'sand', professor: 'Ana Souza' }],
    tasks: [{ id: 'tarefa', title: 'Ler o código de ética', subjectId: 'etica', date: '2026-09-29', kind: 'Estudo', minutes: 25, done: false }],
    notes: [{ id: 'nota', title: 'Resumo antigo', subjectId: 'social', content: '<p>Texto antigo</p>', updatedAt: '2026-09-22T12:00:00Z' }],
    sessions: [], classes: [{ id: 'aula', subjectId: 'etica', weekday: 2, startTime: '19:00', intervalWeeks: 1, location: 'Sala 4', enabled: true }] };
  const raw = JSON.stringify(legacy);
  await page.addInitScript(value => { if (!localStorage.getItem('faculdade-psi:personal:v1')) localStorage.setItem('faculdade-psi:personal:v1', value); }, raw);
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  await expect(page.getByRole('heading', { name: 'Meu curso' })).toBeVisible();
  await nav.getByRole('button', { name: 'Estudos', exact: true }).click();
  const card = page.locator('.course-card').filter({ hasText: 'Meu curso' });
  await expect(card).toContainText('Graduação');
  await expect(card).toContainText('2 matérias');
  await card.getByRole('heading', { name: 'Meu curso', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meu curso', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ética profissional', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Psicologia social', exact: true })).toBeVisible();
  await expect(page.getByText('3º sem.', { exact: true })).toHaveCount(2);
  expect(await page.evaluate(() => localStorage.getItem('faculdade-psi:personal:v1'))).toBe(raw);
  await nav.getByRole('button', { name: 'Caderno', exact: true }).click();
  await expect(page.locator('#note-subject optgroup[label="Meu curso"] option')).toHaveText(['Ética profissional', 'Psicologia social']);
  await page.getByLabel('Título da anotação', { exact: true }).fill('Resumo revisado');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).notes[0].title)).toBe('Resumo revisado');
  await page.reload();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!));
  expect(saved.editorGeneration).toBe(8);
  expect(saved.courses).toEqual([{ id: 'curso-principal', name: 'Meu curso', kind: 'graduacao', color: 'lavender', status: 'active' }]);
  expect(saved.subjects).toEqual(legacy.subjects.map(subject => ({ ...subject, courseId: 'curso-principal' })));
  expect(saved.tasks).toEqual(legacy.tasks);
  expect(saved.classes).toEqual(legacy.classes);
  expect(saved.notes.map((note: { id: string; subjectId: string }) => [note.id, note.subjectId])).toEqual([['nota', 'social']]);
  await nav.getByRole('button', { name: 'Estudos', exact: true }).click();
  await expect(page.locator('.course-card').filter({ hasText: 'Meu curso' })).toContainText('2 matérias');
});

test('link antigo #subjects abre Estudos', async ({ page }) => {
  await page.goto('/#subjects');
  await expect(page.getByRole('heading', { name: 'Meus estudos', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name: 'Estudos', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Novo curso', exact: true })).toBeVisible();
});

test('voltar do Android em um curso retorna para a lista de Estudos', async ({ page }) => {
  const data = { version: 1, editorGeneration: 7, courses: [{ id: 'idiomas', name: 'Inglês instrumental', kind: 'idioma', color: 'blue', status: 'active' }],
    subjects: [{ id: 'leitura', name: 'Leitura técnica', color: 'blue', courseId: 'idiomas' }], tasks: [], notes: [], sessions: [] };
  await page.addInitScript(raw => { if (!localStorage.getItem('faculdade-psi:personal:v1')) localStorage.setItem('faculdade-psi:personal:v1', raw); }, JSON.stringify(data));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const list = page.getByRole('heading', { name: 'Em andamento', level: 2 });
  const hero = page.getByRole('heading', { name: 'Inglês instrumental', level: 1 });
  await page.locator('.subjects-section').getByRole('heading', { name: 'Inglês instrumental', exact: true }).click();
  await expect(hero).toBeVisible();
  await expect(page.getByText('1 módulo', { exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Inglês instrumental · Jornada Plena');
  await page.goBack();
  await expect(hero).toBeHidden();
  await expect(list).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: /^Hoje/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ir para Estudos', exact: true }).click();
  await page.getByRole('heading', { name: 'Inglês instrumental', exact: true }).click();
  await expect(hero).toBeVisible();
  await page.getByRole('button', { name: 'Voltar para Estudos', exact: true }).click();
  await expect(list).toBeVisible();
  await expect(hero).toBeHidden();
  await page.getByRole('heading', { name: 'Inglês instrumental', exact: true }).click();
  await expect(hero).toBeVisible();
  await page.goBack();
  await expect(list).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ir para Estudos', exact: true })).toHaveAttribute('aria-current', 'page');
  // Recarregar dentro de um curso mantém o curso, e voltar ainda leva para a lista.
  await page.getByRole('heading', { name: 'Inglês instrumental', exact: true }).click();
  await expect(hero).toBeVisible();
  await page.reload();
  await expect(hero).toBeVisible();
  await page.goBack();
  await expect(hero).toBeHidden();
  await expect(list).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

const twoCourses = { version: 1, editorGeneration: 7,
  courses: [{ id: 'idiomas', name: 'Inglês instrumental', kind: 'idioma', color: 'blue', status: 'active' }, { id: 'psico', name: 'Psicologia', kind: 'graduacao', color: 'rose', status: 'active' }],
  subjects: [{ id: 'leitura', name: 'Leitura técnica', color: 'blue', courseId: 'idiomas' }], tasks: [], notes: [], sessions: [] };

test('link direto #subjects: voltar de um curso leva à lista, sem recarregar a página', async ({ page }) => {
  await page.addInitScript(raw => { if (!localStorage.getItem('faculdade-psi:personal:v1')) localStorage.setItem('faculdade-psi:personal:v1', raw); }, JSON.stringify(twoCourses));
  await page.goto('/#subjects');
  await expect(page).toHaveURL(/#studies$/);
  const list = page.getByRole('heading', { name: 'Em andamento', level: 2 });
  const hero = page.getByRole('heading', { name: 'Inglês instrumental', level: 1 });
  await expect(list).toBeVisible();
  await page.evaluate(() => { (window as unknown as { marker: number }).marker = 1; });
  await page.getByRole('heading', { name: 'Inglês instrumental', exact: true }).click();
  await expect(hero).toBeVisible();
  await page.goBack();
  await expect(list).toBeVisible();
  await page.getByRole('heading', { name: 'Inglês instrumental', exact: true }).click();
  await page.getByRole('button', { name: 'Todos os estudos', exact: true }).click();
  await expect(list).toBeVisible();
  await expect(page.locator('#main')).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
});

test('formulários abertos num curso não deixam toques mortos no voltar e mudar de curso avisa', async ({ page }) => {
  await page.addInitScript(raw => { if (!localStorage.getItem('faculdade-psi:personal:v1')) localStorage.setItem('faculdade-psi:personal:v1', raw); }, JSON.stringify(twoCourses));
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  const list = page.getByRole('heading', { name: 'Em andamento', level: 2 });
  const hero = page.getByRole('heading', { name: 'Inglês instrumental', level: 1 });
  await nav.getByRole('button', { name: 'Estudos', exact: true }).click();
  await page.getByRole('heading', { name: 'Inglês instrumental', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar módulo', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Vocabulário');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Vocabulário', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar módulo', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect.poll(() => page.evaluate(() => history.state?.modal ?? null)).toBeNull();
  await page.getByRole('button', { name: 'Editar curso', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => history.state?.modal ?? null)).toBeNull();
  await page.reload();
  await expect(hero).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar módulo', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Fundamentos');
  await page.getByLabel('Curso', { exact: true }).selectOption('psico');
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Adicionar matéria', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '“Fundamentos” agora está em Psicologia.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fundamentos', exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => history.state?.modal ?? null)).toBeNull();
  await page.getByRole('button', { name: 'Voltar para Estudos', exact: true }).click();
  await expect(list).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: /^Hoje/ })).toBeVisible();
  await page.goForward();
  await expect(list).toBeVisible();
  await page.goForward();
  await expect(hero).toBeVisible();
});

test('excluir curso vazio volta para a lista e curso com partes explica como excluir', async ({ page }) => {
  await page.addInitScript(raw => { if (!localStorage.getItem('faculdade-psi:personal:v1')) localStorage.setItem('faculdade-psi:personal:v1', raw); }, JSON.stringify(twoCourses));
  await page.goto('/#studies');
  const list = page.getByRole('heading', { name: 'Em andamento', level: 2 });
  await page.getByRole('heading', { name: 'Inglês instrumental', exact: true }).click();
  await page.getByRole('button', { name: 'Editar curso', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Excluir curso', exact: true })).toBeDisabled();
  await expect(page.getByText('Para excluir, primeiro leve as partes deste curso (módulos) para outro curso, pelo campo Curso de cada uma.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar para Estudos', exact: true }).click();
  await page.getByRole('heading', { name: 'Psicologia', exact: true }).click();
  await page.getByRole('button', { name: 'Editar curso', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Excluir curso', exact: true }).click();
  await expect(list).toBeVisible();
  await expect(page.locator('#main')).toBeFocused();
  await expect(page.locator('.course-card')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).courses.map((item: { id: string }) => item.id))).toEqual(['idiomas']);
  await page.goForward();
  await expect(list).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Psicologia', exact: true })).toHaveCount(0);
});

test('restaurar backup antigo com matérias cria "Meu curso" na geração atual', async ({ page }) => {
  await page.goto('/#settings');
  const backup = { version: 1, editorGeneration: 5, subjects: [{ id: 'etica', name: 'Ética profissional', semester: 3, color: 'lavender' }], tasks: [], notes: [], sessions: [] };
  await page.getByLabel('Selecionar backup JSON', { exact: true }).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('button', { name: 'Confirmar restauração', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1') ?? '{}').editorGeneration)).toBe(8);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!));
  expect(saved.courses.map((item: { id: string }) => item.id)).toEqual(['curso-principal']);
  expect(saved.subjects).toEqual([{ ...backup.subjects[0], courseId: 'curso-principal' }]);
});

test('planejamento: fluxo completo de meta, projeto ligado, tarefas, 50% operacional e separação conceitual', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  await nav.getByRole('button', { name: 'Metas e projetos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Metas e projetos', level: 1 })).toBeVisible();

  // 1. Criar meta com medição
  await page.getByRole('button', { name: 'Nova meta', exact: true }).click();
  await page.getByLabel('Título da meta').fill('Aprender Psicometria');
  await page.getByLabel('Descrição · opcional').fill('Dominar testes e escalas validadas');
  await page.getByLabel('Adicionar medição quantitativa da meta').check();
  await page.getByLabel('Unidade de medida').fill('capítulos');
  await page.getByLabel('Ponto inicial').fill('0');
  await page.getByLabel('Valor atual').fill('4');
  await page.getByLabel('Valor alvo').fill('10');
  await page.getByRole('button', { name: 'Salvar meta' }).click();

  await expect(page.locator('.goal-card')).toContainText('Aprender Psicometria');
  await expect(page.locator('.goal-card .metric-deck-label')).toHaveText('Medição da meta');
  await expect(page.locator('.goal-card .metric-deck-value')).toContainText('4 de 10 capítulos (40%)');

  // 2. Criar projeto ligado a essa meta
  await page.getByRole('button', { name: 'Novo projeto', exact: true }).click();
  await page.getByLabel('Título do projeto').fill('Elaboração do Instrumento');
  await page.getByLabel('Meta vinculada · opcional').selectOption({ label: 'Aprender Psicometria' });
  await page.getByRole('button', { name: 'Salvar projeto' }).click();

  // Mudar para aba Projetos
  await page.getByRole('tab', { name: 'Projetos' }).click();
  await expect(page.locator('.project-card')).toContainText('Elaboração do Instrumento');
  await expect(page.locator('.project-card .card-parent-link')).toContainText('Aprender Psicometria');
  // Projeto sem tarefas mostra 'Sem tarefas'
  await expect(page.locator('.project-card .metric-deck-label')).toHaveText('Tarefas concluídas');
  await expect(page.locator('.project-card .metric-deck-value')).toHaveText('Sem tarefas');

  // 3. Criar duas tarefas vinculadas ao projeto
  await nav.getByRole('button', { name: 'Meu dia', exact: true }).click();
  await page.getByRole('button', { name: 'Novo compromisso' }).click();
  await page.getByLabel('O que você quer fazer?').fill('Revisar literatura de escalas');
  await page.getByLabel('Projeto · opcional').selectOption({ label: 'Elaboração do Instrumento' });
  await page.getByRole('button', { name: 'Salvar' }).click();

  await page.getByRole('button', { name: 'Novo compromisso' }).click();
  await page.getByLabel('O que você quer fazer?').fill('Construir itens preliminares');
  await page.getByLabel('Projeto · opcional').selectOption({ label: 'Elaboração do Instrumento' });
  await page.getByRole('button', { name: 'Salvar' }).click();

  // Conferir que na lista de tarefas aparece o nome do projeto
  await expect(page.locator('.today-agenda li').filter({ hasText: 'Construir itens preliminares' })).toContainText('Projeto: Elaboração do Instrumento');

  // 4. Voltar para Metas e Projetos, abrir tarefas do projeto e concluir uma
  await nav.getByRole('button', { name: 'Metas e projetos', exact: true }).click();
  await page.getByRole('tab', { name: 'Projetos' }).click();
  await page.getByRole('button', { name: '2 tarefas no projeto' }).click();
  await expect(page.locator('.project-task-item')).toHaveCount(2);

  // Concluir a primeira tarefa
  await page.locator('.project-task-item').first().getByRole('checkbox').check();

  // 5. Verificar progresso operacional: 50% concluídas (1 de 2)
  await expect(page.locator('.project-card .metric-deck-value')).toContainText('1/2 concluídas (50%)');

  // 6. Verificar que a meta NÃO mudou seu resultado ou status
  await page.getByRole('tab', { name: 'Metas' }).click();
  await expect(page.locator('.goal-card .status-pill')).toHaveText('Ativa');
  await expect(page.locator('.goal-card .metric-deck-value')).toContainText('4 de 10 capítulos (40%)');

  // 7. Persistência após reload
  await page.screenshot({ path: 'test-results/planning-desktop.png', fullPage: true });
  await page.reload();
  await nav.getByRole('button', { name: 'Metas e projetos', exact: true }).click();
  await page.getByRole('tab', { name: 'Projetos' }).click();
  await expect(page.locator('.project-card .metric-deck-value')).toContainText('1/2 concluídas (50%)');
});

test('planejamento: métrica decrescente, ausência de métrica e ações de status', async ({ page }) => {
  const data = {
    version: 1,
    editorGeneration: 5,
    subjects: [],
    tasks: [],
    sessions: [],
    notes: [],
    goals: [
      { id: 'g-dec', title: 'Reduzir Tempo de Tela', status: 'active', metric: { unit: 'horas/sem', baseline: 40, target: 20, current: 30 } },
      { id: 'g-nomet', title: 'Aprender Mindfulness', status: 'active' },
    ],
    projects: [
      { id: 'p-long', title: 'Projeto com Título Extenso '.repeat(5), goalId: 'g-dec', status: 'active' },
    ],
  };
  await page.addInitScript(raw => localStorage.setItem('faculdade-psi:personal:v1', raw), JSON.stringify(data));
  await page.goto('/');

  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  await nav.getByRole('button', { name: 'Metas e projetos', exact: true }).click();

  // Métrica decrescente (baseline 40, target 20, current 30 -> 50%)
  const decCard = page.locator('.goal-card').filter({ hasText: 'Reduzir Tempo de Tela' });
  await expect(decCard.locator('.metric-deck-value')).toContainText('30 de 20 horas/sem (50%)');

  // Ausência de métrica -> Sem medição
  const noMetCard = page.locator('.goal-card').filter({ hasText: 'Aprender Mindfulness' });
  await expect(noMetCard.locator('.metric-deck-value')).toHaveText('Sem medição');

  // Ações de status na meta: Pausar -> Concluir -> Reabrir
  await noMetCard.getByRole('button', { name: 'Pausar' }).click();
  await expect(noMetCard.locator('.status-pill')).toHaveText('Pausada');

  await noMetCard.getByRole('button', { name: 'Concluir' }).click();
  await expect(noMetCard.locator('.status-pill')).toHaveText('Concluída');

  await noMetCard.getByRole('button', { name: 'Reabrir' }).click();
  await expect(noMetCard.locator('.status-pill')).toHaveText('Ativa');

  // Arquivamento com confirmação
  page.on('dialog', dialog => dialog.accept());
  await noMetCard.getByRole('button', { name: 'Arquivar' }).click();
  await expect(noMetCard.locator('.status-pill')).toHaveText('Arquivada');

  // Restaurar meta arquivada
  await noMetCard.getByRole('button', { name: 'Restaurar meta' }).click();
  await expect(noMetCard.locator('.status-pill')).toHaveText('Ativa');
});

test('planejamento: arquivamento de projeto preserva tarefas e desvinculação é imutável', async ({ page }) => {
  // Tarefas do dia atual no fuso do navegador, para aparecerem em "Meu dia" em qualquer data de execução.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const data = {
    version: 1,
    editorGeneration: 5,
    subjects: [],
    sessions: [],
    notes: [],
    goals: [{ id: 'g1', title: 'Meta Base', status: 'active' }],
    projects: [{ id: 'p1', title: 'Projeto Alpha', goalId: 'g1', status: 'active' }],
    tasks: [
      { id: 't1', title: 'Tarefa do Projeto Alpha', projectId: 'p1', subjectId: '', date: today, done: false, kind: 'Tarefa', minutes: 25 },
      { id: 't2', title: 'Segunda Tarefa Alpha', projectId: 'p1', subjectId: '', date: today, done: true, kind: 'Tarefa', minutes: 30 },
    ],
  };
  // Seed only once before the first goto — do NOT re-seed on reload
  await page.addInitScript(raw => {
    if (!localStorage.getItem('faculdade-psi:personal:v1')) localStorage.setItem('faculdade-psi:personal:v1', raw);
  }, JSON.stringify(data));
  await page.goto('/');

  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  await nav.getByRole('button', { name: 'Metas e projetos', exact: true }).click();
  await page.getByRole('tab', { name: 'Projetos' }).click();

  // ─── 1. Archive via form: CANCEL — modal stays open, data preserved ───
  const projectCard = page.locator('.project-card').filter({ hasText: 'Projeto Alpha' });
  await projectCard.getByRole('button', { name: 'Editar' }).click();

  // Change status to Arquivado
  await page.locator('#project-status').selectOption('archived');
  // Fill title to something we can verify is preserved on cancel
  await page.getByLabel('Título do projeto').fill('Projeto Alpha Renomeado');

  // Dismiss the confirm dialog (user cancels archiving)
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Salvar projeto' }).click();

  // Modal should stay open with form data preserved
  await expect(page.getByLabel('Título do projeto')).toHaveValue('Projeto Alpha Renomeado');
  // Project status on the card should still be active (not archived)
  await expect(projectCard.locator('.status-pill')).toHaveText('Ativo');

  // ─── 2. Archive via form: CONFIRM — project archives ───
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Salvar projeto' }).click();

  // Modal closes, project is now archived with the new title
  await expect(projectCard.locator('.status-pill')).toHaveText('Arquivado');
  await expect(projectCard).toContainText('Projeto Alpha Renomeado');

  // ─── 3. Verify tasks still exist after archiving project ───
  await nav.getByRole('button', { name: 'Meu dia', exact: true }).click();
  await expect(page.locator('.today-agenda li').filter({ hasText: 'Tarefa do Projeto Alpha' })).toBeVisible();
  await expect(page.locator('.today-agenda li').filter({ hasText: 'Segunda Tarefa Alpha' })).toBeVisible();

  // ─── 4. Reload and verify persistence (no re-seeding) ───
  await page.reload();
  await nav.getByRole('button', { name: 'Metas e projetos', exact: true }).click();
  await page.getByRole('tab', { name: 'Projetos' }).click();

  // Project is still archived with the renamed title
  const reloadedCard = page.locator('.project-card').filter({ hasText: 'Projeto Alpha Renomeado' });
  await expect(reloadedCard.locator('.status-pill')).toHaveText('Arquivado');

  // Tasks are preserved and still linked
  await nav.getByRole('button', { name: 'Meu dia', exact: true }).click();
  await expect(page.locator('.today-agenda li').filter({ hasText: 'Tarefa do Projeto Alpha' })).toBeVisible();
  await expect(page.locator('.today-agenda li').filter({ hasText: 'Segunda Tarefa Alpha' })).toBeVisible();

  // ─── 5. Restore project and verify data ───
  await nav.getByRole('button', { name: 'Metas e projetos', exact: true }).click();
  await page.getByRole('tab', { name: 'Projetos' }).click();
  await reloadedCard.getByRole('button', { name: 'Restaurar projeto' }).click();
  await expect(reloadedCard.locator('.status-pill')).toHaveText('Ativo');

  // Open tasks accordion — both tasks should still be linked
  await reloadedCard.getByRole('button', { name: '2 tarefas no projeto' }).click();
  await expect(reloadedCard.locator('.project-task-item')).toHaveCount(2);

  // Goal link is preserved
  await expect(reloadedCard.locator('.card-parent-link')).toContainText('Meta Base');

  // ─── 6. Unlink a task, reload, and confirm task persists independently ───
  await reloadedCard.getByRole('button', { name: 'Desvincular tarefa: Tarefa do Projeto Alpha' }).click();
  await expect(reloadedCard.locator('.project-task-item')).toHaveCount(1);
  await expect(reloadedCard).toContainText('Segunda Tarefa Alpha');

  // The unlinked task still exists in Meu dia
  await nav.getByRole('button', { name: 'Meu dia', exact: true }).click();
  await expect(page.locator('.today-agenda li').filter({ hasText: 'Tarefa do Projeto Alpha' })).toBeVisible();
  // No longer shows project name
  await expect(page.locator('.today-agenda li').filter({ hasText: 'Tarefa do Projeto Alpha' })).not.toContainText('Projeto:');

  // Reload and confirm persistence
  await page.reload();
  await expect(page.locator('.today-agenda li').filter({ hasText: 'Tarefa do Projeto Alpha' })).toBeVisible();

  // The second task is still linked to the project after reload
  await nav.getByRole('button', { name: 'Metas e projetos', exact: true }).click();
  await page.getByRole('tab', { name: 'Projetos' }).click();
  const finalCard = page.locator('.project-card').filter({ hasText: 'Projeto Alpha Renomeado' });
  await finalCard.getByRole('button', { name: '1 tarefa no projeto' }).click();
  await expect(finalCard.locator('.project-task-item')).toHaveCount(1);
  await expect(finalCard).toContainText('Segunda Tarefa Alpha');

  await page.screenshot({ path: 'test-results/planning-archive-persistence.png', fullPage: true });
});

test('planejamento: arquivamento de meta pelo formulário exige confirmação', async ({ page }) => {
  const data = {
    version: 1,
    editorGeneration: 5,
    subjects: [],
    sessions: [],
    notes: [],
    goals: [{ id: 'g1', title: 'Meta para Arquivar', status: 'active' }],
    projects: [],
    tasks: [],
  };
  await page.addInitScript(raw => {
    if (!localStorage.getItem('faculdade-psi:personal:v1')) localStorage.setItem('faculdade-psi:personal:v1', raw);
  }, JSON.stringify(data));
  await page.goto('/');

  const nav = page.getByRole('navigation', { name: 'Principal', exact: true });
  await nav.getByRole('button', { name: 'Metas e projetos', exact: true }).click();

  const goalCard = page.locator('.goal-card').filter({ hasText: 'Meta para Arquivar' });

  // Open edit modal and select archived status
  await goalCard.getByRole('button', { name: 'Editar' }).click();
  await page.locator('#goal-status').selectOption('archived');

  // Cancel the confirm — form stays open with data
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Salvar meta' }).click();
  await expect(page.getByLabel('Título da meta')).toHaveValue('Meta para Arquivar');
  await expect(goalCard.locator('.status-pill')).toHaveText('Ativa');

  // Accept the confirm — goal is archived
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Salvar meta' }).click();
  await expect(goalCard.locator('.status-pill')).toHaveText('Arquivada');

  // Reload and confirm persistence
  await page.reload();
  await nav.getByRole('button', { name: 'Metas e projetos', exact: true }).click();
  await expect(page.locator('.goal-card').filter({ hasText: 'Meta para Arquivar' }).locator('.status-pill')).toHaveText('Arquivada');
});

test('planejamento: responsividade e alvos de toque mínimos de 44px em telas pequenas', async ({ page }) => {
  const data = {
    version: 1,
    editorGeneration: 5,
    subjects: [],
    sessions: [],
    notes: [],
    goals: [{ id: 'g1', title: 'Meta Sintética para Teste Mobile', status: 'active' }],
    projects: [{ id: 'p1', title: 'Projeto Sintético com Título Bastante Longo Para Testar Quebra de Linha em Telas Estreitas', goalId: 'g1', status: 'active' }],
    tasks: [
      { id: 't1', title: 'Tarefa Vinculada ao Projeto', projectId: 'p1', subjectId: '', date: '2026-09-29', done: false, kind: 'Tarefa', minutes: 25 },
      { id: 't2', title: 'Segunda Tarefa do Projeto', projectId: 'p1', subjectId: '', date: '2026-09-29', done: true, kind: 'Tarefa', minutes: 30 },
    ],
  };
  await page.addInitScript(raw => localStorage.setItem('faculdade-psi:personal:v1', raw), JSON.stringify(data));

  // ─── 1. Medição de alvos interativos (largura E altura >= 44px) ───
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Abrir navegação' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Metas e projetos' }).click();

  // Abas
  for (const tab of await page.locator('.planning-tab').all()) {
    const box = await tab.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  // Botões de status
  for (const btn of await page.locator('.status-btn').all()) {
    const box = await btn.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  // Filtros
  for (const filter of await page.locator('.planning-filters-bar select').all()) {
    const box = await filter.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  // Alternar para projetos e verificar acordeão e tarefas expandidas
  await page.getByRole('tab', { name: 'Projetos' }).click();
  const projectCard = page.locator('.project-card').first();

  const toggleBtn = projectCard.getByRole('button', { name: /tarefas no projeto/ });
  const toggleBox = await toggleBtn.boundingBox();
  expect(toggleBox!.width).toBeGreaterThanOrEqual(44);
  expect(toggleBox!.height).toBeGreaterThanOrEqual(44);
  await toggleBtn.click();

  // Checkbox de tarefa (largura E altura >= 44px)
  for (const item of await projectCard.locator('.project-task-item').all()) {
    const cb = item.locator('.task-checkbox');
    const cbBox = await cb.boundingBox();
    expect(cbBox!.width).toBeGreaterThanOrEqual(44);
    expect(cbBox!.height).toBeGreaterThanOrEqual(44);

    const inputEl = cb.locator('input[type="checkbox"]');
    const inBox = await inputEl.boundingBox();
    expect(inBox!.width).toBeGreaterThanOrEqual(44);
    expect(inBox!.height).toBeGreaterThanOrEqual(44);

    const unlink = item.locator('.unlink-btn');
    const uBox = await unlink.boundingBox();
    expect(uBox!.width).toBeGreaterThanOrEqual(44);
    expect(uBox!.height).toBeGreaterThanOrEqual(44);
  }

  // Botão Editar
  const editBtn = projectCard.getByRole('button', { name: /Editar/ });
  const editBox = await editBtn.boundingBox();
  expect(editBox!.width).toBeGreaterThanOrEqual(44);
  expect(editBox!.height).toBeGreaterThanOrEqual(44);

  // ─── 2. Validação de formulários abertos e capturas (320, 360, 393 e 500h) ───
  const viewports = [
    { width: 320, height: 700, suffix: '320' },
    { width: 360, height: 740, suffix: '360' },
    { width: 393, height: 800, suffix: '393' },
    { width: 360, height: 500, suffix: 'short-500' },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    if (vp.width <= 760) {
      await page.getByRole('button', { name: 'Abrir navegação' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Metas e projetos' }).click();
    } else {
      await page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name: 'Metas e projetos' }).click();
    }

    // Sem rolagem horizontal na tela base
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // ── Form de Meta com medição quantitativa aberta e preenchida ──
    await page.getByRole('button', { name: 'Nova meta', exact: true }).click();
    const goalModal = page.getByRole('dialog');
    await expect(goalModal).toBeVisible();

    // Fechar botão (icon-button) tem >= 44x44
    const closeBtn = goalModal.getByRole('button', { name: 'Fechar janela' });
    const closeBox = await closeBtn.boundingBox();
    expect(closeBox!.width).toBeGreaterThanOrEqual(44);
    expect(closeBox!.height).toBeGreaterThanOrEqual(44);

    // Preencher campos
    await page.getByLabel('Título da meta').fill('Leitura de 12 livros de Neurociência');
    await page.getByLabel('Descrição · opcional').fill('Metas de desenvolvimento profissional e consolidação acadêmica');
    
    // Checkbox de medição quantitativa (alvo de toque >= 44x44)
    const metricLabel = page.locator('.checkbox-label');
    const mBox = await metricLabel.boundingBox();
    expect(mBox!.width).toBeGreaterThanOrEqual(44);
    expect(mBox!.height).toBeGreaterThanOrEqual(44);
    await page.getByLabel('Adicionar medição quantitativa da meta').check();

    await page.getByLabel('Unidade de medida').fill('livros');
    await page.getByLabel('Ponto inicial').fill('0');
    await page.getByLabel('Valor atual').fill('3');
    await page.getByLabel('Valor alvo').fill('12');

    // Sem rolagem horizontal dentro do modal
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // Rolar até os botões do rodapé
    const goalSaveBtn = goalModal.getByRole('button', { name: 'Salvar meta' });
    const goalCancelBtn = goalModal.getByRole('button', { name: 'Cancelar' });
    await goalSaveBtn.scrollIntoViewIfNeeded();

    // Ambos os botões devem estar dentro da área visível do viewport
    await expect(goalSaveBtn).toBeInViewport();
    await expect(goalCancelBtn).toBeInViewport();

    // Dimensões mínimas dos botões
    const gsBox = await goalSaveBtn.boundingBox();
    const gcBox = await goalCancelBtn.boundingBox();
    expect(gsBox!.width).toBeGreaterThanOrEqual(44);
    expect(gsBox!.height).toBeGreaterThanOrEqual(44);
    expect(gcBox!.width).toBeGreaterThanOrEqual(44);
    expect(gcBox!.height).toBeGreaterThanOrEqual(44);

    // Sem sobreposição entre os botões
    const noOverlapGoal =
      gsBox!.y + gsBox!.height <= gcBox!.y ||
      gcBox!.y + gcBox!.height <= gsBox!.y ||
      gsBox!.x + gsBox!.width <= gcBox!.x ||
      gcBox!.x + gcBox!.width <= gsBox!.x;
    expect(noOverlapGoal).toBe(true);

    // Captura com o formulário de meta aberto e preenchido
    await page.screenshot({ path: `test-results/planning-goal-form-open-${vp.suffix}.png`, scale: 'css' });

    // Cancelar para fechar modal
    await goalCancelBtn.click();
    await expect(goalModal).not.toBeVisible();

    // ── Form de Projeto com campos preenchidos ──
    await page.getByRole('button', { name: 'Novo projeto', exact: true }).click();
    const projModal = page.getByRole('dialog');
    await expect(projModal).toBeVisible();

    await page.getByLabel('Título do projeto').fill('Revisão Sistemática de Avaliação Psicológica');
    await page.getByLabel('Descrição · opcional').fill('Elaborar protocolo, selecionar artigos em bases e sintetizar evidências.');
    await page.getByLabel('Meta vinculada · opcional').selectOption({ label: 'Meta Sintética para Teste Mobile' });
    await page.getByLabel('Prazo · opcional').fill('2026-11-30');

    // Sem rolagem horizontal
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // Rolar até os botões do rodapé
    const projSaveBtn = projModal.getByRole('button', { name: 'Salvar projeto' });
    const projCancelBtn = projModal.getByRole('button', { name: 'Cancelar' });
    await projSaveBtn.scrollIntoViewIfNeeded();

    // Ambos os botões devem estar visíveis e acessíveis
    await expect(projSaveBtn).toBeInViewport();
    await expect(projCancelBtn).toBeInViewport();

    const psBox = await projSaveBtn.boundingBox();
    const pcBox = await projCancelBtn.boundingBox();
    expect(psBox!.width).toBeGreaterThanOrEqual(44);
    expect(psBox!.height).toBeGreaterThanOrEqual(44);
    expect(pcBox!.width).toBeGreaterThanOrEqual(44);
    expect(pcBox!.height).toBeGreaterThanOrEqual(44);

    // Sem sobreposição entre botões
    const noOverlapProj =
      psBox!.y + psBox!.height <= pcBox!.y ||
      pcBox!.y + pcBox!.height <= psBox!.y ||
      psBox!.x + psBox!.width <= pcBox!.x ||
      pcBox!.x + pcBox!.width <= psBox!.x;
    expect(noOverlapProj).toBe(true);

    // Captura com o formulário de projeto aberto e preenchido
    await page.screenshot({ path: `test-results/planning-project-form-open-${vp.suffix}.png`, scale: 'css' });

    // Cancelar para fechar modal
    await projCancelBtn.click();
    await expect(projModal).not.toBeVisible();
  }
});

test('cards do Meu dia abrem suas abas e a aba Foco mostra o histórico', async ({ page }) => {
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const data = { version: 1, editorGeneration: 7, tasks: [], notes: [],
    courses: [{ id: 'psi', name: 'Psicologia', kind: 'graduacao', color: 'rose', status: 'active' }],
    subjects: [{ id: 'etica', name: 'Ética', color: 'rose', courseId: 'psi' }],
    sessions: [
      { id: 'a', date: today, minutes: 50, seconds: 3000, activity: 'Leitura de ética', areaId: 'studies', subjectId: 'etica' },
      { id: 'b', date: today, minutes: 30, seconds: 1800, activity: 'Corrida', areaId: 'health', subjectId: '' },
    ] };
  await page.addInitScript(raw => { if (!localStorage.getItem('faculdade-psi:personal:v1')) localStorage.setItem('faculdade-psi:personal:v1', raw); }, JSON.stringify(data));
  await page.goto('/');
  await page.getByRole('button', { name: /Foco hoje/ }).click();
  await expect(page.getByRole('heading', { name: 'Meu foco', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Por área da vida')).toContainText('Estudos e aprendizagem');
  await expect(page.getByLabel('Por curso e matéria')).toContainText('Psicologia › Ética');
  await expect(page.locator('.focus-log')).toContainText('Corrida');
  await expect(page.locator('.focus-page .metric-value').first()).toHaveText('1h 20min');
  expect((await new AxeBuilder({ page }).include('.focus-page').analyze()).violations).toEqual([]);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Apagar registro Corrida' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).sessions.length)).toBe(1);
  for (const [card, heading] of [[/Tarefas de hoje/, 'Minha agenda'], [/Ver estudos/, 'Meus estudos']] as const) {
    await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name: 'Meu dia', exact: true }).click();
    await page.getByRole('button', { name: card }).click();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  }
});

test('botão central abre o registro rápido, guarda vídeo e a nota mantém o vídeo no caderno', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: 'Atalhos mobile' });
  await expect(bar.getByRole('button')).toHaveText(['Hoje', 'Agenda', 'Registrar', 'Estudos', 'Mais']);
  await bar.getByRole('button', { name: 'Registrar', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Registro rápido' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel('O que você quer guardar?')).toBeFocused();
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await bar.getByRole('button', { name: 'Registrar', exact: true }).click();
  await sheet.getByLabel('O que você quer guardar?').fill('Gravação da aula de ética');
  await sheet.getByLabel('Anexar arquivo para insight').setInputFiles({ name: 'aula.webm', mimeType: 'video/webm', buffer: Buffer.alloc(2048, 1) });
  await expect(sheet.getByText(/🎬 Vídeo: aula\.webm/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Guardar ideia', exact: true }).click();
  await expect(sheet.getByText('Ideia guardada no seu caderno local!', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).notes[0]);
  expect(saved).toMatchObject({ title: 'Gravação da aula de ética', subjectId: '', areaId: '' });
  expect(saved.content).toMatch(/<video src="\/api\/note-media\/[0-9a-f-]{36}\.webm" title="aula\.webm" controls><\/video>/);
  await sheet.getByRole('button', { name: /Abrir e organizar agora/ }).click();
  await expect(page.getByRole('heading', { name: 'Meu caderno', level: 1 })).toBeVisible();
  await expect(page.locator('.note-prose video')).toHaveCount(1);
  await page.getByLabel('Título da anotação', { exact: true }).fill('Ética · vídeo da aula');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).notes[0].title)).toBe('Ética · vídeo da aula');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).notes[0].content)).toContain('<video');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: /^Hoje/ })).toBeVisible();
});

test('registro rápido leva a compromisso, foco e gasto; o atalho da barra é pessoal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: 'Atalhos mobile' });
  const sheet = page.getByRole('dialog', { name: 'Registro rápido' });
  const settled = () => expect.poll(() => page.evaluate(() => history.state?.modal ?? null)).toBeNull();
  await bar.getByRole('button', { name: 'Registrar', exact: true }).click();
  await sheet.getByRole('button', { name: 'Tarefa ou compromisso', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Um novo passo' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: /^Hoje/ })).toBeVisible();
  await settled();
  await bar.getByRole('button', { name: 'Registrar', exact: true }).click();
  await sheet.getByRole('button', { name: 'Começar foco', exact: true }).click();
  await expect(page.getByLabel('O que você vai fazer?')).toBeFocused();
  await settled();
  await bar.getByRole('button', { name: 'Registrar', exact: true }).click();
  await sheet.getByRole('button', { name: 'Gasto ou entrada', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Finanças', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Novo lançamento' })).toBeVisible();
  await expect(page.getByLabel('Descrição')).toBeFocused();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Meu foco', level: 1 })).toBeVisible();
  await bar.getByRole('button', { name: 'Ver todas as áreas' }).click();
  await page.getByLabel('Botão da barra, ao lado do Registrar').selectOption('focus');
  await page.getByRole('button', { name: 'Fechar janela' }).click();
  await expect(bar.getByRole('button')).toHaveText(['Hoje', 'Agenda', 'Registrar', 'Foco', 'Mais']);
  await page.reload();
  await expect(bar.getByRole('button')).toHaveText(['Hoje', 'Agenda', 'Registrar', 'Foco', 'Mais']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('no computador, a bolinha se apresenta uma vez, anexa arquivos, pode ser arrastada e escondida', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const bubble = page.getByRole('button', { name: 'Abrir assistente' });
  const intro = page.getByRole('status').filter({ hasText: 'Eu sou o assistente da Jornada Plena' });
  await expect(intro).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.assistant-dock').analyze()).violations).toEqual([]);
  await intro.getByRole('button', { name: 'Entendi' }).click();
  await expect(intro).toHaveCount(0);
  const start = (await bubble.boundingBox())!;
  expect(start.x + start.width).toBeGreaterThan(1280 - 90);
  await page.mouse.move(start.x + 28, start.y + 28);
  await page.mouse.down();
  await page.mouse.move(400, 500, { steps: 8 });
  await page.mouse.move(80, 500, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await bubble.boundingBox())!.x).toBeLessThan(40);
  await page.reload();
  await expect.poll(async () => (await bubble.boundingBox())!.x).toBeLessThan(40);
  await expect(page.getByText('Eu sou o assistente da Jornada Plena')).toHaveCount(0);
  await bubble.click();
  const panel = page.getByRole('dialog', { name: 'Assistente Jornada Plena' });
  await expect(panel).toBeVisible();
  await panel.getByLabel('Anexar arquivo ao assistente').setInputFiles({ name: 'lousa.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex') });
  await expect(panel.getByText(/lousa\.png/)).toBeVisible();
  await panel.getByLabel('Mensagem para o assistente').fill('Foto da lousa de Ética');
  await panel.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(panel.getByText(/Anotei em Para organizar: “Foto da lousa de Ética”, com o anexo/)).toBeVisible();
  const note = await page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).notes[0]);
  expect(note).toMatchObject({ title: 'Foto da lousa de Ética', subjectId: '', areaId: '' });
  expect(note.content).toMatch(/<img src="\/api\/note-media\/[0-9a-f-]{36}\.png" alt="lousa\.png"/);
  expect((await new AxeBuilder({ page }).include('dialog').analyze()).violations).toEqual([]);
  await panel.getByRole('button', { name: 'Fechar janela' }).click();
  await expect.poll(() => page.evaluate(() => history.state?.modal ?? null)).toBeNull();
  await page.getByRole('button', { name: 'Esconder assistente' }).click();
  await expect(bubble).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Assistente escondido' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /^Hoje/ })).toBeVisible();
  await expect(bubble).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('button', { name: /^Assistente/ }).click();
  await expect(page.getByRole('heading', { name: 'Assistente', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Mostrar a bolinha do assistente' }).click();
  await expect(bubble).toBeVisible();
});

test('no celular não há bolinha: o assistente vive na aba Assistente', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /^Hoje/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir assistente' })).toBeHidden();
  await page.getByRole('button', { name: 'Ver todas as áreas' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Assistente/ }).click();
  await expect(page.getByRole('heading', { name: 'Assistente', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mostrar a bolinha do assistente' })).toHaveCount(0);
  await page.getByLabel('Mensagem para o assistente').fill('Lembrar de levar o livro de Ética');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(page.getByText(/Anotei em Para organizar: “Lembrar de levar o livro de Ética”/)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).notes[0].title)).toBe('Lembrar de levar o livro de Ética');
  await page.getByRole('button', { name: /Ver anotação/ }).click();
  await expect(page.getByLabel('Título da anotação', { exact: true })).toHaveValue('Lembrar de levar o livro de Ética');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('meu dia mostra o dia, o ciclo do mês, a agenda de hoje e os avisos sem repetir', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  const { today, yesterday, weekday } = await page.evaluate(() => {
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const now = new Date(); const before = new Date(now); before.setDate(now.getDate() - 1);
    return { today: key(now), yesterday: key(before), weekday: now.getDay() };
  });
  const data = { version: 1, editorGeneration: 7,
    courses: [{ id: 'psi', name: 'Psicologia', kind: 'graduacao', color: 'rose', status: 'active' }],
    subjects: [{ id: 'neuro', name: 'Neuropsicologia', color: 'rose', courseId: 'psi', professor: 'Profa. Lia' }],
    classes: [{ id: 'aula', subjectId: 'neuro', weekday, startTime: '19:10', endTime: '20:50', location: 'Sala 12', enabled: true, intervalWeeks: 1 }],
    tasks: [
      { id: 'consulta', title: 'Consulta médica', subjectId: '', date: today, time: '08:30', kind: 'Consulta', done: false, minutes: 60 },
      { id: 'luz', title: 'Pagar luz', subjectId: '', date: yesterday, kind: 'Pagamento', done: false, minutes: 10 },
    ], notes: [], sessions: [] };
  await page.evaluate(raw => localStorage.setItem('faculdade-psi:personal:v1', raw), JSON.stringify(data));
  await page.reload();
  const hero = page.getByRole('region', { name: /^Hoje/ });
  await expect(hero.getByRole('heading', { level: 1, name: /^Hoje/ })).toBeVisible();
  await expect(page.locator('.topbar .cycle-bars i.on')).toHaveCount(1);
  await expect(page.locator('.topbar-cycle')).toContainText(/ciclo \d\/4 · dia \d+\/\d+/);
  const agenda = hero.locator('.today-agenda li');
  await expect(agenda).toHaveCount(2);
  await expect(agenda.nth(0)).toContainText('08:30Consulta médica');
  await expect(agenda.nth(1)).toContainText('Neuropsicologia');
  await expect(agenda.nth(1)).toContainText('Aula · Psicologia · Profa. Lia · Sala 12');
  await expect(page.getByRole('region', { name: 'Atenção' }).getByRole('button', { name: /1 compromisso atrasado: Pagar luz/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nova anotação' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Registro de tempo e foco' })).toHaveCount(0);
  await expect(page.getByText('Espaço pessoal · privado')).toHaveCount(0);
  await hero.getByRole('checkbox', { name: 'Concluir: Consulta médica' }).check();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).tasks.find((t: { id: string }) => t.id === 'consulta').done)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.today-hero').include('.today-alerts').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('region', { name: 'Atenção' }).getByRole('button', { name: /atrasado/ }).click();
  await expect(page.getByRole('heading', { name: 'Minha agenda', level: 1 })).toBeVisible();
});

test('finanças: parcelas viram contas a pagar, o aviso do Meu dia leva até elas e "Paguei" registra', async ({ page }) => {
  const day = (offset: number) => { const date = new Date(); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#finances');
  await expect(page.getByRole('heading', { name: 'Finanças', level: 1 })).toBeVisible();
  await expect(page.getByText(/Nada em aberto/)).toBeVisible();
  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  const form = page.locator('form.fin-form');
  await form.getByLabel('Descrição').fill('Notebook');
  await form.getByText('A pagar', { exact: true }).click();
  await form.getByLabel('Vencimento').fill(day(1));
  await form.getByLabel('Repetição').selectOption('installments');
  await form.getByLabel('Número de parcelas').fill('3');
  await form.getByLabel('Valor de cada parcela').fill('1.250,00');
  await expect(form).toContainText('Cria 3 lançamentos');
  expect((await new AxeBuilder({ page }).include('.fin').analyze()).violations).toEqual([]);
  await form.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(page.getByRole('status').filter({ hasText: '3 lançamentos criados' })).toBeVisible();
  const open = page.locator('#fin-open');
  await expect(open.getByText('parcela 1/3', { exact: false })).toBeVisible();
  await expect(open.locator('.fin-row')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!));
  expect(saved.editorGeneration).toBe(8);
  expect(saved.transactions.map((item: { amountCents: number; status: string }) => [item.amountCents, item.status])).toEqual([[125000, 'pending'], [125000, 'pending'], [125000, 'pending']]);

  await page.goto('/');
  const alert = page.getByRole('button', { name: /Amanhã tem conta para pagar: Notebook · R\$\s1\.250,00/ });
  await expect(alert).toBeVisible();
  await alert.click();
  await expect(page.locator('#fin-open')).toBeFocused();
  await page.locator('#fin-open').getByRole('button', { name: 'Paguei: Notebook' }).first().click();
  await expect(page.locator('#fin-open .fin-row')).toHaveCount(2);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Amanhã tem conta para pagar/ })).toHaveCount(0);

  await page.goto('/#finances');
  await page.locator('#fin-open').getByRole('button', { name: 'Excluir: Notebook' }).first().click();
  await page.getByRole('button', { name: /Este e os próximos \(2\)/ }).click();
  await expect(page.locator('#fin-open .fin-row')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('faculdade-psi:personal:v1')!).transactions.length)).toBe(1);
});
