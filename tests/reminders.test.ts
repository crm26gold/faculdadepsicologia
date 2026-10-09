import assert from 'node:assert/strict';
import { test } from 'node:test';
import { channelsFor, reminderLink, reminderText, remindSchema, type ClaimedReminder } from '../src/lib/reminders';
import { applyCommands } from '../src/lib/commands';
import { demoWorkspace, parseWorkspace } from '../src/lib/workspace';

const claimed = (over: Partial<ClaimedReminder> = {}): ClaimedReminder => ({ id: '6f1c2b0e-1d2a-4c3b-9e8f-0a1b2c3d4e5f', title: 'Dentista', event_at: '2030-01-08T13:00:00.000Z',
  due_at: '2030-01-08T12:45:00.000Z', level: 'insistente', step: 0, telegram: '123', whatsapp: '5511999990000', bridge_online: true,
  push: [{ endpoint: 'https://push.example.invalid/x', p256dh: 'p', auth: 'a' }], ...over });

test('a escada: na hora, os canais silenciosos; do segundo aviso em diante, também o WhatsApp; só canais grátis', () => {
  assert.deepEqual(channelsFor(claimed()), ['push', 'telegram']);
  assert.deepEqual(channelsFor(claimed({ step: 1 })), ['push', 'telegram', 'whatsapp']);
  assert.deepEqual(channelsFor(claimed({ step: 2 })), ['push', 'telegram', 'whatsapp']);
  assert.deepEqual(channelsFor(claimed({ level: 'suave' })), ['push', 'telegram', 'whatsapp'], 'suave é a única chance: o WhatsApp entra junto');
  assert.deepEqual(channelsFor(claimed({ step: 2, push: [], telegram: null })), ['whatsapp'], 'só os canais ligados');
  assert.deepEqual(channelsFor(claimed({ step: 1, whatsapp: null })), ['push', 'telegram']);
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
