import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demoWorkspace, dateKey, parseWorkspace, type Workspace } from '../../src/lib/workspace';
import { applyCommands, executionSummary, type CommandAction } from '../../src/lib/commands';
import type { AssistantJob } from '../../src/lib/assistant-jobs';

type Fixture = { workspace: Workspace; saves: Workspace[]; revision: number; jobs: Map<string, AssistantJob>; socket?: WebSocketRoute; sent: Record<string, unknown>[]; delaySave?: () => Promise<void> };
async function fixture(page: Page) {
  const state: Fixture = { workspace: demoWorkspace(dateKey()), saves: [], sent: [], revision: 1, jobs: new Map() };
  const conversations = new Map<string, Record<string, unknown>>();
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let body: unknown = { ok: true, data: [] };
    if (path === '/api/me') body = { ok: true, data: {
      account: { user_id: '11111111-1111-4111-8111-111111111111', display_name: 'Pessoa Teste', email: 'teste@example.invalid', is_master: false, plan: 'academic', plan_source: 'free', pro_until: null, features: [], ai_credits: 0 },
      settings: { open_access: true }, spaces: [], my_parts: [], to_review: [], consents: [{ document: 'terms', version: '2026-09-30' }, { document: 'privacy', version: '2026-09-30' }],
    } };
    if (path === '/api/workspace') {
      if (request.method() === 'PUT') { const value = request.postDataJSON(); state.saves.push(value.data); await state.delaySave?.(); state.workspace = value.data; state.revision = value.revision + 1; body = { revision: state.revision }; }
      else body = { data: state.workspace, revision: state.revision, accountId: '11111111-1111-4111-8111-111111111111' };
    }
    if (path === '/api/conversations') {
      if (request.method() === 'GET') body = { ok: true, data: { accountId: '11111111-1111-4111-8111-111111111111', items: [...conversations.values()], hasMore: false } };
      else {
        const value = request.postDataJSON();
        if (value.action === 'save') { const item = { ...value.conversation, dirty: false, revision: value.conversation.revision + 1 }; conversations.set(item.id, item); body = { ok: true, data: { revision: item.revision, updatedAt: item.updatedAt } }; }
        else { conversations.delete(value.id); body = { ok: true, data: null }; }
      }
    }
    if (path === '/api/assistant/jobs') {
      if (request.method() === 'GET') {
        const query = new URL(request.url()).searchParams;
        body = { ok: true, data: { accountId: '11111111-1111-4111-8111-111111111111', jobs: [...state.jobs.values()].filter(job => query.get('id') ? job.id === query.get('id') : job.conversation_id === query.get('conversation')).toReversed() } };
      } else {
        const value = request.postDataJSON();
        if (value.action === 'settle') { const job = state.jobs.get(value.id); if (job?.result) { job.status = 'done'; job.result.pending = []; } body = { ok: true, data: {} }; }
        else {
          const id = crypto.randomUUID();
          const job: AssistantJob = { id, conversation_id: value.conversationId, input: value.input, status: 'working', result: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          state.jobs.set(id, job);
          await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { id, status: 'working' } }) });
          const actions: CommandAction[] = value.input.message.includes('excluir') ? [{ type: 'excluir', entity: 'compromisso', target: 't1' }] : [{ type: 'compromisso', title: 'Dentista por voz', date: dateKey(), time: '15:00' }];
          const result = applyCommands(parseWorkspace(JSON.stringify(state.workspace)), actions, { today: dateKey(), now: Date.now() });
          if (result.applied.length) { state.saves.push(result.data); await state.delaySave?.(); state.workspace = result.data; state.revision++; }
          job.status = result.pending.length ? 'needs_confirmation' : 'done'; job.result = { saved: true, reply: executionSummary(result), applied: result.applied, pending: result.pending, failed: result.failed };
          return;
        }
      }
    }
    if (path === '/api/ai/live') body = { ok: true, data: { token: 'test-ephemeral-not-a-secret', model: 'gemini-test-live', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), maxSeconds: 1200 } };
    if (path === '/api/ai/command') {
      const message = String(request.postDataJSON().message);
      body = { ok: true, data: { configured: true, reply: 'Promessa do modelo que não deve anunciar salvamento antes da hora.', actions: message.includes('excluir') ? [{ type: 'excluir', entity: 'compromisso', target: 't1' }] : [{ type: 'compromisso', title: 'Dentista por voz', date: dateKey(), time: '15:00' }] } };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.routeWebSocket(/generativelanguage\.googleapis\.com/, socket => {
    state.socket = socket;
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw)); state.sent.push(message);
      if (message.setup) socket.send(JSON.stringify({ setupComplete: {} }));
    });
  });
  await page.goto('/#assistant');
  await expect(page.getByRole('heading', { name: 'Assistente', exact: true })).toBeVisible();
  return state;
}
async function start(page: Page) {
  await page.getByRole('button', { name: 'Conversar ao vivo', exact: false }).click();
  const call = page.getByRole('dialog');
  await expect(call).toContainText('Vamos conversar?');
  await call.getByRole('button', { name: 'Iniciar chamada', exact: true }).click();
  await expect(call).toContainText('Pode falar. Estou ouvindo.');
  return call;
}
const tool = (state: Fixture, id: string, name: string, args: unknown = {}) => state.socket!.send(JSON.stringify({ toolCall: { functionCalls: [{ id, name, args }] } }));

