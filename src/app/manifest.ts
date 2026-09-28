import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Jornada Plena · Gestor para a Vida',
    short_name: 'Jornada Plena',
    description: 'Seu espaço integrado para faculdade, rotina, finanças e desenvolvimento pessoal.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f8fafc',
    theme_color: '#0f172a',
    icons: [
      {
        src: '/jornalogoplena369.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/logopleno9.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
