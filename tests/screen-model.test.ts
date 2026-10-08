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

test('"me mostra o que você fez": o print traz as alterações no topo e marca os itens alterados', () => {
  const recent = { at: '14:32', labels: ['Conta a pagar: Aluguel · R$ 1.200,00 · 10/10'], ids: ['t2'] };
  const model = screenModel(data(), 'financas', today, recent);
  assert.deepEqual(model.changes, { at: '14:32', labels: recent.labels });
  assert.deepEqual(model.sections[1].rows.map(row => [row.primary, row.recent ?? false]), [['Aluguel', true]]);
  assert.match(screenText(model), /^Finanças · .*\nO que mudou agora \(14:32\): Conta a pagar: Aluguel/);
  assert.match(screenText(model), /Aluguel · .* · agora/);
  assert.match(screenText(screenModel(data(), 'meu_dia', today, { at: '', labels: [], ids: [] })), /Nenhuma alteração desta conexão nas últimas 24 horas/);
  assert.equal(screenModel(data(), 'financas', today).changes, undefined, 'sem pedido, o print continua igual');
});

test('o print de Meu dia e da Agenda trazem o compromisso de hoje', () => {
  assert.equal(screenModel(data(), 'meu_dia', today).sections[0].rows[0].primary, 'Prova de Ética');
  const agenda = screenModel(data(), 'agenda', today);
  assert.equal(agenda.sections[0].rows[0].secondary, '19:00');
  assert.equal(screenModel(emptyWorkspace(), 'agenda', today).sections[0].empty, 'Nada marcado nos próximos 7 dias.');
});
