import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hoje · Faculdade Psi',
  description: 'Seu espaço para aprender, organizar e seguir no seu ritmo.',
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
