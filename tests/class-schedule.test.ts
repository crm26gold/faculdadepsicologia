import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertClass } from '../src/lib/class-schedule';
import { emptyWorkspace, type ClassSession } from '../src/lib/workspace';

const subject = { id: 'subject', name: 'Matéria de teste', semester: 1, color: 'sage' as const };
const session: ClassSession = { id: 'class', subjectId: subject.id, weekday: 1, startTime: '19:10', intervalWeeks: 1, location: '', enabled: true };

test('cria o primeiro horário sem inventar término ou primeira data', () => {
  const previous = { ...emptyWorkspace(), subjects: [subject] };
  const next = upsertClass(previous, session);
  assert.equal(previous.classes.length, 0);
  assert.deepEqual(next.classes, [session]);
  assert.equal(next.classes[0].endTime, undefined);
  assert.equal(next.classes[0].firstDate, undefined);
});

test('edição preserva identificador e outros horários sem duplicar', () => {
  const previous = { ...emptyWorkspace(), subjects: [subject], classes: [session, { ...session, id: 'other', weekday: 2 }] };
  const next = upsertClass(previous, { ...session, startTime: '18:10', enabled: false });
  assert.equal(next.classes.length, 2);
  assert.equal(next.classes[0].id, session.id);
  assert.equal(next.classes[0].enabled, false);
  assert.deepEqual(next.classes[1], previous.classes[1]);
  assert.equal(previous.classes[0].startTime, '19:10');
});

test('rejeita matéria inexistente e horário de término inválido', () => {
  assert.throws(() => upsertClass(emptyWorkspace(), session));
  assert.throws(() => upsertClass({ ...emptyWorkspace(), subjects: [subject] }, { ...session, endTime: '18:00' }));
});

test('recorrência permite data pendente, mas rejeita âncora de outro dia', () => {
  const previous = { ...emptyWorkspace(), subjects: [subject] };
  assert.equal(upsertClass(previous, { ...session, intervalWeeks: 3 }).classes[0].firstDate, undefined);
  assert.throws(() => upsertClass(previous, { ...session, firstDate: '2026-09-22' }));
  assert.equal(upsertClass(previous, { ...session, firstDate: '2026-09-21' }).classes[0].firstDate, '2026-09-21');
});

test('respeita limite sem impedir edição de uma grade já cheia', () => {
  const previous = { ...emptyWorkspace(), subjects: [subject], classes: Array.from({ length: 300 }, (_, index) => ({ ...session, id: String(index) })) };
  assert.throws(() => upsertClass(previous, session));
  assert.equal(upsertClass(previous, { ...session, id: '0', startTime: '18:00' }).classes.length, 300);
});
