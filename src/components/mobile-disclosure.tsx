'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** One content tree: expanded on desktop, user-controlled on narrow screens. */
export function MobileDisclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="mobile-disclosure" data-open={open}>
    <button type="button" className="mobile-disclosure-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span>{label}</span><ChevronDown size={18} aria-hidden="true" />
    </button>
    <div id={id} className="mobile-disclosure-content">{children}</div>
  </div>;
}
