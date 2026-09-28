import type { Metadata, Viewport } from 'next';
import './globals.css';
import './focus-responsive.css';

export const metadata: Metadata = {
  title: 'Jornada Plena · Gestor para a Vida',
  description: 'Seu espaço integrado para faculdade, rotina, finanças e desenvolvimento pessoal.',
  robots: { index: false, follow: false },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Jornada Plena',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="apple-touch-icon" href="/jornalogoplena369.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
