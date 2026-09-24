import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarEntries, classOccurs, monthDays, shiftMonth, studySuggestions, weekDays } from '../src/lib/academic';
import { calendarIcs, saoPauloInstant } from '../src/lib/calendar-export';
import { classSchema, demoWorkspace, emptyWorkspace, termSchema } from '../src/lib/workspace';

const today = '2030-01-07'; // Synthetic Monday; no personal timetable is used.
function calendarWorkspace() {
  const data = demoWorkspace(today);
  data.tasks = [];
  data.notes = [];
  return data;
}

test('calendário privado vazio não recebe aulas nem sugestões automaticamente', () => {
  const data = emptyWorkspace();
  assert.deepEqual(calendarEntries(data, today, '2030-02-01'), []);
  assert.deepEqual(studySuggestions(data, today), []);
  assert.deepEqual(data, emptyWorkspace());
});

test('recorrência de três semanas exige âncora e respeita período e desativação', () => {
  const session = calendarWorkspace().classes[2];
  assert.equal(classOccurs(session, '2030-01-11', {}), false);
  const anchored = { ...session, firstDate: '2030-01-11' };
  assert.equal(classOccurs(anchored, '2030-01-11', {}), true);
  assert.equal(classOccurs(anchored, '2030-02-01', {}), true);
  for (const day of ['2029-12-21', '2030-01-18', '2030-01-25', '2030-02-02']) assert.equal(classOccurs(anchored, day, {}), false);
  assert.equal(classOccurs(anchored, '2030-02-01', { end: '2030-01-31' }), false);
  assert.equal(classOccurs(anchored, '2030-01-11', { start: '2030-01-12' }), false);
  assert.equal(classOccurs(anchored, '2030-02-01', { start: '2030-02-01', end: '2030-02-01' }), true);
  assert.equal(classOccurs({ ...anchored, enabled: false }, '2030-01-11', {}), false);
  assert.equal(session.firstDate, undefined);
});

test('aula semanal dispensa âncora mas respeita uma primeira data explícita', () => {
  const session = calendarWorkspace().classes[0];
  assert.equal(classOccurs(session, today, {}), true);
  assert.equal(classOccurs(session, '2030-01-08', {}), false);
  assert.equal(classOccurs({ ...session, firstDate: '2030-01-14' }, today, {}), false);
  assert.equal(classOccurs({ ...session, firstDate: '2030-01-14' }, '2030-01-14', {}), true);
});

test('validação de horários, datas da recorrência e período letivo', () => {
  const session = calendarWorkspace().classes[0];
  for (const override of [
    { startTime: '25:00' }, { startTime: '18:60' }, { endTime: '17:00' }, { endTime: '18:00' },
    { firstDate: '2030-01-08' }, { intervalWeeks: 0 }, { intervalWeeks: 13 }, { weekday: 7 },
  ]) assert.equal(classSchema.safeParse({ ...session, ...override }).success, false);
  assert.equal(termSchema.safeParse({ start: '2030-02-01', end: today }).success, false);
  assert.equal(termSchema.safeParse({ start: today, end: today }).success, true);
  assert.equal(classSchema.safeParse({ ...session, endTime: '19:00', firstDate: today }).success, true);
});

test('mês, semana e virada de ano mantêm datas consistentes', () => {
  const days = monthDays('2028-02-20');
  assert.equal(days.length, 42);
  assert.equal(days[0], '2028-01-30');
  assert.ok(days.includes('2028-02-29'));
  assert.equal(shiftMonth('2030-01-31', 1), '2030-02-01');
  assert.equal(shiftMonth('2030-12-15', 1), '2031-01-01');
  assert.equal(shiftMonth('2030-01-15', -1), '2029-12-01');
  assert.deepEqual(weekDays('2030-01-13'), ['2030-01-07', '2030-01-08', '2030-01-09', '2030-01-10', '2030-01-11', '2030-01-12', '2030-01-13']);
  assert.deepEqual(weekDays(today), weekDays('2030-01-13'));
});

