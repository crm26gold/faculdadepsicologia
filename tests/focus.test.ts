import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorkspace, parseWorkspace, type ActiveFocus } from '../src/lib/workspace';
import { finishFocus, focusMilliseconds, pauseFocus, resumeFocus, formatFocusTime } from '../src/lib/focus';
const start = new Date('2026-09-28T10:00:00').getTime();
const focus = (): ActiveFocus => ({ id: 'focus', activity: 'Trabalho', areaId: 'work', subjectId: '', targetSeconds: 0, segments: [{ start, end: null }] });
test('foco mantém início após serialização e conta com navegador fechado', () => {
  const restored = parseWorkspace(JSON.stringify({ ...emptyWorkspace(), activeFocus: focus() }));
  assert.equal(focusMilliseconds(restored.activeFocus!, start + 95_500), 95_500);
});
test('pausa não conta e continuação soma somente intervalos ativos', () => {
  const paused = pauseFocus(focus(), start + 40_000);
  assert.equal(focusMilliseconds(paused, start + 100_000), 40_000);
  const resumed = resumeFocus(paused, start + 100_000);
  assert.equal(focusMilliseconds(resumed, start + 120_000), 60_000);
});
test('encerramento registra segundos parciais e é idempotente', () => {
  const result = finishFocus({ ...emptyWorkspace(), activeFocus: focus() }, start + 12_500);
  assert.equal(result.sessions[0].seconds, 12.5);
  assert.equal(result.activeFocus, null);
  assert.deepEqual(finishFocus(result, start + 90_000), result);
  assert.equal(parseWorkspace(JSON.stringify(result)).sessions[0].activity, 'Trabalho');
});
test('divide o tempo pela meia-noite sem atribuir tudo ao dia do encerramento', () => {
  const midnightStart = new Date('2026-09-28T23:59:30').getTime();
  const result = finishFocus({ ...emptyWorkspace(), activeFocus: { ...focus(), segments: [{ start: midnightStart, end: null }] } }, midnightStart + 90_000);
  assert.deepEqual(result.sessions.map(s => [s.date, s.seconds]), [['2026-09-28', 30], ['2026-09-29', 60]]);
});
test('meta não encerra atividade livre e sessões antigas continuam legíveis', () => {
  assert.equal(focusMilliseconds({ ...focus(), targetSeconds: 600 }, start + 900_000), 900_000);
  assert.equal(formatFocusTime(3661), '01:01:01');
  assert.equal(parseWorkspace(JSON.stringify({ ...emptyWorkspace(), sessions: [{ id: 'old', date: '2026-09-28', minutes: 25 }] })).sessions.length, 1);
});
test('rejeita intervalos negativos e sobrepostos', () => {
  for (const segments of [[{ start, end: start - 1 }], [{ start, end: null }, { start: start + 1, end: null }]]) {
    assert.throws(() => parseWorkspace(JSON.stringify({ ...emptyWorkspace(), activeFocus: { ...focus(), segments } })));
  }
});
