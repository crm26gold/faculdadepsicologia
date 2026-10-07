import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchedItems, touchedLabel } from '../src/lib/live-follow';
import { emptyWorkspace, type Workspace } from '../src/lib/workspace';

const base = (): Workspace => ({ ...emptyWorkspace(), tasks: [{ id: 'old', title: 'Dentista', subjectId: '', date: '2026-10-08', kind: 'Compromisso', done: false, minutes: 30 }] });

test('o app sabe o que a IA mudou em outro lugar e em qual tela mostrar', () => {
  const before = base();
  const after: Workspace = { ...before, finance: { openingCents: 10000, openingDate: '2026-10-07' },
    tasks: [{ ...before.tasks[0], done: true }, { id: 'new', title: 'Prova de Ética', subjectId: '', date: '2026-10-10', kind: 'Prova', done: false, minutes: 60 }] };
  const items = touchedItems(before, after);
  assert.deepEqual(items, [
    { view: 'agenda', kind: 'updated', title: 'Dentista', id: 'old' },
    { view: 'agenda', kind: 'created', title: 'Prova de Ética', id: 'new' },
    { view: 'finances', kind: 'setting', title: 'Saldo inicial' },
  ]);
  assert.equal(touchedLabel(items[2]), 'A IA ajustou: Saldo inicial');
  assert.deepEqual(touchedItems(after, { ...after, tasks: [after.tasks[1]] }), [{ view: 'agenda', kind: 'removed', title: 'Dentista' }]);
  assert.deepEqual(touchedItems(before, structuredClone(before)), [], 'mesma versão não move a tela');
});
