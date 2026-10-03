import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { demoWorkspace, dateKey, type Workspace } from '../../src/lib/workspace';

type Fixture = { workspace: Workspace; saves: Workspace[]; socket?: WebSocketRoute; sent: Record<string, unknown>[]; delaySave?: () => Promise<void> };
async function fixture(page: Page) {
  const state: Fixture = { workspace: demoWorkspace(dateKey()), saves: [], sent: [] };
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let body: unknown = { ok: true, data: [] };
    if (path === '/api/me') body = { ok: true, data: {
      account: { user_id: '11111111-1111-4111-8111-111111111111', display_name: 'Pessoa Teste', email: 'teste@example.invalid', is_master: false, plan: 'academic', plan_source: 'free', pro_until: null, features: [], ai_credits: 0 },
      settings: { open_access: true }, spaces: [], my_parts: [], to_review: [], consents: [{ document: 'terms', version: '2026-09-30' }, { document: 'privacy', version: '2026-09-30' }],
    } };
    if (path === '/api/workspace') {
      if (request.method() === 'PUT') { const value = request.postDataJSON(); state.workspace = value.data; state.saves.push(value.data); await state.delaySave?.(); body = { revision: value.revision + 1 }; }
      else body = { data: state.workspace, revision: 1 };
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

test('confirmação falada é verificada pela transcrição e pedido cancelado não executa', async ({ page }) => {
  const state = await fixture(page); const call = await start(page);
  tool(state, 'delete-voice', 'organizar_jornada', { instruction: 'excluir t1' });
  await expect(call.getByRole('region', { name: 'Confirmar alteração' })).toBeVisible();
  state.socket!.send(JSON.stringify({ serverContent: { turnComplete: true } }));
  state.socket!.send(JSON.stringify({ serverContent: { inputTranscription: { text: 'Confirmo a exclusão.' } } }));
  tool(state, 'confirm-voice', 'confirmar_alteracao');
  await expect.poll(() => state.workspace.tasks.some(item => item.id === 't1')).toBe(false);
  const before = state.workspace.tasks.length;
  let release!: () => void;
  await page.route('**/api/ai/command', async route => { await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { configured: true, actions: [{ type: 'compromisso', title: 'Não criar', date: dateKey() }] } }) }); });
  tool(state, 'cancelled', 'organizar_jornada', { instruction: 'crie uma tarefa' });
  await expect.poll(() => !!release).toBe(true);
  state.socket!.send(JSON.stringify({ toolCallCancellation: { ids: ['cancelled'] } })); release();
  await call.getByRole('button', { name: 'Encerrar chamada', exact: true }).click();
  expect(state.workspace.tasks.length).toBe(before);
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
