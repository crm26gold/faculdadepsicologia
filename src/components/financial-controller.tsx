'use client';

import { useState, useEffect } from 'react';
import { ArrowDownRight, ArrowUpRight, DollarSign, Filter, Plus, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: string;
}

const defaultTransactions: Transaction[] = [
  { id: 'tx-1', description: 'Remuneração / Bolsa de Estudos', amount: 1500, type: 'income', category: 'Remuneração', date: '2026-09-05' },
  { id: 'tx-2', description: 'Mensalidade UNIP Psicologia', amount: 890, type: 'expense', category: 'Faculdade', date: '2026-09-10' },
  { id: 'tx-3', description: 'Manual de Neurociências (Lent)', amount: 160, type: 'expense', category: 'Livros e Material', date: '2026-09-12' },
  { id: 'tx-4', description: 'Transporte / Combustível Faculdade', amount: 180, type: 'expense', category: 'Transporte', date: '2026-09-18' },
  { id: 'tx-5', description: 'Alimentação Campus', amount: 125, type: 'expense', category: 'Alimentação', date: '2026-09-22' },
];

const categories = ['Faculdade', 'Livros e Material', 'Transporte', 'Alimentação', 'Remuneração', 'Lazer', 'Saúde', 'Outros'];

export function FinancialController({ demo }: { demo: boolean }) {
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    if (demo) return defaultTransactions;
    try {
      const saved = localStorage.getItem('faculdade-psi:finances:v1');
      return saved ? JSON.parse(saved) : defaultTransactions;
    } catch {
      return defaultTransactions;
    }
  });

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [category, setCategory] = useState('Faculdade');
  const [filterCategory, setFilterCategory] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (demo) return;
    try {
      localStorage.setItem('faculdade-psi:finances:v1', JSON.stringify(transactions));
    } catch {
      // Safely ignore storage errors
    }
  }, [transactions, demo]);

  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const balance = totalIncome - totalExpense;
  const collegeExpense = transactions.filter(t => t.category === 'Faculdade' || t.category === 'Livros e Material').reduce((sum, t) => sum + t.amount, 0);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const val = parseFloat(amount.replace(',', '.'));
    if (!description.trim() || isNaN(val) || val <= 0) return;

    const newTx: Transaction = {
      id: crypto.randomUUID(),
      description: description.trim(),
      amount: val,
      type,
      category,
      date: new Date().toISOString().slice(0, 10),
    };

    setTransactions([newTx, ...transactions]);
    setDescription('');
    setAmount('');
    setShowAddForm(false);
  }

  function handleDelete(id: string) {
    setTransactions(transactions.filter(t => t.id !== id));
  }

  const filtered = filterCategory
    ? transactions.filter(t => t.category === filterCategory)
    : transactions;

  return (
    <div className="finances-container">
      <div className="finances-header-row">
        <div>
          <h2>Controlador Financeiro</h2>
          <p>Acompanhe mensalidade, despesas acadêmicas e orçamento pessoal.</p>
        </div>
        <button
          className="button primary"
          onClick={() => setShowAddForm(!showAddForm)}
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
          <span className="kpi-sub">Orçamento disponível</span>
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
            <div>
              <label htmlFor="tx-desc">Descrição</label>
              <input
                id="tx-desc"
                type="text"
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
                type="number"
                step="0.01"
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
                    {tx.type === 'income' ? '+' : '-'} R$ {tx.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'center' }}>
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
    </div>
  );
}
