import type { Metadata, Viewport } from 'next';
import { JornadaLanding } from '@/components/landing/jornada-landing';
import './cinematic.css';

export const metadata: Metadata = {
  title: 'Jornada Plena · Mais vida. Menos ruído.',
  description: 'Um espaço para organizar sua rotina, seus estudos e suas ideias. Seu caminho, seu tempo, seu jeito de florescer.',
};

export const viewport: Viewport = { themeColor: '#F5F8FC' };

export default function JornadaPage() {
  return <JornadaLanding />;
}
