'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { dateKey, formatDate, type Workspace } from '@/lib/workspace';
import { moneyToCents, type Transaction } from '@/lib/life-data';
import { buildSeries, expenseCategories, flowWords, incomeCategories, isPending, money, monthLabel, monthOf, monthSummary, natures, openItems, reopen, seriesAfter, settle, shiftMonths, type Flow, type Nature, type Repeat } from '@/lib/finance';
import { AreaSelect } from './life-organization';

type Draft = { flow: Flow; description: string; amount: string; category: string; nature: Nature; settled: boolean; date: string; repeat: Repeat['kind']; count: string; areaId: string; applyToNext: boolean };
const blankDraft = (today: string): Draft => ({ flow: 'expense', description: '', amount: '', category: expenseCategories[0], nature: 'oneoff', settled: true, date: today, repeat: 'none', count: '12', areaId: 'finance', applyToNext: false });
const listFilters = [['all', 'Todos'], ['expense', 'Saídas'], ['income', 'Entradas'], ['open', 'Em aberto']] as const;

export function FinancialController({ data, update, blocked, addRequest = 0, openRequest = 0 }: { data: Workspace; blocked: boolean; update: (recipe: (previous: Workspace) => Workspace) => boolean; addRequest?: number; openRequest?: number }) {
  const today = dateKey();
  const transactions = data.transactions ?? [];
  const [month, setMonth] = useState(monthOf(today));
  const [filter, setFilter] = useState<(typeof listFilters)[number][0]>('all');
  const [category, setCategory] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState('');
  const [removing, setRemoving] = useState('');
  const [showLater, setShowLater] = useState(false);
  const [message, setMessage] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const openRef = useRef<HTMLElement>(null);

  useEffect(() => { if (addRequest) startNew(); }, [addRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!openRequest) return;
    const timer = setTimeout(() => { openRef.current?.scrollIntoView({ block: 'start' }); openRef.current?.focus({ preventScroll: true }); }, 80);
    return () => clearTimeout(timer);
  }, [openRequest]);
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => { formRef.current?.scrollIntoView({ block: 'start' }); formRef.current?.querySelector<HTMLInputElement>('#fin-description')?.focus({ preventScroll: true }); }, 60);
    return () => clearTimeout(timer);
  }, [draft === null, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = monthSummary(transactions, month);
  const open = openItems(transactions, today);
  const openCount = open.late.length + open.week.length + open.later.length;
  const inMonth = transactions.filter(item => monthOf(item.date) === month)
    .filter(item => filter === 'all' || (filter === 'open' ? isPending(item) : item.type === filter))
    .filter(item => !category || item.category === category)
    .toSorted((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description));
  const monthCategories = [...new Set(transactions.filter(item => monthOf(item.date) === month).map(item => item.category))].toSorted();
  const outgoing = summary.paid + summary.toPay;
  const monthName = monthLabel(month).split(' ')[0].toLocaleLowerCase('pt-BR');

  function change(recipe: (items: Transaction[]) => Transaction[], done: string) {
    if (blocked) return false;
    if (!update(previous => ({ ...previous, transactions: recipe(previous.transactions ?? []) }))) { setMessage('Não foi possível salvar agora. Confira o aviso de salvamento.'); return false; }
    setMessage(done);
    return true;
  }

  function startNew() { setEditingId(''); setRemoving(''); setDraft(blankDraft(today)); }
  function startEdit(item: Transaction) {
    setRemoving(''); setEditingId(item.id);
    setDraft({ flow: item.type, description: item.description, amount: (item.amountCents / 100).toFixed(2).replace('.', ','), category: item.category, nature: item.nature ?? 'oneoff', settled: !isPending(item), date: item.date, repeat: 'none', count: '12', areaId: item.areaId ?? '', applyToNext: false });
  }
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(previous => previous && { ...previous, [key]: value });

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || blocked) return;
    let amountCents: number;
    try { amountCents = moneyToCents(draft.amount); } catch (error) { setMessage((error as Error).message); return; }
    const description = draft.description.trim();
    if (!description) { setMessage('Descreva o lançamento.'); return; }
    const fields = { description, amountCents, type: draft.flow, category: draft.category, nature: draft.nature, areaId: draft.areaId || undefined };
    if (editingId) {
      const current = transactions.find(item => item.id === editingId);
      if (!current) return;
      const edited: Transaction = { ...current, ...fields, date: draft.date, ...(draft.settled ? { status: 'paid' as const, paidOn: current.paidOn ?? (isPending(current) ? today : undefined) } : { status: 'pending' as const, paidOn: undefined }) };
      const next = new Set(draft.applyToNext ? seriesAfter(data, current).filter(item => item.id !== current.id && isPending(item)).map(item => item.id) : []);
      if (change(items => items.map(item => item.id === editingId ? edited : next.has(item.id) ? { ...item, ...fields } : item), next.size ? `Lançamento e ${next.size} seguintes atualizados.` : 'Lançamento atualizado.')) { setDraft(null); setEditingId(''); }
      return;
    }
    const count = Number(draft.count);
    const repeat: Repeat = draft.repeat === 'monthly' ? { kind: 'monthly', months: count } : draft.repeat === 'installments' ? { kind: 'installments', count } : { kind: 'none' };
    let series: Transaction[];
    try { series = buildSeries({ ...fields, date: draft.date, status: draft.settled ? 'paid' : 'pending', paidOn: draft.settled ? draft.date : undefined }, repeat, today); } catch (error) { setMessage((error as Error).message); return; }
    if (change(items => [...series, ...items], series.length > 1 ? `${series.length} lançamentos criados, de ${formatDate(series[0].date)} a ${formatDate(series.at(-1)!.date, { day: 'numeric', month: 'short', year: 'numeric' })}.` : 'Lançamento salvo.')) {
      setDraft(null);
      setMonth(monthOf(draft.date));
    }
  }

  function markDone(item: Transaction) {
    change(items => items.map(entry => entry.id === item.id ? settle(entry, today) : entry), item.type === 'income' ? `Recebimento confirmado: ${item.description}.` : `Pagamento registrado: ${item.description}.`);
  }
  function undoDone(item: Transaction) {
    change(items => items.map(entry => entry.id === item.id ? reopen(entry) : entry), `${item.description} voltou para ${flowWords[item.type].pending.toLocaleLowerCase('pt-BR')}.`);
  }
  function remove(item: Transaction, scope: 'one' | 'next') {
    const ids = new Set(scope === 'next' ? seriesAfter(data, item).map(entry => entry.id) : [item.id]);
    if (change(items => items.filter(entry => !ids.has(entry.id)), ids.size > 1 ? `${ids.size} lançamentos excluídos.` : 'Lançamento excluído.')) setRemoving('');
  }
  function askRemove(item: Transaction) {
    if (item.groupId && seriesAfter(data, item).length > 1) { setRemoving(item.id); return; }
    if (window.confirm(`Excluir "${item.description}"?`)) remove(item, 'one');
  }

  function row(item: Transaction, showMonth = false) {
    const pending = isPending(item);
    const late = pending && item.date < today;
    const words = flowWords[item.type];
    const status = pending ? (late ? words.late : item.date === today ? `${words.pending} hoje` : words.pending) : '';
    const following = removing === item.id ? seriesAfter(data, item).length : 0;
    return <li key={item.id} className={`fin-row ${item.type}${pending ? ' pending' : ''}${late ? ' late' : ''}`}>
      <span className="fin-date" aria-hidden="true"><strong>{Number(item.date.slice(8))}</strong><small>{formatDate(item.date, { month: 'short' }).replace('.', '')}{showMonth && item.date.slice(0, 4) !== today.slice(0, 4) ? ` ${item.date.slice(2, 4)}` : ''}</small></span>
      <span className="fin-what">
        <strong>{item.description}</strong>
        <small><span className="sr-only">{formatDate(item.date, { day: 'numeric', month: 'long', year: 'numeric' })} · </span>{[item.category, item.nature && natures[item.nature].label, item.installment && `parcela ${item.installment.index}/${item.installment.count}`].filter(Boolean).join(' · ')}</small>
        {status && <span className="fin-status">{status}</span>}
      </span>
      <span className="fin-amount"><span className="sr-only">{item.type === 'income' ? 'Entrada de' : 'Saída de'} </span><span aria-hidden="true">{item.type === 'income' ? '+' : '−'} </span>{money(item.amountCents)}</span>
      <span className="fin-actions">
        {pending ? <button type="button" className="fin-done" onClick={() => markDone(item)} aria-label={`${words.action}: ${item.description}`}>{words.action}</button>
          : item.paidOn && item.groupId ? <button type="button" className="text-button" onClick={() => undoDone(item)} aria-label={`Desfazer: ${item.description}`}>Desfazer</button> : null}
        <button type="button" className="text-button" onClick={() => startEdit(item)} aria-label={`Editar: ${item.description}`}>Editar</button>
        <button type="button" className="text-button fin-remove" onClick={() => askRemove(item)} aria-label={`Excluir: ${item.description}`}>Excluir</button>
      </span>
      {following > 0 && <div className="fin-confirm" role="group" aria-label={`Excluir ${item.description}`}>
        <span>Este lançamento faz parte de uma série.</span>
        <button type="button" className="button outline" onClick={() => remove(item, 'one')}>Só este</button>
        <button type="button" className="button outline danger" onClick={() => remove(item, 'next')}>Este e os próximos ({following})</button>
        <button type="button" className="text-button" onClick={() => setRemoving('')}>Cancelar</button>
      </div>}
    </li>;
  }

  const editing = editingId ? transactions.find(item => item.id === editingId) : undefined;
  const nextInSeries = editing ? seriesAfter(data, editing).filter(item => item.id !== editing.id && isPending(item)).length : 0;
  const categoryOptions = draft ? [...new Set([...(draft.flow === 'income' ? incomeCategories : expenseCategories), draft.category])] : [];
  const words = draft ? flowWords[draft.flow] : flowWords.expense;

  return (
    <fieldset className="fin" disabled={blocked}>
      <div className="fin-toolbar">
        <div className="fin-month" role="group" aria-label="Mês">
          <button type="button" className="icon-button" onClick={() => setMonth(monthOf(shiftMonths(`${month}-01`, -1)))} aria-label="Mês anterior"><ChevronLeft size={18} aria-hidden="true" /></button>
          <strong aria-live="polite">{monthLabel(month)}</strong>
          <button type="button" className="icon-button" onClick={() => setMonth(monthOf(shiftMonths(`${month}-01`, 1)))} aria-label="Próximo mês"><ChevronRight size={18} aria-hidden="true" /></button>
          {month !== monthOf(today) && <button type="button" className="text-button" onClick={() => setMonth(monthOf(today))}>Mês atual</button>}
        </div>
        <button type="button" className="button primary" onClick={startNew}><Plus size={16} aria-hidden="true" />Novo lançamento</button>
      </div>
      {message && <p className="fin-message" role="status">{message}</p>}

      <section className="panel fin-summary" aria-label={`Resumo de ${monthLabel(month)}`}>
        <div className="fin-balance">
          <span>Saldo de {monthName}</span>
          <strong className={summary.balance < 0 ? 'negative' : ''}>{money(summary.balance)}</strong>
          <small>O que entrou menos o que saiu</small>
        </div>
        <div className="fin-forecast">
          <span>Previsão para o fim do mês</span>
          <strong className={summary.projected < 0 ? 'negative' : ''}>{money(summary.projected)}</strong>
          <small>Contando o que ainda falta pagar e receber</small>
        </div>
        <dl className="fin-flows">
          <div className="income"><dt>Entradas</dt><dd>{money(summary.received)}</dd>{summary.toReceive > 0 && <dd className="fin-more">+ {money(summary.toReceive)} a receber</dd>}</div>
          <div className="expense"><dt>Saídas</dt><dd>{money(summary.paid)}</dd>{summary.toPay > 0 && <dd className="fin-more">+ {money(summary.toPay)} a pagar</dd>}</div>
        </dl>
      </section>

      {draft && <form ref={formRef} onSubmit={save} className="panel fin-form" aria-labelledby="fin-form-title">
        <h2 id="fin-form-title">{editingId ? 'Editar lançamento' : 'Novo lançamento'}</h2>
        <fieldset className="fin-choice">
          <legend>Tipo</legend>
          {(['expense', 'income'] as const).map(flow => <label key={flow}><input type="radio" name="fin-flow" checked={draft.flow === flow} onChange={() => setDraft(previous => previous && { ...previous, flow, category: (flow === 'income' ? incomeCategories : expenseCategories)[0] })} />{flow === 'expense' ? 'Saída' : 'Entrada'}</label>)}
        </fieldset>
        <div className="fin-form-grid">
          <div className="fin-wide"><label htmlFor="fin-description">Descrição</label><input id="fin-description" maxLength={160} required value={draft.description} onChange={event => set('description', event.target.value)} placeholder={draft.flow === 'expense' ? 'Ex.: aluguel, mercado, conta de luz' : 'Ex.: salário, venda, reembolso'} /></div>
          <div><label htmlFor="fin-amount">{draft.repeat === 'installments' && !editingId ? 'Valor de cada parcela' : 'Valor'}</label><input id="fin-amount" inputMode="decimal" required value={draft.amount} onChange={event => set('amount', event.target.value)} placeholder="R$ 0,00" /></div>
          <div><label htmlFor="fin-category">Categoria</label><select id="fin-category" value={draft.category} onChange={event => set('category', event.target.value)}>{categoryOptions.map(item => <option key={item}>{item}</option>)}</select></div>
        </div>
        <fieldset className="fin-choice">
          <legend>Natureza</legend>
          {(Object.keys(natures) as Nature[]).map(nature => <label key={nature}><input type="radio" name="fin-nature" checked={draft.nature === nature} onChange={() => setDraft(previous => previous && { ...previous, nature, repeat: editingId ? previous.repeat : nature === 'fixed' ? 'monthly' : previous.repeat === 'monthly' ? 'none' : previous.repeat })} />{natures[nature].label}</label>)}
          <p className="fin-hint">{natures[draft.nature].hint}</p>
        </fieldset>
        <fieldset className="fin-choice">
          <legend>Situação</legend>
          <label><input type="radio" name="fin-settled" checked={draft.settled} onChange={() => set('settled', true)} />{draft.flow === 'expense' ? 'Já paguei' : 'Já recebi'}</label>
          <label><input type="radio" name="fin-settled" checked={!draft.settled} onChange={() => set('settled', false)} />{words.pending}</label>
        </fieldset>
        <div className="fin-form-grid">
          <div><label htmlFor="fin-date">{draft.settled ? (draft.flow === 'expense' ? 'Data do pagamento' : 'Data do recebimento') : (draft.flow === 'expense' ? 'Vencimento' : 'Previsto para')}</label><input id="fin-date" type="date" required value={draft.date} onChange={event => set('date', event.target.value)} /></div>
          {!editingId && <div><label htmlFor="fin-repeat">Repetição</label><select id="fin-repeat" value={draft.repeat} onChange={event => set('repeat', event.target.value as Repeat['kind'])}><option value="none">Não repete</option><option value="monthly">Todo mês</option><option value="installments">Parcelado</option></select></div>}
          {!editingId && draft.repeat !== 'none' && <div><label htmlFor="fin-count">{draft.repeat === 'monthly' ? 'Por quantos meses' : 'Número de parcelas'}</label><input id="fin-count" type="number" min={2} max={120} required value={draft.count} onChange={event => set('count', event.target.value)} /></div>}
          <div><label htmlFor="fin-area">Área da vida</label><AreaSelect id="fin-area" data={data} value={draft.areaId} onChange={value => set('areaId', value)} /></div>
        </div>
        {!editingId && draft.repeat !== 'none' && Number(draft.count) >= 2 && <p className="fin-hint">Cria {draft.count} lançamentos, um por mês, a partir de {formatDate(draft.date, { day: 'numeric', month: 'long' })}. Os meses que ainda não chegaram ficam como “{words.pending.toLocaleLowerCase('pt-BR')}” e aparecem nos avisos do Meu dia.</p>}
        {nextInSeries > 0 && <label className="fin-check"><input type="checkbox" checked={draft.applyToNext} onChange={event => set('applyToNext', event.target.checked)} />Aplicar descrição, valor e categoria também aos próximos {nextInSeries} em aberto</label>}
        <div className="form-footer">
          <button type="button" className="button outline" onClick={() => { setDraft(null); setEditingId(''); }}>Cancelar</button>
          <button type="submit" className="button primary">{editingId ? 'Salvar alterações' : 'Salvar lançamento'}</button>
        </div>
      </form>}

      <section ref={openRef} tabIndex={-1} id="fin-open" className="panel fin-open" aria-labelledby="fin-open-title">
        <h2 id="fin-open-title">Contas e recebimentos em aberto{openCount ? ` (${openCount})` : ''}</h2>
        {!openCount && <p className="fin-empty">Nada em aberto. Para ser avisado antes do vencimento, cadastre contas, parcelas e salários como “A pagar” ou “A receber”.</p>}
        {open.late.length > 0 && <><h3 className="fin-group late">Vencidos</h3><ul className="fin-list">{open.late.map(item => row(item, true))}</ul></>}
        {open.week.length > 0 && <><h3 className="fin-group">Próximos 7 dias</h3><ul className="fin-list">{open.week.map(item => row(item, true))}</ul></>}
        {open.later.length > 0 && <><h3 className="fin-group">Mais adiante</h3><ul className="fin-list">{(showLater ? open.later : open.later.slice(0, 4)).map(item => row(item, true))}</ul>
          {open.later.length > 4 && <button type="button" className="text-button" onClick={() => setShowLater(value => !value)}>{showLater ? 'Mostrar menos' : `Mostrar todos (${open.later.length})`}</button>}</>}
      </section>

      {outgoing > 0 && <section className="panel fin-breakdown" aria-labelledby="fin-breakdown-title">
        <h2 id="fin-breakdown-title">Para onde vai o dinheiro em {monthName}</h2>
        <p className="fin-note">{money(outgoing)} em saídas no mês{summary.toPay ? `, contando ${money(summary.toPay)} que ainda vão ser pagos` : ''}.</p>
        <div className="fin-nature-bar" aria-hidden="true">{summary.byNature.filter(item => item.cents).map(item => <span key={item.nature} className={item.nature} style={{ flexGrow: item.cents }} />)}</div>
        <ul className="fin-nature-legend">{summary.byNature.map(item => <li key={item.nature} className={item.nature}><span>{natures[item.nature].plural}</span><strong>{money(item.cents)}</strong><small>{Math.round(item.cents / outgoing * 100)}%</small></li>)}</ul>
        <ul className="fin-categories">{summary.byCategory.map(item => { const share = Math.round(item.cents / outgoing * 100); return <li key={item.category}><span>{item.category}</span><strong>{money(item.cents)}</strong><span className="fin-track" role="img" aria-label={`${share}% das saídas`}><i style={{ inlineSize: `${Math.max(share, 2)}%` }} /></span></li>; })}</ul>
      </section>}

      <section className="panel fin-month-list" aria-labelledby="fin-list-title">
        <div className="fin-list-head">
          <h2 id="fin-list-title">Lançamentos de {monthName}</h2>
          <div className="fin-filters" role="group" aria-label="Mostrar">{listFilters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
          {monthCategories.length > 1 && <select aria-label="Filtrar por categoria" value={category} onChange={event => setCategory(event.target.value)}><option value="">Todas as categorias</option>{monthCategories.map(item => <option key={item}>{item}</option>)}</select>}
        </div>
        {inMonth.length ? <ul className="fin-list">{inMonth.map(item => row(item))}</ul>
          : <p className="fin-empty">{transactions.some(item => monthOf(item.date) === month) ? 'Nada com esse filtro neste mês.' : `Nenhum lançamento em ${monthName}. Comece pelo salário e pelas contas fixas: o resto do mês fica bem mais claro.`}</p>}
      </section>
    </fieldset>
  );
}
