import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenModel, screenText } from '../src/lib/screens/screen-model';
import { emptyWorkspace, type Workspace } from '../src/lib/workspace';

const today = '2026-10-07';
const data = (): Workspace => ({ ...emptyWorkspace(), finance: { openingCents: 10000, openingDate: today },
  transactions: [
    { id: 't1', description: 'Mercado', amountCents: 5000, type: 'expense', category: 'Alimentação', date: today, status: 'paid', paidOn: today, areaId: 'finance' },
    { id: 't2', description: 'Aluguel', amountCents: 120000, type: 'expense', category: 'Moradia', date: '2026-10-10', status: 'pending', areaId: 'finance' },
  ] as Workspace['transactions'],
  tasks: [{ id: 'k1', title: 'Prova de Ética', subjectId: '', date: today, time: '19:00', kind: 'Prova', done: false, minutes: 60 }] });

test('o print de Finanças usa o saldo e as contas que a tela mostra', () => {
  const model = screenModel(data(), 'financas', today);
  assert.equal(model.highlight?.value.replace(/\s/g, ' '), 'R$ 50,00');
  assert.equal(model.highlight?.negative, false);
  assert.deepEqual(model.sections[1].rows.map(row => row.primary), ['Aluguel']);
  assert.match(screenText(model).replace(/\s/g, ' '), /Saldo agora .*: R\$ 50,00/);
});

test('o print de Meu dia e da Agenda trazem o compromisso de hoje', () => {
  assert.equal(screenModel(data(), 'meu_dia', today).sections[0].rows[0].primary, 'Prova de Ética');
  const agenda = screenModel(data(), 'agenda', today);
  assert.equal(agenda.sections[0].rows[0].secondary, '19:00');
  assert.equal(screenModel(emptyWorkspace(), 'agenda', today).sections[0].empty, 'Nada marcado nos próximos 7 dias.');
});
