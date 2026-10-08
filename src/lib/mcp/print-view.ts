// The MCP App that shows ver_tela's print inside the conversation: Claude and ChatGPT render this page in a
// sandboxed frame and hand it the tool result through the MCP Apps bridge (ui/initialize, then tool-result).
// Hosts without apps keep the text and the link. The page reads only the result it is given: no network.
export const PRINT_VIEW_URI = 'ui://jornada/print-v1.html';
export const PRINT_VIEW_MIME = 'text/html;profile=mcp-app';
export const PRINT_VIEW_PROTOCOL = '2026-01-26';

export const printView = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Print da Jornada</title>
<style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body{margin:0;background:transparent;color:#0b2338}
@media (prefers-color-scheme:dark){body{color:#e6eef6}}
main{display:flex;flex-direction:column;gap:10px;padding:2px}
img{display:block;width:100%;height:auto;border-radius:12px;border:1px solid rgba(87,105,123,.25)}
p{margin:0;font-size:14px;line-height:1.45}
button{align-self:flex-start;font:inherit;font-size:14px;font-weight:600;padding:8px 16px;border-radius:999px;border:1px solid #387aab;background:#387aab;color:#fff;cursor:pointer}
[hidden]{display:none!important}
</style></head>
<body><main>
<p id="status" role="status">Preparando o print…</p>
<img id="print" alt="" hidden>
<button id="open" type="button" hidden>Abrir na Jornada</button>
</main>
<script>
(function () {
  var nextId = 1, waiting = {}, link = null;
  var status = document.getElementById('status'), image = document.getElementById('print'), open = document.getElementById('open');
  var formats = ['image/png', 'image/jpeg', 'image/webp'];
  function post(message) { window.parent.postMessage(message, '*'); }
  function request(method, params) {
    var id = nextId++;
    post({ jsonrpc: '2.0', id: id, method: method, params: params });
    return new Promise(function (resolve) { waiting[id] = resolve; });
  }
  function notify(method, params) { post({ jsonrpc: '2.0', method: method, params: params || {} }); }
  function resize() { notify('ui/notifications/size-changed', { height: Math.ceil(document.documentElement.getBoundingClientRect().height) }); }
  function show(result) {
    var blocks = (result && result.content) || [];
    var picture = blocks.filter(function (block) { return block && block.type === 'image'; })[0];
    var data = (result && result.structuredContent) || {};
    if (picture && formats.indexOf(picture.mimeType) >= 0 && /^[A-Za-z0-9+/=]+$/.test(picture.data)) {
      image.onload = resize;
      image.src = 'data:' + picture.mimeType + ';base64,' + picture.data;
      image.alt = typeof data.resumo === 'string' ? data.resumo.split(String.fromCharCode(10))[0] : 'Print da Jornada';
      image.hidden = false;
      status.textContent = Array.isArray(data.mudancas) && data.mudancas.length ? 'O que mudou: ' + data.mudancas.join('; ') : '';
    } else {
      status.textContent = result && result.isError ? 'Não consegui montar o print agora.' : 'O print não veio nesta resposta.';
    }
    status.hidden = !status.textContent;
    link = typeof data.link === 'string' && data.link.indexOf('https://') === 0 ? data.link : null;
    open.hidden = !link;
    resize();
  }
  open.addEventListener('click', function () { if (link) request('ui/open-link', { url: link }); });
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var message = event.data;
    if (!message || message.jsonrpc !== '2.0') return;
    if (!message.method && message.id !== undefined && waiting[message.id]) {
      var resolve = waiting[message.id]; delete waiting[message.id]; resolve(message.result); return;
    }
    if (message.method === 'ui/notifications/tool-result') { show(message.params); return; }
    // Any request from the host (teardown and the like) gets an empty answer, so it never waits on this page.
    if (message.method && message.id !== undefined) post({ jsonrpc: '2.0', id: message.id, result: {} });
  });
  request('ui/initialize', { protocolVersion: '${PRINT_VIEW_PROTOCOL}', appInfo: { name: 'jornada-print', version: '1.0.0' }, appCapabilities: {} })
    .then(function () { notify('ui/notifications/initialized'); resize(); });
})();
</script></body></html>`;
