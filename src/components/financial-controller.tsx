'use client';

import { useState } from 'react';
import { dateKey, type Workspace } from '@/lib/workspace';
import { moneyToCents, type Transaction } from '@/lib/life-data';
import { AreaSelect } from './life-organization';
import { ArrowDownRight, ArrowUpRight, DollarSign, Filter, Plus, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

const categories = ['Faculdade', 'Livros e Material', 'Transporte', 'Alimentação', 'Remuneração', 'Lazer', 'Saúde', 'Outros'];

export function FinancialController({ data, update, blocked }: { data: Workspace; blocked: boolean; update: (recipe: (previous: Workspace) => Workspace) => boolean }) {
  const transactions = data.transactions ?? [];
  const [date, setDate] = useState(dateKey);
  const [areaId, setAreaId] = useState('finance');
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState('');

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [category, setCategory] = useState('Faculdade');
  const [filterCategory, setFilterCategory] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amountCents, 0) / 100;
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amountCents, 0) / 100;
  const balance = totalIncome - totalExpense;
  const collegeExpense = transactions.filter(t => t.type === 'expense' && (t.category === 'Faculdade' || t.category === 'Livros e Material')).reduce((sum, t) => sum + t.amountCents, 0) / 100;

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (blocked) return;
    let amountCents: number;
    try { amountCents = moneyToCents(amount); } catch (error) { setMessage((error as Error).message); return; }
    if (!description.trim()) return;

    const newTx: Transaction = {
      id: editingId || crypto.randomUUID(),
      description: description.trim(),
      amountCents,
      type,
      category,
      date, areaId,
    };

    if (!update(previous => ({ ...previous, transactions: editingId ? (previous.transactions ?? []).map(tx => tx.id === editingId ? newTx : tx) : [newTx, ...(previous.transactions ?? [])] }))) { setMessage('Alteração não aceita. Confira o aviso de salvamento.'); return; }
    setEditingId(''); setMessage('Alteração enviada. Confira o indicador de salvamento.');
    setDescription('');
    setAmount('');
    setShowAddForm(false);
  }

  function handleDelete(id: string) {
    if (!blocked && window.confirm('Excluir este lançamento?')) update(previous => ({ ...previous, transactions: (previous.transactions ?? []).filter(t => t.id !== id) }));
  }

  const filtered = filterCategory
    ? transactions.filter(t => t.category === filterCategory).toSorted((a,b) => b.date.localeCompare(a.date))
    : transactions.toSorted((a,b) => b.date.localeCompare(a.date));

  return (
    <fieldset className="finances-container" disabled={blocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {message && <p role="status">{message}</p>}
      <div className="finances-header-row">
        <div>
          <h2>Controlador Financeiro</h2>
          <p>Acompanhe mensalidade, despesas acadêmicas e orçamento pessoal.</p>
        </div>
        <button
          className="button primary"
          onClick={() => { setEditingId(''); setDescription(''); setAmount(''); setShowAddForm(!showAddForm); }}
        >
          <Plus size={16} aria-hidden="true" />
          {showAddForm ? 'Fechar formulário' : 'Nova transação'}
        </button>
      </div>

      {/* METRIC CARDS */}
      <div className="finances-kpi-grid">
        <div className="finance-kpi-card balance">
          <div className="kpi-header">
            <span className="kpi-icon"><Wallet size={18} /></span>
            <span className="kpi-title">Saldo Líquido</span>
          </div>
          <div className={`kpi-val ${balance >= 0 ? 'positive' : 'negative'}`}>
            R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="kpi-sub">Saldo dos lançamentos cadastrados · não é saldo bancário</span>
        </div>

        <div className="finance-kpi-card income">
          <div className="kpi-header">
            <span className="kpi-icon income"><TrendingUp size={18} /></span>
            <span className="kpi-title">Receitas / Bolsas</span>
          </div>
          <div className="kpi-val positive">
            R$ {totalIncome.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="kpi-sub">Total de entradas</span>
        </div>

        <div className="finance-kpi-card expense">
          <div className="kpi-header">
            <span className="kpi-icon expense"><TrendingDown size={18} /></span>
            <span className="kpi-title">Despesas Totais</span>
          </div>
          <div className="kpi-val negative">
            R$ {totalExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="kpi-sub">Total de saídas</span>
        </div>

        <div className="finance-kpi-card college">
          <div className="kpi-header">
            <span className="kpi-icon college"><DollarSign size={18} /></span>
            <span className="kpi-title">Investimento Faculdade</span>
          </div>
          <div className="kpi-val">
            R$ {collegeExpense.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="kpi-sub">Mensalidades & livros</span>
        </div>
      </div>

      {/* ADD TRANSACTION FORM */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="panel finance-form">
          <h3>Adicionar Transação</h3>
          <div className="finance-form-grid">
            <div><label htmlFor="tx-date">Data do lançamento</label><input id="tx-date" type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label htmlFor="tx-area">Área da vida</label><AreaSelect id="tx-area" data={data} value={areaId} onChange={setAreaId} /></div>
            <div>
              <label htmlFor="tx-desc">Descrição</label>
              <input
                id="tx-desc"
                type="text"
                maxLength={160}
                placeholder="Ex.: Mensalidade UNIP, Livro..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="tx-amount">Valor (R$)</label>
              <input
                id="tx-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="tx-type">Tipo</label>
              <select
                id="tx-type"
                value={type}
                onChange={e => setType(e.target.value as 'income' | 'expense')}
              >
                <option value="expense">Despesa (Saída)</option>
                <option value="income">Receita (Entrada)</option>
              </select>
            </div>
            <div>
              <label htmlFor="tx-cat">Categoria</label>
              <select
                id="tx-cat"
                value={category}
                onChange={e => setCategory(e.target.value)}
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-footer" style={{ marginTop: '14px' }}>
            <button type="button" className="button outline" onClick={() => setShowAddForm(false)}>
              Cancelar
            </button>
            <button type="submit" className="button primary">
              Salvar transação
            </button>
          </div>
        </form>
      )}

      {/* TRANSACTION LIST */}
      <div className="panel finance-list-panel">
        <div className="section-heading">
          <div>
            <h3>Extrato de Lançamentos ({filtered.length})</h3>
            <p>Registro ordenado de despesas e receitas.</p>
          </div>
          <div className="finance-filter-group">
            <Filter size={14} aria-hidden="true" />
            <select
              aria-label="Filtrar por categoria"
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="compact-select"
            >
              <option value="">Todas as categorias</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="transaction-table-wrapper">
          <table className="transaction-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Tipo</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => (
                <tr key={tx.id}>
                  <td className="tx-date">{new Date(`${tx.date}T12:00:00`).toLocaleDateString('pt-BR')}</td>
                  <td className="tx-desc"><strong>{tx.description}</strong></td>
                  <td><span className="tx-badge">{tx.category}</span></td>
                  <td>
                    <span className={`tx-type-tag ${tx.type}`}>
                      {tx.type === 'income' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                      {tx.type === 'income' ? 'Entrada' : 'Saída'}
                    </span>
                  </td>
                  <td className={`tx-amount ${tx.type}`} style={{ textAlign: 'right' }}>
                    {tx.type === 'income' ? '+' : '-'} R$ {(tx.amountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button type="button" aria-label={`Editar: ${tx.description}`} onClick={() => { setEditingId(tx.id); setDescription(tx.description); setAmount((tx.amountCents / 100).toFixed(2)); setType(tx.type); setCategory(tx.category); setDate(tx.date); setAreaId(tx.areaId ?? ''); setShowAddForm(true); }}>Editar</button>
                    <button
                      className="icon-button danger"
                      onClick={() => handleDelete(tx.id)}
                      aria-label={`Excluir: ${tx.description}`}
                      title="Excluir lançamento"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                    Nenhum lançamento encontrado nesta categoria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </fieldset>
  );
}
