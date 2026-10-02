import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeries, collapseSeries, currentBalance, dailySpend, insights, lastDayOfMonth, monthlyProjection, monthSummary, openItems, projectTo, settle, shiftMonths } from '../src/lib/finance';
import { moneyToCents, type Transaction } from '../src/lib/life-data';
import { CURRENT_EDITOR_GENERATION, emptyWorkspace, workspaceSchema, type Workspace } from '../src/lib/workspace';
import { todayAlerts } from '../src/lib/today';

const ids = () => { let n = 0; return () => `id-${++n}`; };
const entry = (over: Partial<Transaction>): Transaction => ({ id: over.id ?? 'x', description: 'Item', amountCents: 1000, type: 'expense', category: 'Outros', date: '2026-10-10', ...over });

test('valores no jeito brasileiro viram centavos', () => {
  assert.deepEqual(['R$ 1.234,56', '1234,56', '1.500', '19.90', '0,5', '10'].map(moneyToCents), [123456, 123456, 150000, 1990, 50, 1000]);
  for (const bad of ['', '-3', '1,234', 'abc', '0']) assert.throws(() => moneyToCents(bad), bad);
});

test('mês seguinte mantém o dia, encurtando nos meses menores', () => {
  assert.deepEqual([0, 1, 2, 13].map(n => shiftMonths('2026-01-31', n)), ['2026-01-31', '2026-02-28', '2026-03-31', '2027-02-28']);
  assert.equal(shiftMonths('2026-01-15', -1), '2025-12-15');
});

test('conta fixa cria um lançamento por mês; os meses futuros ficam a pagar', () => {
  const series = buildSeries({ description: 'Aluguel', amountCents: 150000, type: 'expense', category: 'Moradia', nature: 'fixed', date: '2026-10-05', status: 'paid', paidOn: '2026-10-05' }, { kind: 'monthly', months: 3 }, '2026-10-20', ids());
  assert.deepEqual(series.map(item => [item.date, item.status, item.paidOn]), [['2026-10-05', 'paid', '2026-10-05'], ['2026-11-05', 'pending', undefined], ['2026-12-05', 'pending', undefined]]);
  assert.equal(new Set(series.map(item => item.groupId)).size, 1);
  assert.equal(series.every(item => item.installment === undefined), true);
});

test('compra parcelada numera as parcelas e todas ficam em aberto', () => {
  const series = buildSeries({ description: 'Notebook', amountCents: 25000, type: 'expense', category: 'Compras', nature: 'oneoff', date: '2026-11-10', status: 'pending' }, { kind: 'installments', count: 10 }, '2026-10-20', ids());
  assert.equal(series.length, 10);
  assert.deepEqual(series.at(-1)!.installment, { index: 10, count: 10 });
  assert.equal(series.every(item => item.status === 'pending'), true);
  assert.equal(series.at(-1)!.date, '2027-08-10');
  assert.throws(() => buildSeries({ description: 'x', amountCents: 1, type: 'expense', category: 'Outros', date: '2026-10-10' }, { kind: 'installments', count: 500 }, '2026-10-10'));
});

test('resumo do mês separa o realizado do previsto e as despesas por natureza', () => {
  const items = [
    entry({ id: 'a', type: 'income', amountCents: 500000, category: 'Salário', nature: 'fixed', status: 'paid' }),
    entry({ id: 'b', type: 'income', amountCents: 80000, category: 'Trabalho extra', status: 'pending' }),
    entry({ id: 'c', amountCents: 150000, category: 'Moradia', nature: 'fixed' }),
    entry({ id: 'd', amountCents: 30000, category: 'Alimentação', nature: 'variable' }),
    entry({ id: 'e', amountCents: 12000, category: 'Contas da casa', nature: 'fixed', status: 'pending' }),
    entry({ id: 'f', amountCents: 99999, date: '2026-11-01' }),
  ];
  const summary = monthSummary(items, '2026-10');
  assert.deepEqual([summary.received, summary.toReceive, summary.paid, summary.toPay, summary.balance, summary.projected], [500000, 80000, 180000, 12000, 320000, 388000]);
  assert.deepEqual(summary.byNature.map(item => item.cents), [162000, 30000, 0]);
  assert.equal(summary.byCategory[0].category, 'Moradia');
});

