'use client';
import { useState } from 'react';
import { ArrowRight, CalendarPlus, Timer, Wallet } from 'lucide-react';
import type { Workspace } from '@/lib/workspace';
import { Modal } from './modal';
import { QuickCaptureWidget } from './quick-capture';

type Props = {
  data: Workspace; blocked: boolean; status: string; cloud: boolean; demo: boolean;
  update: (change: (previous: Workspace) => Workspace) => boolean;
  ensureSaved: () => Promise<void>;
  onClose: () => void; onOpenNote: (id: string) => void;
  onTask: () => void; onFocus: () => void; onMoney: () => void;
};
// The center of the app: register anything now, organize it later.
export function CaptureSheet({ onClose, onOpenNote, onTask, onFocus, onMoney, ...capture }: Props) {
  const [saved, setSaved] = useState('');
  return <Modal title="Registro rápido" onClose={onClose}>
    <p className="capture-sheet-lead">Registre agora, organize depois. O que não tiver lugar fica em <strong>Para organizar</strong>.</p>
    <QuickCaptureWidget {...capture} variant="sheet" onOpen={onOpenNote} onSaved={setSaved} />
    {saved && <p className="capture-sheet-saved"><button type="button" className="text-button" onClick={() => onOpenNote(saved)}>Abrir e organizar agora <ArrowRight size={14} aria-hidden="true" /></button></p>}
    <h3 className="capture-sheet-subtitle">Outros registros</h3>
    <div className="capture-sheet-actions">
      <button type="button" disabled={capture.blocked} onClick={onTask}><CalendarPlus size={20} aria-hidden="true" />Tarefa ou compromisso</button>
      <button type="button" disabled={capture.blocked} onClick={onFocus}><Timer size={20} aria-hidden="true" />Começar foco</button>
      <button type="button" disabled={capture.blocked} onClick={onMoney}><Wallet size={20} aria-hidden="true" />Gasto ou entrada</button>
    </div>
  </Modal>;
}
