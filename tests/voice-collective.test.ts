import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectiveReadResult, collectiveReadUrl } from '../src/lib/voice/collective-read';
import { voiceTools } from '../src/lib/voice/protocol';

test('a voz lê a parte coletiva pelas rotas das telas', () => {
  const id = '00000000-0000-4000-8000-0000000000b1';
  assert.equal(collectiveReadUrl({ o_que: 'inicio' }), '/api/me');
  assert.equal(collectiveReadUrl({ o_que: 'sala', id }), `/api/spaces?id=${id}`);
  assert.equal(collectiveReadUrl({ o_que: 'trabalho', id }), `/api/work?id=${id}`);
  assert.equal(collectiveReadUrl({ o_que: 'recursos' }), '/api/ai/resources');
  assert.throws(() => collectiveReadUrl({ o_que: 'sala' }), /Informe o ID/);
  assert.throws(() => collectiveReadUrl({ o_que: 'sala', id: '../admin' }), /inválida/);
  assert.throws(() => collectiveReadUrl({ o_que: 'chaves' }), /inválida/);
  assert.deepEqual(collectiveReadResult('/api/me', { account: { email: 'eu@example.invalid' }, spaces: [1], my_parts: [], to_review: [] }), { spaces: [1], my_parts: [], to_review: [] });
  const names = voiceTools[0].functionDeclarations.map(tool => tool.name);
  assert.ok(names.includes('consultar_coletivo'));
});
