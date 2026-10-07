import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseLiveModel, liveTokenRequest } from '../src/lib/voice/protocol';
import { boundedLiveText, DelegationInput, liveResultText } from '../src/lib/voice/transcripts';
import { imageMime, chatImageContent, claudeImageContent } from '../src/lib/ai/media';
import { photoHandler } from '../supabase/functions/telegram-photo/index.js';

test('token REST fixa os campos fornecidos inteiros e preserva retomada da sessão', () => {
  const choices = ['gemini-3.8-live-extended-thinking', 'gemini-3.8-live'].map(id => ({ name: `models/${id}`, supportedGenerationMethods: ['bidiGenerateContent'] }));
  assert.equal(chooseLiveModel(choices), 'gemini-3.8-live');
  const now = Date.parse('2026-10-03T22:00:00Z');
  const request = liveTokenRequest('gemini-3.8-live', 'Resumo', [], now);
  // AuthToken REST fields, not SDK-only liveConnectConstraints/config fields.
  assert.deepEqual(Object.keys(request).sort(), ['bidiGenerateContentSetup', 'expireTime', 'fieldMask', 'newSessionExpireTime', 'uses']);
  const setup = request.bidiGenerateContentSetup;
  const locked = request.fieldMask.split(',');
  assert.ok(locked.every(field => /^[a-zA-Z]+$/.test(field)), 'no nested paths or array indexes in the mask');
  assert.deepEqual(locked.toSorted(), Object.keys(setup).filter(field => field !== 'sessionResumption').toSorted());
  assert.ok(locked.includes('generationConfig'), 'client cannot override another generation option');
  assert.equal(setup.model, 'models/gemini-3.8-live');
  assert.deepEqual(setup.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(setup.tools[0].functionDeclarations.length, 6);
  assert.deepEqual(setup.sessionResumption, {});
  assert.equal(request.uses, 1);
  assert.equal(Date.parse(request.newSessionExpireTime) - now, 120_000);
  assert.equal(Date.parse(request.expireTime) - now, 1_320_000);
});
test('ferramentas Gemini omitem schemas vazios e aguardam resultado antes de confirmar', () => {
  const tools = liveTokenRequest('gemini-3.8-live', '', [], 0).bidiGenerateContentSetup.tools[0].functionDeclarations;
  assert.deepEqual(tools.map(tool => tool.name).toSorted(), ['cancelar_alteracao', 'confirmar_alteracao', 'consultar_coletivo', 'consultar_jornada', 'desfazer_ultima_acao', 'organizar_jornada']);
  for (const tool of tools) {
    assert.equal(tool.behavior, 'BLOCKING');
    if (!('parameters' in tool) || !tool.parameters) continue;
    assert.equal(tool.parameters.type, 'OBJECT');
    const properties = Object.keys(tool.parameters.properties);
    assert.ok(properties.length > 0, `${tool.name}: Gemini rejects empty OBJECT properties`);
    assert.ok(tool.parameters.required.every(name => properties.includes(name)));
  }
  for (const name of ['cancelar_alteracao', 'confirmar_alteracao', 'desfazer_ultima_acao']) {
    assert.equal('parameters' in tools.find(tool => tool.name === name)!, false);
  }
});
test('delegação recebe somente fala até seu instante e não repete um pedido consumido', () => {
  const input = new DelegationInput();
  input.add('Agende o dentista', 0, 100, 10);
  input.add(' amanhã às 15h', 100, 200, 20);
  const captured = input.take(200);
  input.add('E consulte meu saldo', 201, 400, 30);
  assert.equal(captured?.transcript.text, 'Agende o dentista amanhã às 15h');
  assert.equal(input.take(200), null);
  assert.equal(input.take(400)?.transcript.text, 'E consulte meu saldo');
});
test('comentário Live mantém Unicode válido e nunca inventa conclusão com salvamento pendente', () => {
  const text = boundedLiveText('🕊️'.repeat(1000));
  assert.ok(new TextEncoder().encode(text).length <= 480); assert.ok(!text.includes('\uFFFD'));
  assert.match(liveResultText({ saved: false, reply: 'Pedido recebido e aguardando conclusão.' }), /aguardando/);
});
test('adaptação de imagem usa os bytes e os formatos próprios de cada provedor', () => {
  assert.equal(imageMime(new Uint8Array([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.equal(imageMime(new TextEncoder().encode('<script>foto.png</script>')), null);
  const image = { mimeType: 'image/jpeg' as const, base64: 'fake-test-bytes' };
  assert.equal(typeof chatImageContent('Leia', image), 'object');
  const claude = claudeImageContent('Leia', image); assert.ok(Array.isArray(claude)); assert.equal(claude[0].type, 'image');
});
test('serviço de fotos recusa chamadas sem segredo ou de Telegram não vinculado antes de usar Storage', async () => {
  const urls: string[] = [];
  const handler = photoHandler({ url: 'https://example.invalid', anon: 'public-test', service: 'private-test' }, async url => { urls.push(String(url)); return Response.json(null); });
  const missing = await handler(new Request('https://example.invalid', { method: 'POST', body: new Uint8Array([0xff, 0xd8, 0xff, 0]) }));
  assert.equal(missing.status, 401); assert.equal(urls.length, 0);
  const denied = await handler(new Request('https://example.invalid', { method: 'POST', headers: { 'x-jornada-server-secret': 'a'.repeat(64), 'x-telegram-chat': '123', 'x-telegram-update': '4' }, body: new Uint8Array([0xff, 0xd8, 0xff, 0]) }));
  assert.equal(denied.status, 401); assert.equal(urls.length, 1); assert.ok(!urls[0].includes('storage'));
});
test('foto vinculada usa somente o dono retornado pelo banco, preserva ID no replay e rejeita conteúdo falso', async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const handler = photoHandler({ url: 'https://example.invalid', anon: 'public-test', service: 'private-test' }, async (url, init) => {
    requests.push({ url: String(url), init: init || {} }); return String(url).includes('/rpc/') ? Response.json('11111111-1111-4111-8111-111111111111') : Response.json({});
  });
  const photo = () => new Request('https://example.invalid', { method: 'POST', headers: { 'x-jornada-server-secret': 'a'.repeat(64), 'x-telegram-chat': '123', 'x-telegram-update': '4' }, body: new Uint8Array([0xff, 0xd8, 0xff, 0]) });
  const first = await (await handler(photo())).json(), second = await (await handler(photo())).json();
  assert.equal(first.src, second.src); assert.match(first.src, /^\/api\/note-media\/[a-f0-9-]{36}\.jpg$/);
  assert.ok(requests[1].url.includes('/11111111-1111-4111-8111-111111111111/'));
  const fake = await handler(new Request('https://example.invalid', { method: 'POST', headers: { 'x-jornada-server-secret': 'a'.repeat(64), 'x-telegram-chat': '123', 'x-telegram-update': '4' }, body: '<script>' }));
  assert.equal(fake.status, 400); assert.equal(requests.length, 5);
});
