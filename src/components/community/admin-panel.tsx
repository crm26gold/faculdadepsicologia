'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, History, KeyRound, Plus, School, Search, ShieldCheck, UserCog } from 'lucide-react';
import { Modal } from '../modal';
import { api, formatDay } from './client';
import { roleLabels, type AdminOverview } from '@/lib/community';

type Account = AdminOverview['accounts'][number];
const actionLabels: Record<string, string> = {
  update_account: 'alterou a conta', set_open_access: 'mudou o acesso da plataforma', create_institution: 'criou a instituição',
  grant_space_role: 'concedeu papel', change_space_role: 'mudou papel',
};

export function AdminPanel({ me, onOpenSpace }: { me: string; onOpenSpace: (id: string) => void }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState<{ kind: 'institution' } | { kind: 'class'; parent: string } | { kind: 'teacher'; space: string; name: string } | null>(null);

  const load = useCallback(async () => {
    try { setData(await api<AdminOverview>('/api/admin')); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Painel indisponível.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(url: string, body: Record<string, unknown>, done: string) {
    setBusy(true); setMessage('');
    try { await api(url, body); setMessage(done); await load(); return true; }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Falha.'); return false; }
    finally { setBusy(false); }
  }

  const names = useMemo(() => new Map((data?.accounts ?? []).map(account => [account.user_id, account.display_name || account.email])), [data]);
  if (error) return <div className="error-banner" role="alert">{error}</div>;
  if (!data) return <p role="status" className="loading-panel">Abrindo painel…</p>;
  const filtered = data.accounts.filter(account => `${account.display_name} ${account.email}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  const institutions = data.spaces.filter(space => space.kind === 'institution');
  const children = (id: string) => data.spaces.filter(space => space.parent_id === id);
  const spaceName = (id: string | null) => data.spaces.find(space => space.id === id)?.name ?? '';

  return <div className="cm-stack">
    {message && <p className="cm-message" role="status">{message}</p>}
    <section className="panel cm-admin-switch">
      <div><h2><KeyRound size={16} aria-hidden="true" /> Fase de lançamento</h2>
        <p>{data.settings.open_access ? 'Tudo liberado para todos (piloto gratuito). Desligue quando abrir as vendas do Pro.' : 'Recursos Pro só para quem tem plano Pro ou cortesia.'}</p></div>
      <button className={`button ${data.settings.open_access ? 'outline' : 'primary'}`} disabled={busy} onClick={() => {
        const next = !data.settings.open_access;
        if (window.confirm(next ? 'Liberar todos os recursos para todas as contas?' : 'Restringir os recursos Pro a quem tem plano Pro ou cortesia?')) void run('/api/admin', { action: 'set_open_access', value: next }, next ? 'Tudo liberado.' : 'Recursos Pro restritos.');
      }}>{data.settings.open_access ? 'Restringir ao Pro' : 'Liberar tudo'}</button>
    </section>

    <section className="panel">
      <div className="section-heading"><h2><Building2 size={16} aria-hidden="true" /> Estrutura</h2><button className="button outline" onClick={() => setCreating({ kind: 'institution' })}><Plus size={16} aria-hidden="true" />Instituição</button></div>
      {institutions.map(inst => <div key={inst.id} className="cm-tree">
        <div className="cm-tree-row"><strong>{inst.name}</strong><button className="text-button" onClick={() => setCreating({ kind: 'class', parent: inst.id })}><Plus size={13} aria-hidden="true" />Sala</button></div>
        {children(inst.id).map(cls => <div key={cls.id} className="cm-tree-branch">
          <div className="cm-tree-row"><button className="text-button" onClick={() => onOpenSpace(cls.id)}><School size={14} aria-hidden="true" />{cls.name}</button><small>{cls.members} pessoas · {children(cls.id).length} grupos</small>
            <button className="text-button" onClick={() => setCreating({ kind: 'teacher', space: cls.id, name: cls.name })}><UserCog size={13} aria-hidden="true" />Professor(a)</button></div>
          {children(cls.id).map(group => <div key={group.id} className="cm-tree-leaf"><button className="text-button" onClick={() => onOpenSpace(group.id)}>{group.name}</button><small>{group.members} pessoas{group.archived_at ? ' · arquivado' : ''}</small></div>)}
        </div>)}
      </div>)}
      {!institutions.length && <p className="muted">Comece criando a instituição (ex.: UNIP), depois a sala e os professores. Dentro da sala você ou o professor criam os grupos.</p>}
    </section>

    <section className="panel">
      <div className="section-heading"><h2><ShieldCheck size={16} aria-hidden="true" /> Contas ({data.accounts.length})</h2></div>
      <label className="cm-search"><Search size={15} aria-hidden="true" /><span className="sr-only">Buscar conta</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por nome ou e-mail" /></label>
      <ul className="cm-people">{filtered.map(account => <li key={account.user_id}>
        <span className="cm-avatar" aria-hidden="true">{(account.display_name || account.email || '?').slice(0, 1).toUpperCase()}</span>
        <span className="cm-person"><strong>{account.display_name || 'Sem nome'}{account.user_id === me ? ' (você)' : ''}</strong>
          <small>{account.email} · {account.is_master ? 'Master' : account.plan === 'pro' ? `Pro${account.plan_source === 'courtesy' ? ' (cortesia)' : ''}` : 'Acadêmico'} · {account.spaces} salas/grupos · desde {formatDay(account.created_at)}</small></span>
        <button className="button outline" onClick={() => setEditing(account)}>Gerenciar</button>
      </li>)}</ul>
    </section>

    <section className="panel">
      <div className="section-heading"><h2><History size={16} aria-hidden="true" /> Histórico administrativo</h2></div>
      <ul className="cm-audit">{data.audit.map(item => <li key={item.id}><small>{formatDay(item.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small>
        <span><strong>{names.get(item.actor_id ?? '') ?? 'Conta removida'}</strong> {actionLabels[item.action] ?? item.action}{item.target_user_id ? ` · ${names.get(item.target_user_id) ?? 'conta'}` : ''}{item.target_space_id ? ` · ${spaceName(item.target_space_id) || 'espaço'}` : ''}
          {typeof item.details.role === 'string' ? ` (${roleLabels[item.details.role as keyof typeof roleLabels] ?? item.details.role})` : ''}</span></li>)}</ul>
      {!data.audit.length && <p className="muted">Nenhuma ação administrativa ainda.</p>}
    </section>

    {editing && <Modal title={editing.display_name || editing.email} onClose={() => setEditing(null)}><form className="entry-form" onSubmit={async event => {
      event.preventDefault(); const f = new FormData(event.currentTarget);
      const ok = await run('/api/admin', {
        action: 'update_account', account: editing.user_id, plan: f.get('plan'), source: f.get('source'), pro_until: f.get('pro_until') || null,
        credits: Number(f.get('credits') || 0), features: f.getAll('features'), master: f.get('master') === 'on',
      }, 'Conta atualizada.');
      if (ok) setEditing(null);
    }}>
      <p className="muted small">{editing.email}</p>
      <div className="form-grid">
        <div><label htmlFor="acc-plan">Plano</label><select id="acc-plan" name="plan" defaultValue={editing.plan}><option value="academic">Acadêmico (grátis)</option><option value="pro">Pro</option></select></div>
        <div><label htmlFor="acc-source">Origem</label><select id="acc-source" name="source" defaultValue={editing.plan_source}><option value="free">Gratuito</option><option value="paid">Pago</option><option value="courtesy">Cortesia</option></select></div>
        <div><label htmlFor="acc-until">Pro válido até (opcional)</label><input id="acc-until" name="pro_until" type="date" defaultValue={editing.pro_until?.slice(0, 10) ?? ''} /></div>
        <div><label htmlFor="acc-credits">Créditos de IA (anotação; ainda não limita o uso)</label><input id="acc-credits" name="credits" type="number" min={0} max={1000000} defaultValue={editing.ai_credits} /></div>
      </div>
      <fieldset className="cm-targets"><legend>Funções liberadas</legend>
        <label className="cm-check"><input type="checkbox" name="features" value="create_classes" defaultChecked={editing.features.includes('create_classes')} /> Pode criar salas nas instituições em que participa</label>
        <label className="cm-check"><input type="checkbox" name="features" value="ai" defaultChecked={editing.features.includes('ai')} /> Pode usar recursos de IA</label>
      </fieldset>
      <label className="cm-check"><input type="checkbox" name="master" defaultChecked={editing.is_master} disabled={editing.user_id === me} /> Administrador master (acesso total)</label>
      {editing.user_id === me && <input type="hidden" name="master" value="on" />}
      <p className="muted small">Papéis de professor são dados por sala, na Estrutura acima. Tudo aqui fica no histórico.</p>
      <div className="form-footer"><button className="button primary" disabled={busy}>Salvar</button></div>
    </form></Modal>}

    {creating && creating.kind !== 'teacher' && <Modal title={creating.kind === 'institution' ? 'Nova instituição' : 'Nova sala'} onClose={() => setCreating(null)}><form className="entry-form" onSubmit={async event => {
      event.preventDefault(); const f = new FormData(event.currentTarget);
      const ok = await run('/api/spaces', { action: 'create_space', kind: creating.kind, name: f.get('name'), parent: creating.kind === 'class' ? creating.parent : null, description: f.get('description') ?? '', color: 'blue' }, creating.kind === 'institution' ? 'Instituição criada.' : 'Sala criada.');
      if (ok) setCreating(null);
    }}>
      <label htmlFor="new-space-name">Nome</label><input id="new-space-name" name="name" required maxLength={160} placeholder={creating.kind === 'institution' ? 'Ex.: UNIP' : 'Ex.: Psicologia · 1º semestre · noite'} />
      <label htmlFor="new-space-description">Descrição (opcional)</label><input id="new-space-description" name="description" maxLength={2000} placeholder={creating.kind === 'class' ? 'Campus, turno, turma' : ''} />
      <div className="form-footer"><button className="button primary" disabled={busy}>Criar</button></div>
    </form></Modal>}

    {creating?.kind === 'teacher' && <Modal title={`Professor(a) em ${creating.name}`} onClose={() => setCreating(null)}><form className="entry-form" onSubmit={async event => {
      event.preventDefault(); const f = new FormData(event.currentTarget);
      const ok = await run('/api/spaces', { action: 'add_member', space: creating.space, email: String(f.get('email') ?? '').trim(), role: f.get('role') }, 'Papel concedido.');
      if (ok) setCreating(null);
    }}>
      <p className="muted small">A pessoa precisa ter entrado no Jornada Plena ao menos uma vez com este e-mail do Google.</p>
      <label htmlFor="teacher-email">E-mail</label><input id="teacher-email" name="email" type="email" required maxLength={254} />
      <label htmlFor="teacher-role">Papel</label><select id="teacher-role" name="role"><option value="teacher">Professor(a)</option><option value="assistant">Professor(a) auxiliar</option><option value="student">Aluno(a)</option><option value="leader">Líder</option></select>
      <div className="form-footer"><button className="button primary" disabled={busy}>Conceder</button></div>
    </form></Modal>}
  </div>;
}
