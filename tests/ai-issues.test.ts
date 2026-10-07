import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueResolved, resourceIssues } from '../src/lib/ai/issues';
import type { AiResource, AiResourceMap, AiRouteMap } from '../src/lib/ai/resources';

const resource = (source_id: string, provider: AiResource['provider'], label: string, kind: AiResource['kind'] = 'api'): AiResource => ({ source_id, kind, provider,
  connection_id: kind === 'connection' ? source_id : null, label, configured: true, enabled: true, key_hint: 'abcd', updated_at: '2026-10-07T10:00:00Z', personal_data_ok: false,
  declaration: { privacy_basis: null, audience: null, current: false } });
const route = (task: AiRouteMap['task'], chain: string[], blocked: string[]): AiRouteMap => ({ task, enabled: true, mode: 'auto', provider: null, model: 'auto:rapido', routing_effective: null,
  chain: chain.map(source_id => ({ source_id, provider: 'groq', model: 'auto:rapido', source: 'owner' })), configured_chain: [], members_chain: [], members_note: 'base_off',
  sources: [...chain.map(source_id => ({ source_id, state: 'active' as const })), ...blocked.map(source_id => ({ source_id, state: 'blocked' as const, role: 'auto' as const, reason: 'declaration_missing' as const })),
    { source_id: 'api:elevenlabs', state: 'incapable', reason: 'capability' }] });
// The owner's map on 2026-10-07: two Gemini keys idle without a privacy declaration, Groq answering.
const ownerMap = (): AiResourceMap => ({ version: 1, generated_at: '2026-10-07T16:06:00Z', base_enabled: false,
  resources: [resource('api:gemini', 'gemini', ''), resource('c1', 'gemini', 'Gemini', 'connection'), resource('c2', 'groq', 'Jornada Groq', 'connection'), resource('api:elevenlabs', 'elevenlabs', '')],
  routes: [route('assistente', ['c2'], ['c1', 'api:gemini']), route('organizar', ['c2'], ['c1', 'api:gemini'])],
  channels: [], whatsapp: { enabled: false, state: 'off', stt: { source_id: 'api:gemini', provider: 'gemini', model: 'auto', state: 'blocked', reason: 'declaration_missing' } },
  mcp_inbound: { owner_tokens: 0, owner_oauth: 1, members_with_access: 0 }, mcp_outbound: [], members: { accounts: 3, with_personal_keys: 0 } });

test('o mesmo problema aparece uma vez, com as tarefas que ele afeta, em vez de um aviso por tarefa', () => {
  const issues = resourceIssues(ownerMap());
  const main = issues.find(issue => issue.id === 'declaration_missing:api:gemini')!;
  assert.ok(main);
  assert.deepEqual(main.affects, ['Conversa do assistente', 'Organizar registros', 'Transcrição do WhatsApp']);
  assert.match(main.title, /aguardando sua declaração de privacidade/);
  assert.match(main.why, /faturamento ativo/);
  assert.equal(issues.filter(issue => issue.id.startsWith('declaration_missing:')).length, 2, 'uma por chave do Gemini');
  assert.equal(issues.some(issue => /ElevenLabs/.test(issue.title)), false, '"não faz esta tarefa" não vira problema');
});

test('cada problema traz opções que levam ao lugar certo, com o passo a passo', () => {
  const [first] = resourceIssues(ownerMap()).filter(issue => issue.id === 'declaration_missing:api:gemini');
  assert.deepEqual(first.options.map(option => option.label), ['Meu projeto Google tem faturamento ativo', 'Não tenho faturamento: usar outra conexão', 'Não vou usar esta chave']);
  assert.deepEqual(first.options[0].go, { view: 'resources', target: '[data-source="api:gemini"]' });
  assert.equal(first.options[0].link?.href, 'https://aistudio.google.com/apikey');
  assert.deepEqual(first.options[1].go, { view: 'tasks', target: '[data-task="assistente"]' });
  assert.deepEqual(first.options[2].go, { view: 'connections', target: '[data-provider="gemini"]' });
});

test('duas chaves da mesma empresa viram uma dica; tarefa sem IA vira o primeiro aviso; resolvido some', () => {
  const map = ownerMap();
  assert.match(resourceIssues(map).find(issue => issue.id === 'duplicate:gemini')!.title, /2 chaves de Google Gemini/);
  map.routes[0] = { ...map.routes[0], chain: [], sources: map.routes[0].sources.filter(source => source.state !== 'active') };
  const issues = resourceIssues(map);
  assert.equal(issues[0].id, 'empty:assistente');
  assert.equal(issues[0].level, 'warning');
  const fixed = ownerMap();
  fixed.routes = fixed.routes.map(item => ({ ...item, sources: item.sources.filter(source => source.source_id !== 'api:gemini') }));
  fixed.whatsapp = null;
  assert.equal(issueResolved('declaration_missing:api:gemini', fixed), true);
  assert.equal(issueResolved('declaration_missing:c1', fixed), false);
});
