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
  resources: [resource('api:gemini', 'gemini', ''), resource('c1', 'gemini', 'Gemini', 'connection'), { ...resource('c2', 'groq', 'Jornada Groq', 'connection'), personal_data_ok: true }, resource('api:elevenlabs', 'elevenlabs', '')],
  routes: [route('assistente', ['c2'], ['c1', 'api:gemini']), route('organizar', ['c2'], ['c1', 'api:gemini'])],
  channels: [], whatsapp: { enabled: false, state: 'off', stt: { source_id: 'api:gemini', provider: 'gemini', model: 'auto', state: 'blocked', reason: 'declaration_missing' } },
  mcp_inbound: { owner_tokens: 0, owner_oauth: 1, members_with_access: 0 }, mcp_outbound: [], members: { accounts: 3, with_personal_keys: 0 } });

test('troquei pela Groq: chave do Gemini fora do automático vira uma sugestão calma, não um aviso por tarefa', () => {
  const issues = resourceIssues(ownerMap());
  assert.equal(issues.some(issue => issue.id.startsWith('declaration_missing:')), false, 'nenhuma tarefa está parada');
  assert.equal(issues.some(issue => issue.level === 'warning'), false);
  const idle = issues.find(issue => issue.id === 'idle:gemini')!;
  assert.equal(idle.level, 'info');
  assert.equal(idle.title, 'Google Gemini (AI Studio): 2 chaves paradas, esperando sua decisão');
  assert.match(idle.what, /^Está tudo respondendo: Groq · inferência rápida responde por Conversa do assistente e Organizar registros\./);
  assert.match(idle.what, /transcrição do WhatsApp, hoje desligada/);
  assert.deepEqual(idle.affects, []);
  assert.equal(issues.some(issue => issue.id === 'duplicate:gemini'), false, 'o aviso parado já cobre as duas chaves');
  assert.equal(issues.some(issue => /ElevenLabs/.test(issue.title)), false, '"não faz esta tarefa" não vira problema');
});

test('a sugestão resolve com um toque: liberar com a declaração confirmada, ou deixar de lado pausando', () => {
  const idle = resourceIssues(ownerMap()).find(issue => issue.id === 'idle:gemini')!;
  assert.deepEqual(idle.options.map(option => option.label), ['Tenho faturamento ativo: liberar', 'Ainda não tenho faturamento: deixar de lado', 'Ver as chaves antes']);
  const keys = [{ provider: 'gemini', connection_id: 'c1' }, { provider: 'gemini', connection_id: null }];
  assert.deepEqual(idle.options[0].act, { kind: 'declare', sources: keys, confirm: 'Conferi no Google AI Studio: o projeto destas chaves tem faturamento ativo.' });
  assert.equal(idle.options[0].link?.href, 'https://aistudio.google.com/apikey');
  assert.deepEqual(idle.options[1].act, { kind: 'pause', sources: keys });
  assert.equal(idle.options[2].act, undefined);
  assert.deepEqual(idle.options[2].go, { view: 'connections', target: '[data-provider="gemini"]' });
  // Paused: the automatic mode reports them as disabled, and a pause is a choice, not a problem.
  const paused = ownerMap();
  paused.resources = paused.resources.map(item => item.provider === 'gemini' ? { ...item, enabled: false } : item);
  paused.routes = paused.routes.map(item => ({ ...item, sources: item.sources.map(source => source.state === 'blocked' ? { ...source, reason: 'disabled' as const } : source) }));
  paused.whatsapp!.stt.reason = 'disabled';
  assert.equal(resourceIssues(paused).some(issue => /gemini/i.test(issue.id) || /Gemini/.test(issue.title)), false);
  assert.equal(issueResolved('idle:gemini', paused), true);
});