test('em aberto separa vencidos, próximos 7 dias e mais adiante; pagar tira da lista', () => {
  const items = [entry({ id: 'late', date: '2026-10-01', status: 'pending' }), entry({ id: 'week', date: '2026-10-12', status: 'pending' }), entry({ id: 'later', date: '2026-12-01', status: 'pending' }), entry({ id: 'done', date: '2026-10-01' })];
  const open = openItems(items, '2026-10-10');
  assert.deepEqual([open.late, open.week, open.later].map(list => list.map(item => item.id)), [['late'], ['week'], ['later']]);
  const paid = settle(items[0], '2026-10-10');
  assert.deepEqual([paid.status, paid.paidOn], ['paid', '2026-10-10']);
});

test('Meu dia avisa conta vencida, conta de hoje, conta de amanhã e dinheiro a receber', () => {
  const data: Workspace = { ...emptyWorkspace(), editorGeneration: CURRENT_EDITOR_GENERATION, transactions: [
    entry({ id: 'v', description: 'Cartão', amountCents: 80000, date: '2026-10-08', status: 'pending' }),
    entry({ id: 'h', description: 'Luz', amountCents: 21050, date: '2026-10-10', status: 'pending' }),
    entry({ id: 't', description: 'Internet', amountCents: 12000, date: '2026-10-11', status: 'pending' }),
    entry({ id: 's', description: 'Salário', type: 'income', amountCents: 500000, date: '2026-10-10', status: 'pending' }),
    entry({ id: 'p', description: 'Mercado', date: '2026-10-11' }),
  ] };
  const alerts = todayAlerts(data, '2026-10-10');
  assert.deepEqual(alerts.map(alert => [alert.id, alert.tone, alert.target]), [['bills-late', 'urgent', 'finances'], ['bills-today', 'urgent', 'finances'], ['bills-tomorrow', 'attention', 'finances'], ['income-due', 'info', 'finances']]);
  assert.equal(alerts[0].text.replace(/\s/g, ' '), 'Conta vencida: Cartão · R$ 800,00');
  assert.equal(alerts[2].text.replace(/\s/g, ' '), 'Amanhã tem conta para pagar: Internet · R$ 120,00');
  assert.match(alerts[3].text, /^Para receber: Salário · R\$\s5\.000,00 — já caiu\?$/);
});

test('contas e parcelas exigem a geração 8, para um editor antigo não apagar os campos novos', () => {
  const data = { ...emptyWorkspace(), transactions: [entry({ status: 'pending', nature: 'fixed', groupId: 'g', installment: { index: 1, count: 3 } })] };
  assert.equal(workspaceSchema.safeParse({ ...data, editorGeneration: 7 }).success, false);
  const parsed = workspaceSchema.parse({ ...data, editorGeneration: 8 });
  assert.deepEqual(parsed.transactions![0].installment, { index: 1, count: 3 });
  assert.equal(workspaceSchema.safeParse({ ...data, editorGeneration: 8, transactions: [entry({ installment: { index: 4, count: 3 } })] }).success, false);
  assert.equal(workspaceSchema.safeParse({ ...emptyWorkspace(), editorGeneration: 7, transactions: [entry({})] }).success, true);
});

test('saldo agora parte do saldo inicial e soma só o que foi pago ou recebido desde aquele dia', () => {
  const items = [
    entry({ id: 'antes', amountCents: 99900, date: '2026-09-30' }),
    entry({ id: 'mercado', amountCents: 20000, date: '2026-10-02' }),
    entry({ id: 'salario', type: 'income', amountCents: 300000, date: '2026-10-05' }),
    entry({ id: 'conta', amountCents: 15000, date: '2026-10-06', status: 'pending' }),
    entry({ id: 'paga-depois', amountCents: 5000, date: '2026-09-28', status: 'paid', paidOn: '2026-10-03' }),
  ];
  assert.equal(currentBalance(items, { openingCents: 100000, openingDate: '2026-10-01' }, '2026-10-10'), 100000 - 20000 + 300000 - 5000);
  assert.equal(currentBalance(items, { openingCents: -50000, openingDate: '2026-10-01' }, '2026-10-04'), -50000 - 20000 - 5000);
  assert.equal(currentBalance(items, undefined, '2026-10-10'), -99900 - 20000 + 300000 - 5000);
  assert.equal(lastDayOfMonth('2026-02'), '2026-02-28');
  assert.equal(lastDayOfMonth('2026-12'), '2026-12-31');
});

