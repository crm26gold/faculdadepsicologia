import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Telas conectadas com dados fictícios: as rotas /api são simuladas no navegador.
// As permissões reais são testadas no banco (supabase/tests); aqui validamos a interface.
const ME = '11111111-1111-4111-8111-111111111111';
const COLEGA = '22222222-2222-4222-8222-222222222222';
const PROF = '33333333-3333-4333-8333-333333333333';
const UNIP = 'aaaaaaaa-0000-4000-8000-000000000001';
const SALA = 'aaaaaaaa-0000-4000-8000-000000000002';
const G1 = 'aaaaaaaa-0000-4000-8000-000000000003';
const WORK = 'bbbbbbbb-0000-4000-8000-000000000001';
const P1 = 'cccccccc-0000-4000-8000-000000000001';
const P2 = 'cccccccc-0000-4000-8000-000000000002';
const P3 = 'cccccccc-0000-4000-8000-000000000003';
const POLL = 'dddddddd-0000-4000-8000-000000000001';
const TERMS = '2026-09-30';
const text = (value: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] });

function homeFixture(options: { master?: boolean; consents?: boolean; openAccess?: boolean } = {}) {
  return {
    account: { user_id: ME, email: 'eu@example.invalid', display_name: 'Pessoa Teste', is_master: !!options.master, plan: 'academic', plan_source: 'free', pro_until: null, ai_credits: 0, features: [], created_at: '2026-09-30T10:00:00Z' },
    settings: { open_access: options.openAccess ?? true },
    consents: options.consents === false ? [] : [{ document: 'terms', version: TERMS }, { document: 'privacy', version: TERMS }],
    spaces: [
      { id: SALA, kind: 'class', name: 'Psicologia 1º semestre', description: 'Noite', color: 'sage', parent_id: UNIP, archived_at: null, my_role: 'student' },
      { id: G1, kind: 'group', name: 'Ética · Grupo 1', description: '', color: 'lavender', parent_id: SALA, archived_at: null, my_role: 'leader' },
    ],
    my_parts: [{ id: P1, title: 'Introdução', status: 'pending', assignment_id: WORK, assignment_title: 'Direitos Humanos', due_date: '2026-10-20', space_id: G1 }],
    to_review: [{ id: P2, title: 'Declaração Universal', assignment_id: WORK, assignment_title: 'Direitos Humanos', space_id: G1, submitted_at: '2026-09-30T12:00:00Z' }],
  };
}
const people = [
  { user_id: ME, display_name: 'Pessoa Teste', email: null, role: 'leader', is_direct: true, is_master: false },
  { user_id: COLEGA, display_name: 'Colega Ana', email: null, role: 'student', is_direct: true, is_master: false },
  { user_id: PROF, display_name: 'Professora Bia', email: null, role: 'teacher', is_direct: false, is_master: false },
];
const groupOverview = {
  space: { id: G1, kind: 'group', name: 'Ética · Grupo 1', description: '', color: 'lavender', parent_id: SALA, archived_at: null, created_at: '2026-09-30T10:00:00Z' },
  path: [{ id: UNIP, kind: 'institution', name: 'UNIP' }, { id: SALA, kind: 'class', name: 'Psicologia 1º semestre' }, { id: G1, kind: 'group', name: 'Ética · Grupo 1' }],
  access: { can_lead: true, can_manage: false, is_master: false }, my_role: 'leader', people, groups: [],
  posts: [{ id: 'eeeeeeee-0000-4000-8000-000000000001', kind: 'event', title: 'Entrega do trabalho', body: 'Formato ABNT.', link_url: 'https://example.invalid/modelo', event_date: '2026-10-20', pinned: true, author_id: PROF, created_at: '2026-09-30T10:00:00Z' }],
  polls: [{ id: POLL, question: 'Reunião do grupo?', options: ['Segunda', 'Quarta'], closes_at: null, author_id: ME, created_at: '2026-09-30T10:00:00Z', my_vote: null, results: [{ option_index: 1, votes: 2 }] }],
  assignments: [{ id: WORK, title: 'Direitos Humanos', subject_name: 'Ética', due_date: '2026-10-20', status: 'open', space_id: G1, space_name: 'Ética · Grupo 1', batch_id: null, parts_total: 3, parts_submitted: 2, parts_approved: 1 }],
  invitations: [],
};
const detail = {
  assignment: { id: WORK, space_id: G1, batch_id: null, title: 'Direitos Humanos', subject_name: 'Ética', instructions: 'Seguir o modelo da professora.\nCada parte com uma página.', format_rules: 'ABNT', doc_style: { font: 'Times New Roman', size: 12, spacing: 1.5, align: 'justify' }, due_date: '2026-10-20', status: 'open', created_by: ME, created_at: '2026-09-30T10:00:00Z', updated_at: '2026-09-30T10:00:00Z' },
  space: { id: G1, kind: 'group', name: 'Ética · Grupo 1', color: 'lavender', parent_id: SALA },
  path: groupOverview.path, access: { can_lead: true, can_manage: false }, people,
  parts: [
    { id: P1, assignment_id: WORK, position: 0, title: 'Introdução', assignee_id: ME, assignee_label: '', content: { type: 'doc', content: [] }, status: 'pending', submitted_by: null, submitted_at: null, updated_by: ME, updated_at: '2026-09-30T10:00:00Z' },
    { id: P2, assignment_id: WORK, position: 1, title: 'Declaração Universal', assignee_id: COLEGA, assignee_label: '', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto da Ana ', marks: [{ type: 'textStyle', attrs: { color: 'red', fontFamily: 'Comic Sans MS' } }] }, { type: 'text', text: 'com destaque', marks: [{ type: 'bold' }] }] }] }, status: 'submitted', submitted_by: COLEGA, submitted_at: '2026-09-30T12:00:00Z', updated_by: COLEGA, updated_at: '2026-09-30T12:00:00Z' },
    { id: P3, assignment_id: WORK, position: 2, title: 'Conclusão', assignee_id: null, assignee_label: 'Colega sem conta', content: text('Conclusão entregue pelo líder.'), status: 'approved', submitted_by: ME, submitted_at: '2026-09-30T13:00:00Z', updated_by: PROF, updated_at: '2026-09-30T14:00:00Z' },
  ],
  comments: [{ id: 'ffffffff-0000-4000-8000-000000000001', part_id: P2, author_id: PROF, kind: 'revision_request', body: 'Cite a fonte do artigo 1.', created_at: '2026-09-30T15:00:00Z', resolved_at: null }],
};
const admin = {
  settings: { open_access: true, updated_at: '2026-09-30T10:00:00Z' },
  accounts: [
    { ...homeFixture({ master: true }).account, spaces: 2 },
    { user_id: COLEGA, email: 'ana@example.invalid', display_name: 'Colega Ana', is_master: false, plan: 'academic', plan_source: 'free', pro_until: null, ai_credits: 0, features: [], created_at: '2026-09-30T11:00:00Z', spaces: 2 },
  ],
  spaces: [
    { id: UNIP, kind: 'institution', name: 'UNIP', parent_id: null, color: 'blue', archived_at: null, members: 0 },
    { id: SALA, kind: 'class', name: 'Psicologia 1º semestre', parent_id: UNIP, color: 'sage', archived_at: null, members: 3 },
    { id: G1, kind: 'group', name: 'Ética · Grupo 1', parent_id: SALA, color: 'lavender', archived_at: null, members: 2 },
  ],
  audit: [{ id: 1, actor_id: ME, target_user_id: PROF, target_space_id: SALA, action: 'grant_space_role', details: { role: 'teacher' }, created_at: '2026-09-30T10:00:00Z' }],
};

type Posted = { url: string; body: Record<string, unknown> };
async function mockApi(page: Page, options: { home?: ReturnType<typeof homeFixture>; onPost?: (post: Posted) => unknown; ai?: unknown } = {}) {
  const posted: Posted[] = [];
  let home = options.home ?? homeFixture();
  const json = (route: Route, data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      posted.push({ url: url.pathname, body });
      if (body.action === 'accept_terms') home = { ...home, consents: [{ document: 'terms', version: TERMS }, { document: 'privacy', version: TERMS }] };
      const custom = options.onPost?.({ url: url.pathname, body });
      return json(route, { ok: true, data: custom ?? null });
    }
    if (url.pathname === '/api/workspace') {
      if (request.method() === 'PUT') return json(route, { revision: 2 });
      return json(route, { data: { version: 1, subjects: [], tasks: [], notes: [], sessions: [], classes: [], term: {} }, revision: 1 });
    }
    if (url.pathname === '/api/me') return json(route, { ok: true, data: home });
    if (url.pathname === '/api/contacts') return json(route, { ok: true, data: [{ id: 'c1', name: 'Amiga da turma', email: '', phone: '', birthdate: `2000-${new Date().toISOString().slice(5, 10)}`, notes: '', created_at: '' }] });
    if (url.pathname === '/api/spaces') return json(route, { ok: true, data: groupOverview });
    if (url.pathname === '/api/work') return json(route, { ok: true, data: detail });
    if (url.pathname === '/api/admin') return json(route, { ok: true, data: admin });
    if (url.pathname === '/api/ai/admin' && options.ai) return json(route, { ok: true, data: options.ai });
    return json(route, { error: 'não simulado' }, 404);
  });
  return posted;
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Principal', exact: true });