test('uma falha na voz do navegador não impede abrir a chamada', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window.speechSynthesis, 'cancel', { value: () => { throw new Error('Speech engine unavailable'); } });
  });
  await fixture(page);
  const entry = page.getByRole('button', { name: 'Conversar ao vivo', exact: false });
  if (info.project.name === 'voice-android') await entry.tap(); else await entry.click();
  const call = page.getByRole('dialog');
  await expect(call).toContainText('Vamos conversar?');
  await call.getByRole('button', { name: 'Fechar chamada' }).click();
  await expect(call).toBeHidden();
  expect(errors).toEqual([]);
});

test('um conflito de sincronização abre a chamada com uma explicação e bloqueia iniciar', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/workspace', async route => {
    if (route.request().method() === 'PUT') await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Alteração concorrente de teste. Confira seus dados antes de continuar.' }) });
    else await route.fallback();
  });
  await page.getByLabel('Mensagem para o assistente').fill('agende dentista hoje às 15h');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(page.locator('.error-banner')).toContainText('Alteração concorrente de teste');
  const entry = page.getByRole('button', { name: 'Conversar ao vivo', exact: false });
  await expect(entry).toBeEnabled();
  await entry.click();
  const call = page.getByRole('dialog');
  await expect(call.getByRole('alert')).toContainText('sincronização do seu espaço');
  await expect(call.getByRole('button', { name: 'Iniciar chamada', exact: true })).toBeDisabled();
  await call.getByRole('button', { name: 'Fechar chamada' }).click();
});

test('abrir a chamada pela bolinha preserva a janela do assistente ao fechar', async ({ page }, info) => {
  test.skip(info.project.name === 'voice-android', 'A bolinha só aparece no computador.');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await fixture(page);
  await page.goto('/#today');
  await page.getByRole('button', { name: 'Abrir assistente', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Assistente Jornada Plena', exact: true });
  await panel.getByRole('button', { name: 'Conversar ao vivo', exact: false }).click();
  const call = page.getByRole('dialog', { name: 'Vamos conversar?', exact: true });
  await expect(call).toBeVisible();
  await call.getByRole('button', { name: 'Fechar chamada' }).click();
  await expect(call).toBeHidden();
  await expect(panel.getByLabel('Mensagem para o assistente')).toBeEnabled();
  await panel.getByRole('button', { name: 'Fechar janela' }).click();
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});

test('a chamada continua acessível quando o diálogo nativo falha, sem ligar o microfone sozinha', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  let captures = 0; page.on('request', request => { if (new URL(request.url()).pathname === '/api/ai/live') captures++; });
  await page.addInitScript(() => {
    const original = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function () {
      if (this.classList.contains('voice-call')) throw new DOMException('Dialog unavailable', 'InvalidStateError');
      original.call(this);
    };
  });
  await fixture(page);
  await page.getByRole('button', { name: 'Conversar ao vivo', exact: false }).click();
  const call = page.locator('section.voice-call-inline');
  await expect(call).toBeVisible();
  await expect(call).toHaveAccessibleName('Vamos conversar?');
  await expect(call).toBeFocused();
  expect(captures).toBe(0);
  const audit = await new AxeBuilder({ page }).include('.voice-call').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(issue => issue.id)).toEqual([]);
  await call.getByRole('button', { name: 'Iniciar chamada', exact: true }).click();
  await expect(call).toContainText('Pode falar. Estou ouvindo.');
  await call.getByRole('button', { name: 'Fechar chamada' }).click();
  await expect(call).toBeHidden();
  expect(errors).toEqual([]);
});

