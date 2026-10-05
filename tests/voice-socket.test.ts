import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveVoiceConnection, type VoiceOptions } from '../src/lib/voice/client';
import { liveCloseFailure, liveSocketFailure } from '../src/lib/voice/socket-failure';

test('a chamada distingue configuração, autorização e cota sem mostrar dados brutos do socket', async () => {
  const cases = [
    { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid field mask: private-secret-transcript' }, expected: /configuração/, absent: /cota|acesso à Live API/ },
    { error: { code: 403, status: 'PERMISSION_DENIED', message: 'private-secret-transcript' }, expected: /autorização/, absent: /cota|faturamento/ },
    { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'private-secret-transcript' }, expected: /limite/, absent: /configuração/ },
    { error: { code: 503, status: 'UNAVAILABLE', message: 'private-secret-transcript' }, expected: /Tente novamente/, absent: /cota|acesso à Live API|configuração/ },
  ];
  for (const item of cases) {
    const notices: string[] = [], states: string[] = [];
    const options: VoiceOptions = {
      credentials: async () => { throw new Error('Must not fetch credentials'); },
      state: state => states.push(state), level: () => {}, transcript: () => {},
      tool: async () => { throw new Error('Must not execute a tool'); }, notice: message => notices.push(message),
    };
    const connection = new LiveVoiceConnection(options);
    await (connection as unknown as { receive(message: { error: unknown }): Promise<void> }).receive({ error: item.error });
    assert.equal(notices.length, 1);
    assert.match(notices[0], item.expected);
    assert.doesNotMatch(notices[0], item.absent);
    assert.doesNotMatch(notices[0], /private-secret|transcript|auth_tokens/);
    assert.deepEqual(states, ['error']);
  }
});

test('erro desconhecido do socket fica sem status inventado e sem vazar texto arbitrário', async () => {
  for (const value of [null, 'private-secret-transcript', { code: 1008, status: 'UNKNOWN', message: 'private-secret-transcript' }, { status: 'constructor', message: 'private-secret-transcript' }]) {
    const failure = await liveSocketFailure(value);
    assert.equal(failure.diagnostic?.upstreamStatus, undefined);
    assert.equal(failure.diagnostic?.upstreamCode, undefined);
    assert.doesNotMatch(JSON.stringify(failure), /private-secret|transcript|INVALID_ARGUMENT/);
  }
});

test('fechamento reconhece configuração segura sem atribuir HTTP ou enum recebido inexistente', async () => {
  const failure = await liveCloseFailure(1008, 'Invalid field mask: private-secret-transcript');
  assert.equal(failure.diagnostic?.configurationIssue, 'INVALID_FIELD_MASK');
  assert.deepEqual(failure.diagnostic?.invalidFields, ['fieldMask']);
  assert.equal(failure.diagnostic?.upstreamStatus, undefined);
  assert.equal(failure.diagnostic?.upstreamCode, undefined);
  assert.match(failure.message, /configuração/);
  assert.doesNotMatch(JSON.stringify(failure), /private-secret|transcript/);
  const unknown = await liveCloseFailure(1008, 'private-secret-transcript');
  assert.equal(unknown.diagnostic, undefined);
  assert.doesNotMatch(unknown.message, /cota|faturamento|private-secret|transcript/);
});