test('gasto do dia a dia ignora contas fixas e parcelas, e não divide por poucos dias', () => {
  const items = [
    entry({ id: 'a', amountCents: 7000, date: '2026-10-09', nature: 'variable' }),
    entry({ id: 'b', amountCents: 7000, date: '2026-10-10', nature: 'oneoff' }),
    entry({ id: 'aluguel', amountCents: 150000, date: '2026-10-05', nature: 'fixed' }),
    entry({ id: 'parcela', amountCents: 30000, date: '2026-10-05', groupId: 'g', installment: { index: 1, count: 3 } }),
  ];
  assert.deepEqual(dailySpend(items, '2026-10-10'), { perDayCents: 2000, basisDays: 7 });
  assert.deepEqual(dailySpend([], '2026-10-10'), { perDayCents: 0, basisDays: 0 });
});

test('projeção soma o agendado e o gasto diário até a data escolhida, mês a mês', () => {
  const opening = { openingCents: 100000, openingDate: '2026-10-01' };
  const items = [
    entry({ id: 'salario', type: 'income', amountCents: 300000, date: '2026-11-05', status: 'pending' }),
    entry({ id: 'luz', amountCents: 20000, date: '2026-10-20', status: 'pending' }),
    entry({ id: 'longe', amountCents: 90000, date: '2027-03-01', status: 'pending' }),
  ];
  const result = projectTo(items, opening, '2026-10-10', '2026-11-10', 1000);
  assert.deepEqual([result.now, result.toReceive, result.toPay, result.days, result.everyday, result.projected], [100000, 300000, 20000, 31, 31000, 349000]);
  const months = monthlyProjection(items, opening, '2026-10-10', '2026-12-15');
  assert.deepEqual(months.map(row => [row.month, row.end, row.toPay, row.toReceive]), [['2026-10', '2026-10-31', 20000, 0], ['2026-11', '2026-11-30', 0, 300000], ['2026-12', '2026-12-15', 0, 0]]);
  assert.deepEqual(months.map(row => row.balance), [80000, 380000, 380000]);
});

test('séries repetidas aparecem uma vez, com quantas faltam e até quando', () => {
  const series = buildSeries({ description: 'Motorhome', amountCents: 90000, type: 'expense', category: 'Transporte', nature: 'fixed', date: '2026-10-02', status: 'pending' }, { kind: 'monthly', months: 12 }, '2026-10-02', ids());
  const open = openItems(series, '2026-10-02');
  const later = collapseSeries(open.later, series);
  assert.equal(later.length, 1);
  assert.equal(later[0].item.date, '2026-11-02');
  assert.equal(later[0].remaining, 10);
  assert.equal(later[0].until, '2027-09-02');
});

test('dicas avisam conta vencida, série que termina, parcelas restantes, gasto que subiu e falta de saldo inicial', () => {
  const items = [
    entry({ id: 'vencida', amountCents: 5000, date: '2026-10-01', status: 'pending' }),
    entry({ id: 'p1', description: 'Notebook', amountCents: 30000, date: '2026-09-15', groupId: 'g', installment: { index: 1, count: 2 } }),
    entry({ id: 'p2', description: 'Notebook', amountCents: 30000, date: '2026-10-15', status: 'pending', groupId: 'g', installment: { index: 2, count: 2 } }),
    entry({ id: 'set', category: 'Alimentação', amountCents: 40000, date: '2026-09-10' }),
    entry({ id: 'out', category: 'Alimentação', amountCents: 60000, date: '2026-10-05' }),
  ];
  const tips = insights(items, undefined, '2026-10-10');
  assert.deepEqual(tips.map(tip => tip.id), ['late', 'ends-g', 'debt', 'jump', 'pace', 'opening']);
  assert.match(tips[1].text, /^Notebook termina este mês/);
  assert.match(tips[3].text, /^Alimentação: R\$\s600,00 este mês, 50% acima do mês passado\.$/);
  assert.equal(insights([], { openingCents: 0, openingDate: '2026-10-01' }, '2026-10-10').length, 0);
});

test('saldo inicial exige a geração 9', () => {
  const data = { ...emptyWorkspace(), finance: { openingCents: -1500, openingDate: '2026-10-01' } };
  assert.equal(workspaceSchema.safeParse({ ...data, editorGeneration: 8 }).success, false);
  assert.deepEqual(workspaceSchema.parse({ ...data, editorGeneration: 9 }).finance, { openingCents: -1500, openingDate: '2026-10-01' });
});