test('chamada responsiva, acessível, microfone e áudio controláveis; fechar libera o microfone', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as unknown as { callStreams: MediaStream[] }).callStreams = [];
    navigator.mediaDevices.getUserMedia = async constraints => { const stream = await original(constraints); (window as unknown as { callStreams: MediaStream[] }).callStreams.push(stream); return stream; };
  });
  const state = await fixture(page);
  await page.screenshot({ path: `test-results/voice-home-${info.project.name}.png` });
  const homeAudit = await new AxeBuilder({ page }).include('.assistant-call-home').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(homeAudit.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
  const call = await start(page);
  const audit = await new AxeBuilder({ page }).include('.voice-call').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await call.getByRole('button', { name: 'Desligar microfone', exact: true }).click();
  await expect(call).toContainText('Microfone desligado');
  expect(await page.evaluate(() => (window as unknown as { callStreams: MediaStream[] }).callStreams[0].getAudioTracks()[0].enabled)).toBe(false);
  await call.getByRole('button', { name: 'Ligar microfone', exact: true }).click();
  await call.getByRole('button', { name: 'Silenciar voz do assistente', exact: true }).click();
  await expect(call.getByRole('button', { name: 'Ouvir voz do assistente', exact: true })).toHaveAttribute('aria-pressed', 'true');
  state.socket!.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'O que tenho hoje?' }, outputTranscription: { text: 'Vou consultar sua agenda.' }, turnComplete: true } }));
  await expect(call.getByRole('log')).toContainText('O que tenho hoje?');
  await page.screenshot({ path: `test-results/voice-${info.project.name}.png` });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  const darkAudit = await new AxeBuilder({ page }).include('.voice-call').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(darkAudit.violations.map(issue => ({ id: issue.id, targets: issue.nodes.map(node => node.target) }))).toEqual([]);
  await call.getByRole('button', { name: 'Fechar chamada' }).click();
  await expect(call).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { callStreams: MediaStream[] }).callStreams.every(stream => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true);
  expect(errors).toEqual([]);
});

test('ações por voz aguardam o banco, não duplicam tool calls e confirmam exclusão por toque', async ({ page }) => {
  const state = await fixture(page);
  const call = await start(page);
  let release!: () => void;
  state.delaySave = () => new Promise<void>(resolve => { release = resolve; });
  tool(state, 'create-1', 'organizar_jornada', { instruction: 'agende um dentista hoje às 15h' });
  await expect.poll(() => state.saves.length).toBe(1);
  expect(state.sent.some(message => JSON.stringify(message).includes('Feito.'))).toBe(false);
  state.delaySave = undefined; release();
  await expect.poll(() => state.sent.some(message => JSON.stringify(message).includes('Dentista por voz'))).toBe(true);
  tool(state, 'create-1', 'organizar_jornada', { instruction: 'agende um dentista hoje às 15h' });
  await expect.poll(() => state.sent.filter(message => JSON.stringify(message).includes('create-1') && message.toolResponse).length).toBe(2);
  expect(state.workspace.tasks.filter(item => item.title === 'Dentista por voz')).toHaveLength(1);
  tool(state, 'delete-1', 'organizar_jornada', { instruction: 'excluir t1' });
  await expect(call.getByRole('region', { name: 'Confirmar alteração' })).toBeVisible();
  expect(state.workspace.tasks.some(item => item.id === 't1')).toBe(true);
  tool(state, 'fake-confirm', 'confirmar_alteracao');
  await expect.poll(() => state.sent.some(message => JSON.stringify(message).includes('Para confirmar por voz'))).toBe(true);
  expect(state.workspace.tasks.some(item => item.id === 't1')).toBe(true);
  await call.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect.poll(() => state.workspace.tasks.some(item => item.id === 't1')).toBe(false);
  await expect(call.getByRole('region', { name: 'Confirmar alteração' })).toBeHidden();
  await call.getByRole('button', { name: 'Encerrar chamada', exact: true }).click();
  await expect(call).toContainText('Chamada encerrada');
});

