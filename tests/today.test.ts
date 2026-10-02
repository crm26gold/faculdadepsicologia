import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greeting, monthCycles, todayAgenda, todayAlerts } from '../src/lib/today';
import { emptyWorkspace, type Workspace } from '../src/lib/workspace';

test('o mês vira quatro ciclos e o último absorve os dias que sobram', () => {
  const october = monthCycles('2026-10-01');
  assert.equal(october.month, 'Outubro');
  assert.deepEqual(october.cycles.map(cycle => [cycle.start, cycle.end]), [[1, 7], [8, 14], [15, 21], [22, 31]]);
  assert.equal(october.cycle, 1);
  assert.equal(october.last, 31);
  for (const [date, last, cycle] of [['2026-02-28', 28, 4], ['2028-02-29', 29, 4], ['2026-09-30', 30, 4], ['2026-10-14', 31, 2], ['2026-10-15', 31, 3], ['2026-10-21', 31, 3], ['2026-10-22', 31, 4]] as const) {
    const result = monthCycles(date);
    assert.equal(result.last, last, date);
    assert.equal(result.cycle, cycle, date);
    assert.equal(result.cycles.filter(item => item.current).length, 1, date);
  }
});

test('saudação acompanha a hora', () => {
  assert.deepEqual([3, 8, 13, 20].map(greeting), ['Boa noite', 'Bom dia', 'Boa tarde', 'Boa noite']);
});

test('avisos mostram atrasos, foco esquecido, prazos próximos e o que falta organizar', () => {
  const base = emptyWorkspace();
  const data: Workspace = { ...base,
    tasks: [
      { id: 'a', title: 'Pagar luz', subjectId: '', date: '2026-09-28', kind: 'Pagamento', done: false, minutes: 10 },
      { id: 'b', title: 'Prova de Ética', subjectId: '', date: '2026-10-03', kind: 'Prova', done: false, minutes: 60 },
      { id: 'c', title: 'Feito', subjectId: '', date: '2026-09-20', kind: 'Tarefa', done: true, minutes: 10 },
    ],
    notes: [{ id: 'n', title: 'Ideia solta', subjectId: '', content: '<p>x</p>', updatedAt: '2026-10-01T10:00:00Z' }],
    activeFocus: { id: 'f', activity: 'Leitura', subjectId: '', areaId: '', targetSeconds: 0, segments: [{ start: 0, end: null }] },
  };
  const alerts = todayAlerts(data, '2026-10-01', 90 * 60_000);
  assert.deepEqual(alerts.map(alert => alert.id), ['late', 'focus', 'soon-b', 'loose']);
  assert.equal(alerts[0].text, '1 compromisso atrasado: Pagar luz');
  assert.match(alerts[1].text, /Foco ligado: Leitura · 1h30 — esqueceu ligado\?/);
  assert.equal(alerts[1].tone, 'urgent');
  assert.equal(alerts[2].text, 'Prova: Prova de Ética em 2 dias');
  assert.equal(alerts[3].text, '1 registro esperando organização');
  assert.deepEqual(todayAlerts(base, '2026-10-01'), []);
});

test('a agenda de hoje junta aulas da grade e compromissos, em ordem de horário', () => {
  const base = emptyWorkspace();
  const data: Workspace = { ...base,
    subjects: [{ id: 's', name: 'Neuropsicologia', color: 'rose' }],
    classes: [{ id: 'k', subjectId: 's', weekday: 4, startTime: '19:10', endTime: '20:50', location: 'Sala 12', enabled: true, intervalWeeks: 1 }],
    tasks: [{ id: 't', title: 'Consulta médica', subjectId: '', date: '2026-10-01', time: '08:30', kind: 'Consulta', done: false, minutes: 60 }],
  } as Workspace;
  assert.deepEqual(todayAgenda(data, '2026-10-01').map(entry => [entry.time, entry.title, entry.kind]), [['08:30', 'Consulta médica', 'Consulta'], ['19:10', 'Neuropsicologia', 'Aula']]);
});
