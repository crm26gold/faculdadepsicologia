'use client';
import { useRef, useState } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { api } from './client';
import { audienceLabels, audiences, postStyles, styleLabels, topicsIn, type Audience, type PostStyle } from '@/lib/network';
import { postPhoto, type PostPhoto } from '@/lib/image-shrink';
import type { Home } from '@/lib/community';

/** Publicar: texto, card de texto ou fotos, com o público escolhido em cada publicação. Story some em 24 horas. */
export function Composer({ home, space, story: startAsStory, onPosted, onCancel }: {
  home: Home; space?: { id: string; name: string }; story?: boolean; onPosted: () => void; onCancel: () => void;
}) {
  const places = home.spaces.filter(item => item.my_role && !item.archived_at && item.kind !== 'institution');
  const [story, setStory] = useState(Boolean(startAsStory));
  const [body, setBody] = useState('');
  const [style, setStyle] = useState<PostStyle>('text');
  const [photos, setPhotos] = useState<PostPhoto[]>([]);
  const [audience, setAudience] = useState<Audience>(space ? 'group' : 'followers');
  const [target, setTarget] = useState(space?.id ?? places[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const closed = home.profile?.closed !== false;
  const topics = topicsIn(body);
  const maxPhotos = story ? 1 : 4;
  const choices = audiences.filter(item => !(story && item === 'private'));

  function pickMode(next: boolean) {
    setStory(next);
    if (next) { setPhotos(list => list.slice(0, 1)); if (audience === 'private') setAudience('followers'); }
  }
  async function addPhotos(files: FileList | null) {
    const chosen = [...(files ?? [])].slice(0, maxPhotos - photos.length);
    if (!chosen.length) return;
    setBusy(true); setMessage('');
    const ready: PostPhoto[] = [];
    for (const file of chosen) {
      const shrunk = await postPhoto(file);
      if (shrunk) ready.push(shrunk);
      else setMessage('Uma das fotos não pôde ser usada. Tente JPG, PNG ou WebP.');
    }
    setPhotos(list => [...list, ...ready].slice(0, maxPhotos));
    setBusy(false);
  }
  async function submit() {
    if (!body.trim() && !photos.length) { setMessage(story ? 'Escreva o texto do story ou escolha uma foto.' : 'Escreva alguma coisa ou escolha uma foto.'); return; }
    if (audience === 'group' && !target) { setMessage('Escolha o grupo.'); return; }
    setBusy(true); setMessage('');
    try {
      await api('/api/network', { action: 'create_post', body: body.trim(), style: photos.length ? 'text' : style, audience,
        space: audience === 'group' ? target : null, photos: photos.map(({ url: _url, ...photo }) => photo), story });
      onPosted();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível publicar.'); }
    finally { setBusy(false); }
  }
  const title = story ? 'Novo story' : space ? `Publicar em ${space.name}` : 'Publicar';
  return <section className="panel nw-form" aria-labelledby="nw-compose-title">
    <h2 id="nw-compose-title">{title}</h2>
    <div className="nw-chips" role="group" aria-label="Tipo">
      <button type="button" className="nw-chip" aria-pressed={!story} onClick={() => pickMode(false)}>Publicação</button>
      <button type="button" className="nw-chip" aria-pressed={story} onClick={() => pickMode(true)}>Story · some em 24 h</button>
    </div>
    <label htmlFor="nw-body">{story ? 'Texto do story' : 'O que você quer compartilhar?'}{photos.length ? ' · opcional' : ''}</label>
    <textarea id="nw-body" rows={story ? 2 : 4} maxLength={2200} value={body} onChange={event => setBody(event.target.value)}
      placeholder={story ? 'O que você está fazendo agora?' : 'Um resumo, uma dica, uma conquista… Use #temas para quem procura achar.'} />
    <small className="muted">{body.length}/2200{topics.length ? ` · temas: ${topics.map(topic => `#${topic}`).join(' ')}` : ''}</small>

    <fieldset className="nw-choice"><legend>{story ? 'Foto' : 'Fotos'}</legend>
      {photos.length > 0 && <ul className="nw-picked">{photos.map((photo, index) => <li key={photo.url.slice(-40) + index}>
        <img src={photo.url} alt={`Foto ${index + 1}`} />
        <button type="button" className="icon-button" aria-label={`Tirar a foto ${index + 1}`} onClick={() => setPhotos(list => list.filter((_, item) => item !== index))}><X size={16} aria-hidden="true" /></button>
      </li>)}</ul>}
      {photos.length < maxPhotos && <button type="button" className="button outline" disabled={busy} onClick={() => picker.current?.click()}>
        <ImagePlus size={16} aria-hidden="true" />{photos.length ? 'Mais uma foto' : story ? 'Escolher foto' : 'Escolher fotos (até 4)'}</button>}
      <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple={!story} hidden onChange={event => { void addPhotos(event.target.files); event.target.value = ''; }} />
      <p className="muted small">A foto é reduzida no seu aparelho antes de sair.{story ? ' O story e a foto somem em 24 horas.' : ''}</p>
    </fieldset>

    {!photos.length && <fieldset className="nw-choice"><legend>Jeito</legend>
      <div className="nw-chips">{postStyles.map(item => <button key={item} type="button" className={`nw-chip ${item}`} aria-pressed={style === item} onClick={() => setStyle(item)}>{styleLabels[item]}</button>)}</div>
      {style !== 'text' && body.trim() && <div className={`nw-card-text ${style}`} aria-label="Prévia do card"><p>{body}</p></div>}
      {style !== 'text' && <p className="muted small">O card é montado na tela a partir do texto: não vira arquivo nem ocupa espaço.</p>}
    </fieldset>}
    {!space && <fieldset className="nw-choice"><legend>Quem vê</legend>
      {choices.map(item => <label key={item} className="nw-radio"><input type="radio" name="nw-audience" checked={audience === item} disabled={item === 'group' && !places.length} onChange={() => setAudience(item)} />
        <span>{audienceLabels[item]}<small>{item === 'followers' ? 'Quem você aceitou como seguidor.' : item === 'public' ? closed ? 'Seu perfil é fechado: vale só para quem segue você.' : 'Qualquer pessoa que chegar ao seu perfil ou ao #tema.' : item === 'group' ? places.length ? 'Só quem é do grupo ou da sala.' : 'Entre em um grupo para usar.' : 'Fica guardada só para você.'}</small></span></label>)}
      {audience === 'group' && places.length > 0 && <><label htmlFor="nw-place" className="sr-only">Grupo</label>
        <select id="nw-place" value={target} onChange={event => setTarget(event.target.value)}>{places.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></>}
    </fieldset>}
    {message && <p className="cm-message" role="alert">{message}</p>}
    <div className="form-footer"><button type="button" className="button outline" onClick={onCancel}>Cancelar</button>
      <button type="button" className="button primary" disabled={busy} onClick={submit}>{story ? 'Publicar story' : 'Publicar'} <Send size={16} aria-hidden="true" /></button></div>
  </section>;
}