test('confirmação falada é verificada; encerrar uma chamada preserva um pedido já aceito', async ({ page }) => {
  const state = await fixture(page); const call = await start(page);
  tool(state, 'delete-voice', 'organizar_jornada', { instruction: 'excluir t1' });
  await expect(call.getByRole('region', { name: 'Confirmar alteração' })).toBeVisible();
  state.socket!.send(JSON.stringify({ serverContent: { turnComplete: true } }));
  state.socket!.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'Confirmo a exclusão.' } } }));
  tool(state, 'confirm-voice', 'confirmar_alteracao');
  await expect.poll(() => state.workspace.tasks.some(item => item.id === 't1')).toBe(false);
  const before = state.workspace.tasks.length;
  let release!: () => void;
  state.delaySave = () => new Promise<void>(resolve => { release = resolve; });
  tool(state, 'continue-after-close', 'organizar_jornada', { instruction: 'agende dentista hoje às 15h' });
  await expect.poll(() => !!release).toBe(true);
  await call.getByRole('button', { name: 'Encerrar chamada', exact: true }).click();
  expect(state.workspace.tasks.length).toBe(before);
  state.delaySave = undefined; release();
  await expect.poll(() => state.workspace.tasks.length).toBe(before + 1);
  await call.getByRole('button', { name: 'Fechar chamada' }).click();
  await expect(page.locator('.assistant-messages')).toContainText('Dentista por voz');
  expect(state.workspace.tasks.filter(item => item.title === 'Dentista por voz')).toHaveLength(1);
});

test('negar microfone mostra uma orientação e permite tentar novamente', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await fixture(page);
  await page.getByRole('button', { name: 'Conversar ao vivo', exact: false }).click();
  const call = page.getByRole('dialog');
  await call.getByRole('button', { name: 'Iniciar chamada', exact: true }).click();
  await expect(call.getByRole('alert')).toContainText('microfone não foi autorizado');
  await expect(call.getByRole('button', { name: 'Conversar novamente' })).toBeEnabled();
  await call.getByRole('button', { name: 'Fechar chamada' }).click();
  await expect(call).toBeHidden();
});

test('uma nova conversa não desfaz ações de uma conversa anterior', async ({ page }) => {
  const state = await fixture(page); const call = await start(page);
  tool(state, 'previous-create', 'organizar_jornada', { instruction: 'agende dentista hoje às 15h' });
  await expect.poll(() => state.sent.some(message => message.toolResponse && JSON.stringify(message).includes('Dentista por voz'))).toBe(true);
  await call.getByRole('button', { name: 'Fechar chamada' }).click();
  await page.getByRole('button', { name: 'Nova conversa' }).click();
  const nextCall = await start(page);
  tool(state, 'new-undo', 'desfazer_ultima_acao');
  await expect.poll(() => state.sent.some(message => message.toolResponse && JSON.stringify(message).includes('Não há uma ação desta conversa para desfazer'))).toBe(true);
  expect(state.workspace.tasks.filter(item => item.title === 'Dentista por voz')).toHaveLength(1);
  await nextCall.getByRole('button', { name: 'Fechar chamada' }).click();
});

