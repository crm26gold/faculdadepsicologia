import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Jornada Plena · Gestor para a Vida',
    short_name: 'Jornada Plena',
    description: 'Seu espaço integrado para estudos, rotina, finanças e desenvolvimento pessoal.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAF7ED',
    theme_color: '#0F3D2E',
    icons: [
      { src: '/brand/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/brand/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/brand/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
