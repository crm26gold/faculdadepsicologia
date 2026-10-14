'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Flame, Pencil, Plus, Trophy, Users, X } from 'lucide-react';
import { Modal } from '../modal';
import { api, formatDay } from './client';
import { PersonAvatar } from './avatar';
import { Medal } from './medal';
import { weekdayShort, type Challenge, type ChallengeDay, type ChallengeKind, type TodayChallenge } from '@/lib/network';

/** Datas do desafio: texto AAAA-MM-DD, no dia de São Paulo. */
const shift = (day: string, by: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + by); return date.toISOString().slice(0, 10); };
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
export const todayInBrazil = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const number = (value: number | null | undefined) => (value ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const days = (count: number) => `${count} ${count === 1 ? 'dia' : 'dias'}`;

export function goalText(challenge: { kind: ChallengeKind; goal: number | null; unit: string }) {
  return challenge.kind === 'feito' ? 'Feito ou não, todo dia' : `${number(challenge.goal)} ${challenge.unit} por dia`;
}
export function restText(rest: number[]) {
  return rest.length ? `descanso: ${rest.map(day => weekdayShort[day]).join(', ')}` : 'sem dia de descanso';
}
const stateText = (challenge: Challenge) => challenge.state === 'soon' ? `Começa ${challenge.starts_on === shift(challenge.today, 1) ? 'amanhã' : formatDay(challenge.starts_on, { weekday: 'short', day: 'numeric', month: 'short' })}`
  : challenge.state === 'ended' ? 'Encerrado' : challenge.state === 'cancelled' ? 'Cancelado' : `Até ${formatDay(challenge.ends_on)}`;

/** A aba Desafios do grupo: os em andamento primeiro; quem está no grupo cria, participa e marca o dia. */
export function ChallengesTab({ space, archived, onOpenPerson }: { space: string; archived: boolean; onOpenPerson: (id: string) => void }) {
  const [list, setList] = useState<Challenge[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    try { setList(await api<Challenge[]>(`/api/network?challenges=${space}`) ?? []); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir.'); }
  }, [space]);
  useEffect(() => { void load(); }, [load]);
  const replace = (next: Challenge) => setList(items => items?.map(item => item.id === next.id ? next : item) ?? null);
  if (error) return <div className="error-banner" role="alert">{error}</div>;
  if (!list) return <p role="status" className="muted">Abrindo…</p>;
  const open = list.filter(item => item.state === 'active' || item.state === 'soon');
  const finished = list.filter(item => item.state === 'ended' || item.state === 'cancelled');
  return <div className="cm-stack">
    {!archived && <div className="button-row"><button type="button" className="button primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />Novo desafio</button></div>}
    {open.map(item => <ChallengeCard key={item.id} challenge={item} readOnly={archived} onChange={replace} onOpenPerson={onOpenPerson} />)}
    {!open.length && <div className="empty-inline"><Trophy size={22} aria-hidden="true" /><p>Nenhum desafio em andamento.{archived ? '' : ' Crie um: ler 10 páginas, caminhar 3 km, beber 8 copos de água… Cada um marca o seu dia e o grupo acompanha.'}</p></div>}
    {finished.length > 0 && <><h3 className="small-heading">Encerrados</h3>
      {finished.map(item => <ChallengeCard key={item.id} challenge={item} readOnly={archived} onChange={replace} onOpenPerson={onOpenPerson} />)}</>}
    {creating && <ChallengeForm space={space} onClose={() => setCreating(false)} onCreated={created => { setCreating(false); setList(items => [created, ...(items ?? [])]); }} />}
  </div>;
}

/** Um desafio: o grupo (quem fez hoje e o progresso) e, para quem participa, a sequência, os últimos 7 dias e o botão do dia.
 * No grupo arquivado (`readOnly`), só a leitura. */
export function ChallengeCard({ challenge, readOnly = false, onChange, onOpenPerson }: {
  challenge: Challenge; readOnly?: boolean; onChange: (next: Challenge) => void; onOpenPerson: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const { me } = challenge;
  const running = challenge.state === 'active';
  const open = running || challenge.state === 'soon';
  const writable = !readOnly;
  // Depois que começa, o nome fica: é o que vai para a medalha.
  const started = challenge.state !== 'soon';
  const yesterday = shift(challenge.today, -1);
  // No dia seguinte ao fim ainda dá para marcar o último dia; a medalha sai na manhã depois disso.
  const grace = challenge.state === 'ended' && challenge.ends_on === yesterday;
  const missedYesterday = writable && (running || grace) && !!me && !me.yesterday?.done && yesterday >= challenge.starts_on && !challenge.rest_days.includes(weekday(yesterday));
  async function send(body: Record<string, unknown>, done = '') {
    setBusy(true); setMessage('');
    try { onChange(await api<Challenge>('/api/network', body)); setMessage(done); return true; }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível salvar.'); return false; }
    finally { setBusy(false); }
  }
  const people = challenge.done_today.people;
  return <article className="panel ch-card" aria-label={`Desafio ${challenge.title}`}>
    <header className="ch-head">
      <span className="ch-icon" aria-hidden="true">{me?.medal ? <Medal title={challenge.title} size={34} /> : <Flame size={22} />}</span>
      <div>
        <h3>{challenge.title}</h3>
        <small>{goalText(challenge)} · {restText(challenge.rest_days)}</small>
        <span className={`ch-state ${challenge.state}`}>{stateText(challenge)}</span>
      </div>
    </header>
    {challenge.description && <p className="cm-pre ch-description">{challenge.description}</p>}

    {me && open && <div className="ch-me">
      <p className="ch-streak"><Flame size={18} aria-hidden="true" /><strong>{days(me.streak)}</strong> seguidos<span className="muted"> · {me.done_days} de {days(me.required)}</span></p>
      {me.recent.length > 0 && <ol className="ch-week" aria-label="Seus últimos dias">{me.recent.map(day => <li key={day.day} className={day.done ? 'done' : day.rest ? 'rest' : day.day === challenge.today ? 'today' : 'missed'}>
        <span>{weekdayShort[weekday(day.day)].slice(0, 1)}</span>
        <span className="sr-only">{formatDay(day.day, { weekday: 'long', day: 'numeric' })}: {day.done ? 'feito' : day.rest ? 'descanso' : day.day === challenge.today ? 'em aberto' : 'não feito'}</span>
        <i aria-hidden="true">{day.done ? <Check size={14} /> : day.rest ? '–' : ''}</i>
      </li>)}</ol>}
      {running && writable && challenge.rest_days.includes(weekday(challenge.today)) && <p className="muted small">Hoje é dia de descanso: não marcar não quebra a sua sequência. Se fizer mesmo assim, conta.</p>}
      {running && writable && <DayCheck challenge={challenge} day={challenge.today} value={me.today} busy={busy} label="hoje"
        onSave={(done, amount) => send({ action: 'challenge_checkin', challenge: challenge.id, day: challenge.today, done, amount }, done ? 'Dia marcado.' : 'Dia desmarcado.')} />}
      {missedYesterday && <details className="ch-yesterday"><summary>Esqueceu de marcar ontem?</summary>
        <DayCheck challenge={challenge} day={yesterday} value={me.yesterday} busy={busy} label="ontem"
          onSave={(done, amount) => send({ action: 'challenge_checkin', challenge: challenge.id, day: yesterday, done, amount }, 'Ontem marcado.')} /></details>}
    </div>}
    {me?.medal && <div className="ch-medal"><Medal title={challenge.title} size={44} />Você ganhou a medalha deste desafio. Ela está na aba Conquistas do seu perfil.</div>}
    {me && !open && !me.medal && <p className="muted small">Você cumpriu {me.done_days} de {days(me.required)}.{grace
      ? ' A medalha sai amanhã de manhã para quem cumpriu 80% dos dias.' : challenge.state === 'ended' ? ' A medalha vinha com 80% dos dias.' : ''}</p>}
    {grace && missedYesterday && <details className="ch-yesterday"><summary>Esqueceu de marcar o último dia?</summary>
      <DayCheck challenge={challenge} day={yesterday} value={me.yesterday} busy={busy} label="ontem"
        onSave={(done, amount) => send({ action: 'challenge_checkin', challenge: challenge.id, day: yesterday, done, amount }, 'Último dia marcado.')} /></details>}

    <div className="ch-group">
      <span className="cm-progress" role="progressbar" aria-label="Dias cumpridos pelo grupo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(challenge.progress * 100)}>
        <span style={{ inlineSize: `${Math.round(challenge.progress * 100)}%` }} /></span>
      <small>{challenge.people} {challenge.people === 1 ? 'pessoa participa' : 'pessoas participam'} · o grupo cumpriu {Math.round(challenge.progress * 100)}% dos dias</small>
      {running && challenge.done_today.count > 0 && <div className="ch-today">
        <span className="ch-faces">{people.map(person => <button key={person.id} type="button" className="nw-person-link" onClick={() => onOpenPerson(person.id)} aria-label={`Abrir o perfil de ${person.name}`}>
          <PersonAvatar name={person.name} avatar={person.avatar} /></button>)}</span>
        <small>{challenge.done_today.count === 1 ? `${people[0]?.name ?? '1 pessoa'} já fez hoje` : `${challenge.done_today.count} pessoas já fizeram hoje`}</small>
      </div>}
    </div>

    {open && writable && <div className="button-row">
      {!me && <button type="button" className="button primary" disabled={busy} onClick={() => send({ action: 'challenge_join', challenge: challenge.id, joining: true }, 'Você entrou no desafio.')}><Users size={16} aria-hidden="true" />Participar</button>}
      {me && <button type="button" className="text-button" disabled={busy} onClick={() => {
        if (window.confirm(`Sair de “${challenge.title}”? Os dias que você marcou aqui serão apagados.`)) void send({ action: 'challenge_join', challenge: challenge.id, joining: false }, 'Você saiu do desafio.');
      }}>Sair do desafio</button>}
      {challenge.can_manage && <button type="button" className="text-button" disabled={busy} onClick={() => setEditing(true)}><Pencil size={14} aria-hidden="true" />Editar</button>}
      {challenge.can_manage && <button type="button" className="text-button" disabled={busy} onClick={() => {
        if (window.confirm(`Encerrar “${challenge.title}” agora? O desafio acaba para todos e ninguém ganha medalha.`)) void send({ action: 'challenge_manage', challenge: challenge.id, cancel: true }, 'Desafio encerrado.');
      }}><X size={14} aria-hidden="true" />Encerrar</button>}
    </div>}
    {message && <p className="cm-message" role="status">{message}</p>}
    {editing && <Modal title="Editar desafio" onClose={() => setEditing(false)}><form className="entry-form" onSubmit={async event => {
      event.preventDefault(); const f = new FormData(event.currentTarget);
      if (await send({ action: 'challenge_manage', challenge: challenge.id, title: started ? challenge.title : f.get('title'), description: f.get('description') ?? '' }, 'Desafio atualizado.')) setEditing(false);
    }}>
      <label htmlFor={`ch-title-${challenge.id}`}>Nome</label><input id={`ch-title-${challenge.id}`} name="title" required maxLength={120} defaultValue={challenge.title} disabled={started} aria-describedby={`ch-rules-${challenge.id}`} />
      <label htmlFor={`ch-details-${challenge.id}`}>Descrição</label><textarea id={`ch-details-${challenge.id}`} name="description" rows={3} maxLength={1000} defaultValue={challenge.description} />
      <p id={`ch-rules-${challenge.id}`} className="muted small">{started ? 'O desafio já começou: o nome, a meta, as datas e os dias de descanso ficam como estão, para não mudar a regra no meio do caminho.'
        : 'Dá para mudar o nome até o desafio começar. A meta, as datas e os dias de descanso ficam como estão.'}</p>
      <div className="form-footer"><button className="button primary" disabled={busy}>Salvar</button></div>
    </form></Modal>}
  </article>;
}

/** No Meu dia: os desafios de hoje de quem participa, com o botão do dia. Sem desafio hoje, o card não aparece. */
export function TodayChallenges({ onOpenSpace }: { onOpenSpace: (space: string) => void }) {
  const [list, setList] = useState<TodayChallenge[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { api<TodayChallenge[]>('/api/network?challenges=today').then(items => setList(items ?? []), () => setList([])); }, []);
  async function save(item: TodayChallenge, done: boolean, amount: number | null) {
    setBusy(true); setMessage('');
    try {
      const card = await api<Challenge>('/api/network', { action: 'challenge_checkin', challenge: item.id, day: todayInBrazil(), done, amount });
      setList(items => items.map(other => other.id === item.id
        ? { ...other, amount: card.me?.today?.amount ?? null, done: !!card.me?.today?.done, streak: card.me?.streak ?? other.streak } : other));
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível marcar.'); }
    finally { setBusy(false); }
  }
  if (!list.length) return null;
  return <section className="panel cm-today ch-today-card" aria-labelledby="ch-today-title">
    <div className="section-heading"><h2 id="ch-today-title"><Flame size={16} aria-hidden="true" /> Desafios de hoje</h2></div>
    <ul className="ch-today-list">{list.map(item => <li key={item.id}>
      <button type="button" className="ch-today-name" onClick={() => onOpenSpace(item.space.id)}>
        <strong>{item.title}</strong><small>{item.space.name}{item.streak ? ` · 🔥 ${days(item.streak)}` : ''}{item.rest ? ' · hoje é descanso' : ''}</small></button>
      <DayCheck challenge={item} day={todayInBrazil()} value={item.amount !== null || item.done ? { amount: item.amount, done: item.done } : null} busy={busy} label="hoje"
        onSave={(done, amount) => save(item, done, amount)} />
    </li>)}</ul>
    {message && <p className="cm-message" role="alert">{message}</p>}
  </section>;
}

/** O botão do dia: "Fiz hoje" (feito ou não) ou quanto fez (quantidade). */
function DayCheck({ challenge, day, value, busy, label, onSave }: {
  challenge: Pick<Challenge, 'id' | 'kind' | 'goal' | 'unit' | 'title'>; day: string; value: ChallengeDay | null; busy: boolean; label: 'hoje' | 'ontem';
  onSave: (done: boolean, amount: number | null) => unknown;
}) {
  const [amount, setAmount] = useState(value?.amount ? String(value.amount) : '');
  useEffect(() => { setAmount(value?.amount ? String(value.amount) : ''); }, [value?.amount]);
  if (challenge.kind === 'feito') return <button type="button" className="button ch-done" aria-pressed={!!value?.done} disabled={busy}
    onClick={() => onSave(!value?.done, null)}><Check size={18} aria-hidden="true" />Fiz {label}</button>;
  const id = `ch-amount-${challenge.id}-${day}`;
  return <form className="ch-amount" onSubmit={event => {
    event.preventDefault();
    const parsed = Number(amount.replace(',', '.'));
    if (amount.trim() === '' || parsed === 0) { void onSave(false, null); return; }
    if (!Number.isFinite(parsed) || parsed < 0) return;
    void onSave(true, parsed);
  }}>
    <label htmlFor={id}>Quanto você fez {label}? <small className="muted">Meta: {number(challenge.goal)} {challenge.unit}</small></label>
    <span className="ch-amount-row">
      <input id={id} inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" aria-describedby={`${id}-state`} />
      <span>{challenge.unit}</span>
      <button className="button primary" disabled={busy}>Salvar</button>
    </span>
    <small id={`${id}-state`} className={value?.done ? 'ch-hit' : 'muted'}>{value?.amount ? (value.done ? 'Meta do dia cumprida.' : `Faltam ${number((challenge.goal ?? 0) - value.amount)} ${challenge.unit} para a meta.`) : 'Ainda não marcado.'}</small>
  </form>;
}

/** Criar um desafio: nome, tipo (feito ou quantidade), começo, duração e até 3 dias de descanso por semana. */
function ChallengeForm({ space, onClose, onCreated }: { space: string; onClose: () => void; onCreated: (created: Challenge) => void }) {
  const today = todayInBrazil();
  const [kind, setKind] = useState<ChallengeKind>('feito');
  const [start, setStart] = useState(today);
  const [length, setLength] = useState(30);
  const [rest, setRest] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const valid = Number.isInteger(length) && length >= 3 && length <= 365 && start >= today && start <= shift(today, 30);
  const end = valid ? shift(start, length - 1) : '';
  return <Modal title="Novo desafio" onClose={onClose}><form className="entry-form" onSubmit={async event => {
    event.preventDefault(); const f = new FormData(event.currentTarget);
    if (!valid) { setMessage('Confira o começo (até 30 dias à frente) e a duração (de 3 a 365 dias).'); return; }
    const goal = Number(String(f.get('goal') ?? '').replace(',', '.'));
    setBusy(true); setMessage('');
    try {
      onCreated(await api<Challenge>('/api/network', { action: 'challenge_create', space, title: f.get('title'), description: f.get('description') ?? '', kind,
        unit: kind === 'quantidade' ? f.get('unit') : '', goal: kind === 'quantidade' && goal > 0 ? goal : null, start, days: length, rest }));
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível criar.'); }
    finally { setBusy(false); }
  }}>
    <label htmlFor="ch-new-title">Nome do desafio</label><input id="ch-new-title" name="title" required maxLength={120} placeholder="Ex.: Ler todo dia" />
    <label htmlFor="ch-new-details">Descrição (opcional)</label><textarea id="ch-new-details" name="description" rows={2} maxLength={1000} placeholder="Combinados, dicas, por que vale a pena…" />
    <fieldset className="nw-choice"><legend>Como marca o dia?</legend>
      <div className="nw-chips">{([['feito', 'Feito ou não'], ['quantidade', 'Quantidade']] as [ChallengeKind, string][]).map(([value, text]) =>
        <button key={value} type="button" className="nw-chip" aria-pressed={kind === value} onClick={() => setKind(value)}>{text}</button>)}</div>
      {kind === 'quantidade' && <div className="form-grid">
        <div><label htmlFor="ch-new-goal">Meta por dia</label><input id="ch-new-goal" name="goal" inputMode="decimal" required pattern="[0-9]+([.,][0-9]{1,2})?" placeholder="10" /></div>
        <div><label htmlFor="ch-new-unit">Unidade</label><input id="ch-new-unit" name="unit" required maxLength={20} placeholder="páginas, km, copos" /></div>
      </div>}
    </fieldset>
    <div className="form-grid">
      <div><label htmlFor="ch-new-start">Começa</label><input id="ch-new-start" type="date" required min={today} max={shift(today, 30)} value={start} onChange={event => setStart(event.target.value)} /></div>
      <div><label htmlFor="ch-new-days">Dura (dias)</label><input id="ch-new-days" type="number" required min={3} max={365} value={Number.isNaN(length) ? '' : length} onChange={event => setLength(event.target.valueAsNumber)} /></div>
    </div>
    <div className="nw-chips" role="group" aria-label="Durações comuns">{[7, 21, 30, 66].map(value => <button key={value} type="button" className="nw-chip" aria-pressed={length === value} onClick={() => setLength(value)}>{value} dias</button>)}</div>
    <fieldset className="nw-choice"><legend>Dias de descanso (até 3)</legend>
      <div className="nw-chips">{weekdayShort.map((label, day) => <button key={label} type="button" className="nw-chip" aria-pressed={rest.includes(day)}
        disabled={!rest.includes(day) && rest.length >= 3} onClick={() => setRest(list => list.includes(day) ? list.filter(item => item !== day) : [...list, day].sort((a, b) => a - b))}>{label}</button>)}</div>
      <p className="muted small">Descanso não quebra a sequência. A medalha vem para quem cumprir 80% dos outros dias.</p>
    </fieldset>
    {end && <p className="muted small">Vai de {formatDay(start, { day: 'numeric', month: 'long' })} a {formatDay(end, { day: 'numeric', month: 'long', year: end.slice(0, 4) !== start.slice(0, 4) ? 'numeric' : undefined })}. Você já entra participando.</p>}
    {message && <p className="cm-message" role="alert">{message}</p>}
    <div className="form-footer"><button className="button primary" disabled={busy}>Criar desafio</button></div>
  </form></Modal>;
}
