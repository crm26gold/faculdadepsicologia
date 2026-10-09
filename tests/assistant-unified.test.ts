import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { assistantRules, compromissoFormat, controlarFocoFormat, focoFormat } from '../src/lib/assistant-rules';
import { applyCommands, commandAction, commandSystem, completeFromRequest, requestHints, type CommandAction } from '../src/lib/commands';
import { voiceSystem, voiceTools } from '../src/lib/voice/protocol';
import { executeAssistantJob, type ExecutionStore } from '../src/lib/assistant-execution';
import type { JobOutcome } from '../src/lib/assistant-jobs';
import { saoPauloMoment, reminderText, focusStopLink } from '../src/lib/reminders';
import { finishFocusAt, startFocus } from '../src/lib/focus';
import { demoWorkspace, type Workspace } from '../src/lib/workspace';

const empty = pathToFileURL(`${process.cwd()}/node_modules/server-only/empty.js`).href;
registerHooks({ resolve: (specifier, context, next) => specifier === 'server-only' ? { url: empty, shortCircuit: true } : next(specifier, context) });
process.env.AI_KEYS_SECRET ??= randomBytes(32).toString('base64');
process.env.APP_ORIGIN ??= 'https://jornada.example';

// O caso real de 09/10/2026: a voz ao vivo montou a ação sozinha, sem aviso e com a hora calculada por ela.
const said = 'Me lembra de tomar água daqui três minutos.';
const voiceProposal = (today: string): CommandAction => ({ type: 'compromisso', title: 'Tomar água', date: today, time: '12:15' });

test('uma regra só: texto, voz e MCP recebem as mesmas regras de lembrete, categoria e foco', async () => {
  const { mcpInstructions } = await import('../src/lib/mcp/server');
  const voiceCatalog = (voiceTools[0].functionDeclarations.find(tool => tool.name === 'organizar_jornada')!.parameters!.properties as unknown as Record<string, { description: string }>).actions_json.description;
  for (const rule of assistantRules) {
    assert.ok(commandSystem.includes(rule), 'assistente de texto, Telegram e WhatsApp');
    assert.ok(voiceSystem.includes(rule), 'voz ao vivo');
    assert.ok(mcpInstructions.includes(rule), 'assistentes conectados pelo MCP');
  }
  for (const format of [compromissoFormat, focoFormat, controlarFocoFormat]) {
    assert.ok(commandSystem.includes(format));
    assert.ok(voiceCatalog.includes(format), 'o catálogo da voz usa o mesmo formato (foi aqui que faltou o remind)');
  }
  assert.match(voiceCatalog, /"remind"/);
  assert.match(voiceCatalog, /"daqui"/);
  // Todo tipo de ação validado pelo motor aparece nas instruções do texto.
  for (const option of commandAction.options) assert.ok(commandSystem.includes(`"type":"${option.shape.type.value}"`), option.shape.type.value);
});

test('rede de segurança: as palavras da pessoa garantem o aviso e a hora do servidor', () => {
  assert.deepEqual(requestHints(said), { remind: 'normal', daqui: 3 });
  assert.deepEqual(requestHints('Não me deixa esquecer de pagar o aluguel amanhã'), { remind: 'insistente', daqui: undefined });
  assert.deepEqual(requestHints('me avisa só uma vez às 9'), { remind: 'suave', daqui: undefined });
  assert.deepEqual(requestHints('daqui meia hora me lembra do forno'), { remind: 'normal', daqui: 30 });
  assert.deepEqual(requestHints('daqui 2 horas, reunião'), { remind: undefined, daqui: 120 });
  assert.equal(requestHints('anota que comprei pão'), null);
  const today = '2026-10-09';
  const [completed] = completeFromRequest([voiceProposal(today)], said, today);
  assert.deepEqual(completed, { type: 'compromisso', title: 'Tomar água', daqui: 3, remind: { minutes: 0, level: 'normal' } });
  // Só completa o que um modelo já decidiu criar; nunca cria nada.
  assert.deepEqual(completeFromRequest([], 'isso me lembra minha avó', today), []);
  const note: CommandAction = { type: 'anotacao', text: 'Lembrança da avó' };
  assert.deepEqual(completeFromRequest([note], 'isso me lembra minha avó', today), [note]);
  // Dois compromissos no mesmo pedido: não adivinha qual.
  const two: CommandAction[] = [voiceProposal(today), { type: 'compromisso', title: 'Outro', date: today }];
  assert.deepEqual(completeFromRequest(two, said, today), two);
  // O que o modelo já disse fica: intensidade e outro dia.
  const chosen: CommandAction = { type: 'compromisso', title: 'Prova', date: '2026-10-12', remind: { minutes: 60, level: 'insistente' } };
  assert.deepEqual(completeFromRequest([chosen], 'me lembra da prova', today), [chosen]);
});

/** Os campos que importam de um compromisso salvo; a hora com tolerância de 1 minuto (o relógio avança entre portas). */
const saved = (data: Workspace, title: string) => { const { id: _id, ...rest } = data.tasks.find(task => task.title === title)!; return rest; };
const minutes = (time?: string) => time ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : -1;

