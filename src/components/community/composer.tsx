'use client';
import { useState } from 'react';
import { Send } from 'lucide-react';
import { api } from './client';
import { audienceLabels, audiences, postStyles, styleLabels, topicsIn, type Audience, type PostStyle } from '@/lib/network';
import type { Home } from '@/lib/community';

/** Publicar: texto ou card de texto, com o público escolhido em cada publicação. */
export function Composer({ home, space, onPosted, onCancel }: {
  home: Home; space?: { id: string; name: string }; onPosted: () => void; onCancel: () => void;
}) {
  const places = home.spaces.filter(item => item.my_role && !item.archived_at && item.kind !== 'institution');
  const [body, setBody] = useState('');
  const [style, setStyle] = useState<PostStyle>('text');
  const [audience, setAudience] = useState<Audience>(space ? 'group' : 'followers');
  const [target, setTarget] = useState(space?.id ?? places[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const closed = home.profile?.closed !== false;
  const topics = topicsIn(body);
  async function submit() {
    if (!body.trim()) { setMessage('Escreva alguma coisa.'); return; }
    if (audience === 'group' && !target) { setMessage('Escolha o grupo.'); return; }
    setBusy(true); setMessage('');
    try {
      await api('/api/network', { action: 'create_post', body: body.trim(), style, audience, space: audience === 'group' ? target : null });
      onPosted();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível publicar.'); }
    finally { setBusy(false); }
  }
  return <section className="panel nw-form" aria-labelledby="nw-compose-title">
    <h2 id="nw-compose-title">{space ? `Publicar em ${space.name}` : 'Publicar'}</h2>
    <label htmlFor="nw-body">O que você quer compartilhar?</label>
    <textarea id="nw-body" rows={4} maxLength={2200} value={body} onChange={event => setBody(event.target.value)} placeholder="Um resumo, uma dica, uma conquista… Use #temas para quem procura achar." />
    <small className="muted">{body.length}/2200{topics.length ? ` · temas: ${topics.map(topic => `#${topic}`).join(' ')}` : ''}</small>
    <fieldset className="nw-choice"><legend>Jeito</legend>
      <div className="nw-chips">{postStyles.map(item => <button key={item} type="button" className={`nw-chip ${item}`} aria-pressed={style === item} onClick={() => setStyle(item)}>{styleLabels[item]}</button>)}</div>
      {style !== 'text' && body.trim() && <div className={`nw-card-text ${style}`} aria-label="Prévia do card"><p>{body}</p></div>}
      {style !== 'text' && <p className="muted small">O card é montado na tela a partir do texto: não vira arquivo nem ocupa espaço.</p>}
    </fieldset>
    {!space && <fieldset className="nw-choice"><legend>Quem vê</legend>
      {audiences.map(item => <label key={item} className="nw-radio"><input type="radio" name="nw-audience" checked={audience === item} disabled={item === 'group' && !places.length} onChange={() => setAudience(item)} />
        <span>{audienceLabels[item]}<small>{item === 'followers' ? 'Quem você aceitou como seguidor.' : item === 'public' ? closed ? 'Seu perfil é fechado: vale só para quem segue você.' : 'Qualquer pessoa que chegar ao seu perfil ou ao #tema.' : item === 'group' ? places.length ? 'Só quem é do grupo ou da sala.' : 'Entre em um grupo para usar.' : 'Fica guardada só para você.'}</small></span></label>)}
      {audience === 'group' && places.length > 0 && <><label htmlFor="nw-place" className="sr-only">Grupo</label>
        <select id="nw-place" value={target} onChange={event => setTarget(event.target.value)}>{places.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></>}
    </fieldset>}
    {message && <p className="cm-message" role="alert">{message}</p>}
    <div className="form-footer"><button type="button" className="button outline" onClick={onCancel}>Cancelar</button>
      <button type="button" className="button primary" disabled={busy} onClick={submit}>Publicar <Send size={16} aria-hidden="true" /></button></div>
  </section>;
}