test('primeiro acesso pede aceite claro dos termos antes de usar', async ({ page }) => {
  const posted = await mockApi(page, { home: homeFixture({ consents: false }) });
  await page.goto('/');
  const gate = page.getByRole('dialog', { name: 'Antes de começar, o combinado' });
  await expect(gate).toBeVisible();
  await expect(gate).toContainText('Seu espaço pessoal é só seu.');
  const accept = gate.getByRole('button', { name: 'Concordo e quero continuar' });
  await expect(accept).toBeDisabled();
  await gate.getByLabel('Li e concordo com os termos de uso e a política de privacidade.').check();
  await accept.click();
  await expect(gate).toBeHidden();
  expect(posted.some(item => item.body.action === 'accept_terms')).toBe(true);
});

test('meu dia mostra trabalhos em grupo e aniversários; salas levam ao mural e à enquete', async ({ page }) => {
  const posted = await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Trabalhos em grupo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aniversários da semana' })).toBeVisible();
  await expect(page.getByText('Amiga da turma')).toBeVisible();
  await nav(page).getByRole('button', { name: /^Salas e grupos/ }).click();
  await expect(page.getByRole('heading', { name: 'Minhas partes' })).toBeVisible();
  await page.getByRole('button', { name: /Ética · Grupo 1/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Ética · Grupo 1', level: 2 })).toBeVisible();
  await expect(page.getByText('UNIP')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Entrega do trabalho' })).toBeVisible();
  await expect(page.getByRole('link', { name: /example.invalid\/modelo/ })).toHaveAttribute('rel', 'noopener noreferrer');
  await page.getByRole('button', { name: /Segunda/ }).click();
  await expect.poll(() => posted.find(item => item.body.action === 'vote')?.body).toEqual({ action: 'vote', poll: POLL, choice: 0 });
  await page.getByRole('tab', { name: /Pessoas/ }).click();
  await expect(page.getByText('Colega Ana')).toBeVisible();
  await expect(page.getByText('Professora Bia')).toBeVisible();
});

test('trabalho em grupo: parte, entrega em nome, revisão e documento final padronizado', async ({ page }, info) => {
  const posted = await mockApi(page);
  await page.goto('/#community');
  await page.getByRole('button', { name: /Pendente|Em andamento/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Direitos Humanos', level: 2 })).toBeVisible();
  await expect(page.getByText('1 de 3 partes entregues').or(page.getByText('2 de 3 partes entregues'))).toBeVisible();
  await expect(page.getByText('Enviada por Pessoa Teste em nome de Colega sem conta')).toBeVisible();

  await page.locator('.cm-part-open', { hasText: 'Introdução' }).click();
  const editor = page.getByRole('textbox', { name: 'Texto da parte Introdução' });
  await editor.click();
  await page.keyboard.type('Os direitos humanos são universais.');
  await page.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect.poll(() => posted.find(item => item.body.action === 'save_part')?.body).toEqual({
    action: 'save_part', part: P1, status: null, content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Os direitos humanos são universais.' }] }] },
  });

  await page.locator('.cm-part-open', { hasText: 'Declaração Universal' }).click();
  await expect(page.getByText('Cite a fonte do artigo 1.')).toBeVisible();
  await page.getByRole('button', { name: 'Aprovar' }).click();
  await expect.poll(() => posted.some(item => item.body.action === 'save_part' && item.body.status === 'approved' && item.body.part === P2)).toBe(true);

  await page.getByRole('tab', { name: 'Documento final' }).click();
  const paper = page.locator('.cm-paper');
  await expect(paper).toContainText('Integrantes: Colega Ana, Colega sem conta, Pessoa Teste');
  await expect(paper.getByRole('heading', { level: 2 })).toHaveText(['Introdução', 'Declaração Universal', 'Conclusão']);
  await expect(paper).toHaveCSS('font-family', /Times New Roman/);
  await expect(paper.locator('[style*="Comic"], [style*="color"]')).toHaveCount(0);
  await expect(page.getByRole('note')).toContainText('Introdução (Pessoa Teste)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.screenshot({ path: `test-results/trabalho-final-${info.project.name}.png`, fullPage: true });
});

test('painel master: abertura da plataforma, estrutura e gestão de contas com histórico', async ({ page }, info) => {
  const posted = await mockApi(page, { home: homeFixture({ master: true }) });
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Administração', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fase de lançamento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Psicologia 1º semestre' })).toBeVisible();
  await expect(page.getByText(/concedeu papel/)).toBeVisible();
  await page.getByRole('listitem').filter({ hasText: 'ana@example.invalid' }).getByRole('button', { name: 'Gerenciar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Plano').selectOption('pro');
  await dialog.getByLabel('Origem').selectOption('courtesy');
  await dialog.getByLabel('Pode usar recursos de IA').check();
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => posted.find(item => item.body.action === 'update_account')?.body).toEqual({
    action: 'update_account', account: COLEGA, plan: 'pro', source: 'courtesy', pro_until: null, credits: 0, features: ['ai'], master: false,
  });
  await page.screenshot({ path: `test-results/admin-${info.project.name}.png`, fullPage: true });
});

test('sem acesso Pro, finanças mostram o convite ao Pro e o menu sinaliza', async ({ page }) => {
  await mockApi(page, { home: homeFixture({ openAccess: false }) });
  await page.goto('/');
  await expect(nav(page).getByRole('button', { name: /Finanças/ })).toContainText('Pro');
  await nav(page).getByRole('button', { name: /Finanças/ }).click();
  await expect(page.getByRole('heading', { name: 'Este bloco faz parte do Pro' })).toBeVisible();
  await nav(page).getByRole('button', { name: 'Estudos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meus estudos', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Este bloco faz parte do Pro' })).toBeHidden();
});

test('link de convite é guardado e aceito automaticamente depois do login', async ({ page }) => {
  const token = 'convite_sintetico_1234567890';
  const posted = await mockApi(page, { onPost: ({ body }) => body.action === 'accept_invitation' ? G1 : null });
  await page.goto(`/convite/${token}`);
  await expect(page.getByRole('heading', { name: 'Ética · Grupo 1', level: 2 })).toBeVisible();
  expect(posted.find(item => item.body.action === 'accept_invitation')?.body).toEqual({ action: 'accept_invitation', token });
  expect(await page.evaluate(() => localStorage.getItem('jornada-plena:pending-invite'))).toBeNull();
});

test('termos e privacidade são públicos e explicam exclusão e grupos', async ({ page }) => {
  await page.goto('/privacidade');
  await expect(page.getByRole('heading', { name: 'Política de privacidade' })).toBeVisible();
  await expect(page.getByText(/Ex-membro/).first()).toBeVisible();
  await page.goto('/termos');
  await expect(page.getByRole('heading', { name: 'Termos de uso' })).toBeVisible();
  await expect(page.getByText(/direito de arrependimento de 7 dias/)).toBeVisible();
});

test('no celular, salas, trabalho e administração cabem na tela sem rolagem lateral', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, { home: homeFixture({ master: true }) });
  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  await page.goto('/#community');
  await expect(page.getByRole('heading', { name: 'Minhas partes' })).toBeVisible();
  expect(await noOverflow()).toBe(true);
  await page.screenshot({ path: `test-results/salas-mobile-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: /Em andamento/ }).first().click();
  await page.locator('.cm-part-open', { hasText: 'Introdução' }).click();
  await expect(page.getByRole('textbox', { name: 'Texto da parte Introdução' })).toBeVisible();
  expect(await noOverflow()).toBe(true);
  await page.screenshot({ path: `test-results/trabalho-mobile-${info.project.name}.png`, fullPage: true });
  await page.getByRole('tab', { name: 'Documento final' }).click();
  expect(await noOverflow()).toBe(true);
  await page.goto('/#admin');
  await expect(page.getByRole('heading', { name: 'Fase de lançamento' })).toBeVisible();
  expect(await noOverflow()).toBe(true);
});

test('conectado no celular, a barra tem o Registrar no centro e o primeiro curso vai para a nuvem', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await mockApi(page);
  const saves: { data: { courses?: unknown[]; editorGeneration?: number } }[] = [];
  page.on('request', request => { if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/workspace') saves.push(request.postDataJSON()); });
  await page.goto('/');
  const bar = page.getByRole('navigation', { name: 'Atalhos mobile' });
  await expect(bar.getByRole('button')).toHaveText(['Hoje', 'Agenda', 'Registrar', 'Estudos', 'Mais']);
  for (const button of await bar.getByRole('button').all()) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await bar.getByRole('button', { name: 'Ir para Estudos', exact: true }).click();
  await page.getByRole('button', { name: 'Cadastrar meu primeiro curso', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Pós em Pedagogia');
  await page.getByLabel('Tipo', { exact: true }).selectOption('pos');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Adicionar matéria', exact: true })).toBeVisible();
  await expect.poll(() => saves.at(-1)?.data.courses).toEqual([expect.objectContaining({ name: 'Pós em Pedagogia', kind: 'pos', status: 'active' })]);
  expect(saves.at(-1)?.data.editorGeneration).toBe(9);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('proprietário configura a IA pelo painel: chave cifrada, modelo por tarefa e teste de conexão', async ({ page }) => {
  const providers = ['anthropic', 'compatible', 'gemini', 'openai', 'vertex'].map(id => ({ id, enabled: id === 'gemini', label: '', base_url: '', gcp_project: '', gcp_location: '', has_key: id === 'gemini', key_hint: id === 'gemini' ? 'abcd' : '', updated_at: '2026-10-01T12:00:00Z' }));
  const ai = { secretReady: true, providers, tasks: [{ id: 'assistente', provider: 'gemini', model: 'modelo-teste', enabled: true, updated_at: '' }, { id: 'organizar', provider: null, model: '', enabled: false, updated_at: '' }] };
  const posted = await mockApi(page, { home: homeFixture({ master: true }), ai, onPost: post => post.body.action === 'test' ? { text: 'Conexão funcionou', ms: 820, model: 'modelo-teste' } : post.body.action === 'models' ? { ids: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'], auto: { 'auto:melhor': 'gemini-3.8-flash', 'auto:rapido': 'gemini-3.8-flash', 'auto:economico': 'gemini-3.5-flash-lite' } } : null });
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Administração', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Inteligência artificial' });
  await expect(panel.getByText(/Cofre de chaves pronto/)).toBeVisible();
  const gemini = panel.locator('form').filter({ hasText: 'Google Gemini (AI Studio)' }).filter({ hasText: 'aistudio' });
  await expect(gemini.getByText(/chave …abcd/)).toBeVisible();
  await gemini.getByRole('button', { name: 'Ver modelos' }).click();
  await expect(panel.getByText(/2 modelos de texto/)).toBeVisible();
  const vertex = panel.locator('form').filter({ hasText: 'Credencial da conta de serviço' });
  await vertex.getByLabel(/Credencial da conta de serviço/).fill('{"client_email":"robo@projeto.iam.gserviceaccount.com","private_key":"x"}');
  await vertex.getByLabel('Região').fill('us-central1');
  await vertex.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => posted.find(item => item.body.action === 'save_provider')?.body).toMatchObject({ provider: 'vertex', gcp_location: 'us-central1', key: expect.stringContaining('client_email') });
  const task = panel.locator('form').filter({ hasText: 'Conversa do assistente' });
  await task.getByRole('button', { name: 'Testar' }).click();
  await expect(panel.getByText(/Funcionou com modelo-teste em 0.8 s/)).toBeVisible();
  expect(posted.find(item => item.body.action === 'test')?.body).toEqual({ action: 'test', provider: 'gemini', model: 'modelo-teste' });
  await expect(task.getByLabel('Nome do modelo')).toHaveValue('modelo-teste');
  await task.getByRole('button', { name: 'Voltar para a lista' }).click();
  await expect(task.getByLabel('Modelo', { exact: true })).toHaveValue('auto:rapido');
  await expect(task.getByText(/Hoje usaria: gemini-3.8-flash/)).toBeVisible();
  await task.getByLabel('Modelo', { exact: true }).selectOption('gemini-3.5-flash-lite');
  await task.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => posted.find(item => item.body.action === 'save_task')?.body).toMatchObject({ task: 'assistente', provider: 'gemini', model: 'gemini-3.5-flash-lite' });
  expect((await new AxeBuilder({ page }).include('.ai-settings').analyze()).violations).toEqual([]);
});