test('mesma frase, mesmo resultado: texto no app, voz ao vivo e MCP gravam o mesmo compromisso', async () => {
  const now = Date.now(), today = saoPauloMoment(now).date;
  const base = demoWorkspace(today);
  // Texto no app (e Telegram/WhatsApp, que chamam applyCommands do mesmo jeito, com a frase).
  const text = saved(applyCommands(base, [voiceProposal(today)], { today, now, said }).data, 'Tomar água');
  // Voz ao vivo: a ação estruturada vai ao servidor junto com a frase ouvida.
  let voiceData: Workspace = base;
  const store: ExecutionStore = {
    claim: async () => voiceData === base ? { input: { message: 'Criar compromisso tomar água', today, actions: [voiceProposal(today)], said } } : null,
    load: async () => ({ data: voiceData, revision: 1 }),
    plan: async () => { throw new Error('a voz já trouxe a ação'); },
    commit: async (next: Workspace | null, _revision: number, _outcome: JobOutcome) => { if (next) voiceData = next; return { conflict: false }; },
    fail: async () => { throw new Error('não deveria falhar'); },
  };
  await executeAssistantJob(store);
  const voice = saved(voiceData, 'Tomar água');
  // MCP: o assistente de fora manda a mesma ação e, em pedido, as palavras da pessoa.
  const { jornadaMcpHandler, mcpAuthenticate } = await import('../src/lib/mcp/server');
  let mcpData: unknown = base;
  const db = { rpc: async (name: string, args: Record<string, unknown>) => {
    if (name === 'mcp_auth') return { data: { token_id: 't', can_write: true }, error: null };
    if (name === 'mcp_context') return { data: { can_write: true, workspace: { data: mcpData, revision: 1 } }, error: null };
    if (name === 'mcp_commit') { mcpData = args.next_data; const outcome = args.outcome as JobOutcome; return { data: { ...outcome, conversation_id: null }, error: null }; }
    return { data: null, error: { code: 'XX' } };
  } };
  const access = await mcpAuthenticate(db as never, 'Bearer jp_teste_chave_pessoal_0123456789abcdef');
  await jornadaMcpHandler(db as never, access).fetch(new Request('https://jornada.example/api/mcp', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25', Authorization: 'Bearer jp_teste_chave_pessoal_0123456789abcdef' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'registrar_na_jornada', arguments: { acoes: [voiceProposal(today)], pedido: said } } }) }));
  const mcp = saved(mcpData as Workspace, 'Tomar água');
  for (const [name, result] of Object.entries({ text, voice, mcp })) {
    assert.deepEqual(result.remind, { minutes: 0, level: 'normal' }, `${name}: com aviso`);
    assert.notEqual(result.time, '12:15', `${name}: a hora é do servidor, não do modelo`);
    assert.ok(Math.abs(minutes(result.time) - minutes(text.time)) <= 1, `${name}: mesma hora`);
    assert.deepEqual({ ...result, time: undefined }, { ...text, time: undefined }, `${name}: mesmo compromisso`);
  }
});

test('"esqueci o foco ligado": encerra no horário dito, conta só até ali e recusa horário impossível', () => {
  const day = '2026-10-09';
  const start = Date.parse('2026-10-09T21:10:00.000Z'); // 18:10 em São Paulo
  const running = startFocus(demoWorkspace(day), { id: 'f1', now: start, activity: 'Comunicação e Expressão' });
  const now = Date.parse('2026-10-09T23:40:00.000Z'); // 20:40
  const ended = applyCommands(running, [{ type: 'controlar_foco', operation: 'encerrar', end: '19:10' }], { today: day, now });
  assert.equal(ended.data.activeFocus, null);
  assert.equal(Math.round(ended.data.sessions.find(item => item.focusId === 'f1')!.minutes), 60, 'das 18:10 às 19:10');
  assert.match(ended.applied[0].label, /Foco encerrado às 19:10/);
  assert.equal(applyCommands(running, [{ type: 'controlar_foco', operation: 'encerrar', end: '17:00' }], { today: day, now }).failed.length, 1, 'antes de começar');
  assert.equal(applyCommands(running, [{ type: 'controlar_foco', operation: 'pausar', end: '19:10' }], { today: day, now }).failed.length, 1, 'horário só para encerrar');
  assert.throws(() => finishFocusAt(running, now + 60_000, now), /ainda não chegou/);
});

test('foco esquecido: a mensagem e o botão encerram no fim do tempo, daquele foco', () => {
  const forgotten = { title: 'Foco: Bases Biológicas', event_at: '2026-10-09T22:10:00.000Z', step: 0, forgotten: true, focus_id: 'f1' };
  assert.equal(reminderText(forgotten, new Date('2026-10-09T22:40:00.000Z')), 'Foco: Bases Biológicas continua ligado; o tempo dele acabou às 19:10. Esqueceu? Encerrar às 19:10 ou continuar?');
  assert.equal(reminderText({ ...forgotten, event_at: null }), 'Foco: Bases Biológicas continua ligado há mais de 3 horas. Esqueceu? Encerrar agora ou continuar?');
  assert.equal(focusStopLink('https://jornada.example/', forgotten), `https://jornada.example/?foco=encerrar&id=f1&fim=${Date.parse(forgotten.event_at)}`);
});
