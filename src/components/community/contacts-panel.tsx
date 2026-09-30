'use client';
import { useCallback, useEffect, useState } from 'react';
import { Cake, Contact as ContactIcon, Plus, Search, Trash2 } from 'lucide-react';
import { Modal } from '../modal';
import { api, formatDay } from './client';
import { upcomingBirthdays, type Contact } from '@/lib/community';
import { dateKey } from '@/lib/workspace';

export function ContactsPanel() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const load = useCallback(async () => {
    try { setContacts(await api<Contact[]>('/api/contacts')); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Contatos indisponíveis.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage('');
    try { await api('/api/contacts', body); setMessage(done); await load(); return true; }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Falha ao salvar.'); return false; }
    finally { setBusy(false); }
  }
  if (error) return <div className="error-banner" role="alert">{error}</div>;
  if (!contacts) return <p role="status" className="loading-panel">Abrindo contatos…</p>;
  const birthdays = upcomingBirthdays(contacts, dateKey(), 30);
  const filtered = contacts.filter(contact => `${contact.name} ${contact.email} ${contact.notes}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  const current = editing && editing !== 'new' ? editing : null;

  return <div className="cm-stack">
    <p className="cm-privacy-note">Sua agenda é privada: ninguém mais vê estes contatos, nem a administração. Serve também para quem não usa o sistema.</p>
    {message && <p className="cm-message" role="status">{message}</p>}
    {birthdays.length > 0 && <section className="panel"><div className="section-heading"><h2><Cake size={16} aria-hidden="true" /> Aniversários nos próximos 30 dias</h2></div>
      <ul className="cm-todo">{birthdays.map(({ contact, inDays, date }) => <li key={contact.id}><button onClick={() => setEditing(contact)}>
        <span className="cm-status approved">{inDays === 0 ? 'Hoje!' : inDays === 1 ? 'Amanhã' : `em ${inDays} dias`}</span><strong>{contact.name}</strong><small>{date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</small></button></li>)}</ul></section>}
    <div className="section-heading"><label className="cm-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Buscar contato</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar contato" /></label>
      <button className="button primary" onClick={() => setEditing('new')}><Plus size={16} aria-hidden="true" />Novo contato</button></div>
    <ul className="cm-people">{filtered.map(contact => <li key={contact.id}>
      <span className="cm-avatar" aria-hidden="true">{contact.name.slice(0, 1).toUpperCase()}</span>
      <button className="cm-person cm-person-button" onClick={() => setEditing(contact)}><strong>{contact.name}</strong><small>{[contact.email, contact.phone, contact.birthdate ? `🎂 ${formatDay(contact.birthdate, { day: 'numeric', month: 'long' })}` : ''].filter(Boolean).join(' · ') || contact.notes || 'Sem detalhes'}</small></button>
    </li>)}</ul>
    {!contacts.length && <div className="empty-inline"><ContactIcon size={22} aria-hidden="true" /><p>Guarde colegas, professores e família. Com a data de nascimento, você é lembrado de dar parabéns.</p></div>}

    {editing && <Modal title={current ? 'Editar contato' : 'Novo contato'} onClose={() => setEditing(null)}><form className="entry-form" onSubmit={async event => {
      event.preventDefault(); const f = new FormData(event.currentTarget);
      const ok = await run({ action: 'save', contact: current?.id ?? null, name: f.get('name'), email: String(f.get('email') ?? '').trim(), phone: f.get('phone') ?? '', birthdate: f.get('birthdate') || null, notes: f.get('notes') ?? '' }, 'Contato salvo.');
      if (ok) setEditing(null);
    }}>
      <label htmlFor="contact-name">Nome</label><input id="contact-name" name="name" required maxLength={160} defaultValue={current?.name ?? ''} />
      <div className="form-grid"><div><label htmlFor="contact-email">E-mail</label><input id="contact-email" name="email" type="email" maxLength={254} defaultValue={current?.email ?? ''} /></div>
        <div><label htmlFor="contact-phone">Telefone</label><input id="contact-phone" name="phone" maxLength={40} defaultValue={current?.phone ?? ''} /></div></div>
      <label htmlFor="contact-birth">Aniversário</label><input id="contact-birth" name="birthdate" type="date" defaultValue={current?.birthdate ?? ''} />
      <label htmlFor="contact-notes">Observações</label><textarea id="contact-notes" name="notes" rows={3} maxLength={2000} defaultValue={current?.notes ?? ''} placeholder="Ex.: grupo de Ética, colega do estágio" />
      <div className="form-footer">{current && <button type="button" className="button outline" disabled={busy} onClick={async () => { if (window.confirm(`Excluir ${current.name}?`) && await run({ action: 'delete', contact: current.id }, 'Contato excluído.')) setEditing(null); }}><Trash2 size={16} aria-hidden="true" />Excluir</button>}
        <button className="button primary" disabled={busy}>Salvar</button></div>
    </form></Modal>}
  </div>;
}
