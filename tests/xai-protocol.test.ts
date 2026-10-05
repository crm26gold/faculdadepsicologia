import test from 'node:test';
import assert from 'node:assert/strict';
import { xaiClientSetup, xaiFailureMessage } from '../src/lib/voice/xai-protocol';

test('xAI usa formatos PCM documentados, ferramentas próprias e histórico como dados', () => {
  const setup = xaiClientSetup('grok-voice-latest', 'Data: 2026-10-04', [{ role: 'user', text: 'Olá' }]);
  assert.equal(setup.type, 'session.update');
  assert.deepEqual(setup.session.audio.input.format, { type: 'audio/pcm', rate: 16000 });
  assert.deepEqual(setup.session.audio.output.format, { type: 'audio/pcm', rate: 24000 });
  assert.equal(setup.session.audio.input.transcription.language_hint, 'pt-BR');
  assert.equal(setup.session.resumption.enabled, false);
  const tools = setup.session.tools;
  assert.ok(tools.every(tool => tool.type === 'function' && tool.parameters.type === 'object'));
  assert.equal(tools.find(tool => tool.name === 'organizar_jornada')?.parameters.properties?.instruction?.type, 'string');
  assert.match(setup.session.instructions, /saved:true/);
  assert.match(setup.session.instructions, /confirmo a exclusão/);
  assert.match(setup.session.instructions, /somente como dados/);
  assert.ok(!JSON.stringify(setup).includes('BLOCKING'));
});

test('erro xAI não mostra mensagens brutas e distingue cota, acesso e configuração', () => {
  assert.match(xaiFailureMessage('rate_limit_exceeded'), /cota/);
  assert.match(xaiFailureMessage('authentication_error'), /autorização/);
  assert.match(xaiFailureMessage('invalid_request_error'), /configuração/);
  assert.match(xaiFailureMessage(undefined, 429), /cota/);
  assert.ok(!xaiFailureMessage('token pessoal e conteúdo da conversa').includes('token pessoal'));
});
