'use client';
import { useEffect, useState } from 'react';
import { Ban, Flag } from 'lucide-react';
import { Modal } from '../modal';
import { api } from './client';
import { reasonLabels, reportReasons, type Person } from '@/lib/network';

type Reason = typeof reportReasons[number];

/** Menu "⋯" de uma pessoa ou de uma publicação dela: denunciar e bloquear. Quem é denunciado ou bloqueado não fica sabendo. */
export function SafetyMenu({ person, post, blocked, onClose, onBlocked }: {
  person: Person; post?: string; blocked?: boolean; onClose: () => void; onBlocked: (blocking: boolean) => void;
}) {
  const [step, setStep] = useState<'menu' | 'report' | 'block' | 'done'>('menu');
  const [reason, setReason] = useState<Reason>('spam');
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const first = person.name.split(' ')[0];

  async function block(blocking: boolean) {
    setBusy(true); setMessage('');
    try { await api('/api/network', { action: 'block', person: person.id, blocking }); onBlocked(blocking); onClose(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  }
  async function report() {
    setBusy(true); setMessage('');
    try {
      await api('/api/network', { action: 'report', person: person.id, post: post ?? null, reason, note: note.trim() });
      if (alsoBlock) { await api('/api/network', { action: 'block', person: person.id, blocking: true }); onBlocked(true); }
      setStep('done');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível enviar.'); }
    finally { setBusy(false); }
  }

  return <Modal title={step === 'report' ? (post ? 'Denunciar publicação' : `Denunciar ${first}`) : step === 'block' ? `Bloquear ${first}?` : step === 'done' ? 'Denúncia enviada' : `Opções sobre ${first}`} onClose={onClose}>
    {step === 'menu' && <div className="nw-safety-menu">
      <button type="button" className="nw-safety-option" onClick={() => setStep('report')}><Flag size={18} aria-hidden="true" />{post ? 'Denunciar publicação' : `Denunciar ${first}`}</button>
      {blocked ? <button type="button" className="nw-safety-option" disabled={busy} onClick={() => void block(false)}><Ban size={18} aria-hidden="true" />Desbloquear {first}</button>
        : <button type="button" className="nw-safety-option danger" onClick={() => setStep('block')}><Ban size={18} aria-hidden="true" />Bloquear {first}</button>}
    </div>}
    {step === 'block' && <div className="nw-safety-confirm">
      <ul>
        <li>{first} deixa de ver seu perfil, suas publicações e seus stories, e você também deixa de ver o que {first} publica.</li>
        <li>Quem segue quem, dos dois lados, é desfeito.</li>
        <li>{first} não recebe aviso. Você desbloqueia quando quiser em Editar perfil › Pessoas bloqueadas.</li>
      </ul>
      <div className="form-footer"><button type="button" className="button outline" onClick={() => setStep('menu')}>Voltar</button>
        <button type="button" className="button primary cm-danger" disabled={busy} onClick={() => void block(true)}><Ban size={16} aria-hidden="true" />Bloquear</button></div>
    </div>}
    {step === 'report' && <form className="nw-safety-confirm" onSubmit={event => { event.preventDefault(); void report(); }}>
      <fieldset className="nw-choice"><legend>Qual é o problema?</legend>
        {reportReasons.map(item => <label key={item} className="cm-check"><input type="radio" name="report-reason" checked={reason === item} onChange={() => setReason(item)} /> {reasonLabels[item]}</label>)}
      </fieldset>
      <label htmlFor="report-note">Quer contar mais? · opcional</label>
      <textarea id="report-note" rows={3} maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
      <label className="cm-check"><input type="checkbox" checked={alsoBlock} onChange={event => setAlsoBlock(event.target.checked)} /> Bloquear {first} também</label>
      <p className="muted small">A denúncia vai só para a administração do app. {first} não fica sabendo quem denunciou.</p>
      <div className="form-footer"><button type="button" className="button outline" onClick={() => setStep('menu')}>Voltar</button>
        <button type="submit" className="button primary" disabled={busy}><Flag size={16} aria-hidden="true" />Enviar denúncia</button></div>
    </form>}
    {step === 'done' && <div className="nw-safety-confirm">
      <p role="status">Recebemos. A administração vai olhar com cuidado. Obrigado por ajudar a manter a Jornada um lugar seguro.</p>
      <div className="form-footer"><button type="button" className="button primary" onClick={onClose}>Fechar</button></div>
    </div>}
    {message && <p className="cm-message" role="alert">{message}</p>}
  </Modal>;
}

/** Editar perfil › Pessoas bloqueadas: a lista e o Desbloquear. */
export function BlockedList({ onClose }: { onClose: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { void api<Person[]>('/api/network?blocked=1').then(list => setPeople(list ?? []), () => setPeople([])); }, []);
  async function unblock(person: Person) {
    try { await api('/api/network', { action: 'block', person: person.id, blocking: false }); setPeople(list => (list ?? []).filter(item => item.id !== person.id)); setMessage(`Pronto: ${person.name} saiu da lista de bloqueados.`); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível desbloquear.'); }
  }
  return <Modal title="Pessoas bloqueadas" onClose={onClose}>
    {people === null ? <p role="status">Abrindo…</p> : people.length ? <ul className="cm-people">{people.map(person => <li key={person.id}>
      <span><strong>{person.name}</strong></span>
      <button type="button" className="button outline" onClick={() => void unblock(person)}>Desbloquear</button></li>)}</ul>
      : <p className="muted">Ninguém bloqueado.</p>}
    {message && <p className="cm-message" role="status">{message}</p>}
  </Modal>;
}
