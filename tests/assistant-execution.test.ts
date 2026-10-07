import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeAssistantJob, type ExecutionStore } from '../src/lib/assistant-execution';
import { jobInputSchema, type JobOutcome } from '../src/lib/assistant-jobs';
import { voiceActionRequest } from '../src/lib/voice/actions';
import { emptyWorkspace } from '../src/lib/workspace';
import { elevenLabsTools } from '../src/lib/voice/elevenlabs-protocol';
import { xaiClientSetup } from '../src/lib/voice/xai-protocol';
import { voiceTools } from '../src/lib/voice/protocol';
import type { CommandAction } from '../src/lib/commands';

const appointment: CommandAction = { type: 'compromisso', title: 'Dentista', date: '2026-10-06', time: '15:00' };
function fixture(input: unknown) {
  const state = { data: emptyWorkspace(), revision: 1, done: false, planned: 0, commits: 0, loads: 0,
    conflicts: 0, receipt: null as JobOutcome | null, failure: null as JobOutcome | null };
  const store: ExecutionStore = {
    claim: async () => state.done ? null : { input },
    load: async () => { state.loads++; return { data: state.data, revision: state.revision }; },
    plan: async () => { state.planned++; return { actions: [appointment], reply: 'Uma promessa sem comprovante', model: 'synthetic-model' }; },
    commit: async (next, revision, outcome) => {
      state.commits++;
      if (state.conflicts-- > 0) { state.data = { ...state.data, notes: [{ id: 'concurrent', title: 'Anotação concorrente', content: 'preservar', subjectId: '', updatedAt: new Date().toISOString() }] }; state.revision++; return { conflict: true }; }
      assert.equal(revision, state.revision);
      if (next) { state.data = next; state.revision++; }
      state.receipt = outcome; state.done = true; return { conflict: false };
    },
    fail: async outcome => { state.failure = outcome; },
  };
  return { state, store };
}
const input = (actions?: unknown) => ({ message: 'Agende o dentista', today: '2026-10-05', ...(actions ? { actions } : {}) });

test('ação estruturada salva e publica comprovante sem chamar o planejador; replay não duplica', async () => {
  const { state, store } = fixture(input([appointment]));
  store.plan = async () => { throw new Error('API sem créditos: este caminho nunca deve chamá-la'); };
  await executeAssistantJob(store);
  assert.equal(state.failure, null);
  assert.equal(state.data.tasks.length, 1);
  assert.equal(state.receipt?.saved, true);
  assert.equal(state.receipt?.execution, 'structured');
  assert.equal(state.receipt?.model, undefined);
  await executeAssistantJob(store);
  assert.equal(state.commits, 1);
  assert.equal(state.data.tasks.length, 1);
});

test('pedido antigo continua passando pelo planejador uma vez e usa resumo real', async () => {
  const { state, store } = fixture(input());
  await executeAssistantJob(store);
  assert.equal(state.planned, 1);
  assert.equal(state.receipt?.execution, 'planned');
  assert.equal(state.receipt?.model, 'synthetic-model');
  assert.doesNotMatch(state.receipt!.reply, /promessa/);
});

test('conflito relê os dados, preserva escrita concorrente e não interpreta novamente', async () => {
  for (const actions of [undefined, [appointment]]) {
    const { state, store } = fixture(input(actions)); state.conflicts = 1;
    await executeAssistantJob(store);
    assert.equal(state.loads, 2);
    assert.equal(state.commits, 2);
    assert.equal(state.planned, actions ? 0 : 1);
    assert.equal(state.data.tasks.length, 1);
    assert.equal(state.data.notes[0].id, 'concurrent');
    assert.equal(state.receipt?.saved, true);
  }
});

test('exclusão estruturada não aceita confirmação fornecida pelo modelo', async () => {
  const { state, store } = fixture(input([{ type: 'excluir', entity: 'compromisso', target: 'existing', confirmed: true }]));
  state.data.tasks.push({ id: 'existing', title: 'Dentista', date: '2026-10-06', kind: 'Compromisso', subjectId: '', done: false, minutes: 30 });
  await executeAssistantJob(store);
  assert.equal(state.data.tasks.length, 1);
  assert.equal(state.receipt?.applied.length, 0);
  assert.equal(state.receipt?.pending.length, 1);
  assert.equal(state.planned, 0);
});

test('lote inválido não aplica parte válida nem faz fallback para API', async () => {
  const { state, store } = fixture(input([appointment, { type: 'financeiro', amount: -10 }]));
  await executeAssistantJob(store);
  assert.equal(state.commits, 0);
  assert.equal(state.planned, 0);
  assert.equal(state.data.tasks.length, 0);
  assert.equal(state.failure?.saved, false);
});

test('falha de commit e conflito repetido nunca anunciam salvamento', async () => {
  const first = fixture(input([appointment])); first.store.commit = async () => { throw new Error('Banco indisponível'); };
  await executeAssistantJob(first.store);
  assert.equal(first.state.receipt, null);
  assert.equal(first.state.failure?.saved, false);
  const second = fixture(input([appointment])); second.state.conflicts = 2;
  await executeAssistantJob(second.store);
  assert.equal(second.state.commits, 2);
  assert.equal(second.state.receipt, null);
  assert.equal(second.state.failure?.saved, false);
});

