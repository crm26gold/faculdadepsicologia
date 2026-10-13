import type { Avatar } from '@/lib/community';

export const animals = ['🦊', '🐼', '🦉', '🐢', '🐙', '🐝', '🦋', '🐬', '🐨', '🦁', '🐸', '🐧'];
export const symbols = ['🌿', '📚', '🧠', '⭐', '🎯', '🎨', '🎵', '☀️', '💡', '🌊', '🔥', '🌙'];

export const initialsOf = (name: string) => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase() || '?';

/** Foto, bichinho, símbolo ou iniciais. Sem perfil, mostra as iniciais do nome. */
export function PersonAvatar({ name, avatar, size = 36 }: { name: string; avatar?: Avatar | null; size?: number }) {
  const style = { inlineSize: size, blockSize: size, fontSize: Math.round(size * (avatar?.kind === 'animal' || avatar?.kind === 'symbol' ? 0.55 : 0.38)) };
  if (avatar?.kind === 'photo' && avatar.photo) return <img className="nw-avatar" src={avatar.photo} alt="" width={size} height={size} style={style} />;
  const glyph = (avatar?.kind === 'animal' || avatar?.kind === 'symbol') && avatar.value ? avatar.value : initialsOf(name);
  return <span className={`nw-avatar ${avatar?.kind === 'animal' || avatar?.kind === 'symbol' ? 'glyph' : ''}`} style={style} aria-hidden="true">{glyph}</span>;
}
