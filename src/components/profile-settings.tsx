'use client';

import { useState, useRef, useEffect } from 'react';
import { Camera, Check, Download, GraduationCap, Mail, MapPin, Phone, ShieldCheck, Upload, User, Sparkles } from 'lucide-react';
import { OrganizationPanel } from './life-organization';
import type { Workspace } from '@/lib/workspace';
import { emptyProfile, type UserProfileData } from '@/lib/life-data';
export { emptyProfile as defaultUserProfile } from '@/lib/life-data';
export type { UserProfileData } from '@/lib/life-data';

type ThemePreference = 'light' | 'dark' | 'system';
const THEME_CHANGE_EVENT = 'jornada-theme-change';

function savedThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem('jornada-theme');
    return value === 'dark' || value === 'system' ? value : 'light';
  } catch {
    return 'light';
  }
}

function renderTheme(preference: ThemePreference, systemDark: boolean) {
  document.documentElement.setAttribute('data-theme-preference', preference);
  if (preference === 'dark' || (preference === 'system' && systemDark)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function WorkspaceThemeObserver({ demo }: { demo: boolean }) {
  useEffect(() => {
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    let preference: ThemePreference = demo ? 'light' : savedThemePreference();
    const syncTheme = () => renderTheme(preference, scheme.matches);
    const preferenceChanged = (event: Event) => {
      const next = (event as CustomEvent<ThemePreference>).detail;
      if (next !== 'light' && next !== 'dark' && next !== 'system') return;
      preference = next;
      syncTheme();
    };
    syncTheme();
    scheme.addEventListener('change', syncTheme);
    window.addEventListener(THEME_CHANGE_EVENT, preferenceChanged);
    return () => {
      scheme.removeEventListener('change', syncTheme);
      window.removeEventListener(THEME_CHANGE_EVENT, preferenceChanged);
    };
  }, [demo]);
  return null;
}

export function ProfileSettings({
  data,
  update,
  blocked,
  demo,
  mode,
  privacyNotice,
  downloadData,
  onImportClick,
  authenticated,
}: {
  data: Workspace;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  blocked: boolean;
  demo: boolean;
  mode: 'local' | 'cloud' | 'demo';
  privacyNotice: string;
  downloadData: () => void;
  onImportClick: () => void;
  authenticated: boolean;
}) {
  const [profile, setProfile] = useState<UserProfileData>(data.profile ?? emptyProfile);
  const [photoError, setPhotoError] = useState('');

  const [savedNotice, setSavedNotice] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>('light');
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setProfile(data.profile ?? emptyProfile); }, [data.profile]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const activeTheme = document.documentElement.getAttribute('data-theme-preference');
      const preference = activeTheme === 'light' || activeTheme === 'dark' || activeTheme === 'system'
        ? activeTheme
        : demo ? 'light' : savedThemePreference();
      setTheme(preference);
      renderTheme(preference, window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  }, [demo]);

  function applyTheme(newTheme: ThemePreference) {
    setTheme(newTheme);
    if (!demo && typeof window !== 'undefined') {
      try {
        localStorage.setItem('jornada-theme', newTheme);
      } catch {}
    }
    if (typeof window !== 'undefined') {
      renderTheme(newTheme, window.matchMedia('(prefers-color-scheme: dark)').matches);
      window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_CHANGE_EVENT, { detail: newTheme }));
    }
  }

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (blocked) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 250_000) {
      setPhotoError('Use JPG, PNG ou WebP de até 250 KB para o perfil.');
      return;
    }
    setPhotoError('');
    const reader = new FileReader();
    reader.onerror = () => setPhotoError('Não foi possível ler a foto. Tente novamente.');
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfile(prev => ({ ...prev, photoUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (blocked || !update(previous => ({ ...previous, profile }))) return;
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  }

  return (
    <div className="profile-settings-layout">
      {/* LEFT COLUMN: EDIT FORM */}
      <div className="profile-form-column">
        <form onSubmit={handleSave} className="panel profile-editor-panel">
          <fieldset disabled={blocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="section-heading">
            <div>
              <h2>Seu perfil</h2>
              <p>Como você aparece no app e como podemos falar com você. Cursos e instituições ficam em Estudos.</p>
            </div>
            {savedNotice && (
              <span className="tiny-tag positive" style={{ background: 'var(--ok-bg)', color: 'var(--ok-text)' }}>
                <Check size={12} /> Alteração enviada · confira o indicador de salvamento
              </span>
            )}
          </div>

          <div className="photo-upload-row">
            <div className="profile-avatar-large">
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt="Foto de perfil" />
              ) : (
                <span className="avatar-initials">{profile.name.slice(0, 1) || 'P'}</span>
              )}
            </div>
            <div className="photo-actions">
              {!demo && (
                <input
                  type="file"
                  ref={photoInputRef}
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                  aria-label="Upload de foto de perfil"
                />
              )}
              <button
                type="button"
                className="button outline"
                onClick={() => {
                  if (demo) {
                    alert('Upload de foto desativado na demonstração pública.');
                  } else {
                    photoInputRef.current?.click();
                  }
                }}
              >
                <Camera size={15} aria-hidden="true" />
                Alterar foto
              </button>
              {profile.photoUrl && (
                <button
                  type="button"
                  className="button outline"
                  onClick={() => setProfile(prev => ({ ...prev, photoUrl: '' }))}
                >
                  Usar iniciais originais
                </button>
              )}
              <small className="muted">JPG, PNG ou WebP · até 250 KB · incluída no backup</small>
              {photoError && <p role="alert">{photoError}</p>}
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: '16px' }}>
            <div>
              <label htmlFor="p-name">Seu nome</label>
              <input
                id="p-name"
                value={profile.name}
                onChange={e => setProfile(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label htmlFor="p-email">E-mail para contato · opcional</label>
              <input
                id="p-email"
                type="email"
                value={profile.email}
                onChange={e => setProfile(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="p-phone">Telefone · opcional</label>
              <input
                id="p-phone"
                value={profile.phone}
                onChange={e => setProfile(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-footer" style={{ marginTop: '20px' }}>
            <button type="submit" className="button primary">
              Salvar perfil
            </button>
          </div>
          </fieldset>
        </form>

        {/* ORGANIZAÇÃO: ÁREAS E CADERNOS */}
        <OrganizationPanel data={data} update={update} blocked={blocked} />
      </div>

      {/* RIGHT COLUMN: PREVIEW CARD & SYSTEM INTEGRATIONS */}
      <div className="profile-preview-column">
        {/* BACKUP & PRIVACIDADE */}
        <div className="panel backup-card">
          <h3>Segurança e Backup dos Dados</h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
            {demo
              ? 'Ambiente de demonstração. Dados descartáveis e salvos apenas na sessão da aba.'
              : mode === 'local'
              ? privacyNotice
              : 'Seu acesso é validado no servidor.'}
          </p>

          <div className="notice" style={{ margin: '14px 0' }}>
            <ShieldCheck size={18} aria-hidden="true" />
            <span>{mode === 'cloud' ? 'Dados sincronizados na sua conta privada. Não enviados a uma IA.' : 'Dados locais ou temporários, sem sincronização na nuvem.'} O JSON inclui perfil, finanças e hábitos; anexos do caderno são referências, não cópias dos arquivos.</span>
          </div>

          {!demo && (
            <div className="button-row">
              <button className="button primary" onClick={downloadData}>
                <Download size={15} aria-hidden="true" />
                Exportar meus dados (JSON)
              </button>
              <button className="button outline" disabled={blocked} onClick={onImportClick}>
                <Upload size={15} aria-hidden="true" />
                Importar backup
              </button>
            </div>
          )}

          {(mode === 'cloud' || authenticated) && (
            <form action="/auth/logout" method="post" style={{ marginTop: '16px' }}>
              <button className="button outline">Sair da conta</button>
            </form>
          )}
        </div>

        {/* TEMA & MODO NOTURNO */}
        <div className="panel" style={{ padding: 18, background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)' }}>
          <h3>Aparência & Modo Noturno</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '4px 0 12px' }}>
            Adapte a interface para estudar à noite sem cansar a visão.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`button ${theme === 'light' ? 'primary' : 'outline'}`}
              aria-pressed={theme === 'light'}
              onClick={() => applyTheme('light')}
              style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            >
              ☀️ Modo Claro
            </button>
            <button
              type="button"
              className={`button ${theme === 'dark' ? 'primary' : 'outline'}`}
              aria-pressed={theme === 'dark'}
              onClick={() => applyTheme('dark')}
              style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            >
              🌙 Modo Escuro
            </button>
            <button
              type="button"
              className={`button ${theme === 'system' ? 'primary' : 'outline'}`}
              aria-pressed={theme === 'system'}
              onClick={() => applyTheme('system')}
              style={{ fontSize: '0.78rem', padding: '6px 12px' }}
            >
              ⚙️ Automático
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
