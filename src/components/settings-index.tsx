'use client';
import { Bell, ChevronRight, Database, LayoutGrid, Mail, MessageCircle, Palette, Sparkles, UserRound } from 'lucide-react';
import { PersonAvatar } from './community/avatar';
import type { Avatar } from '@/lib/community';

export const settingsSections = ['conta', 'contato', 'areas', 'aparencia', 'avisos', 'conexoes', 'assistentes', 'dados'] as const;
export type SettingsSection = typeof settingsSections[number];

const rows: { id: SettingsSection; title: string; detail: string; Icon: typeof Bell; cloud?: boolean }[] = [
  { id: 'conta', title: 'Conta', detail: 'E-mail de login, plano e excluir a conta', Icon: UserRound, cloud: true },
  { id: 'contato', title: 'Contato', detail: 'E-mail e telefone para falarmos com você. Ninguém mais vê.', Icon: Mail },
  { id: 'areas', title: 'Áreas da vida e cadernos', detail: 'O que organiza metas, rotina, finanças e o caderno', Icon: LayoutGrid },
  { id: 'aparencia', title: 'Aparência', detail: 'Claro, escuro ou igual ao celular', Icon: Palette },
  { id: 'avisos', title: 'Avisos', detail: 'Notificações do app, horário de silêncio e extras', Icon: Bell, cloud: true },
  { id: 'conexoes', title: 'Telegram e WhatsApp', detail: 'Converse com o app pelo Telegram e pelo WhatsApp', Icon: MessageCircle, cloud: true },
  { id: 'assistentes', title: 'Assistentes e IA', detail: 'Claude, ChatGPT e suas chaves de IA', Icon: Sparkles, cloud: true },
  { id: 'dados', title: 'Seus dados', detail: 'Baixar, backup, lixeira, termos e privacidade', Icon: Database },
];

export const settingsTitle = (section: SettingsSection) => rows.find(row => row.id === section)!.title;
export const settingsAvailable = (section: SettingsSection, cloud: boolean) => cloud || !rows.find(row => row.id === section)!.cloud;

/** Meu espaço: só o que é privado e muda pouco. Nome e foto ficam no perfil, um lugar só. */
export function SettingsIndex({ cloud, identity, onOpen, onProfile }: {
  cloud: boolean; identity: { name: string; avatar: Avatar | null } | null;
  onOpen: (section: SettingsSection) => void; onProfile: () => void;
}) {
  return <div className="settings-index">
    {identity && <button type="button" className="panel settings-identity" onClick={onProfile}>
      <PersonAvatar name={identity.name} avatar={identity.avatar} size={48} />
      <span className="settings-identity-text"><strong>{identity.name}</strong><small>Nome, foto e “sobre você”: Meu perfil</small></span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>}
    <h2 className="settings-index-heading">Só seu, muda pouco</h2>
    <ul className="panel settings-list">
      {rows.filter(row => settingsAvailable(row.id, cloud)).map(({ id, title, detail, Icon }) => <li key={id}>
        <button type="button" onClick={() => onOpen(id)}>
          <Icon size={18} aria-hidden="true" />
          <span><strong>{title}</strong><small>{id === 'contato' && !identity ? 'Seu nome, sua foto, e-mail e telefone' : detail}</small></span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </li>)}
    </ul>
  </div>;
}