test('voz valida JSON e rejeita vazio, truncado, grande ou mais de oito ações', () => {
  const request = voiceActionRequest({ instruction: 'Agende', actions_json: JSON.stringify([appointment]) });
  assert.deepEqual(request.actions, [appointment]);
  assert.equal(voiceActionRequest({ instruction: 'Agende' }).actions, undefined);
  for (const actions_json of ['[]', '{', 'x'.repeat(120001), JSON.stringify(Array(9).fill(appointment)), JSON.stringify([{ type: 'compromisso', title: 'Sem data' }])]) {
    assert.throws(() => voiceActionRequest({ instruction: 'Agende', actions_json }), /Nenhuma alteração/);
  }
  assert.equal(jobInputSchema.safeParse(input([])).success, false);
});

test('mesmo contrato opcional é oferecido por Gemini, ElevenLabs e xAI', () => {
  const gemini = voiceTools[0].functionDeclarations.find(tool => tool.name === 'organizar_jornada')!;
  assert.ok('parameters' in gemini && gemini.parameters);
  assert.deepEqual(gemini.parameters.required, ['instruction']);
  assert.equal(gemini.parameters.properties.actions_json!.type, 'STRING');
  const eleven = elevenLabsTools().find(tool => tool.name === 'organizar_jornada')!;
  assert.equal(eleven.parameters!.properties.actions_json.type, 'string');
  const xai = xaiClientSetup('').session.tools.find(tool => tool.name === 'organizar_jornada')!;
  assert.equal(xai.parameters.properties!.actions_json.type, 'string');
});

test('parte coletiva roda uma vez mesmo com conflito, e exclusão vira pedido de confirmação', async () => {
  const post: CommandAction = { type: 'coletivo', area: 'salas', acao: { action: 'create_post', space: '00000000-0000-4000-8000-0000000000b1', kind: 'announcement', title: 'Prova sexta' } };
  const removal: CommandAction = { type: 'coletivo', area: 'salas', acao: { action: 'delete_post', post: '00000000-0000-4000-8000-0000000000c1' } };
  const { state, store } = fixture(input([appointment, post, removal])); state.conflicts = 1;
  const calls: unknown[][] = [];
  store.shared = async actions => { calls.push(actions); return { done: ['Publicado no mural: Prova sexta'], failed: [],
    pending: [{ action: { type: 'excluir_coletivo', fn: 'delete_post', target: '00000000-0000-4000-8000-0000000000c1' }, fingerprint: '{}', label: 'Excluir publicação: Aviso (Grupo 1)' }] }; };
  await executeAssistantJob(store);
  assert.equal(calls.length, 1, 'efeitos fora do espaço pessoal não se repetem no conflito');
  assert.deepEqual(calls[0].map(item => (item as { acao: { action: string } }).acao.action), ['create_post', 'delete_post']);
  assert.equal(state.data.tasks.length, 1, 'a parte pessoal segue pelo motor de sempre');
  assert.deepEqual(state.receipt?.shared, ['Publicado no mural: Prova sexta']);
  assert.deepEqual(state.receipt?.pending.map(item => item.label), ['Excluir publicação: Aviso (Grupo 1)']);
  assert.match(state.receipt!.reply, /^Feito: Publicado no mural: Prova sexta\. Guardei para você confirmar no aplicativo: Excluir publicação: Aviso \(Grupo 1\)\. Feito\. /);
});

test('canal sem parte coletiva relata o limite e não inventa execução', async () => {
  const post: CommandAction = { type: 'coletivo', area: 'contatos', acao: { action: 'save', contact: null, name: 'Bia' } };
  const { state, store } = fixture(input([post]));
  await executeAssistantJob(store);
  assert.equal(state.receipt?.applied.length, 0);
  assert.match(state.receipt!.failed[0], /não estão disponíveis neste canal/);
  assert.equal(state.receipt?.shared, undefined);
});

test('"me mande um print" abre a tela no app depois de salvar o resto', async () => {
  const shot: CommandAction = { type: 'mostrar_tela', tela: 'financas' };
  const balance: CommandAction = { type: 'saldo_inicial', amount: 100 };
  const { state, store } = fixture(input([balance, shot]));
  await executeAssistantJob(store);
  assert.deepEqual(state.data.finance, { openingCents: 10000, openingDate: '2026-10-05' });
  assert.equal(state.receipt?.show, 'finances');
  assert.match(state.receipt!.reply, /Abri Finanças para você ver\.$/);
  assert.equal(state.receipt?.failed.length, 0, 'mostrar uma tela não é tratado como alteração');
});

test('no assistente do app e na voz, excluir com a lixeira é direto e "restaura" traz de volta', async () => {
  const removal: CommandAction = { type: 'excluir', entity: 'compromisso', target: 'Dentista' };
  const { state, store } = fixture(input([appointment]));
  await executeAssistantJob(store);
  const second = fixture(input([removal]));
  second.state.data = state.data; second.state.revision = state.revision;
  let reads = 0;
  second.store.trash = async () => { reads++; return []; };
  await executeAssistantJob(second.store);
  assert.equal(reads, 1, 'a lixeira é lida uma vez por pedido');
  assert.deepEqual([second.state.data.tasks.length, second.state.receipt?.pending.length], [0, 0]);
  const third = fixture(input([{ type: 'restaurar', target: 'Dentista' }]));
  third.state.data = second.state.data; third.state.revision = second.state.revision;
  third.store.trash = async () => [{ id: 'lx-1', collection: 'tasks', item_id: state.data.tasks[0].id, item: state.data.tasks[0] as never, deleted_at: '2026-10-05T10:00:00Z' }];
  await executeAssistantJob(third.store);
  assert.equal(third.state.data.tasks[0].title, 'Dentista');
  assert.match(third.state.receipt!.reply, /Restaurado: Dentista/);
});