test('chave escolhida numa rota continua aviso, com declaração em um toque; WhatsApp ligado também', () => {
  const map = ownerMap();
  map.routes[0] = { ...map.routes[0], mode: 'fallback', sources: map.routes[0].sources.map(source => source.source_id === 'c1' ? { ...source, role: 'fallback' as const } : source) };
  map.whatsapp!.enabled = true;
  const issues = resourceIssues(map);
  const reserve = issues.find(issue => issue.id === 'declaration_missing:c1')!;
  assert.deepEqual(reserve.affects, ['Conversa do assistente']);
  assert.match(reserve.title, /aguardando sua declaração de privacidade/);
  assert.deepEqual(reserve.options[0].act, { kind: 'declare', sources: [{ provider: 'gemini', connection_id: 'c1' }], confirm: 'Conferi no Google AI Studio: o projeto desta chave tem faturamento ativo.' });
  const whatsapp = issues.find(issue => issue.id === 'declaration_missing:api:gemini')!;
  assert.equal(whatsapp.level, 'warning');
  assert.deepEqual(whatsapp.affects, ['Transcrição do WhatsApp']);
  assert.equal(issues.some(issue => issue.id === 'idle:gemini'), false, 'as duas chaves já aparecem nos avisos delas');
});

test('tarefa sem IA vira o primeiro aviso e oferece, em um toque, a chave que já funciona; resolvido some', () => {
  const map = ownerMap();
  map.routes[0] = { ...map.routes[0], chain: [], sources: map.routes[0].sources.filter(source => source.state !== 'active') };
  const issues = resourceIssues(map);
  assert.equal(issues[0].id, 'empty:assistente');
  assert.equal(issues[0].level, 'warning');
  assert.equal(issues[0].options[0].label, 'Usar Jornada Groq · Groq · inferência rápida agora');
  assert.deepEqual(issues[0].options[0].act, { kind: 'route', tasks: ['assistente'], provider: 'groq', connection_id: 'c2' });
  assert.equal(issues.find(issue => issue.id === 'declaration_missing:api:gemini')?.level, 'warning', 'sem resposta, a chave parada volta a ser aviso');
  const fixed = ownerMap();
  fixed.routes = fixed.routes.map(item => ({ ...item, sources: item.sources.filter(source => source.source_id !== 'api:gemini') }));
  fixed.whatsapp = null;
  assert.equal(issueResolved('idle:gemini', fixed), false, 'a outra chave segue parada');
  fixed.routes = fixed.routes.map(item => ({ ...item, sources: item.sources.filter(source => source.source_id !== 'c1') }));
  assert.equal(issueResolved('idle:gemini', fixed), true);
});

test('queda de IA vira aviso com quem assumiu e como resolver; depois de corrigir, Conferir não espera 24 horas', () => {
  const map = ownerMap();
  map.failures = [{ provider: 'gemini', kind: 'rate_limit', count: 3, last_at: '2026-10-07T23:10:00.123456+00:00', served: 'groq', tasks: ['assistente', 'transcricao'] },
    { provider: 'deepseek', kind: 'billing', count: 1, last_at: '2026-10-07T20:00:00+00:00', served: null, tasks: ['assistente'] }];
  const issues = resourceIssues(map);
  const google = issues.find(issue => issue.id === 'failure:gemini:rate_limit')!;
  assert.equal(google.title, 'Google Gemini (AI Studio) falhou 3 vezes nas últimas 24 horas');
  assert.equal(google.what, 'Groq · inferência rápida assumiu e a conversa seguiu.');
  assert.deepEqual(google.affects, ['Conversa do assistente', 'Transcrição de áudio']);
  assert.deepEqual(google.options.map(option => option.label), ['Trocar ou conferir a chave', 'Pôr outra IA na sequência', 'Ativar ou recarregar o plano pago']);
  assert.match(issues.find(issue => issue.id === 'failure:deepseek:billing')!.what, /Nenhuma outra conexão assumiu/);
  assert.equal(issueResolved('failure:gemini:rate_limit', map, '2026-10-07T23:30:00.000Z'), true, 'nada falhou depois que comecei a resolver');
  assert.equal(issueResolved('failure:gemini:rate_limit', map, '2026-10-07T23:00:00.000Z'), false, 'falhou de novo depois');
});
