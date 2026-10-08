import { test, expect } from '@playwright/test';
import { printView, PRINT_VIEW_PROTOCOL } from '../../src/lib/mcp/print-view';

// A stand-in for Claude or ChatGPT: it frames the page in a sandbox, answers ui/initialize and hands it a ver_tela
// result, the way MCP Apps hosts do. Nothing here reaches the network.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test('o print do MCP aparece dentro da conversa, com o que mudou e o botão para abrir na Jornada', async ({ page }) => {
  await page.setContent('<!doctype html><html><body><iframe id="app" title="Print da Jornada" sandbox="allow-scripts" style="width:480px;height:640px;border:0"></iframe></body></html>');
  await page.evaluate(({ html, png }) => {
    const frame = document.getElementById('app') as HTMLIFrameElement;
    const seen: { method?: string; params?: Record<string, unknown> }[] = [];
    (window as unknown as { seen: typeof seen }).seen = seen;
    window.addEventListener('message', event => {
      if (event.source !== frame.contentWindow) return;
      const message = event.data;
      seen.push(message);
      const reply = (value: unknown) => frame.contentWindow!.postMessage(value, '*');
      if (message.method === 'ui/initialize') reply({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: message.params.protocolVersion, hostInfo: { name: 'host de teste', version: '1' }, hostCapabilities: { openLinks: {} }, hostContext: { theme: 'light' } } });
      if (message.method === 'ui/notifications/initialized') reply({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: {
        content: [{ type: 'image', mimeType: 'image/png', data: png }, { type: 'text', text: 'Finanças · outubro de 2026' }],
        structuredContent: { tela: 'financas', resumo: 'Finanças · outubro de 2026', link: 'https://jornada.example/api/tela/financas.png', mudancas: ['Conta a pagar: Conta de luz · R$ 180,00'] } } });
      if (message.method === 'ui/open-link') reply({ jsonrpc: '2.0', id: (message as { id?: number }).id, result: {} });
    });
    frame.srcdoc = html;
  }, { html: printView, png: PNG });

  const app = page.frameLocator('#app');
  await expect(app.getByRole('img', { name: 'Finanças · outubro de 2026' })).toBeVisible();
  await expect(app.getByRole('status')).toHaveText('O que mudou: Conta a pagar: Conta de luz · R$ 180,00');
  await app.getByRole('button', { name: 'Abrir na Jornada' }).click();
  const seen = () => page.evaluate(() => (window as unknown as { seen: { method?: string; params?: Record<string, unknown> }[] }).seen);
  await expect.poll(async () => (await seen()).find(message => message.method === 'ui/open-link')?.params).toEqual({ url: 'https://jornada.example/api/tela/financas.png' });
  const messages = await seen();
  const hello = messages.find(message => message.method === 'ui/initialize');
  expect(hello?.params).toMatchObject({ protocolVersion: PRINT_VIEW_PROTOCOL, appInfo: { name: 'jornada-print' } });
  expect(messages.map(message => message.method)).toContain('ui/notifications/initialized');
  expect(messages.some(message => message.method === 'ui/notifications/size-changed' && Number(message.params?.height) > 100)).toBe(true);
});
