'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Lightbulb, Pencil, TriangleAlert, PartyPopper } from 'lucide-react';
import { addDays, dateKey, formatDate, type Workspace } from '@/lib/workspace';
import { moneyToCents, type Transaction } from '@/lib/life-data';
import { buildSeries, collapseSeries, currentBalance, dailySpend, expenseCategories, flowWords, incomeCategories, insights, isPending, money, monthLabel, monthOf, monthSummary, monthlyProjection, natures, openItems, projectTo, reopen, seriesAfter, settle, shiftMonths, type Flow, type Nature, type Repeat } from '@/lib/finance';
import { AreaSelect } from './life-organization';

type Draft = { flow: Flow; description: string; amount: string; category: string; nature: Nature; settled: boolean; date: string; repeat: Repeat['kind']; count: string; areaId: string; applyToNext: boolean };
type Tab = 'summary' | 'bills' | 'statement' | 'projection';
const blankDraft = (today: string, flow: Flow): Draft => ({ flow, description: '', amount: '', category: (flow === 'income' ? incomeCategories : expenseCategories)[0], nature: 'oneoff', settled: true, date: today, repeat: 'none', count: '12', areaId: 'finance', applyToNext: false });
const listFilters = [['all', 'Todos'], ['expense', 'Saídas'], ['income', 'Entradas'], ['open', 'Em aberto']] as const;
const horizons = [[1, '1 mês'], [3, '3 meses'], [6, '6 meses'], [12, '1 ano']] as const;
const tabs: [Tab, string][] = [['summary', 'Resumo'], ['bills', 'Contas'], ['statement', 'Extrato'], ['projection', 'Projeção']];
const short = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '').replace(' de ', '/');

