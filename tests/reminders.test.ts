import assert from 'node:assert/strict';
import { test } from 'node:test';
import { channelsFor, reminderLink, reminderText, remindSchema, type ClaimedReminder } from '../src/lib/reminders';
import { applyCommands, commandAction } from '../src/lib/commands';
import { demoWorkspace, parseWorkspace } from '../src/lib/workspace';

const claimed = (over: Partial<ClaimedReminder> = {}): ClaimedReminder => ({ id: '6f1c2b0e-1d2a-4c3b-9e8f-0a1b2c3d4e5f', title: 'Dentista', event_at: '2030-01-08T13:00:00.000Z',
  due_at: '2030-01-08T12:45:00.000Z', level: 'insistente', step: 0, telegram: '123', whatsapp: '5511999990000', bridge_online: true,
  push: [{ endpoint: 'https://push.example.invalid/x', p256dh: 'p', auth: 'a' }], ...over });

test('todo aviso sai em todos os canais ligados, em todos os degraus; só canais grátis', () => {
  for (const over of [{}, { step: 1 }, { step: 2 }, { level: 'suave' as const }, { level: 'normal' as const }])
    assert.deepEqual(channelsFor(claimed(over)), ['push', 'telegram', 'whatsapp']);
  assert.deepEqual(channelsFor(claimed({ step: 2, push: [], telegram: null })), ['whatsapp'], 'só os canais ligados');
  assert.deepEqual(channelsFor(claimed({ whatsapp: null })), ['push', 'telegram']);
});
test('a mensagem diz o quê, a hora em São Paulo e quanto falta; repetição avisa que é de novo', () => {
  const now = new Date('2030-01-08T12:45:00.000Z');
  assert.equal(reminderText(claimed(), now), 'Dentista às 10:00 (em 15 minutos)');
  assert.equal(reminderText(claimed({ step: 1 }), new Date('2030-01-08T12:59:30.000Z')), 'De novo: Dentista agora');
  assert.equal(reminderText(claimed({ step: 2 }), new Date('2030-01-08T13:15:00.000Z')), 'De novo: Dentista (era às 10:00)');
  assert.equal(reminderText(claimed({ event_at: '2030-01-09T13:00:00.000Z' }), now), 'Dentista às 10:00 de 9 de jan.');
  assert.equal(reminderText(claimed({ event_at: null }), now), 'Dentista');
  assert.equal(reminderLink('https://jornada.example/', 'abc'), 'https://jornada.example/lembrete?id=abc');
});
test('a pergunta do foco diz quando termina e pede continuar ou pausar', () => {
  const focus = claimed({ focus: true, title: 'Foco: Bases Biológicas', event_at: '2030-01-08T22:10:00.000Z', level: 'normal' });
  assert.equal(reminderText(focus, new Date('2030-01-08T22:05:00.000Z')), 'Foco: Bases Biológicas termina às 19:10 (em 5 minutos). Ainda em foco? Continuar ou pausar?');
  assert.equal(reminderText({ ...focus, step: 1 }, new Date('2030-01-08T22:10:20.000Z')), 'De novo: Foco: Bases Biológicas termina agora. Ainda em foco? Continuar ou pausar?');
  assert.equal(reminderText({ ...focus, event_at: null }, new Date('2030-01-08T22:05:00.000Z')), 'Foco: Bases Biológicas já passa de 1 hora. Ainda em foco? Continuar ou pausar?');
});
test('"me lembra daqui 3 minutos de beber água": o servidor calcula a hora de Brasília e guarda na área certa', () => {
  const data = demoWorkspace('2030-01-07');
  // 14:31:40 em São Paulo: daqui 3 minutos arredonda para 14:35, nunca antes do pedido.
  const now = Date.parse('2030-01-07T17:31:40.000Z');
  const result = applyCommands(data, [{ type: 'compromisso', title: 'Beber água', daqui: 3, kind: 'Tarefa', area: 'Saúde física', remind: { minutes: 0, level: 'normal' } }], { today: '2030-01-07', now });
  const task = result.data.tasks.find(item => item.title === 'Beber água')!;
  assert.equal(task.date, '2030-01-07');
  assert.equal(task.time, '14:35');
  assert.equal(task.areaId, 'health');
  assert.equal(task.kind, 'Tarefa');
  assert.deepEqual(task.remind, { minutes: 0, level: 'normal' });
  const late = applyCommands(data, [{ type: 'compromisso', title: 'Dormir', daqui: 30, remind: { minutes: 0, level: 'suave' } }], { today: '2030-01-07', now: Date.parse('2030-01-08T02:45:00.000Z') });
  assert.deepEqual([late.data.tasks.at(-1)!.date, late.data.tasks.at(-1)!.time], ['2030-01-08', '00:15'], 'às 23:45 de Brasília, daqui 30 minutos já é o dia seguinte');
  assert.equal(commandAction.safeParse({ type: 'compromisso', title: 'Sem dia' }).success, false, 'sem dia nem daqui, recusado');
});
test('"entrei na aula, liga o foco": a aula de hoje dá a matéria e o tempo até o fim', () => {
  const data = demoWorkspace('2030-01-07');
  const monday = { ...data, term: {}, classes: [
    { id: 'c1', subjectId: data.subjects[0].id, weekday: 1, startTime: '18:10', endTime: '19:10', intervalWeeks: 1, location: '', enabled: true },
    { id: 'c2', subjectId: data.subjects[1].id, weekday: 1, startTime: '19:10', endTime: '22:00', intervalWeeks: 1, location: '', enabled: true }] };
  // Segunda, 7 de janeiro de 2030, 18:20 em São Paulo.
  const named = applyCommands(monday, [{ type: 'foco', activity: `Aula de ${data.subjects[1].name}` }], { today: '2030-01-07', now: Date.parse('2030-01-07T21:20:00.000Z') });
  assert.equal(named.data.activeFocus?.subjectId, data.subjects[1].id);
  assert.equal(named.data.activeFocus?.targetSeconds, (22 * 60 - (18 * 60 + 20)) * 60);
  assert.match(named.applied[0].label, /até 22:00, fim da aula/);
  const current = applyCommands(monday, [{ type: 'foco', activity: 'acabei de entrar na aula' }], { today: '2030-01-07', now: Date.parse('2030-01-07T21:20:00.000Z') });
  assert.equal(current.data.activeFocus?.subjectId, data.subjects[0].id, 'a aula que está acontecendo');
  assert.equal(current.data.activeFocus?.targetSeconds, 50 * 60);
  const early = applyCommands(monday, [{ type: 'foco', activity: 'entrei na aula' }], { today: '2030-01-07', now: Date.parse('2030-01-07T22:05:00.000Z') });
  assert.equal(early.data.activeFocus?.subjectId, data.subjects[1].id, 'chegando para a próxima, conta a próxima');
  const free = applyCommands(monday, [{ type: 'foco', activity: 'Ler um livro' }], { today: '2030-01-07', now: Date.parse('2030-01-07T21:20:00.000Z') });
  assert.equal(free.data.activeFocus?.targetSeconds, 0, 'fora de aula, sem duração inventada');
});
test('o aviso aceita só os tempos e intensidades oferecidos; o assistente cria compromisso com aviso', () => {
  assert.equal(remindSchema.safeParse({ minutes: 15, level: 'normal' }).success, true);
  assert.equal(remindSchema.safeParse({ minutes: 7, level: 'normal' }).success, false);
  assert.equal(remindSchema.safeParse({ minutes: 15, level: 'gritando' }).success, false);
  const data = demoWorkspace('2030-01-07');
  const result = applyCommands(data, [{ type: 'compromisso', title: 'Pagar o aluguel', date: '2030-01-08', time: '09:00', remind: { minutes: 0, level: 'insistente' } }], { today: '2030-01-07', now: Date.parse('2030-01-07T12:00:00Z') });
  const task = result.data.tasks.find(item => item.title === 'Pagar o aluguel')!;
  assert.deepEqual(task.remind, { minutes: 0, level: 'insistente' });
  assert.match(result.applied[0].label, /aviso na hora/);
  assert.equal(parseWorkspace(JSON.stringify({ ...data, tasks: [{ ...task, remind: { minutes: 15, level: 'normal' } }] })).tasks[0].remind?.minutes, 15, 'o aviso sobrevive à gravação');
});
