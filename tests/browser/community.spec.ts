import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { settleAnimations } from './axe-ready';
import { waitingRequests, type AssistantJob } from '../../src/lib/assistant-jobs';
import { savedVersions } from './workspace-saves';
// Calendar day in Brazil (the browser runs in America/Sao_Paulo; CI runs in UTC, which is already tomorrow after 21h).
const spDay = (offset = 0) => { const base = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()); const date = new Date(`${base}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };

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
// The space the mocked server starts with: empty, as for someone who just signed up.
const EMPTY_SPACE ={ version: 1, subjects: [], tasks: [], notes: [], sessions: [], classes: [], term: {} };
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
// jobs: pedidos do assistente desta conta; elsewhere: conversas fora da primeira página, só abertas pelo id.
async function mockApi(page: Page, options: { home?: ReturnType<typeof homeFixture>; onPost?: (post: Posted) => unknown; ai?: unknown; usage?: unknown; jobs?: AssistantJob[]; elsewhere?: Record<string, unknown>[] } = {}) {
  const posted: Posted[] = [];
  let home = options.home ?? homeFixture();
  const conversations = new Map<string, Record<string, unknown>>();
  const elsewhere = new Map((options.elsewhere ?? []).map(item => [item.id as string, item]));
  const jobs = new Map((options.jobs ?? []).map(job => [job.id, structuredClone(job)]));
  const json = (route: Route, data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/conversations') {
      const id = url.searchParams.get('id');
      if (request.method() === 'GET' && id) return json(route, { ok: true, data: { accountId: ME, items: [conversations.get(id) ?? elsewhere.get(id)].filter(Boolean), hasMore: false } });
      if (request.method() === 'GET') return json(route, { ok: true, data: { accountId: ME, items: [...conversations.values()], hasMore: false } });
      const body = request.postDataJSON();
      if (body.action === 'save') {
        const item = { ...body.conversation, revision: body.conversation.revision + 1 };
        conversations.set(item.id, item);
        return json(route, { ok: true, data: { revision: item.revision, updatedAt: item.updatedAt } });
      }
      conversations.delete(body.id); return json(route, { ok: true, data: null });
    }
    if (url.pathname === '/api/assistant/jobs') {
      if (request.method() === 'POST') {
        const body = request.postDataJSON(), job = jobs.get(body.id);
        posted.push({ url: url.pathname, body });
        if (body.action === 'settle' && job?.result) { job.status = 'done'; job.result.pending = []; }
        return json(route, { ok: true, data: {} });
      }
      const query = url.searchParams, list = [...jobs.values()].toSorted((a, b) => b.created_at.localeCompare(a.created_at));
      if (query.get('status') === 'needs_confirmation') return json(route, { ok: true, data: { accountId: ME, waiting: waitingRequests(list.filter(job => job.status === 'needs_confirmation')) } });
      return json(route, { ok: true, data: { accountId: ME, jobs: list.filter(job => query.get('id') ? job.id === query.get('id') : job.conversation_id === query.get('conversation')) } });
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      posted.push({ url: url.pathname, body });
      if (body.action === 'accept_terms') home = { ...home, consents: [{ document: 'terms', version: TERMS }, { document: 'privacy', version: TERMS }] };
      const custom = options.onPost?.({ url: url.pathname, body });
      return json(route, { ok: true, data: custom ?? null });
    }
    if (url.pathname === '/api/workspace') {
      if (request.method() === 'PUT') return json(route, { revision: 2 });
      return json(route, { data: EMPTY_SPACE, revision: 1, accountId: ME });
    }
    if (url.pathname === '/api/me') return json(route, { ok: true, data: home });
    if (url.pathname === '/api/contacts') return json(route, { ok: true, data: [{ id: 'c1', name: 'Amiga da turma', email: '', phone: '', birthdate: `2000-${spDay().slice(5, 10)}`, notes: '', created_at: '' }] });
    if (url.pathname === '/api/spaces') return json(route, { ok: true, data: groupOverview });
    if (url.pathname === '/api/work') return json(route, { ok: true, data: detail });
    if (url.pathname === '/api/admin') return json(route, { ok: true, data: admin });
    if (url.pathname === '/api/ai/admin' && options.ai) return json(route, { ok: true, data: options.ai });
    if (url.pathname === '/api/admin/usage' && options.usage) return json(route, { ok: true, data: options.usage });
    return json(route, { error: 'não simulado' }, 404);
  });
  return posted;
}
const nav = (page: Page) => page.getByRole('navigation', { name: 'Principal', exact: true });

test('WhatsApp: painel permite vincular, configurar voz e revogar com confirmação', async ({ page }) => {
  await mockApi(page, { home: homeFixture({ master: true }) });
  let state = { enabled: true, configured: true, state: 'ready', relay: '5511888888888', heartbeat: new Date().toISOString(), qr: null,
    stt_connection: 'gemini:primary', stt_model: 'auto:rapido', voice: 'pt-BR-AntonioNeural', linked: false, peer: null as string | null, queued: 0,
    connections: [{ id: 'gemini:primary', label: 'Gemini', provider: 'gemini', enabled: true }] };
  const actions: Record<string, unknown>[] = [];
  await page.route('**/api/whatsapp/admin', route => {
    let data: unknown = state;
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); actions.push(body);
      if (body.action === 'code') data = { code: 'ABCD2345', link: 'https://wa.me/5511888888888?text=fixture' };
      if (body.action === 'save') state = { ...state, enabled: body.enabled, voice: body.voice, stt_model: body.stt_model };
      if (body.action === 'unlink') state = { ...state, linked: false, peer: null };
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  });
  await page.goto('/'); await nav(page).getByRole('button', { name: 'Administração', exact: true }).click();
  const panel = page.getByRole('region', { name: 'WhatsApp da Jornada' });
  await expect(panel).toBeVisible(); await panel.getByRole('button', { name: 'Gerar código de vínculo' }).click();
  await expect(panel.getByText('/vincular ABCD2345', { exact: true })).toBeVisible();
  await panel.getByLabel('Voz da resposta').selectOption('pt-BR-FranciscaNeural');
  await panel.getByRole('button', { name: 'Salvar configuração' }).click();
  expect(actions.some(item => item.action === 'save' && item.voice === 'pt-BR-FranciscaNeural')).toBe(true);
  state = { ...state, linked: true, peer: '5511999999999' }; await panel.getByRole('button', { name: 'Atualizar conexão' }).click();
  await panel.getByRole('button', { name: 'Revogar acesso' }).click();
  expect(actions.some(item => item.action === 'unlink')).toBe(false);
  await panel.getByRole('button', { name: 'Confirmar', exact: true }).click();
  expect(actions.some(item => item.action === 'unlink')).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const audit = await new AxeBuilder({ page }).include('.wa-settings').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations).toEqual([]);
});

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

test('meu dia lista os pedidos aguardando você e abre a confirmação exata, sem confirmar sozinho', async ({ page }) => {
  // Dois pedidos na mesma conversa, que não está na primeira página carregada: o link abre exatamente o escolhido.
  const CONVERSA = 'abababab-0000-4000-8000-000000000001', ANTIGO = 'abababab-0000-4000-8000-0000000000a1', NOVO = 'abababab-0000-4000-8000-0000000000a2';
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const job = (id: string, label: string, minutes: number): AssistantJob => ({ id, conversation_id: CONVERSA, status: 'needs_confirmation', created_at: ago(minutes), updated_at: ago(minutes),
    input: { message: 'Pedido de Assistente externo', today: spDay(), history: [] },
    result: { saved: true, reply: 'Para excluir, confirme no app.', applied: [], failed: [], pending: [{ action: { type: 'excluir', entity: 'compromisso', target: id }, fingerprint: '{}', label }] } });
  const posted = await mockApi(page, {
    jobs: [job(ANTIGO, 'Excluir compromisso: Prova de Ética (2026-10-08 14:00)', 25 * 60), job(NOVO, 'Excluir compromisso: Reunião do grupo (2026-10-09)', 2 * 60)],
    elsewhere: [{ id: CONVERSA, title: 'Confirmação de assistente externo', mode: 'text', pinned: false, archived: false, updatedAt: ago(25 * 60), revision: 1, synced: true,
      messages: [ANTIGO, NOVO].map(id => ({ id: `job:${id}`, from: 'assistant', text: 'Para excluir, confirme no app.', saved: true })) }],
  });
  const settled = () => posted.filter(item => item.body.action === 'settle').map(item => item.body.id);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Ações rápidas do dia' })).toBeVisible();
  const card = page.getByRole('region', { name: 'Pedidos aguardando você (2)', exact: true });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button')).toHaveText([/Reunião do grupo.*Pedido há 2 horas.*Revisar/, /Prova de Ética.*Pedido há 1 dia.*Revisar/]);
  await page.screenshot({ path: 'test-results/meu-dia-pedidos-desktop-light.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await card.scrollIntoViewIfNeeded(); await settleAnimations(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const button of await card.getByRole('button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.screenshot({ path: 'test-results/meu-dia-pedidos-mobile-dark.png' });

  // Pelo teclado, o pedido mais antigo abre a própria confirmação, não a mais recente da conversa.
  await card.getByRole('button', { name: /Prova de Ética/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Assistente', exact: true })).toBeVisible();
  const confirmation = page.getByRole('region', { name: 'Confirmar alteração', exact: true });
  await expect(confirmation).toContainText('Excluir compromisso: Prova de Ética (2026-10-08 14:00)');
  await expect(confirmation).not.toContainText('Reunião do grupo');
  await expect(confirmation).toBeFocused();
  expect(settled()).toEqual([]);
  await confirmation.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect.poll(settled).toEqual([ANTIGO]);

  const bar = page.getByRole('navigation', { name: 'Atalhos mobile' });
  await bar.getByRole('button', { name: 'Ir para Meu dia', exact: true }).click();
  const remaining = page.getByRole('region', { name: 'Pedidos aguardando você (1)', exact: true });
  await expect(remaining.getByRole('button')).toHaveText([/Reunião do grupo/]);
  await remaining.getByRole('button').click();
  await expect(confirmation).toContainText('Reunião do grupo');
  await confirmation.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect.poll(settled).toEqual([ANTIGO, NOVO]);
  await bar.getByRole('button', { name: 'Ir para Meu dia', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Ações rápidas do dia' })).toBeVisible();
  await expect(page.getByRole('region', { name: /Pedidos aguardando você/ })).toHaveCount(0);
});

test('exclusão coletiva proposta pelo assistente só roda pela rota da tela depois de Confirmar', async ({ page }) => {
  const CONVERSA = 'abababab-0000-4000-8000-000000000002', PEDIDO = 'abababab-0000-4000-8000-0000000000b1', POST = 'abababab-0000-4000-8000-0000000000c1';
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const posted = await mockApi(page, {
    jobs: [{ id: PEDIDO, conversation_id: CONVERSA, status: 'needs_confirmation', created_at: ago(5), updated_at: ago(5),
      input: { message: 'Pedido de Assistente externo', today: spDay(), history: [] },
      result: { saved: true, reply: 'Pedido guardado.', applied: [], failed: [], pending: [{ action: { type: 'excluir_coletivo', fn: 'delete_post', target: POST }, fingerprint: '{}', label: 'Excluir publicação: Prova sexta (Ética · Grupo 1)' }] } }],
    elsewhere: [{ id: CONVERSA, title: 'Confirmação de assistente externo', mode: 'text', pinned: false, archived: false, updatedAt: ago(5), revision: 1, synced: true,
      messages: [{ id: `job:${PEDIDO}`, from: 'assistant', text: 'Pedido guardado.', saved: true }] }],
  });
  await page.goto('/');
  const card = page.getByRole('region', { name: 'Pedidos aguardando você (1)', exact: true });
  await card.getByRole('button', { name: /Prova sexta/ }).click();
  const confirmation = page.getByRole('region', { name: 'Confirmar alteração', exact: true });
  await expect(confirmation).toContainText('Excluir publicação: Prova sexta (Ética · Grupo 1)');
  expect(posted.some(item => item.url === '/api/spaces')).toBe(false);
  await confirmation.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText('Excluído: publicação: Prova sexta (Ética · Grupo 1).')).toBeVisible();
  expect(posted.filter(item => item.url === '/api/spaces').map(item => item.body)).toEqual([{ action: 'delete_post', post: POST }]);
  await expect.poll(() => posted.filter(item => item.body.action === 'settle').map(item => item.body.id)).toEqual([PEDIDO]);
});

test('mudança de administração proposta pelo assistente só vai ao painel depois de Confirmar', async ({ page }) => {
  const CONVERSA = 'abababab-0000-4000-8000-000000000003', PEDIDO = 'abababab-0000-4000-8000-0000000000b2';
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const body = { action: 'set_open_access' as const, value: false };
  const posted = await mockApi(page, {
    jobs: [{ id: PEDIDO, conversation_id: CONVERSA, status: 'needs_confirmation', created_at: ago(3), updated_at: ago(3),
      input: { message: 'Pedido de Assistente externo', today: spDay(), history: [] },
      result: { saved: true, reply: 'Pedido guardado.', applied: [], failed: [], pending: [{ action: { type: 'administrar', request: { url: '/api/admin', body } }, fingerprint: '{}',
        label: 'Fechar o acesso livre para novas contas (hoje está aberto)' }] } }],
    elsewhere: [{ id: CONVERSA, title: 'Confirmação de assistente externo', mode: 'text', pinned: false, archived: false, updatedAt: ago(3), revision: 1, synced: true,
      messages: [{ id: `job:${PEDIDO}`, from: 'assistant', text: 'Pedido guardado.', saved: true }] }],
  });
  await page.goto('/');
  await page.getByRole('region', { name: 'Pedidos aguardando você (1)', exact: true }).getByRole('button', { name: /acesso livre/ }).click();
  const confirmation = page.getByRole('region', { name: 'Confirmar alteração', exact: true });
  await expect(confirmation).toContainText('Fechar o acesso livre para novas contas');
  expect(posted.some(item => item.url === '/api/admin')).toBe(false);
  await confirmation.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText(/^Feito: Fechar o acesso livre/)).toBeVisible();
  expect(posted.filter(item => item.url === '/api/admin').map(item => item.body)).toEqual([body]);
});

test('com o app aberto, uma mudança feita pela IA em outro lugar abre a tela e aponta o item', async ({ page }) => {
  await mockApi(page);
  const empty = { version: 1, subjects: [], tasks: [], notes: [], sessions: [], classes: [], term: {} };
  let remote = { revision: 1, data: empty as Record<string, unknown> };
  // Registered after mockApi, so these answers win for the space itself.
  await page.route('**/api/workspace**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'PUT') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: remote.revision + 1 }) });
    if (url.searchParams.get('only') === 'revision') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: remote.revision, accountId: ME }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...remote, accountId: ME }) });
  });
  await page.goto('/');
  await expect(page.getByRole('group', { name: 'Ações rápidas do dia' })).toBeVisible();
  remote = { revision: 2, data: { ...empty, tasks: [{ id: 'ia-1', title: 'Prova de Ética', subjectId: '', date: spDay(), kind: 'Prova', done: false, minutes: 60 }] } };
  await expect(page.getByRole('status').filter({ hasText: 'A IA criou: Prova de Ética' })).toBeVisible({ timeout: 12_000 });
  await expect(page).toHaveURL(/#agenda$/);
  await expect(page.locator('.ai-touched')).toContainText('Prova de Ética');
  await expect(page.locator('.ai-pointer')).toBeVisible();
  await page.getByRole('button', { name: 'Pausar acompanhamento' }).click();
  expect(await page.evaluate(() => localStorage.getItem('jornada-acompanhar-ia'))).toBe('off');
});

test('lixeira: o que foi excluído aparece em Minha conta, Restaurar traz de volta e Excluir de vez pede confirmação', async ({ page }) => {
  await mockApi(page);
  const saved = savedVersions(EMPTY_SPACE);
  const purged: string[] = [];
  const rows = [
    { id: 'abababab-0000-4000-8000-0000000000d1', collection: 'tasks', item_id: 'lx-task', item: { id: 'lx-task', title: 'Dentista excluído', subjectId: '', date: spDay(), kind: 'Compromisso', done: false, minutes: 30 }, deleted_at: new Date().toISOString() },
    { id: 'abababab-0000-4000-8000-0000000000d2', collection: 'notes', item_id: 'lx-note', item: { id: 'lx-note', title: 'Ideia antiga', content: '<p>x</p>', subjectId: '', updatedAt: new Date().toISOString() }, deleted_at: new Date().toISOString() },
  ];
  await page.route('**/api/trash', async route => {
    if (route.request().method() === 'POST') { purged.push(route.request().postDataJSON().id); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: null }) }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: rows }) });
  });
  await page.route('**/api/workspace**', async route => {
    if (route.request().method() === 'PUT') { saved.take(route.request().postDataJSON()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1 + saved.versions.length }) }); }
    return route.fallback();
  });
  await page.goto('/#settings');
  const trash = page.getByRole('region', { name: 'Lixeira', exact: true });
  await expect(trash.getByText('Dentista excluído')).toBeVisible();
  await trash.getByRole('listitem').filter({ hasText: 'Dentista excluído' }).getByRole('button', { name: 'Restaurar' }).click();
  await expect(trash.getByRole('status')).toHaveText('Restaurado: Dentista excluído (Agenda).');
  await expect(trash.getByRole('listitem').filter({ hasText: 'Dentista excluído' })).toHaveCount(0);
  await expect.poll(() => saved.versions.some(data => data.tasks.some(task => task.id === 'lx-task'))).toBe(true);
  const note = trash.getByRole('listitem').filter({ hasText: 'Ideia antiga' });
  await note.getByRole('button', { name: 'Excluir de vez' }).click();
  expect(purged).toEqual([]);
  await note.getByRole('button', { name: 'Confirmar exclusão definitiva' }).click();
  await expect.poll(() => purged).toEqual(['abababab-0000-4000-8000-0000000000d2']);
  await expect(trash.getByText('A lixeira está vazia.')).toBeVisible();
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

test('trabalho em grupo: "Na minha agenda" tocado duas vezes deixa uma entrega só, ligada ao trabalho', async ({ page }, info) => {
  await mockApi(page);
  const saved = savedVersions(EMPTY_SPACE);
  page.on('request', request => { if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/workspace') saved.take(request.postDataJSON()); });
  await page.goto('/#community');
  await page.getByRole('button', { name: /Pendente|Em andamento/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Direitos Humanos', level: 2 })).toBeVisible();
  const add = page.getByRole('button', { name: 'Na minha agenda' });
  await add.click();
  await expect(page.getByRole('status').filter({ hasText: 'Entrega adicionada à sua agenda pessoal.' })).toBeVisible();
  await add.click();
  await expect(page.getByRole('status').filter({ hasText: 'Já está na sua agenda (20/10).' })).toBeVisible();
  await expect.poll(() => saved.versions.length).toBeGreaterThan(0);
  expect(saved.versions.at(-1)?.tasks.filter(task => task.title === 'Entregar: Direitos Humanos').map(task => [task.date, task.assignmentId])).toEqual([['2026-10-20', WORK]]);
  await page.screenshot({ path: `test-results/na-minha-agenda-${info.project.name}.png` });
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
  const requests = page.getByRole('region', { name: /Como fazer um pedido e o que acontece num incidente/ });
  await expect(requests.getByText(/em até 15 dias/)).toBeVisible();
  await expect(requests.getByText(/avisamos a Autoridade Nacional de Proteção de Dados \(ANPD\) e as pessoas afetadas/)).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.legal-page').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
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
  const saves = savedVersions(EMPTY_SPACE);
  page.on('request', request => { if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/workspace') saves.take(request.postDataJSON()); });
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
  await expect.poll(() => saves.versions.at(-1)?.courses).toEqual([expect.objectContaining({ name: 'Pós em Pedagogia', kind: 'pos', status: 'active' })]);
  expect(saves.versions.at(-1)?.editorGeneration).toBe(9);
  expect(saves.bodies.at(-1)?.editorGeneration).toBe(9);
  expect(saves.bodies.every(body => body.changes && !body.data), 'cada gravação leva só o que mudou').toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('proprietário configura a IA pelo painel: chave cifrada, modelo por tarefa e teste de conexão', async ({ page }) => {
  const providers = ['anthropic', 'compatible', 'gemini', 'openai', 'vertex'].map(id => ({ id, enabled: id === 'gemini', label: '', base_url: '', gcp_project: '', gcp_location: '', has_key: id === 'gemini', key_hint: id === 'gemini' ? 'abcd' : '', updated_at: '2026-10-01T12:00:00Z' }));
  const ai = { secretReady: true, providers, tasks: [{ id: 'assistente', provider: 'gemini', model: 'modelo-teste', enabled: true, updated_at: '' }, { id: 'organizar', provider: null, model: '', enabled: false, updated_at: '' }] };
  const usage = { window_days: 31, day_resets_at: '2026-10-04T00:00:00Z', items: [{ scope: 'media', day_used: 0, day_limit: 300000000, window_used: 3100000000, window_limit: 4000000000, observed_since: '2026-10-03T00:00:00Z', level: 'warning' }] };
  const posted = await mockApi(page, { home: homeFixture({ master: true }), ai, usage, onPost: post => post.body.action === 'test_task' ? { text: 'Conexão funcionou', ms: 820, model: 'modelo-teste' } : post.body.action === 'models' ? { ids: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'], auto: { 'auto:melhor': 'gemini-3.8-flash', 'auto:rapido': 'gemini-3.8-flash', 'auto:economico': 'gemini-3.5-flash-lite' } } : null });
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Administração', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Inteligência artificial' });
  await expect(panel.getByText(/Cofre de chaves pronto/)).toBeVisible();
  await expect(panel.getByText('Provedores configurados e ligados')).toBeVisible();
  expect(posted.filter(item => item.body.action === 'models')).toHaveLength(0);
  await panel.getByRole('button', { name: 'Consumo e limites', exact: true }).click();
  const consumption = panel.getByRole('region', { name: 'Consumo e proteção' });
  await expect(consumption.getByText('Atenção: consumo acima de 75%')).toBeVisible();
  await expect(consumption.getByText('Últimos 31 dias: 3,1 GB de 4 GB')).toBeVisible();
  usage.items[0].window_used = 4000000000; usage.items[0].level = 'blocked';
  await consumption.getByRole('button', { name: 'Atualizar consumo' }).click();
  await expect(consumption.getByText('Limite atingido: função pausada')).toBeVisible();
  await expect(consumption.getByText(/Não é a fatura dos provedores/)).toBeVisible();
  await panel.getByRole('button', { name: 'Conexões e chaves', exact: true }).click();
  await panel.locator('details.ai-provider').filter({ hasText: 'aistudio' }).locator('summary').click();
  const gemini = panel.locator('form').filter({ hasText: 'Google Gemini (AI Studio)' }).filter({ hasText: 'aistudio' });
  await expect(gemini.getByLabel('Chave de API do Google AI Studio')).toHaveValue('');
  await gemini.getByRole('button', { name: 'Ver modelos' }).click();
  await expect(panel.getByText(/2 modelos de texto/)).toBeVisible();
  await panel.getByRole('button', { name: 'Adicionar empresa', exact: true }).click();
  await panel.locator('details.ai-provider').filter({ hasText: 'Credencial da conta de serviço' }).locator('summary').click();
  const vertex = panel.locator('form').filter({ hasText: 'Credencial da conta de serviço' });
  await vertex.getByLabel(/Credencial da conta de serviço/).fill('{"client_email":"robo@projeto.iam.gserviceaccount.com","private_key":"x"}');
  await vertex.getByLabel('Região').fill('us-central1');
  await vertex.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => posted.find(item => item.body.action === 'save_provider')?.body).toMatchObject({ provider: 'vertex', gcp_location: 'us-central1', key: expect.stringContaining('client_email') });
  await panel.getByRole('button', { name: 'Tarefas e modelos', exact: true }).click();
  const task = panel.locator('form').filter({ hasText: 'Conversa do assistente' });
  await task.getByRole('button', { name: 'Testar' }).click();
  await expect(panel.getByText(/Funcionou com modelo-teste em 0.8 s/)).toBeVisible();
  expect(posted.find(item => item.body.action === 'test_task')?.body).toEqual({ action: 'test_task', task: 'assistente' });
  await expect(task.getByLabel('Nome do modelo')).toHaveValue('modelo-teste');
  await task.getByRole('button', { name: 'Voltar para a lista' }).click();
  await expect(task.getByLabel('Modelo', { exact: true })).toHaveValue('auto:rapido');
  await expect(task.getByText(/Hoje usaria: gemini-3.8-flash/)).toBeVisible();
  await task.getByLabel('Modelo', { exact: true }).selectOption('gemini-3.5-flash-lite');
  await task.getByRole('button', { name: 'Salvar' }).click();
  await expect.poll(() => posted.find(item => item.body.action === 'save_route')?.body).toMatchObject({ task: 'assistente', provider: 'gemini', model: 'gemini-3.5-flash-lite', routing_mode: 'fixed', connection_id: null });
  expect((await new AxeBuilder({ page }).include('.ai-settings').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.getByRole('button', { name: 'Consumo e limites', exact: true }).click();
  await consumption.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/usage-mobile.png', fullPage: true });
});

test('proprietário cadastra reserva explícita e recebe diagnóstico da conexão de voz', async ({ page }) => {
  const providers = ['gemini','openai','anthropic','vertex','compatible'].map(id => ({ id, enabled: id === 'gemini', label: '', base_url: '', gcp_project: '', gcp_location: '', has_key: id === 'gemini', key_hint: '1234', updated_at: '' }));
  const ai = { secretReady: true, providers, connections: [], tasks: [{ id: 'voz', provider: 'gemini', model: 'auto:rapido', enabled: true, updated_at: '' }] };
  const posted = await mockApi(page, { home: homeFixture({ master: true }), ai, onPost: post => post.body.action === 'test_live'
    ? { connected: false, stage: 'token', reference: 'test1234', ms: 800, message: 'A configuração foi recusada.', diagnostic: { upstreamStatus: 400, upstreamCode: 'INVALID_ARGUMENT', configurationIssue: 'INVALID_FIELD_MASK', invalidFields: ['fieldMask'] } } : null });
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Administração', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Inteligência artificial' });
  await panel.getByRole('button', { name: 'Tarefas e modelos', exact: true }).click();
  await panel.getByRole('button', { name: 'Testar conexão de voz' }).click();
  await expect(panel.getByText(/Código: test1234 · etapa: token/)).toBeVisible();
  await expect(panel.getByText(/400 · INVALID_ARGUMENT · INVALID_FIELD_MASK · fieldMask/)).toBeVisible();
  expect(posted.find(item => item.body.action === 'test_live')?.body).toEqual({ action: 'test_live' });
  await panel.getByRole('button', { name: 'Conexões e chaves', exact: true }).click();
  const reserve = panel.locator('form').filter({ hasText: 'Adicionar outra conexão' });
  await reserve.getByLabel('Nome', { exact: true }).fill('Minha reserva');
  await reserve.getByLabel('Chave', { exact: true }).fill('synthetic-api-key');
  await reserve.getByLabel('Ligada', { exact: true }).check();
  await reserve.getByRole('button', { name: 'Cadastrar conexão' }).click();
  await expect.poll(() => posted.find(item => item.body.action === 'save_connection')?.body).toEqual({ action: 'save_connection', id: null, provider: 'gemini', label: 'Minha reserva', enabled: true, position: 1, key: 'synthetic-api-key',base_url:'',gcp_project:'',gcp_location:'' });
  await expect(reserve.getByLabel('Chave', { exact: true })).toHaveValue('');
  expect((await new AxeBuilder({ page }).include('.ai-settings').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('administração preserva alterações entre seções, atualiza modelos e verifica uma reserva sem reenviar a chave', async ({ page }) => {
  const reserveId = '00000000-0000-4000-8000-000000000012';
  let refreshed = false;
  const providers = [{ id: 'gemini', enabled: true, label: 'Conta principal', base_url: '', gcp_project: '', gcp_location: '', has_key: true, key_hint: 'abcd', updated_at: '' }];
  const ai = { secretReady: true, providers, connections: [{ id: reserveId, provider: 'gemini', label: 'Conta reserva', enabled: false, position: 1, key_hint: '1234', updated_at: '' }], tasks: [{ id: 'voz', provider: 'gemini', model: 'auto:rapido', enabled: true, updated_at: '' }, { id: 'assistente', provider: 'gemini', model: 'auto:rapido', enabled: true, updated_at: '' }] };
  const posted = await mockApi(page, { home: homeFixture({ master: true }), ai, onPost: post => post.body.action === 'models' ? { ids: [refreshed ? 'gemini-3.9-flash' : 'gemini-3.8-flash'], liveIds: ['gemini-3.8-live'], auto: { 'auto:rapido': refreshed ? 'gemini-3.9-flash' : 'gemini-3.8-flash' }, refreshedAt: '2026-10-04T14:00:00Z' } : null });
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Administração', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Inteligência artificial' });
  await panel.getByRole('button', { name: 'Tarefas e modelos', exact: true }).click();
  const assistant = panel.locator('form.ai-task-card').filter({ has: page.getByText('Conversa do assistente', { exact: true }) });
  const voice = panel.locator('form.ai-task-card').filter({ has: page.getByText('Chamada ao vivo', { exact: true }) });
  await expect(voice.getByLabel('Modelo', { exact: true }).getByRole('option', { name: 'gemini-3.8-live', exact: true })).toHaveCount(1);
  await expect(assistant.getByText(/Hoje usaria: gemini-3.8-flash/)).toBeVisible();
  expect(posted.filter(post => post.body.action === 'models')).toHaveLength(1);
  refreshed = true;
  await assistant.getByRole('button', { name: 'Atualizar modelos' }).click();
  await expect(assistant.getByText(/Hoje usaria: gemini-3.9-flash/)).toBeVisible();
  await assistant.getByLabel('Modelo', { exact: true }).selectOption('gemini-3.9-flash');
  await expect(assistant.getByRole('button', { name: 'Testar', exact: true })).toBeDisabled();
  await panel.getByRole('button', { name: 'Conexões e chaves', exact: true }).click();
  await panel.locator('details.ai-provider summary').click();
  const reserve = panel.locator('form.ai-reserve-form');
  await reserve.getByRole('button', { name: 'Consultar modelos' }).click();
  await expect(panel.getByText(/Conta reserva: acesso à lista aceito/)).toBeVisible();
  expect(posted.find(post => post.body.connection_id === reserveId)?.body).toEqual({ action: 'models', provider: 'gemini', connection_id: reserveId });
  await panel.getByRole('button', { name: 'Tarefas e modelos', exact: true }).click();
  await expect(assistant.getByLabel('Modelo', { exact: true })).toHaveValue('gemini-3.9-flash');
  expect(posted.filter(post => post.body.action === 'save_task')).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await settleAnimations(page);
  expect((await new AxeBuilder({ page }).include('.ai-settings').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.screenshot({ path: 'test-results/admin-models-mobile-dark.png' });
});

test('conexões independentes têm modelos próprios e rota autoriza outra empresa',async({ page })=>{
  const first='00000000-0000-4000-8000-000000000020',second='00000000-0000-4000-8000-000000000021';
  const providers=['deepseek','anthropic','google_cloud'].map(id=>({id,enabled:false,label:'Principal pausada',base_url:'',gcp_project:'',gcp_location:'',has_key:false,key_hint:'',updated_at:''}));
  const connections=[{id:first,provider:'deepseek',label:'Minha conta DeepSeek',enabled:true,position:1,key_hint:'1234',updated_at:''},{id:second,provider:'anthropic',label:'Minha conta Claude',enabled:true,position:1,key_hint:'4321',updated_at:''}];
  const ai={secretReady:true,providers,connections,tasks:[{id:'assistente',provider:'deepseek',connection_id:first,model:'auto:rapido',enabled:true,routing_mode:'fixed',fallbacks:[] as {connection_id:string;model:string}[],updated_at:''}]};
  const posted=await mockApi(page,{home:homeFixture({master:true}),ai,onPost:post=>post.body.action==='models' ? {ids:post.body.connection_id===first ? ['deepseek-flash'] : ['claude-sonnet-5'],auto:{'auto:rapido':post.body.connection_id===first ? 'deepseek-flash' : 'claude-sonnet-5'}} : post.body.action==='test_task' ? {text:'Rota alternativa funcionando',ms:900,model:'claude-sonnet-5',provider:'anthropic'} : null});
  await page.goto('/');await nav(page).getByRole('button',{name:'Administração',exact:true}).click();
  const panel=page.getByRole('region',{name:'Inteligência artificial'});await panel.getByRole('button',{name:'Tarefas e modelos',exact:true}).click();
  const task=panel.locator('form.ai-task-card');await expect(task.getByText(/Hoje usaria: deepseek-flash/)).toBeVisible();
  await task.getByLabel('Se a conexão falhar').selectOption('fallback');await expect(task.getByLabel('Alternativa 2',{exact:true})).toBeDisabled();
  await task.getByLabel('Alternativa 1',{exact:true}).selectOption(second);await task.getByLabel('Modelo da alternativa 1').fill('claude-sonnet-5');
  await task.getByRole('button',{name:'Salvar',exact:true}).click();
  await expect.poll(()=>posted.find(row=>row.body.action==='save_route')?.body).toEqual({action:'save_route',task:'assistente',provider:'deepseek',connection_id:first,model:'auto:rapido',enabled:true,routing_mode:'fallback',fallbacks:[{connection_id:second,model:'claude-sonnet-5'}]});
  await task.getByLabel('Provedor').selectOption(second);await expect(task.getByText(/Hoje usaria: claude-sonnet-5/)).toBeVisible();
  expect(posted.filter(row=>row.body.action==='models').map(row=>row.body.connection_id)).toEqual([first,second]);
  ai.connections[0].enabled=false;ai.tasks[0].routing_mode='fallback';ai.tasks[0].fallbacks=[{connection_id:second,model:'claude-sonnet-5'}];ai.tasks[0].updated_at='2026-10-04T15:00:00Z';
  await panel.getByRole('button',{name:'Atualizar painel',exact:true}).click();await expect(task.getByRole('button',{name:'Testar',exact:true})).toBeEnabled();await task.getByRole('button',{name:'Testar',exact:true}).click();
  await expect(panel.getByText(/Funcionou com claude-sonnet-5 em 0.9 s · Anthropic/)).toBeVisible();expect(posted.find(row=>row.body.action==='test_task')?.body).toEqual({action:'test_task',task:'assistente'});
  await panel.getByRole('button',{name:'Conexões e chaves',exact:true}).click();await panel.getByLabel('Buscar empresa ou conexão').fill('Minha conta Claude');
  await expect(panel.locator('details.ai-provider')).toHaveCount(1);await expect(panel.locator('details.ai-provider summary')).toContainText('Anthropic');
  await page.setViewportSize({width:390,height:844});expect((await new AxeBuilder({page}).include('.ai-settings').analyze()).violations).toEqual([]);
});

test('admin remove a chave com confirmação, pausa sua tarefa e preserva a conexão extra', async ({page}) => {
  const providers = [{id:'groq',enabled:true,label:'Minha Groq',base_url:'',gcp_project:'',gcp_location:'',has_key:true,key_hint:'1234',updated_at:''},
    {id:'anthropic',enabled:false,label:'',base_url:'',gcp_project:'',gcp_location:'',has_key:false,key_hint:'',updated_at:''}];
  const connections = [{id:'00000000-0000-4000-8000-000000000051',provider:'groq',label:'Groq extra',enabled:true,position:1,key_hint:'5678',updated_at:''}];
  const ai = {secretReady:true,providers,connections,tasks:[{id:'assistente',provider:'groq',model:'auto:rapido',enabled:true,routing_mode:'fixed',fallbacks:[],updated_at:''}]};
  const posted = await mockApi(page,{home:homeFixture({master:true}),ai,onPost: post => {
    if(post.body.action==='remove_provider') {providers[0].has_key=false;providers[0].enabled=false;providers[0].updated_at=new Date().toISOString();ai.tasks[0].enabled=false;ai.tasks[0].updated_at=providers[0].updated_at;}
    return null;
  }});
  await page.goto('/');await nav(page).getByRole('button',{name:'Administração',exact:true}).click();
  const panel=page.getByRole('region',{name:'Inteligência artificial'});
  await panel.getByRole('button',{name:'Conexões e chaves',exact:true}).click();
  await expect(panel.locator('details.ai-provider')).toHaveCount(1);
  await panel.locator('details.ai-provider summary').click();await panel.getByRole('button',{name:'Remover chave',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Remover chave principal'});
  await expect(modal).toContainText('Conversa do assistente · será pausada');
  expect(posted.filter(post=>post.body.action==='remove_provider')).toHaveLength(0);
  await modal.getByRole('button',{name:'Cancelar',exact:true}).click();
  expect(posted.filter(post=>post.body.action==='remove_provider')).toHaveLength(0);
  await panel.getByRole('button',{name:'Remover chave',exact:true}).click();
  await modal.getByRole('button',{name:/^Remover Groq/}).click();
  await expect.poll(()=>posted.find(post=>post.body.action==='remove_provider')?.body).toEqual({action:'remove_provider',provider:'groq'});
  await expect(panel).toContainText('Sem chave principal');await expect(panel).toContainText('Groq extra');
  await expect(panel.locator('details.ai-provider summary .ai-badge')).toHaveText('Ligado');
  await page.setViewportSize({width:390,height:844});await settleAnimations(page);
  expect((await new AxeBuilder({page}).include('.ai-settings').analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await panel.screenshot({path:'test-results/admin-keys-mobile.png'});
});

test('minhas chaves ficam fora do navegador e a remoção pessoal exige confirmação', async ({page}) => {
  await mockApi(page,{home:homeFixture({master:false})});
  const json = (route: import('@playwright/test').Route, data: unknown) => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  const keys: {provider:string;key_hint:string;enabled:boolean;privacy_basis:string;updated_at:string}[]=[];
  const posted: Record<string,unknown>[]=[];
  await page.route('**/api/ai/my-keys',route=>{
    if(route.request().method()==='POST') {
      const body=route.request().postDataJSON();posted.push(body);
      if(body.action==='save') {keys.push({provider:body.provider,key_hint:'test',enabled:body.enabled,privacy_basis:body.privacy_basis,updated_at:new Date().toISOString()});return json(route,{ok:true,data:{message:'Chave validada e guardada só para sua conta.'}});}
      if(body.action==='remove') keys.splice(0,keys.length);
      return json(route,{ok:true,data:null});
    }
    return json(route,{ok:true,data:{available:true,keys,isOwner:false,baseEnabled:false,secretReady:true}});
  });
  await page.goto('/#settings');
  const card=page.getByRole('region',{name:'Minhas chaves de IA'});
  await card.getByLabel('Chave de API',{exact:true}).fill('synthetic-personal-key-test');
  await card.getByLabel('Condições de privacidade da minha API').selectOption('no_training');
  await card.getByRole('checkbox').check();await card.getByRole('button',{name:'Validar e guardar chave'}).click();
  await expect(card.getByLabel('Chave de API',{exact:true})).toHaveValue('');
  await expect(card).toContainText('Chave …test · Ligada');
  expect(posted[0]).toMatchObject({action:'save',provider:'groq',enabled:true,privacy_basis:'no_training'});
  expect(JSON.stringify(await page.evaluate(()=>({...localStorage})))).not.toContain('synthetic-personal-key-test');
  await card.getByRole('button',{name:'Remover',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Remover sua chave de IA'});
  expect(posted.filter(row=>row.action==='remove')).toHaveLength(0);
  await modal.getByRole('button',{name:'Remover chave',exact:true}).click();
  await expect(card).not.toContainText('Chave …test');
  expect(posted.find(row=>row.action==='remove')).toEqual({action:'remove',provider:'groq'});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await settleAnimations(page);
  expect((await new AxeBuilder({page}).include('.my-ai-keys').analyze()).violations).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await card.screenshot({path:'test-results/my-keys-mobile-dark.png'});
});

test('MCP cadastra token transitório e consulta ferramentas sem executar comandos',async({page})=>{
  const connector={id:'00000000-0000-4000-8000-000000000030',label:'Agenda MCP',url:'https://tools.example.invalid/mcp',protocol:'2026-07-28',enabled:true,has_key:true,key_hint:'1234',updated_at:''};
  const ai={secretReady:true,providers:[],connections:[],connectors:[connector],tasks:[]};
  const posted=await mockApi(page,{home:homeFixture({master:true}),ai,onPost:post=>post.body.action==='test_connector' ? {tools:[{name:'agenda.list',description:'Consultar agenda'}],hasMore:false,checkedAt:'2026-10-04T15:00:00Z'} : null});
  await page.goto('/');await nav(page).getByRole('button',{name:'Administração',exact:true}).click();const panel=page.getByRole('region',{name:'Inteligência artificial'});
  await panel.getByRole('button',{name:'Integrações',exact:true}).click();await panel.locator('.ai-mcp-settings details summary').click();await panel.getByRole('button',{name:'Consultar ferramentas'}).click();
  await expect(panel.getByText('agenda.list',{exact:true})).toBeVisible();expect(posted.find(row=>row.body.action==='test_connector')?.body).toEqual({action:'test_connector',id:connector.id});
  const form=panel.locator('form').filter({hasText:'Adicionar servidor MCP'});await form.getByLabel('Nome do conector').fill('Meu MCP');await form.getByLabel('Endpoint MCP').fill('https://more.example.invalid/mcp');await form.getByLabel('Token Bearer (opcional)').fill('synthetic-token');await form.getByRole('button',{name:'Cadastrar conector'}).click();
  await expect(form.getByLabel('Token Bearer (opcional)')).toHaveValue('');await expect.poll(()=>posted.find(row=>row.body.action==='save_connector')?.body).toMatchObject({label:'Meu MCP',url:'https://more.example.invalid/mcp',protocol:'2026-07-28',enabled:false,key:'synthetic-token'});
  expect(JSON.stringify(await page.evaluate(()=>({...localStorage})))).not.toContain('synthetic-token');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await settleAnimations(page);
  expect((await new AxeBuilder({page}).include('.ai-settings').analyze()).violations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await panel.screenshot({path:'test-results/admin-integrations-mobile-dark.png'});
});

test('MCP: libera ferramentas do catálogo e executa só a liberada, depois de confirmar os argumentos',async({page})=>{
  const connector={id:'00000000-0000-4000-8000-000000000031',label:'Agenda MCP',url:'https://tools.example.invalid/mcp',protocol:'2026-07-28',enabled:true,has_key:false,key_hint:'',updated_at:'',allowed_tools:['agenda.list']};
  const ai={secretReady:true,providers:[],connections:[],connectors:[connector],tasks:[]};
  const posted=await mockApi(page,{home:homeFixture({master:true}),ai,onPost:post=>post.body.action==='test_connector' ? {tools:[{name:'agenda.list',description:'Consultar agenda',readOnly:true,inputSchema:'{"type":"object"}'},{name:'agenda.add',description:'Criar evento',readOnly:false,inputSchema:''}],hasMore:false,checkedAt:'2026-10-08T15:00:00Z'}
    : post.body.action==='call_connector_tool' ? {isError:false,text:'3 eventos amanhã',structured:'',omitted:0,ms:420} : null});
  await page.goto('/');await nav(page).getByRole('button',{name:'Administração',exact:true}).click();const panel=page.getByRole('region',{name:'Inteligência artificial'});
  await panel.getByRole('button',{name:'Integrações',exact:true}).click();await panel.locator('.ai-mcp-settings details summary').first().click();
  await expect(panel.getByText('1 ferramentas liberadas',{exact:false})).toBeVisible();
  await panel.getByText('Executar',{exact:true}).click();
  await panel.getByLabel('Argumentos (JSON)').fill('{"dia":"amanhã"}');
  let confirmed='';page.once('dialog',dialog=>{confirmed=dialog.message();void dialog.accept();});
  await panel.getByRole('button',{name:'Executar agenda.list'}).click();
  await expect(panel.getByText('3 eventos amanhã')).toBeVisible();
  expect(confirmed).toContain('"dia": "amanhã"');
  expect(posted.find(row=>row.body.action==='call_connector_tool')?.body).toEqual({action:'call_connector_tool',id:connector.id,tool:'agenda.list',arguments:{dia:'amanhã'}});
  page.once('dialog',dialog=>void dialog.dismiss());
  await panel.getByRole('button',{name:'Executar agenda.list'}).click();
  expect(posted.filter(row=>row.body.action==='call_connector_tool')).toHaveLength(1);
  await panel.getByRole('button',{name:'Consultar ferramentas'}).click();
  await expect(panel.getByText('só consulta (declarado)')).toBeVisible();
  await expect(panel.getByRole('button',{name:'Executar agenda.add'})).toHaveCount(0);
  await panel.getByRole('checkbox',{name:'agenda.add'}).check();
  await panel.getByRole('button',{name:'Salvar ferramentas liberadas'}).click();
  await expect.poll(()=>posted.find(row=>row.body.action==='allow_connector_tools')?.body).toEqual({action:'allow_connector_tools',id:connector.id,tools:['agenda.list','agenda.add']});
});

test('assistente com IA entende o pedido, executa e desfaz; sem IA, guarda em Para organizar', async ({ page }) => {
  const tomorrow = spDay(1);
  let configured = true;
  const posted = await mockApi(page, { onPost: post => post.url === '/api/ai/command' ? (configured
    ? { configured: true, model: 'gemini-3.8-flash', reply: 'Pronto: dentista amanhã às 15h e o mercado anotado.', actions: [
      { type: 'compromisso', title: 'Dentista', date: tomorrow, time: '15:00', kind: 'Consulta', area: 'Saúde física' },
      { type: 'financeiro', flow: 'expense', description: 'Mercado', amount: 32, category: 'Alimentação', date: spDay() }] }
    : { configured: false }) : null });
  const saves = savedVersions(EMPTY_SPACE);
  page.on('request', request => { if (request.method() === 'PUT' && request.url().endsWith('/api/workspace')) saves.take(request.postDataJSON()); });
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Assistente', exact: true }).click();
  const input = page.getByLabel('Mensagem para o assistente');
  await input.fill('amanhã às 15h dentista e gastei 32 no mercado');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  const result = page.locator('.assistant-message.assistant > p').last();
  await expect(result).toContainText('Feito. Consulta: Dentista');
  await expect(result).toContainText('Saída: Mercado');
  const savedReply = await result.innerText();
  await expect(page.getByText('Pronto: dentista amanhã às 15h e o mercado anotado.')).toHaveCount(0);
  await expect(page.locator('.assistant-applied').getByText('Consulta: Dentista · amanhã às 15:00', { exact: true })).toBeVisible();
  await expect(page.locator('.assistant-applied').getByText(/Saída: Mercado · R\$\s32,00/)).toBeVisible();
  await expect(page.getByText('Pronto para conversar e organizar')).toBeVisible();
  const command = posted.find(item => item.url === '/api/ai/command')!.body;
  expect(command.message).toBe('amanhã às 15h dentista e gastei 32 no mercado');
  expect(String(command.context)).toMatch(/^Hoje: /);
  await expect.poll(() => saves.versions.at(-1)?.tasks.map(task => task.title)).toEqual(['Dentista']);
  expect((await new AxeBuilder({ page }).include('.assistant-panel').analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByText(/\(desfeito e salvo\)/)).toBeVisible();
  await expect.poll(() => saves.versions.at(-1)?.tasks.length).toBe(0);
  expect(saves.versions.at(-1)?.transactions ?? []).toEqual([]);
  await input.fill('e quanto gastei hoje?');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect.poll(() => posted.filter(item => item.url === '/api/ai/command').length).toBe(2);
  const second = posted.filter(item => item.url === '/api/ai/command')[1].body as { history: { role: string; text: string }[] };
  expect(second.history.slice(0, 2)).toEqual([{ role: 'user', text: 'amanhã às 15h dentista e gastei 32 no mercado' }, { role: 'assistant', text: `${savedReply} (desfeito e salvo)` }]);
  await page.getByRole('button', { name: 'Nova conversa' }).click();
  await expect(page.getByText('e quanto gastei hoje?')).toHaveCount(0);
  configured = false;
  await input.fill('ideia solta para depois');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(page.getByText(/Guardei em Para organizar: “ideia solta para depois”/)).toBeVisible();
  await expect(page.getByText('IA ainda não ligada: guardo tudo em Para organizar')).toBeVisible();
  await expect(page.getByText(/Administração › Inteligência artificial/)).toBeVisible();
});

test('assistente: falha da IA oferece tentar de novo (pergunta não vira anotação) e conversas antigas ficam guardadas', async ({ page }) => {
  await mockApi(page);
  let calls = 0;
  await page.route('**/api/ai/command', route => {
    calls += 1;
    return calls === 1
      ? route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'Google Gemini (AI Studio) recusou (503): alta demanda.' }) })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { configured: true, model: 'gemini-3.5-flash', reply: 'Seu saldo agora é R$ 1.200,00.', actions: [] } }) });
  });
  const saves = savedVersions(EMPTY_SPACE);
  page.on('request', request => { if (request.method() === 'PUT' && request.url().endsWith('/api/workspace')) saves.take(request.postDataJSON()); });
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Assistente', exact: true }).click();
  await page.getByLabel('Mensagem para o assistente').fill('qual o meu saldo hoje');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(page.getByText(/Não consegui responder agora\. .*alta demanda/)).toBeVisible();
  expect(saves.versions.some(doc => doc.notes.length > 0)).toBe(false);
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByText('Seu saldo agora é R$ 1.200,00.')).toBeVisible();
  await expect(page.getByText(/Não consegui responder agora/)).toHaveCount(0);
  await expect(page.locator('.assistant-message.me')).toHaveCount(1);
  await page.getByRole('button', { name: 'Nova conversa' }).click();
  await expect(page.getByText('Seu saldo agora é R$ 1.200,00.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Conversas', exact: true }).click();
  const archived = page.getByRole('dialog', { name: 'Suas conversas' });
  await expect(archived.getByRole('button', { name: /^qual o meu saldo hoje/ })).toBeVisible();
  await page.reload();
  await nav(page).getByRole('button', { name: 'Assistente', exact: true }).click();
  await page.getByRole('button', { name: 'Conversas', exact: true }).click();
  await page.getByRole('dialog', { name: 'Suas conversas' }).getByRole('button', { name: /^qual o meu saldo hoje/ }).click();
  await expect(page.getByText('Seu saldo agora é R$ 1.200,00.')).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.assistant-panel').analyze()).violations).toEqual([]);
});

test('telegram: a pessoa gera o código, abre o robô e a tela confirma quando o vínculo chega', async ({ page }) => {
  await mockApi(page, { home: homeFixture({ master: true }) });
  let linked = false;
  await page.route('**/api/messenger**', route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { action: string };
      if (body.action === 'link_code') { setTimeout(() => { linked = true; }, 1500); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { code: 'ABCD2345', link: 'https://t.me/jornada_teste_bot?start=ABCD2345' } }) }); }
      linked = false;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: null }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { owner: true, channels: [{ channel: 'telegram', enabled: true, bot_username: 'jornada_teste_bot', linked }, { channel: 'whatsapp', enabled: false, bot_username: '', linked: false }] } }) });
  });
  await page.goto('/#settings');
  const card = page.getByRole('region', { name: 'Telegram' });
  await card.getByRole('button', { name: 'Conectar meu Telegram' }).click();
  await expect(card.getByRole('link', { name: 'Abrir no Telegram e conectar' })).toHaveAttribute('href', 'https://t.me/jornada_teste_bot?start=ABCD2345');
  await expect(card.getByText('/start ABCD2345')).toBeVisible();
  await expect(card.getByText(/Conectado ao @jornada_teste_bot/)).toBeVisible({ timeout: 15_000 });
  expect((await new AxeBuilder({ page }).include('.telegram-link').analyze()).violations).toEqual([]);
  page.once('dialog', dialog => dialog.accept());
  await card.getByRole('button', { name: 'Desconectar' }).click();
  await expect(card.getByRole('button', { name: 'Conectar meu Telegram' })).toBeVisible();
});

test('avisos: cada canal é um passo; o teste mostra o que cada canal fez; só canais grátis', async ({ page }) => {
  await mockApi(page, { home: homeFixture({ master: true }) });
  const tests: Record<string, unknown>[] = [];
  const state = { devices: [], telegram: true, whatsapp: true, bridge_online: false,
    upcoming: [{ id: '6f1c2b0e-1d2a-4c3b-9e8f-0a1b2c3d4e5f', title: 'Dentista', event_at: '2030-01-08T13:00:00.000Z', next_at: '2030-01-08T12:45:00.000Z', level: 'insistente', status: 'agendado' }],
    vapid: 'BAAA' };
  await page.route('**/api/reminders', route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); tests.push(body);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { id: 'x', deliveries: [
        { at: '', step: 0, channel: 'telegram', ok: true, detail: 'enviado' }, { at: '', step: 0, channel: 'whatsapp', ok: false, detail: 'ponte desligada; sai quando ela ligar (até 30 min)' }] } }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: state }) });
  });
  await page.goto('/#settings');
  const card = page.getByRole('region', { name: 'Avisos' });
  await expect(card.locator('.reminder-steps li[data-done="true"]')).toHaveCount(3);
  await expect(card).toContainText('a ponte está desligada');
  await expect(card.locator('.reminder-steps li')).toHaveCount(4);
  await expect(card).not.toContainText(/Twilio|Resend|Ligação/);
  await expect(card.locator('.reminder-upcoming')).toContainText('Dentista');
  await card.getByRole('radio', { name: 'Não me deixa esquecer' }).check();
  await expect(card).toContainText('Em todos os canais na hora, 5 e 15 minutos depois');
  await card.getByRole('button', { name: 'Testar avisos agora' }).click();
  const result = card.getByRole('list', { name: 'Resultado do teste' });
  await expect(result).toContainText('Telegram: enviado');
  await expect(result).toContainText('WhatsApp: ponte desligada');
  expect(tests).toEqual([{ action: 'test', level: 'insistente' }]);
  expect((await new AxeBuilder({ page }).include('.reminders-panel').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 }); await settleAnimations(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'test-results/reminders-mobile.png', fullPage: false });
});

test('assistentes externos: a pessoa cria uma chave MCP, vê a configuração de cada app uma vez e revoga', async ({ page }) => {
  await mockApi(page, { home: homeFixture({ master: false }) });
  let tokens: unknown[] = [];
  const endpoint = 'https://jornada.example/api/mcp';
  await page.route('**/api/mcp-tokens', route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { action: string; label: string; can_write: boolean; valid_days: number | null };
      if (body.action === 'create') {
        expect(body).toMatchObject({ label: 'Claude Code do notebook', can_write: true, valid_days: 90 });
        tokens = [{ id: '11111111-2222-4333-8444-555555555555', label: body.label, hint: 'wxyz', can_write: true, created_at: new Date().toISOString(), expires_at: null, last_used_at: null }];
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { id: 'x', token: 'jp_teste_mostrado_uma_vez_wxyz', endpoint } }) });
      }
      tokens = [];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: null }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { tokens, endpoint } }) });
  });
  await page.goto('/#settings');
  const card = page.getByRole('region', { name: 'Conectar assistentes (MCP)' });
  await expect(card).toContainText(endpoint);
  await card.getByLabel('Nome').fill('Claude Code do notebook');
  await card.getByLabel('Permissão').selectOption('write');
  await card.getByRole('button', { name: 'Criar chave' }).click();
  await expect(card.getByText('jp_teste_mostrado_uma_vez_wxyz', { exact: true })).toBeVisible();
  await card.getByText('Claude Code', { exact: true }).click();
  await expect(card.locator('pre').first()).toContainText(`claude mcp add --transport http jornada ${endpoint} --header "Authorization: Bearer jp_teste_mostrado_uma_vez_wxyz"`);
  await expect(card).toContainText('consulta e registra');
  expect((await new AxeBuilder({ page }).include('.assistant-connections').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await card.getByRole('button', { name: 'Já guardei, esconder' }).click();
  await expect(card.getByText('jp_teste_mostrado_uma_vez_wxyz', { exact: true })).toBeHidden();
  page.once('dialog', dialog => dialog.accept());
  await card.getByRole('button', { name: 'Revogar' }).click();
  await expect(card).not.toContainText('consulta e registra');
});

test('conector desatualizado: a conexão aparece como "precisa atualizar", com o passo a passo de cada aplicativo', async ({ page }) => {
  await mockApi(page, { home: homeFixture({ master: false }) });
  const tokens = [{ id: '11111111-2222-4333-8444-555555555556', label: 'ChatGPT', hint: 'oauth', oauth: true, can_write: true, created_at: new Date().toISOString(), expires_at: null, last_used_at: new Date().toISOString(), outdated: true },
    { id: '11111111-2222-4333-8444-555555555557', label: 'Claude Code', hint: 'abcd', can_write: false, created_at: new Date().toISOString(), expires_at: null, last_used_at: new Date().toISOString(), outdated: false }];
  await page.route('**/api/mcp-tokens', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { tokens, endpoint: 'https://jornada.example/api/mcp', version: '2026.10.09' } }) }));
  await page.goto('/#settings');
  const card = page.getByRole('region', { name: 'Conectar assistentes (MCP)' });
  await expect(card).toContainText('versão 2026.10.09');
  const notice = card.locator('.mcp-outdated');
  await expect(notice).toContainText('Atualize o conector');
  await expect(notice).toContainText('ChatGPT ainda usa a lista de ferramentas antiga');
  await expect(notice).not.toContainText('Claude Code ainda');
  await notice.getByText('ChatGPT', { exact: true }).click();
  await expect(notice.locator('ol').first()).toContainText('Toque em Atualizar');
  await expect(card.locator('.mcp-outdated-tag')).toHaveCount(1);
  expect((await new AxeBuilder({ page }).include('.assistant-connections').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('mapa de recursos mostra o que realmente atua e separa a declaração do compartilhamento', async ({ page }) => {
  const extra = '00000000-0000-4000-8000-000000000061';
  const reserveId = `connection:${extra}`;
  const providers = ['deepseek', 'gemini', 'groq', 'elevenlabs'].map(id => ({ id, enabled: true, label: '', base_url: '', gcp_project: '', gcp_location: '', has_key: true, key_hint: id.slice(0, 4), updated_at: '' }));
  const ai = { secretReady: true, providers, connections: [{ id: extra, provider: 'gemini', label: 'Reserva Gemini', enabled: true, position: 1, key_hint: 'ext1', updated_at: '' }],
    tasks: [{ id: 'assistente', provider: 'deepseek', model: 'auto:rapido', enabled: true, routing_mode: 'fallback', fallbacks: [{ connection_id: extra, model: 'auto:rapido' }], updated_at: '' }] };
  type Declaration = { privacy_basis: string | null; audience: string | null; current: boolean };
  const resource = (source_id: string, provider: string) => ({ source_id, provider, kind: source_id.startsWith('connection:') ? 'connection' : 'api',
    connection_id: source_id.startsWith('connection:') ? source_id.slice(11) : null, label: source_id.startsWith('connection:') ? 'Reserva Gemini' : '', configured: true, enabled: true,
    key_hint: 'abcd', updated_at: '2026-10-05T12:00:00Z', personal_data_ok: provider !== 'gemini', declaration: { privacy_basis: null, audience: null, current: false } as Declaration });
  const map = { version: 1, generated_at: '2026-10-05T16:00:00Z', base_enabled: false,
    resources: [resource('provider:deepseek', 'deepseek'), resource('provider:gemini', 'gemini'), resource('provider:groq', 'groq'), resource('provider:elevenlabs', 'elevenlabs'), resource(reserveId, 'gemini')],
    routes: [{ task: 'assistente', enabled: true, mode: 'fallback', provider: 'deepseek', model: 'auto:rapido', routing_effective: 'fallback',
      chain: [{ source_id: 'provider:deepseek', provider: 'deepseek', model: 'auto:rapido', source: 'owner' }], configured_chain: [], members_chain: [], members_note: 'base_off',
      sources: [{ source_id: 'provider:deepseek', state: 'active', position: 1, role: 'primary' }, { source_id: reserveId, state: 'blocked', role: 'fallback', reason: 'declaration_missing' } as Record<string, unknown>,
        { source_id: 'provider:groq', state: 'available' }, { source_id: 'provider:elevenlabs', state: 'incapable', reason: 'capability' }] },
    { task: 'voz', enabled: true, mode: 'fixed', provider: 'elevenlabs', model: 'qwen36-35b-a3b', routing_effective: 'fixed',
      chain: [{ source_id: 'provider:elevenlabs', provider: 'elevenlabs', model: 'qwen36-35b-a3b', source: 'owner' }], configured_chain: [], members_chain: [], members_note: 'voice_not_shared',
      sources: [{ source_id: 'provider:elevenlabs', state: 'active', position: 1, role: 'primary' }, { source_id: 'provider:deepseek', state: 'incapable', reason: 'capability' }] }],
    channels: [{ channel: 'telegram', enabled: true, bot: 'JornadaPlenaBot', owner_linked: true, member_links: 0 }, { channel: 'whatsapp', enabled: false, bot: '', owner_linked: false, member_links: 0 }],
    whatsapp: { enabled: false, state: 'offline', stt: { source_id: reserveId, provider: 'gemini', model: 'auto:rapido', state: 'blocked', reason: 'declaration_missing' } },
    mcp_inbound: { owner_tokens: 0, owner_oauth: 1, members_with_access: 0 },
    mcp_outbound: [{ id: '00000000-0000-4000-8000-000000000062', label: 'Agenda MCP', host: 'tools.example.invalid', enabled: true, has_key: true }],
    members: { accounts: 3, with_personal_keys: 0 } };
  const posted = await mockApi(page, { home: homeFixture({ master: true }), ai });
  const policies: Record<string, unknown>[] = [];
  await page.route('**/api/ai/resources', route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON(); policies.push(body);
      const target = map.resources.find(item => item.connection_id === body.connection_id && item.provider === body.provider);
      if (target) target.declaration = { privacy_basis: body.privacy_basis, audience: body.audience, current: true };
      map.routes[0].chain.push({ source_id: reserveId, provider: 'gemini', model: 'auto:rapido', source: 'owner' });
      map.routes[0].sources[1] = { source_id: reserveId, state: 'active', position: 2, role: 'fallback' };
      map.whatsapp.stt.state = 'active';
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: null }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { available: true, map } }) });
  });
  await page.goto('/'); await nav(page).getByRole('button', { name: 'Administração', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Inteligência artificial' });
  // "Apitou, eu clico e o sistema me guia": the overview opens the guide, which leads to the exact field.
  // Every task answers: the overview stays calm and offers improvements instead of an alarm.
  await expect(panel.getByText('Tudo respondendo · 3 melhorias possíveis')).toBeVisible();
  await panel.getByRole('button', { name: 'Melhorar agora' }).click();
  const guide = page.getByRole('dialog', { name: 'Resolver' });
  await expect(guide.getByText('Ponto 1 de 3')).toBeVisible();
  await expect(guide).toContainText('Reserva Gemini · Google Gemini (AI Studio): aguardando sua declaração de privacidade');
  await expect(guide).toContainText('faturamento ativo');
  await guide.getByRole('button', { name: 'Ver como resolver' }).click();
  await expect(guide.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await guide.getByRole('radio', { name: /Meu projeto Google tem faturamento ativo/ }).click();
  await guide.getByRole('button', { name: 'Continuar' }).click();
  await expect(guide.getByRole('link', { name: /Abrir as chaves no AI Studio/ })).toHaveAttribute('href', 'https://aistudio.google.com/apikey');
  await expect(guide.getByRole('button', { name: 'Fazer agora' })).toBeDisabled();
  await expect(guide.getByRole('checkbox', { name: /o projeto desta chave tem faturamento ativo/ })).not.toBeChecked();
  expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
  // The declaration can also be made on the key's own card: the guide takes the person there.
  await guide.getByRole('button', { name: 'Prefiro fazer na tela' }).click();
  await expect(page.getByRole('dialog', { name: 'Resolver' })).toHaveCount(0);
  await expect(panel.getByRole('status').filter({ hasText: 'Resolvendo:' })).toBeVisible();
  await expect(panel.locator(`[data-source="${reserveId}"]`)).toHaveClass(/ai-touched/);
  const assistant = panel.locator('.ai-route-map').filter({ hasText: 'Conversa do assistente' });
  await expect(assistant.locator('.ai-chain li')).toHaveCount(1);
  await expect(assistant.locator('.ai-chain')).toContainText('DeepSeek');
  await expect(assistant.locator('li[data-state="blocked"]')).toContainText('Configurada, mas fora');
  await expect(assistant.locator('li[data-state="blocked"]')).toContainText('Falta declarar as condições de privacidade');
  await expect(assistant.locator('li[data-state="available"]')).toContainText('Groq');
  await expect(panel.locator('.ai-route-map').filter({ hasText: 'Chamada ao vivo' }).locator('li[data-state="incapable"]')).toHaveCount(0);
  await expect(panel.locator('.ai-issues')).toContainText('Conversa do assistente depende de uma só conexão');
  await expect(panel.locator('.ai-issues')).toContainText('Você tem 2 chaves de Google Gemini');
  await expect(panel.getByText(/Só você executa ferramentas desses servidores/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Ligar base para membros' })).toBeDisabled();
  await assistant.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'test-results/resource-map-desktop.png' });
  const card = panel.getByRole('form', { name: 'Reserva Gemini · Google Gemini (AI Studio)' });
  await expect(card.getByLabel('Quem pode usar')).toBeDisabled();
  await expect(card.getByLabel('Condições de privacidade').getByRole('option', { name: 'Conferi: contrato sem uso para treino' })).toHaveCount(0);
  await card.getByLabel('Condições de privacidade').selectOption('paid');
  await expect(card.getByLabel('Quem pode usar')).toHaveValue('owner');
  await card.getByRole('button', { name: 'Salvar condições' }).click();
  await expect.poll(() => policies[0]).toEqual({ action: 'set_source_policy', provider: 'gemini', connection_id: extra, privacy_basis: 'paid', audience: 'owner' });
  await expect(assistant.locator('.ai-chain li')).toHaveCount(2);
  await expect(panel.getByText('Reserva Gemini · Google Gemini (AI Studio): liberada só para você.')).toBeVisible();
  await panel.getByRole('button', { name: 'Conferir' }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'Resolvido.' })).toBeVisible();
  Object.assign(map.whatsapp.stt, { source_id: 'provider:deepseek', provider: 'deepseek', reason: 'capability' });
  await panel.getByRole('button', { name: 'Atualizar mapa' }).click();
  await expect(panel.getByText('Escolha Gemini, Google Cloud, Groq ou OpenAI para transcrever.')).toBeVisible();
  expect(posted.filter(item => item.body.action === 'models' || item.body.action === 'test_task')).toHaveLength(0);
  expect((await new AxeBuilder({ page }).include('.ai-settings').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark')); await settleAnimations(page);
  expect((await new AxeBuilder({ page }).include('.ai-settings').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await assistant.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'test-results/resource-map-mobile-dark.png' });
});

test('troquei pela Groq: a Gemini parada sai em um toque e o guia leva ao próximo ponto', async ({ page }) => {
  // The owner on 2026-10-09: every task in the automatic mode answered by Groq, two Gemini keys without a declaration.
  const extra = '00000000-0000-4000-8000-000000000071';
  const providers = ['gemini', 'groq', 'elevenlabs'].map(id => ({ id, enabled: true, label: id === 'gemini' ? 'Jornada Projeto Novo' : '', base_url: '', gcp_project: '', gcp_location: '', has_key: true, key_hint: id.slice(0, 4), updated_at: '' }));
  const ai = { secretReady: true, providers, connections: [{ id: extra, provider: 'gemini', label: 'Gemini', enabled: true, position: 1, key_hint: 'ext1', updated_at: '' }],
    tasks: ['assistente', 'organizar'].map(id => ({ id, provider: 'groq', model: 'auto:rapido', enabled: true, routing_mode: 'auto', fallbacks: [], updated_at: '' })) };
  const resource = (source_id: string, provider: string, label = '') => ({ source_id, provider, kind: source_id.startsWith('connection:') ? 'connection' : 'api',
    connection_id: source_id.startsWith('connection:') ? source_id.slice(11) : null, label, configured: true, enabled: true, key_hint: 'abcd', updated_at: '2026-10-09T01:00:00Z',
    personal_data_ok: provider !== 'gemini', declaration: { privacy_basis: null, audience: null, current: false } });
  const geminis = ['provider:gemini', `connection:${extra}`];
  const route = (task: string) => ({ task, enabled: true, mode: 'auto', provider: 'groq', model: 'auto:rapido', routing_effective: 'auto',
    chain: [{ source_id: 'provider:groq', provider: 'groq', model: 'auto:rapido', source: 'owner' }], configured_chain: [], members_chain: [], members_note: 'base_off',
    sources: [{ source_id: 'provider:groq', state: 'active', position: 1, role: 'auto' }, ...geminis.map(source_id => ({ source_id, state: 'blocked', role: 'auto', reason: 'declaration_missing' }))] });
  const map = { version: 1, generated_at: '2026-10-09T01:00:00Z', base_enabled: false,
    resources: [resource('provider:gemini', 'gemini', 'Jornada Projeto Novo'), resource(`connection:${extra}`, 'gemini', 'Gemini'), resource('provider:groq', 'groq'), resource('provider:elevenlabs', 'elevenlabs')],
    routes: [route('assistente'), route('organizar')], channels: [], whatsapp: null,
    mcp_inbound: { owner_tokens: 0, owner_oauth: 0, members_with_access: 0 }, mcp_outbound: [], members: { accounts: 1, with_personal_keys: 0 } };
  // The pause lands like the database answers it: the key is off and the automatic mode reports it as paused.
  const posted = await mockApi(page, { home: homeFixture({ master: true }), ai, onPost: ({ url, body }) => {
    if (url !== '/api/ai/admin' || body.enabled !== false) return null;
    const id = body.action === 'save_connection' ? `connection:${body.id}` : `provider:${body.provider}`;
    map.resources = map.resources.map(item => item.source_id === id ? { ...item, enabled: false } : item);
    for (const item of map.routes) item.sources = item.sources.map(source => source.source_id === id ? { ...source, reason: 'disabled' } : source);
    return null;
  } });
  await page.route('**/api/ai/resources', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { available: true, map } }) }));
  await page.goto('/'); await nav(page).getByRole('button', { name: 'Administração', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Inteligência artificial' });
  await expect(panel.getByText(/Tudo respondendo · 3 melhorias possíveis/)).toBeVisible();
  await expect(panel.getByText(/pede sua atenção|pedem sua atenção/)).toHaveCount(0);
  await panel.getByRole('button', { name: 'Melhorar agora' }).click();
  const guide = page.getByRole('dialog', { name: 'Resolver' });
  await expect(guide).toContainText('Google Gemini (AI Studio): 2 chaves paradas, esperando sua decisão');
  await expect(guide).toContainText('Está tudo respondendo: Groq · inferência rápida responde por Conversa do assistente e Organizar registros.');
  await guide.getByRole('button', { name: 'Ver como resolver' }).click();
  await expect(guide.getByRole('radio')).toHaveCount(3);
  await expect(guide.getByText('Resolvo daqui, com sua confirmação')).toHaveCount(2);
  await guide.getByRole('radio', { name: /Ainda não tenho faturamento: deixar de lado/ }).click();
  await guide.getByRole('button', { name: 'Continuar' }).click();
  await expect(guide).toContainText('Pauso as 2 chaves de Google Gemini (AI Studio). Quem já responde continua respondendo.');
  expect((await new AxeBuilder({ page }).include('dialog[open]').analyze()).violations).toEqual([]);
  await page.screenshot({ path: 'test-results/issue-one-tap.png' });
  await guide.getByRole('button', { name: 'Fazer agora' }).click();
  await expect(page.getByRole('dialog', { name: 'Resolver' })).toHaveCount(0);
  const bar = panel.getByRole('status').filter({ hasText: 'Resolvido.' });
  await expect(bar).toContainText('não aparece mais nos avisos');
  // Only the settings shown are changed: name, address and project go back as they were, the key stays.
  const pauses = posted.filter(item => item.url === '/api/ai/admin').map(item => item.body);
  expect(pauses).toEqual([
    { action: 'save_provider', provider: 'gemini', enabled: false, label: 'Jornada Projeto Novo', base_url: '', gcp_project: '', gcp_location: '', key: null },
    { action: 'save_connection', id: extra, provider: 'gemini', label: 'Gemini', enabled: false, position: 1, key: null },
  ]);
  // The next point: Groq alone answers, so a second company would keep the tasks up if it fails.
  await expect(bar).toContainText('Faltam 2 pontos.');
  await page.setViewportSize({ width: 390, height: 844 }); await settleAnimations(page);
  await bar.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'test-results/issue-resolved-mobile.png' });
  await bar.getByRole('button', { name: 'Próximo ponto' }).click();
  await expect(page.getByRole('dialog', { name: 'Resolver' })).toContainText('Conversa do assistente depende de uma só conexão');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('link de envio do assistente abre o Registro rápido no destino, sai do endereço e vence', async ({ page }) => {
  await mockApi(page);
  await page.goto(`/?capturar=area:health&ate=${Date.now() + 5 * 60_000}`);
  const sheet = page.getByRole('dialog', { name: 'Registro rápido' });
  await expect(sheet).toContainText('vai para Saúde física');
  await expect(page).not.toHaveURL(/capturar=/);
  await page.goto(`/?capturar=area:health&ate=${Date.now() - 60_000}`);
  await expect(page.getByText('Este link de envio expirou. Peça outro ao assistente.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Registro rápido' })).toHaveCount(0);
});

test('o que os assistentes fizeram: lista as alterações das conexões e Desfazer tira só o que ninguém mudou', async ({ page }) => {
  await mockApi(page, { home: homeFixture({ master: false }) });
  const REQ = 'cdcdcdcd-0000-4000-8000-000000000001', DONE = 'cdcdcdcd-0000-4000-8000-000000000002';
  const task = { id: 't-ia', title: 'Comprar pão', subjectId: '', date: spDay(), kind: 'Tarefa', done: false, minutes: 10 };
  const start = { ...EMPTY_SPACE, tasks: [task] }, saved = savedVersions(start);
  await page.route('**/api/workspace**', async route => {
    if (route.request().method() === 'PUT') { saved.take(route.request().postDataJSON()); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ revision: 1 + saved.versions.length }) }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: start, revision: 1, accountId: 'x' }) });
  });
  await page.route(/\/api\/mcp-tokens(\?.*)?$/, route => {
    const target = new URL(route.request().url()).searchParams.get('atividade');
    const list = [{ request_id: REQ, created_at: new Date().toISOString(), connection: 'Claude', labels: ['Tarefa: Comprar pão · hoje'], undone: false },
      { request_id: DONE, created_at: new Date(Date.now() - 3_600_000).toISOString(), connection: 'ChatGPT', labels: ['Anotação em Para organizar: ideia'], undone: true }];
    const data = target === null ? { tokens: [], endpoint: 'https://jornada.example/api/mcp' }
      : target ? [{ ...list[0], applied: [{ label: list[0].labels[0], view: 'agenda', id: 't-ia', undo: { kind: 'task', id: 't-ia' } }] }] : list;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  });
  await page.goto('/#settings');
  const history = page.getByRole('region', { name: 'O que os assistentes fizeram' });
  await expect(history).toContainText('Tarefa: Comprar pão · hoje');
  await expect(history).toContainText('Claude');
  await expect(history.getByRole('listitem').filter({ hasText: 'ideia' })).toContainText('desfeito pelo assistente');
  await expect(history.getByRole('listitem').filter({ hasText: 'ideia' }).getByRole('button', { name: 'Desfazer' })).toHaveCount(0);
  await history.getByRole('listitem').filter({ hasText: 'Comprar pão' }).getByRole('button', { name: 'Desfazer' }).click();
  await expect(history.getByRole('status')).toHaveText('Desfeito: Tarefa: Comprar pão · hoje.');
  await expect.poll(() => saved.versions.at(-1)?.tasks.some(item => item.id === 't-ia')).toBe(false);
  expect((await new AxeBuilder({ page }).include('.assistant-activity').analyze()).violations).toEqual([]);
});
