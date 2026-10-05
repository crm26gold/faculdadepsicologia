import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Jornada Plena · Gestor para a Vida',
    short_name: 'Jornada Plena',
    description: 'Seu espaço integrado para estudos, rotina, finanças e desenvolvimento pessoal.',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#F5F8FC',
    theme_color: '#123F61',
    icons: [
      { src: '/brand/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