export function FinancialController({ data, update, blocked, addRequest = 0, openRequest = 0 }: { data: Workspace; blocked: boolean; update: (recipe: (previous: Workspace) => Workspace) => boolean; addRequest?: number; openRequest?: number }) {
  const today = dateKey();
  const transactions = data.transactions ?? [];
  const opening = data.finance;
  const [tab, setTab] = useState<Tab>('summary');
  const [month, setMonth] = useState(monthOf(today));
  const [filter, setFilter] = useState<(typeof listFilters)[number][0]>('all');
  const [category, setCategory] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState('');
  const [removing, setRemoving] = useState('');
  const [expandSeries, setExpandSeries] = useState(false);
  const [message, setMessage] = useState('');
  const [openingForm, setOpeningForm] = useState<{ kind: 'have' | 'zero' | 'owe'; amount: string; date: string } | null>(null);
  const [until, setUntil] = useState(shiftMonths(today, 3));
  const [perDay, setPerDay] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (addRequest) startNew('expense'); }, [addRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!openRequest) return;
    setTab('bills');
    const timer = setTimeout(() => { tabsRef.current?.scrollIntoView({ block: 'start' }); document.getElementById('fin-tab-bills')?.focus({ preventScroll: true }); }, 80);
    return () => clearTimeout(timer);
  }, [openRequest]);
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => { formRef.current?.scrollIntoView({ block: 'start' }); formRef.current?.querySelector<HTMLInputElement>('#fin-description')?.focus({ preventScroll: true }); }, 60);
    return () => clearTimeout(timer);
  }, [draft === null, editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const balance = currentBalance(transactions, opening, today);
  const next30 = projectTo(transactions, opening, today, addDays(today, 30));
  const open = openItems(transactions, today);
  const openCount = open.late.length + open.week.length + open.later.length;
  const summary = monthSummary(transactions, month);
  const outgoing = summary.paid + summary.toPay;
  const monthName = monthLabel(month).split(' ')[0].toLocaleLowerCase('pt-BR');
  const tips = insights(transactions, opening, today);
  const pace = dailySpend(transactions, today);
  let perDayCents = pace.perDayCents;
  if (perDay.trim()) { try { perDayCents = moneyToCents(perDay); } catch { if (/^\s*0+([.,]0+)?\s*$/.test(perDay)) perDayCents = 0; } }
  const target = until > today ? until : addDays(today, 1);
  const projection = projectTo(transactions, opening, today, target, perDayCents);
  const months = monthlyProjection(transactions, opening, today, target).map(row => ({ ...row, balance: projectTo(transactions, opening, today, row.end, perDayCents).projected }));
  const scale = Math.max(1, ...months.map(row => Math.abs(row.balance)));

  function change(recipe: (previous: Workspace) => Workspace, done: string) {
    if (blocked) return false;
    if (!update(recipe)) { setMessage('Não foi possível salvar agora. Confira o aviso de salvamento.'); return false; }
    setMessage(done);
    return true;
  }
  const changeItems = (recipe: (items: Transaction[]) => Transaction[], done: string) => change(previous => ({ ...previous, transactions: recipe(previous.transactions ?? []) }), done);

  function startNew(flow: Flow) { setEditingId(''); setRemoving(''); setDraft(blankDraft(today, flow)); }
  function startEdit(item: Transaction) {
    setRemoving(''); setEditingId(item.id);
    setDraft({ flow: item.type, description: item.description, amount: (item.amountCents / 100).toFixed(2).replace('.', ','), category: item.category, nature: item.nature ?? 'oneoff', settled: !isPending(item), date: item.date, repeat: 'none', count: '12', areaId: item.areaId ?? '', applyToNext: false });
  }
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(previous => previous && { ...previous, [key]: value });

  function saveOpening(event: React.FormEvent) {
    event.preventDefault();
    const form = openingForm ?? { kind: 'have' as const, amount: '', date: today };
    let cents = 0;
    if (form.kind !== 'zero') {
      try { cents = moneyToCents(form.amount); } catch (error) { setMessage((error as Error).message); return; }
      if (form.kind === 'owe') cents = -cents;
    }
    if (change(previous => ({ ...previous, finance: { openingCents: cents, openingDate: form.date } }), 'Saldo salvo. A partir daqui, cada entrada e saída atualiza o saldo.')) setOpeningForm(null);
  }

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
      if (changeItems(items => items.map(item => item.id === editingId ? edited : next.has(item.id) ? { ...item, ...fields } : item), next.size ? `Lançamento e ${next.size} seguintes atualizados.` : 'Lançamento atualizado.')) { setDraft(null); setEditingId(''); }
      return;
    }
    const count = Number(draft.count);
    const repeat: Repeat = draft.repeat === 'monthly' ? { kind: 'monthly', months: count } : draft.repeat === 'installments' ? { kind: 'installments', count } : { kind: 'none' };
    let series: Transaction[];
    try { series = buildSeries({ ...fields, date: draft.date, status: draft.settled ? 'paid' : 'pending', paidOn: draft.settled ? draft.date : undefined }, repeat, today); } catch (error) { setMessage((error as Error).message); return; }
    if (changeItems(items => [...series, ...items], series.length > 1 ? `${series.length} lançamentos criados, de ${formatDate(series[0].date)} a ${formatDate(series.at(-1)!.date, { day: 'numeric', month: 'short', year: 'numeric' })}.` : `${draft.flow === 'income' ? 'Entrada' : 'Saída'} registrada.`)) {
      setDraft(null);
      setMonth(monthOf(draft.date));
    }
  }

  const markDone = (item: Transaction) => changeItems(items => items.map(entry => entry.id === item.id ? settle(entry, today) : entry), item.type === 'income' ? `Recebimento confirmado: ${item.description}.` : `Pagamento registrado: ${item.description}.`);
  const undoDone = (item: Transaction) => changeItems(items => items.map(entry => entry.id === item.id ? reopen(entry) : entry), `${item.description} voltou para ${flowWords[item.type].pending.toLocaleLowerCase('pt-BR')}.`);
  function remove(item: Transaction, scope: 'one' | 'next') {
    const ids = new Set(scope === 'next' ? seriesAfter(data, item).map(entry => entry.id) : [item.id]);
    if (changeItems(items => items.filter(entry => !ids.has(entry.id)), ids.size > 1 ? `${ids.size} lançamentos excluídos.` : 'Lançamento excluído.')) setRemoving('');
  }
  function askRemove(item: Transaction) {
    if (item.groupId && seriesAfter(data, item).length > 1) { setRemoving(item.id); return; }
    if (window.confirm(`Excluir "${item.description}"?`)) remove(item, 'one');
  }

  function row(item: Transaction, extra?: { remaining: number; until?: string }) {
    const pending = isPending(item);
    const late = pending && item.date < today;
    const words = flowWords[item.type];
    const status = pending ? (late ? words.late : item.date === today ? `${words.pending} hoje` : words.pending) : '';
    const following = removing === item.id ? seriesAfter(data, item).length : 0;
    const Icon = item.type === 'income' ? ArrowUpRight : ArrowDownRight;
    return <li key={item.id} className={`fin-row ${item.type}${pending ? ' pending' : ''}${late ? ' late' : ''}`}>
      <span className="fin-icon" aria-hidden="true"><Icon size={18} /></span>
      <span className="fin-what">
        <strong>{item.description}</strong>
        <small>{formatDate(item.date, { day: 'numeric', month: 'short', ...(item.date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' as const } : {}) })} · {[item.category, item.nature && natures[item.nature].label, item.installment && `parcela ${item.installment.index}/${item.installment.count}`].filter(Boolean).join(' · ')}</small>
        {extra && extra.remaining > 0 && extra.until && <small className="fin-series">e mais {extra.remaining} {extra.remaining === 1 ? 'mês' : 'meses'}, até {formatDate(extra.until, { month: 'short', year: 'numeric' }).replace('.', '')}</small>}
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
  const group = (title: string, items: Transaction[], tone = '') => items.length > 0 && <><h3 className={`fin-group ${tone}`}>{title}</h3><ul className="fin-list">{(expandSeries ? items.map(item => ({ item, remaining: 0, until: undefined as string | undefined })) : collapseSeries(items, transactions)).map(entry => row(entry.item, entry))}</ul></>;
  const monthPicker = <div className="fin-monthpick" role="group" aria-label="Mês">
    <button type="button" onClick={() => setMonth(monthOf(shiftMonths(`${month}-01`, -1)))} aria-label="Mês anterior"><ChevronLeft size={16} aria-hidden="true" /></button>
    <span aria-live="polite">{monthLabel(month)}</span>
    <button type="button" onClick={() => setMonth(monthOf(shiftMonths(`${month}-01`, 1)))} aria-label="Próximo mês"><ChevronRight size={16} aria-hidden="true" /></button>
    {month !== monthOf(today) && <button type="button" className="text-button" onClick={() => setMonth(monthOf(today))}>Mês atual</button>}
  </div>;

  const editing = editingId ? transactions.find(item => item.id === editingId) : undefined;
  const nextInSeries = editing ? seriesAfter(data, editing).filter(item => item.id !== editing.id && isPending(item)).length : 0;
  const categoryOptions = draft ? [...new Set([...(draft.flow === 'income' ? incomeCategories : expenseCategories), draft.category])] : [];
  const words = draft ? flowWords[draft.flow] : flowWords.expense;
  const inMonth = transactions.filter(item => monthOf(item.date) === month)
    .filter(item => filter === 'all' || (filter === 'open' ? isPending(item) : item.type === filter))
    .filter(item => !category || item.category === category)
    .toSorted((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description));
  const monthCategories = [...new Set(transactions.filter(item => monthOf(item.date) === month).map(item => item.category))].toSorted();
  const openingDraft = openingForm ?? { kind: 'have' as const, amount: '', date: today };
  const patchOpening = (next: Partial<typeof openingDraft>) => setOpeningForm({ ...openingDraft, ...next });

  return (
    <fieldset className="fin" disabled={blocked}>
      <section className="panel fin-hero" aria-labelledby="fin-balance-title">
        {openingForm || !opening ? <form className="fin-opening" onSubmit={saveOpening}>
          <h2 id="fin-balance-title">{opening ? 'Ajustar saldo' : 'Quanto você tem hoje?'}</h2>
          <p>Some o que está no banco e na carteira. É o ponto de partida: depois disso, cada entrada e saída atualiza o saldo sozinha.</p>
          <fieldset className="fin-choice"><legend className="sr-only">Situação de hoje</legend>
            {([['have', 'Tenho dinheiro'], ['zero', 'Estou zerado'], ['owe', 'Estou devendo']] as const).map(([kind, label]) => <label key={kind}><input type="radio" name="fin-opening-kind" checked={openingDraft.kind === kind} onChange={() => patchOpening({ kind })} />{label}</label>)}
          </fieldset>
          <div className="fin-form-grid">
            {openingDraft.kind !== 'zero' && <div><label htmlFor="fin-opening-amount">{openingDraft.kind === 'owe' ? 'Quanto você deve' : 'Quanto você tem'}</label><input id="fin-opening-amount" inputMode="decimal" required value={openingDraft.amount} onChange={event => patchOpening({ amount: event.target.value })} placeholder="R$ 0,00" /></div>}
            <div><label htmlFor="fin-opening-date">A partir de</label><input id="fin-opening-date" type="date" required max={today} value={openingDraft.date} onChange={event => patchOpening({ date: event.target.value })} /></div>
          </div>
          <div className="form-footer">{opening && <button type="button" className="button outline" onClick={() => setOpeningForm(null)}>Cancelar</button>}<button type="submit" className="button primary">Salvar saldo</button></div>
        </form> : <>
          <div className="fin-balance">
            <span id="fin-balance-title">Saldo agora</span>
            <strong className={balance < 0 ? 'negative' : ''}>{money(balance)}</strong>
            <small>Começou em {formatDate(opening.openingDate, { day: 'numeric', month: 'short', year: 'numeric' })} com {money(opening.openingCents)}</small>
            <button type="button" className="text-button fin-adjust" onClick={() => setOpeningForm({ kind: opening.openingCents < 0 ? 'owe' : opening.openingCents === 0 ? 'zero' : 'have', amount: opening.openingCents ? (Math.abs(opening.openingCents) / 100).toFixed(2).replace('.', ',') : '', date: opening.openingDate })}><Pencil size={13} aria-hidden="true" />Ajustar saldo</button>
          </div>
          <dl className="fin-next">
            <div className="expense"><dt>A pagar em 30 dias</dt><dd>{money(next30.toPay)}</dd></div>
            <div className="income"><dt>A receber em 30 dias</dt><dd>{money(next30.toReceive)}</dd></div>
            <div><dt>Previsto para {formatDate(addDays(today, 30))}</dt><dd className={next30.projected < 0 ? 'negative' : ''}>{money(next30.projected)}</dd></div>
          </dl>
        </>}
      </section>

      <div className="fin-add-row">
        <button type="button" className="fin-add income" onClick={() => startNew('income')}><ArrowUpRight size={20} aria-hidden="true" />Entrada</button>
        <button type="button" className="fin-add expense" onClick={() => startNew('expense')}><ArrowDownRight size={20} aria-hidden="true" />Saída</button>
      </div>
      {message && <p className="fin-message" role="status">{message}</p>}

      {draft && <form ref={formRef} onSubmit={save} className={`panel fin-form ${draft.flow}`} aria-labelledby="fin-form-title">
        <h2 id="fin-form-title">{editingId ? 'Editar lançamento' : draft.flow === 'income' ? 'Nova entrada' : 'Nova saída'}</h2>
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
          <button type="submit" className="button primary">{editingId ? 'Salvar alterações' : 'Salvar'}</button>
        </div>
      </form>}

      <div ref={tabsRef} className="fin-tabs" role="tablist" aria-label="Finanças">
        {tabs.map(([id, label]) => <button key={id} id={`fin-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`fin-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}
          onKeyDown={event => { if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return; const index = tabs.findIndex(([key]) => key === tab); const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length][0]; setTab(next); document.getElementById(`fin-tab-${next}`)?.focus(); }}>
          {label}{id === 'bills' && openCount > 0 && <span className="fin-badge">{openCount}</span>}</button>)}
      </div>

      {tab === 'summary' && <section id="fin-panel-summary" role="tabpanel" aria-labelledby="fin-tab-summary" className="fin-panel">
        {monthPicker}
        <div className="fin-month-cards">
          <div className="fin-card income"><span>Entradas</span><strong>{money(summary.received)}</strong>{summary.toReceive > 0 && <small>+ {money(summary.toReceive)} a receber</small>}</div>
          <div className="fin-card expense"><span>Saídas</span><strong>{money(summary.paid)}</strong>{summary.toPay > 0 && <small>+ {money(summary.toPay)} a pagar</small>}</div>
        </div>
        <p className="fin-result">Sobra de {monthName} até agora: <strong className={summary.balance < 0 ? 'negative' : 'positive'}>{money(summary.balance)}</strong>{(summary.toPay || summary.toReceive) ? <> · se tudo se confirmar: <strong className={summary.projected < 0 ? 'negative' : 'positive'}>{money(summary.projected)}</strong></> : null}</p>
        {tips.length > 0 && <div className="panel fin-tips"><h2>O que vale saber</h2><ul>{tips.map(tip => { const Icon = tip.tone === 'warn' ? TriangleAlert : tip.tone === 'good' ? PartyPopper : Lightbulb; return <li key={tip.id} className={tip.tone}><Icon size={17} aria-hidden="true" /><span>{tip.text}</span></li>; })}</ul></div>}
        {outgoing > 0 && <div className="panel fin-breakdown">
          <h2>Para onde vai o dinheiro em {monthName}</h2>
          <p className="fin-note">{money(outgoing)} em saídas no mês{summary.toPay ? `, contando ${money(summary.toPay)} que ainda vão ser pagos` : ''}.</p>
          <div className="fin-nature-bar" aria-hidden="true">{summary.byNature.filter(item => item.cents).map(item => <span key={item.nature} className={item.nature} style={{ flexGrow: item.cents }} />)}</div>
          <ul className="fin-nature-legend">{summary.byNature.map(item => <li key={item.nature} className={item.nature}><span>{natures[item.nature].plural}</span><strong>{money(item.cents)}</strong><small>{Math.round(item.cents / outgoing * 100)}%</small></li>)}</ul>
          <ul className="fin-categories">{summary.byCategory.map(item => { const share = Math.round(item.cents / outgoing * 100); return <li key={item.category}><span>{item.category}</span><strong>{money(item.cents)}</strong><span className="fin-track" role="img" aria-label={`${share}% das saídas`}><i style={{ inlineSize: `${Math.max(share, 2)}%` }} /></span></li>; })}</ul>
        </div>}
      </section>}

      {tab === 'bills' && <section id="fin-panel-bills" role="tabpanel" aria-labelledby="fin-tab-bills" className="fin-panel">
        <div className="fin-panel-head"><h2>Contas e recebimentos em aberto</h2>{transactions.some(item => item.groupId && isPending(item)) && <label className="fin-check"><input type="checkbox" checked={expandSeries} onChange={event => setExpandSeries(event.target.checked)} />Mostrar cada mês e parcela</label>}</div>
        {!openCount && <p className="fin-empty">Nada em aberto. Para ser avisado antes do vencimento, registre contas, parcelas e salários como “A pagar” ou “A receber”.</p>}
        {group('Vencidos', open.late, 'late')}
        {group('Próximos 7 dias', open.week)}
        {group('Mais adiante', open.later)}
      </section>}

      {tab === 'statement' && <section id="fin-panel-statement" role="tabpanel" aria-labelledby="fin-tab-statement" className="fin-panel">
        {monthPicker}
        <div className="fin-list-head">
          <div className="fin-filters" role="group" aria-label="Mostrar">{listFilters.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
          {monthCategories.length > 1 && <select aria-label="Filtrar por categoria" value={category} onChange={event => setCategory(event.target.value)}><option value="">Todas as categorias</option>{monthCategories.map(item => <option key={item}>{item}</option>)}</select>}
        </div>
        {inMonth.length ? <ul className="fin-list">{inMonth.map(item => row(item))}</ul>
          : <p className="fin-empty">{transactions.some(item => monthOf(item.date) === month) ? 'Nada com esse filtro neste mês.' : `Nenhum lançamento em ${monthName}.`}</p>}
      </section>}

      {tab === 'projection' && <section id="fin-panel-projection" role="tabpanel" aria-labelledby="fin-tab-projection" className="fin-panel">
        <div className="fin-horizons" role="group" aria-label="Até quando">
          {horizons.map(([count, label]) => { const date = shiftMonths(today, count); return <button key={count} type="button" aria-pressed={until === date} onClick={() => setUntil(date)}>{label}</button>; })}
          <label className="fin-until"><span>Até</span><input type="date" min={addDays(today, 1)} value={until} onChange={event => { if (event.target.value) setUntil(event.target.value); }} aria-label="Data da projeção" /></label>
        </div>
        <div className="panel fin-projection">
          <span>Em {formatDate(target, { day: 'numeric', month: 'long', year: 'numeric' })}, você deve ter</span>
          <strong className={projection.projected < 0 ? 'negative' : 'positive'}>{money(projection.projected)}</strong>
          <dl>
            <div><dt>Saldo agora</dt><dd>{money(projection.now)}</dd></div>
            <div className="income"><dt>+ A receber agendado</dt><dd>{money(projection.toReceive)}</dd></div>
            <div className="expense"><dt>− Contas e parcelas agendadas</dt><dd>{money(projection.toPay)}</dd></div>
            <div className="expense"><dt>− Dia a dia ({money(perDayCents)} × {projection.days} dias)</dt><dd>{money(projection.everyday)}</dd></div>
          </dl>
          <div className="fin-perday"><label htmlFor="fin-perday">Gasto diário considerado</label><input id="fin-perday" inputMode="decimal" value={perDay} onChange={event => setPerDay(event.target.value)} placeholder={(pace.perDayCents / 100).toFixed(2).replace('.', ',')} /><small>{pace.perDayCents ? `Média real dos últimos ${pace.basisDays} dias, fora contas fixas e parcelas. Mude o valor para simular.` : 'Ainda sem histórico de gastos do dia a dia. Digite um valor para simular.'}</small></div>
          {!opening && <p className="fin-hint">Sem o saldo de hoje, a projeção parte de zero. Informe-o no topo da página.</p>}
        </div>
        <div className="panel fin-chart">
          <h2>Mês a mês</h2>
          <ol className="fin-bars">{months.map(entry => <li key={entry.month} className={entry.balance < 0 ? 'negative' : 'positive'}>
            <span className="fin-bar-month">{short(entry.month)}</span>
            <span className="fin-bar-track" aria-hidden="true"><i style={{ inlineSize: `${Math.max(2, Math.abs(entry.balance) / scale * 100)}%` }} /></span>
            <span className="fin-bar-value">{money(entry.balance)}</span>
            <small>{entry.toPay ? `− ${money(entry.toPay)} em contas` : 'sem contas'}{entry.toReceive ? ` · + ${money(entry.toReceive)} a receber` : ''}</small>
          </li>)}</ol>
          <p className="fin-hint">Saldo previsto no fim de cada mês: o que você tem hoje, mais o que está agendado para entrar, menos as contas e o gasto do dia a dia. Em breve, a inteligência artificial vai comentar seus hábitos e sugerir ajustes.</p>
        </div>
      </section>}
    </fieldset>
  );
}
