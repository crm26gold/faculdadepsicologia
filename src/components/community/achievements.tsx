'use client';
import { useState } from 'react';
import { api, formatDay } from './client';
import { Medal } from './medal';
import { achievementAudienceLabels, achievementAudiences, type Achievement, type Achievements } from '@/lib/network';

const number = (value: number | null | undefined) => (value ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function summary(item: Achievement, owner: boolean) {
  const { detail } = item;
  return [
    `Concluído em ${formatDay(detail.ends_on ?? item.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    detail.days ? `${detail.done ?? 0} de ${detail.days} dias` : '',
    detail.kind === 'quantidade' && detail.goal ? `${number(detail.goal)} ${detail.unit ?? ''} por dia` : '',
    owner && detail.space ? detail.space : '',
  ].filter(Boolean).join(' · ');
}

/** A aba Conquistas: as medalhas dos desafios concluídos. Quem ganhou escolhe quem vê cada uma e se a aba aparece para os outros. */
export function AchievementList({ data, owner, onChange }: { data: Achievements; owner: boolean; onChange: (next: Achievements) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save(body: Record<string, unknown>, next: Achievements, done: string) {
    setBusy(true); setMessage('');
    try { await api('/api/network', body); onChange(next); setMessage(done); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <div className="ach">
    {owner && <div className="ach-owner">
      <label className="cm-check"><input type="checkbox" checked={data.shown} disabled={busy}
        onChange={event => save({ action: 'show_achievements', shown: event.target.checked }, { ...data, shown: event.target.checked },
          event.target.checked ? 'A aba aparece para quem pode ver alguma medalha.' : 'A aba ficou só para você.')} /> Mostrar a aba Conquistas no meu perfil</label>
      <p className="muted small">Cada medalha começa em “Só eu”. Você escolhe quem vê: Seguidores, ou Público (num perfil fechado, Público também fica só para quem segue).</p>
    </div>}
    <ul className="ach-list">{data.items.map(item => <li key={item.id} className="panel ach-item">
      <Medal title={item.title} size={60} />
      <div>
        <strong>{item.title}</strong>
        <small>{summary(item, owner)}</small>
        {owner && <div className="nw-chips" role="group" aria-label={`Quem vê a medalha ${item.title}`}>{achievementAudiences.map(audience =>
          <button key={audience} type="button" className="nw-chip" aria-pressed={item.audience === audience} disabled={busy}
            onClick={() => item.audience !== audience && save({ action: 'achievement_audience', achievement: item.id, audience },
              { ...data, items: data.items.map(other => other.id === item.id ? { ...other, audience } : other) },
              `Agora ${audience === 'private' ? 'só você vê' : audience === 'followers' ? 'seus seguidores veem' : 'quem pode ver seu perfil vê'} “${item.title}”.`)}>
            {achievementAudienceLabels[audience]}</button>)}</div>}
      </div>
    </li>)}</ul>
    {message && <p className="cm-message" role="status">{message}</p>}
  </div>;
}
