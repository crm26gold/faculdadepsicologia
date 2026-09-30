import { Sprout } from 'lucide-react';
import { TERMS_VERSION } from '@/lib/community';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="legal-page">
    <a href="/" className="legal-brand"><span><Sprout size={18} aria-hidden="true" /></span>Jornada <strong>Plena.</strong></a>
    <article>
      <h1>{title}</h1>
      <p className="legal-version">Versão de {new Date(`${TERMS_VERSION}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      {children}
    </article>
    <footer><a href="/termos">Termos de uso</a> · <a href="/privacidade">Privacidade</a> · <a href="/">Voltar ao Jornada Plena</a></footer>
  </main>;
}