test('fechar enquanto o microfone aguarda permissão libera a captura quando ela chega', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const state = window as unknown as { releaseMicrophone?: () => void; lateStream?: MediaStream };
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await original(constraints); state.lateStream = stream;
      await new Promise<void>(resolve => { state.releaseMicrophone = resolve; });
      return stream;
    };
  });
  const state = await fixture(page);
  await page.getByRole('button', { name: 'Conversar ao vivo', exact: false }).click();
  const call = page.getByRole('dialog');
  await call.getByRole('button', { name: 'Iniciar chamada', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releaseMicrophone?: () => void }).releaseMicrophone)).toBe('function');
  await call.getByRole('button', { name: 'Fechar chamada' }).click();
  await page.evaluate(() => (window as unknown as { releaseMicrophone: () => void }).releaseMicrophone());
  await expect.poll(() => page.evaluate(() => (window as unknown as { lateStream: MediaStream }).lateStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
  expect(state.sent).toEqual([]);
});

test('gerenciador permite renomear, buscar, fixar e retomar depois de recarregar', async ({ page }, info) => {
  await fixture(page);
  await page.getByLabel('Mensagem para o assistente').fill('agende dentista hoje às 15h');
  await page.getByRole('button', { name: 'Enviar mensagem' }).click();
  await expect(page.locator('.assistant-messages')).toContainText('Dentista por voz');
  await page.getByRole('button', { name: 'Conversas', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Suas conversas' });
  await history.getByRole('button', { name: /^Renomear:/ }).click();
  await history.getByLabel('Nome da conversa').fill('Agenda e saúde');
  await history.getByRole('button', { name: 'Salvar nome' }).click();
  await history.getByRole('button', { name: 'Fixar: Agenda e saúde', exact: true }).click();
  await history.getByRole('button', { name: 'Fixadas', exact: true }).click();
  await history.getByLabel('Buscar nas conversas').fill('dentista');
  await expect(history.getByRole('button', { name: /Agenda e saúde.*Texto/ })).toBeVisible();
  const audit = await new AxeBuilder({ page }).include('.conversation-manager').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(audit.violations).toEqual([]);
  if (info.project.name === 'voice-android') {
    expect(await history.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/jornada-conversas-android.png' });
  }
  await history.getByRole('button', { name: /Agenda e saúde.*Texto/ }).click();
  await page.reload();
  await expect(page.locator('.assistant-conversation-bar')).toContainText('Agenda e saúde');
  await expect(page.locator('.assistant-messages')).toContainText('Dentista por voz');
});

test('foto na chamada preserva o original e reutiliza o anexo ao tentar a leitura novamente, sem criar gasto', async ({ page }) => {
  const state = await fixture(page), originalNotes = state.workspace.notes.length, originalMoney = JSON.stringify(state.workspace.transactions);
  const src = '/api/note-media/22222222-2222-4222-8222-222222222222.jpg';
  let uploads = 0, readings = 0;
  await page.route('**/api/note-media', route => { uploads++; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ uploadUrl: 'https://storage.example.invalid/photo-test', src }) }); });
  await page.route('https://storage.example.invalid/photo-test', route => route.fulfill({ status: 200, body: '{}' }));
  await page.route('**/api/ai/command', async route => {
    readings++;
    const image = route.request().postDataJSON().image;
    expect(image.src).toBe(src);
    expect(state.workspace.notes.find(note => note.id === image.noteId)?.content).toContain(src);
    await route.fulfill({ status: readings === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(readings === 1 ? { error: 'A leitura não respondeu. A foto permanece guardada.' } : { ok: true, data: { configured: true, actions: [], reply: 'Total informado: R$50. Preços individuais não informados. O que você quer organizar?' } }) });
  });
  const call = await start(page);
  await call.getByLabel('Foto para a chamada').setInputFiles({ name: 'nota.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
  await expect(call.getByRole('button', { name: 'Tentar enviar a foto novamente' })).toBeVisible();
  expect(state.workspace.notes).toHaveLength(originalNotes + 1);
  await call.getByRole('button', { name: 'Tentar enviar a foto novamente' }).click();
  await expect(call.getByRole('status').filter({ hasText: 'Foto guardada e conferida.' })).toBeVisible();
  await expect.poll(() => state.workspace.notes[0].content).toContain('Preços individuais não informados');
  expect(state.workspace.notes).toHaveLength(originalNotes + 1);
  expect(state.workspace.notes[0].content).toContain(src);
  expect(JSON.stringify(state.workspace.transactions)).toBe(originalMoney);
  expect(uploads).toBe(1); expect(readings).toBe(2);
});

test('histórico antigo exige recuperação e envio explícitos antes de ir para a conta', async ({ page }) => {
  await page.addInitScript(() => {
    const messages = Array.from({ length: 70 }, (_, i) => ({ id: `old-${i}`, from: 'me', text: `Meu registro antigo ${i}` }));
    localStorage.setItem('jornada-assistente-conversa', JSON.stringify(messages));
  });
  let uploadedOld = false;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/conversations' && request.method() === 'POST' && request.postData()?.includes('Meu registro antigo')) uploadedOld = true; });
  await fixture(page);
  await page.getByRole('button', { name: 'Conversas', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Suas conversas' });
  await history.getByRole('button', { name: 'Recuperar histórico deste aparelho' }).click();
  expect(uploadedOld).toBe(false);
  await history.getByRole('button', { name: 'Salvar na minha conta' }).click();
  await expect.poll(() => uploadedOld).toBe(true);
  await history.getByRole('button', { name: /Meu registro antigo 0.*Texto/ }).click();
  await expect(page.locator('.assistant-messages .assistant-message')).toHaveCount(70);
});

test('GPT-Live usa sessão HTTP e delegação client, sem enviar session.start nem duplicar o pedido', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { liveSent: Record<string, unknown>[]; emitLive: (value: object) => void };
    state.liveSent = [];
    class Channel {
      readyState = 'open'; onmessage: ((event: { data: string }) => void) | null = null; onclose: (() => void) | null = null;
      send(text: string) { const value = JSON.parse(text); state.liveSent.push(value); if (value.type === 'session.close') queueMicrotask(() => state.emitLive({ type: 'session.closed' })); }
      close() { this.readyState = 'closed'; }
    }
    class Peer extends EventTarget {
      iceGatheringState = 'complete'; connectionState = 'connected'; localDescription: { type: string; sdp: string } | null = null;
      ontrack = null; onconnectionstatechange = null; channel = new Channel();
      createDataChannel() { state.emitLive = value => this.channel.onmessage?.({ data: JSON.stringify(value) }); return this.channel; }
      addTrack() {} close() {}
      async createOffer() { return { type: 'offer', sdp: 'v=0\r\ns=Jornada test\r\n' }; }
      async setLocalDescription(value: { type: string; sdp: string }) { this.localDescription = value; }
      async setRemoteDescription() { setTimeout(() => state.emitLive({ type: 'session.started' }), 20); }
    }
    Object.defineProperty(window, 'RTCPeerConnection', { value: Peer });
  });
  const state = await fixture(page);
  await page.route('**/api/ai/live', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { provider: 'openai', token: '', model: 'gpt-live-1', maxSeconds: 1200, expiresAt: new Date(Date.now() + 1200_000).toISOString() } }) }));
  await page.route('**/api/ai/live/session', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { id: 'live-test', sdp: 'v=0\r\ns=Jornada test\r\n' } }) }));
  const call = await start(page);
  await page.evaluate(() => {
    const state = window as unknown as { emitLive: (value: object) => void };
    state.emitLive({ type: 'session.input_transcript.delta', delta: 'Agende um dentista hoje às 15h', start_ms: 0, end_ms: 1000 });
    state.emitLive({ type: 'session.delegation.created', offset_ms: 1000, delegation: { id: 'delegate-1', target: 'client' } });
    state.emitLive({ type: 'session.delegation.created', offset_ms: 1000, delegation: { id: 'delegate-1', target: 'client' } });
  });
  await expect.poll(() => state.workspace.tasks.filter(item => item.title === 'Dentista por voz').length).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as unknown as { liveSent: Record<string, unknown>[] }).liveSent.some(event => event.type === 'session.commentary.append' && event.delegation_id === 'delegate-1'))).toBe(true);
  expect(state.jobs.size).toBe(1);
  await call.getByRole('button', { name: 'Encerrar chamada', exact: true }).click();
  const events = await page.evaluate(() => (window as unknown as { liveSent: Record<string, unknown>[] }).liveSent);
  expect(events.some(event => event.type === 'session.start')).toBe(false);
  expect(events.some(event => event.type === 'session.close')).toBe(true);
});
