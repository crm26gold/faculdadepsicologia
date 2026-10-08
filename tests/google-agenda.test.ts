import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agendaEvents, googleEventId, planSync, saoPauloToday, GOOGLE_AGENDA_SCOPE } from '../src/lib/google-agenda';
import { demoWorkspace } from '../src/lib/workspace';

const today = '2030-01-07'; // Synthetic Monday; no personal data.
const workspace = () => { const data = demoWorkspace(today); data.notes = []; return data; };

test('o escopo alcança só agendas criadas pela Jornada', () => {
  assert.equal(GOOGLE_AGENDA_SCOPE, 'https://www.googleapis.com/auth/calendar.app.created');
});
test('cada item tem um ID fixo no formato do Google, igual em toda atualização', () => {
  const id = googleEventId('task-1');
  assert.match(id, /^[a-v0-9]{5,1024}$/);
  assert.equal(id, googleEventId('task-1'));
  assert.notEqual(id, googleEventId('task-2'));
  const first = agendaEvents(workspace(), today), again = agendaEvents(workspace(), today);
  assert.deepEqual(first.map(event => [event.id, event.hash]), again.map(event => [event.id, event.hash]));
  assert.equal(new Set(first.map(event => event.id)).size, first.length, 'sem IDs repetidos');
});
test('horários seguem São Paulo; sem término, o Google recebe 30 minutos e o aviso', () => {
  const data = workspace();
  data.tasks = [{ ...data.tasks[0], id: 'dentista', title: 'Dentista', date: '2030-01-08', time: '15:00', done: false },
    { ...data.tasks[0], id: 'prazo', title: 'Entregar relatório', date: '2030-01-09', time: undefined, done: true }];
  data.classes = [];
  const [dentist, deadline] = agendaEvents(data, today).toSorted((a, b) => a.date.localeCompare(b.date));
  assert.deepEqual(dentist.body.start, { dateTime: '2030-01-08T18:00:00.000Z', timeZone: 'America/Sao_Paulo' });
  assert.deepEqual(dentist.body.end, { dateTime: '2030-01-08T18:30:00.000Z', timeZone: 'America/Sao_Paulo' });
  assert.match(String(dentist.body.description), /término não informado/);
  assert.deepEqual(deadline.body.start, { date: '2030-01-09' });
  assert.deepEqual(deadline.body.end, { date: '2030-01-10' });
  assert.equal(deadline.body.summary, '✓ Entregar relatório');
  assert.deepEqual((deadline.body.extendedProperties as { private: Record<string, string> }).private, { jornada: deadline.hash, jornadaDate: '2030-01-09' });
  assert.doesNotMatch(JSON.stringify(agendaEvents(data, today)), /notes|content/i, 'anotações não vão para o Google');
  const classes = workspace(); classes.tasks = [];
  const lesson = agendaEvents(classes, today).find(event => (event.body.start as { dateTime?: string }).dateTime && /Aula/.test(String(event.body.description)));
  assert(lesson, 'aulas da grade vão com horário');
  assert(Date.parse((lesson.body.end as { dateTime: string }).dateTime) > Date.parse((lesson.body.start as { dateTime: string }).dateTime));
});
test('janela de uma semana para trás a quatro meses à frente, e mudar o item muda só a marca', () => {
  const data = workspace();
  data.tasks = [{ ...data.tasks[0], id: 'velho', date: '2029-12-01' }, { ...data.tasks[0], id: 'perto', date: '2030-01-01' }, { ...data.tasks[0], id: 'longe', date: '2030-06-01' }];
  data.classes = [];
  assert.deepEqual(agendaEvents(data, today).map(event => event.date), ['2030-01-01']);
  const before = agendaEvents(data, today)[0];
  data.tasks[1] = { ...data.tasks[1], title: 'Outro título' };
  const after = agendaEvents(data, today)[0];
  assert.equal(after.id, before.id); assert.notEqual(after.hash, before.hash);
});
test('o plano insere o que falta, atualiza o que mudou e só remove eventos nossos dentro da janela', () => {
  const desired = [{ id: 'jpa', date: '2030-01-08', hash: 'h1', body: {} }, { id: 'jpb', date: '2030-01-09', hash: 'h2', body: {} }, { id: 'jpc', date: '2030-01-10', hash: 'h3', body: {} }];
  const plan = planSync(desired, [
    { id: 'jpb', hash: 'h2', date: '2030-01-09' }, // igual
    { id: 'jpc', hash: 'velho', date: '2030-01-10' }, // mudou
    { id: 'jpd', hash: 'h4', date: '2030-01-05' }, // saiu da agenda
    { id: 'jpe', hash: 'h5', date: '2029-12-01' }, // passado fora da janela: fica
    { id: 'feito-a-mao' }, // criado pela pessoa no Google: nunca é tocado
  ], '2029-12-31');
  assert.deepEqual(plan.insert.map(event => event.id), ['jpa']);
  assert.deepEqual(plan.update.map(event => event.id), ['jpc']);
  assert.deepEqual(plan.remove, ['jpd']);
});
test('o dia de hoje é o de São Paulo, não o do servidor', () => {
  assert.equal(saoPauloToday(new Date('2030-01-08T02:00:00Z')), '2030-01-07');
  assert.equal(saoPauloToday(new Date('2030-01-08T03:00:00Z')), '2030-01-08');
});
test('uma atualização conversa com o Google na ordem certa, recria a agenda apagada e para quando a conexão foi revogada', async () => {
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, ['--conditions=react-server', '--import', 'tsx', 'tests/fixtures/google-agenda-contract.mjs'], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, APP_MODE: 'private' } });
  assert.equal(child.status, 0, child.stderr || child.error?.message || child.stdout);
});
