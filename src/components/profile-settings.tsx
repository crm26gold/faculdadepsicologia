'use client';

import { useState, useRef, useEffect } from 'react';
import { Camera, Check, Download, GraduationCap, Mail, MapPin, Phone, ShieldCheck, Upload, User, Sparkles } from 'lucide-react';
import { OrganizationPanel } from './life-organization';
import type { Workspace } from '@/lib/workspace';
import { emptyProfile, type UserProfileData } from '@/lib/life-data';
export { emptyProfile as defaultUserProfile } from '@/lib/life-data';
export type { UserProfileData } from '@/lib/life-data';

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
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setProfile(data.profile ?? emptyProfile); }, [data.profile]);

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
              <h2>Foto e Identificação</h2>
              <p>Personalize seu perfil de estudante e dados acadêmicos.</p>
            </div>
            {savedNotice && (
              <span className="tiny-tag positive" style={{ background: '#ecfdf5', color: '#047857' }}>
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
              <label htmlFor="p-course">Curso ou atividade · opcional</label>
              <input
                id="p-course"
                value={profile.course}
                onChange={e => setProfile(prev => ({ ...prev, course: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="p-sem">Semestre atual</label>
              <input
                id="p-sem"
                value={profile.semester}
                onChange={e => setProfile(prev => ({ ...prev, semester: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="p-reg">Matrícula / RA</label>
              <input
                id="p-reg"
                value={profile.registration}
                onChange={e => setProfile(prev => ({ ...prev, registration: e.target.value }))}
              />
            </div>
          </div>

          <h3 style={{ marginTop: '24px', marginBottom: '10px' }}>Instituição e Contato</h3>
          <div className="form-grid">
            <div>
              <label htmlFor="p-inst">Universidade</label>
              <input
                id="p-inst"
                value={profile.institution}
                onChange={e => setProfile(prev => ({ ...prev, institution: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="p-campus">Campus / Polo</label>
              <input
                id="p-campus"
                value={profile.campus}
                onChange={e => setProfile(prev => ({ ...prev, campus: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="p-email">E-mail institucional / pessoal</label>
              <input
                id="p-email"
                type="email"
                value={profile.email}
                onChange={e => setProfile(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="p-phone">WhatsApp / Telefone</label>
              <input
                id="p-phone"
                value={profile.phone}
                onChange={e => setProfile(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-footer" style={{ marginTop: '20px' }}>
            <button type="submit" className="button primary">
              Salvar dados do perfil
            </button>
          </div>
          </fieldset>
        </form>

        {/* ORGANIZAÇÃO: ÁREAS E CADERNOS */}
        <OrganizationPanel data={data} update={update} blocked={blocked} />
      </div>

      {/* RIGHT COLUMN: PREVIEW CARD & SYSTEM INTEGRATIONS */}
      <div className="profile-preview-column">
        {/* PREVIEW CARD INSPIRED BY BROKER REFERENCE */}
        <div className="panel student-id-card">
          <div className="student-card-banner">
            <span className="inst-badge">{profile.institution}</span>
          </div>
          <div className="student-card-body">
            <div className="student-photo-frame">
              {profile.photoUrl ? (
                <img src={profile.photoUrl} alt={profile.name} />
              ) : (
                <span className="avatar-initials">{profile.name.slice(0, 1) || 'P'}</span>
              )}
            </div>
            <h3>{profile.name}</h3>
            <span className="student-role-chip">
              <GraduationCap size={13} /> {profile.course} · {profile.semester}
            </span>

            <div className="student-meta-list">
              <div className="meta-line">
                <MapPin size={14} />
                <span>{profile.campus}</span>
              </div>
              <div className="meta-line">
                <Mail size={14} />
                <span>{profile.email}</span>
              </div>
              {profile.phone && (
                <div className="meta-line">
                  <Phone size={14} />
                  <span>{profile.phone}</span>
                </div>
              )}
            </div>

            <div className="student-status-row">
              <span className="status-indicator-dot" />
              <span>Identificação pessoal: {profile.registration || 'não informada'} · sem validade de carteirinha oficial</span>
            </div>
          </div>
        </div>

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

        {/* CONEXÕES */}
        <div className="panel integrations-panel">
          <h3>Conexões & Serviços</h3>
          {[
            { name: 'Supabase Database', detail: 'Sincronização e autenticação', state: demo ? 'Desativado na demo' : mode === 'cloud' ? 'Ativo' : 'Aguardando config' },
            { name: 'Google Agenda', detail: 'Exportação manual .ics · sem sincronização automática', state: 'Exportação pronta' },
            { name: 'Planejador por regras', detail: 'Sugestões determinísticas, sem IA generativa conectada', state: 'Disponível' },
          ].map(item => (
            <div className="integration-row" key={item.name}>
              <div>
                <strong>{item.name}</strong>
                <small>{item.detail}</small>
              </div>
              <span className="tiny-tag">{item.state}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
