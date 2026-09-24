'use client';
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return <dialog ref={ref} className="modal" aria-labelledby={id} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-heading"><h2 id={id}>{title}</h2><button className="icon-button" aria-label="Fechar janela" onClick={onClose}><X aria-hidden="true" size={20} /></button></div>
    {children}
  </dialog>;
}