test('agenda ordena aulas e tarefas sem inventar recorrências', () => {
  const data = calendarWorkspace();
  data.tasks.push(
    { id: 'untimed', title: 'Tarefa de teste', subjectId: '', date: today, kind: 'Estudo', done: false, minutes: 25 },
    { id: 'timed', title: 'Estudo de teste', subjectId: 'intro', date: today, time: '16:00', kind: 'Estudo', done: false, minutes: 25 },
  );
  const before = structuredClone(data);
  assert.deepEqual(calendarEntries(data, today, today).map((item) => item.id), ['timed', `example-intro:${today}`, 'untimed']);
  assert.equal(calendarEntries(data, '2030-01-11', '2030-01-11').length, 0);
  assert.deepEqual(data, before);
  data.term = { start: '2030-01-09', end: '2030-01-09' };
  const entries = calendarEntries(data, today, '2030-02-01');
  assert.deepEqual(entries.filter((item) => item.session).map((item) => item.date), ['2030-01-09']);
  assert.equal(entries.filter((item) => item.task).length, 2);
});

test('agenda ignora aulas com matéria desconhecida e limita intervalos excessivos', () => {
  const data = calendarWorkspace();
  data.classes[0].subjectId = 'unknown-subject';
  assert.deepEqual(calendarEntries(data, today, today), []);
  assert.deepEqual(calendarEntries(data, '2030-02-01', today), []);
  const entries = calendarEntries(calendarWorkspace(), today, '2040-01-01');
  assert.ok(entries.length > 0);
  assert.ok(entries.every((entry) => entry.date < '2031-01-12'));
});

test('sugestões priorizam prazos próximos e evitam sugestões já aceitas', () => {
  const data = calendarWorkspace();
  const task = { id: 'exam', title: 'Avaliação de exemplo', date: '2030-01-09', subjectId: 'intro', kind: 'Prova' as const, done: false, minutes: 60 };
  data.tasks.push(task,
    { ...task, id: 'done', done: true }, { ...task, id: 'past', date: '2030-01-06' },
    { ...task, id: 'later', date: '2030-01-15' },
    { ...task, id: 'boundary', date: '2030-01-14', kind: 'Trabalho', subjectId: 'desenv' },
  );
  const before = structuredClone(data);
  const suggestions = studySuggestions(data, today);
  const first = suggestions[0];
  assert.equal(first.title, 'Preparar: Avaliação de exemplo');
  assert.deepEqual(suggestions.filter((item) => item.id.startsWith('suggest-deadline-')).map((item) => item.id), [`suggest-deadline-exam-${today}`, `suggest-deadline-boundary-${today}`]);
  assert.equal(suggestions.filter((item) => item.subjectId === 'intro').length, 1);
  assert.deepEqual(data, before);
  data.tasks.push({ ...first, kind: 'Estudo', done: false });
  assert.equal(studySuggestions(data, today).some((item) => item.id === first.id), false);
});

test('exportação usa fuso de São Paulo e não inventa término', () => {
  const entries = calendarEntries(calendarWorkspace(), today, today);
  const ics = calendarIcs(entries, new Date('2030-01-07T12:00:00Z'));
  assert.match(ics, /DTSTAMP:20300107T120000Z/);
  assert.match(ics, /DTSTART:20300107T210000Z/);
  assert.ok(!ics.includes('DTEND'));
  assert.equal(saoPauloInstant(today, '23:59').toISOString(), '2030-01-08T02:59:00.000Z');
  assert.equal(saoPauloInstant(today, '00:00').toISOString(), '2030-01-07T03:00:00.000Z');
});

test('arquivo ICS escapa texto, preserva Unicode e limita linhas a 75 bytes', () => {
  const entry = calendarEntries(calendarWorkspace(), today, today)[0];
  entry.title = 'Reflexão; notas, estudo\\teste\n' + 'Ética '.repeat(40);
  entry.endTime = '19:00';
  const ics = calendarIcs([entry]);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('Reflexão\\; notas\\, estudo\\\\teste\\n'));
  assert.match(ics, /DTEND:20300107T220000Z/);
  assert.ok(ics.split('\r\n').every((line) => Buffer.byteLength(line, 'utf8') <= 75));
  assert.match(calendarIcs([{ ...entry, time: undefined, endTime: undefined }]), /DTSTART;VALUE=DATE:20300107/);
});
