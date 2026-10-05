import type { Metadata, Viewport } from 'next';
import './dark-auto.css';
import './globals.css';
import './focus-responsive.css';
import './finance.css';
import './notes.css';
import './design-system.css';
import './workspace-design.css';
import './ai-admin.css';

export const metadata: Metadata = {
  title: 'Jornada Plena · Gestor para a Vida',
  description: 'Seu espaço integrado para estudos, rotina, finanças e desenvolvimento pessoal.',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Jornada Plena',
  },
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F5F8FC' }, { media: '(prefers-color-scheme: dark)', color: '#0C1725' }],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" href="/brand/icone-180.png" />
        {/* Aplica o tema salvo antes da primeira pintura, em qualquer tela, sem piscar claro */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('jornada-theme');if(t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.setAttribute('data-theme','dark')}catch(e){}" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
