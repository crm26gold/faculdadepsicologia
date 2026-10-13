'use client';
import { useRef, useState } from 'react';
import { Camera, Check } from 'lucide-react';
import { api } from './client';
import { PersonAvatar, animals, symbols } from './avatar';
import { avatarThumbnail } from '@/lib/image-shrink';
import type { AvatarKind, MyProfile } from '@/lib/community';

const kindLabels: Record<AvatarKind, string> = { initials: 'Iniciais', animal: 'Bichinho', symbol: 'Símbolo', photo: 'Foto' };

/** Perfil primeiro: nome (obrigatório) e avatar. A bio é opcional. Serve para criar e para editar. */
export function ProfileEditor({ name: initialName, profile, personalPhoto, first, onSaved, onCancel }: {
  name: string; profile?: MyProfile | null; personalPhoto?: string; first?: boolean;
  onSaved: () => void; onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<AvatarKind>(profile?.kind ?? 'initials');
  const [value, setValue] = useState(profile?.value || animals[0]);
  const [photo, setPhoto] = useState(profile?.photo ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function pickKind(next: AvatarKind) {
    setKind(next);
    if (next === 'animal' && !animals.includes(value)) setValue(animals[0]);
    if (next === 'symbol' && !symbols.includes(value)) setValue(symbols[0]);
  }
  async function usePhoto(file: Blob | undefined) {
    if (!file) return;
    setMessage('');
    const thumb = await avatarThumbnail(file);
    if (!thumb) { setMessage('Não consegui usar esta imagem. Tente uma foto JPG, PNG ou WebP.'); return; }
    setPhoto(thumb); setKind('photo');
  }
  async function save() {
    if (!name.trim()) { setMessage('Escreva seu nome.'); return; }
    if (kind === 'photo' && !photo) { setMessage('Escolha uma foto ou outro avatar.'); return; }
    setBusy(true); setMessage('');
    try {
      await api('/api/me', { action: 'save_profile', name: name.trim(), kind, value: kind === 'animal' || kind === 'symbol' ? value : '', photo: kind === 'photo' ? photo : null, bio: bio.trim() });
      onSaved();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  const preview = { kind, value, photo: kind === 'photo' ? photo : null };

  return <section className="panel nw-profile-editor" aria-labelledby="nw-profile-title">
    <h2 id="nw-profile-title">{first ? 'Antes de começar: como as pessoas veem você' : 'Editar perfil'}</h2>
    {first && <p className="muted">Nos grupos, aparecem seu nome e seu avatar. O resto da sua vida no app continua só seu.</p>}
    <div className="nw-profile-preview"><PersonAvatar name={name} avatar={preview} size={72} /><strong>{name.trim() || 'Seu nome'}</strong></div>
    <label htmlFor="nw-name">Nome</label>
    <input id="nw-name" value={name} onChange={event => setName(event.target.value)} maxLength={120} required autoComplete="name" />
    <fieldset className="nw-choice"><legend>Avatar</legend>
      <div className="nw-chips">{(Object.keys(kindLabels) as AvatarKind[]).map(item => <button key={item} type="button" className="nw-chip" aria-pressed={kind === item} onClick={() => item === 'photo' && !photo ? input.current?.click() : pickKind(item)}>{kindLabels[item]}</button>)}</div>
      {(kind === 'animal' || kind === 'symbol') && <div className="nw-glyphs" role="group" aria-label={kind === 'animal' ? 'Bichinhos' : 'Símbolos'}>
        {(kind === 'animal' ? animals : symbols).map(item => <button key={item} type="button" className="nw-glyph" aria-pressed={value === item} aria-label={item} onClick={() => setValue(item)}>{item}</button>)}
      </div>}
      {kind === 'photo' && photo && <button type="button" className="text-button" onClick={() => input.current?.click()}><Camera size={14} aria-hidden="true" />Trocar a foto</button>}
      {personalPhoto && kind !== 'photo' && <button type="button" className="text-button" onClick={() => fetch(personalPhoto).then(response => response.blob()).then(usePhoto, () => setMessage('Não consegui usar a foto do seu perfil.'))}>Usar a foto do meu espaço</button>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => { void usePhoto(event.target.files?.[0]); event.target.value = ''; }} />
    </fieldset>
    <label htmlFor="nw-bio">Sobre você · opcional</label>
    <textarea id="nw-bio" rows={2} maxLength={300} value={bio} onChange={event => setBio(event.target.value)} placeholder="Ex.: Psicologia na UNIP · corrida e neurociência" />
    {message && <p className="cm-message" role="alert">{message}</p>}
    <div className="form-footer">
      {onCancel && <button type="button" className="button outline" onClick={onCancel}>Cancelar</button>}
      <button type="button" className="button primary" disabled={busy} onClick={save}>{first ? 'Continuar' : 'Salvar'} <Check size={16} aria-hidden="true" /></button>
    </div>
  </section>;
}
