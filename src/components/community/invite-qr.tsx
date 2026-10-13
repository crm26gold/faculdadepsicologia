'use client';
import { useRef } from 'react';
import { Maximize2 } from 'lucide-react';
import { encode } from 'uqr';

// QR Code do link de convite, desenhado aqui mesmo: quem está na sala aponta a câmera do celular e entra.
// Preto no branco com margem própria, em qualquer tema, para a câmera ler mesmo projetado.
export function InviteQr({ link, label }: { link: string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const { data, size } = encode(link, { ecc: 'M', border: 4 });
  const path = data.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`M${x} ${y}h1v1h-1z`] : [])).join('');
  return <div className="cm-qr" ref={box}>
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR Code do convite para ${label}`} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="white" /><path d={path} fill="black" />
    </svg>
    {document.fullscreenEnabled && <button type="button" className="text-button" onClick={() => void box.current?.requestFullscreen()}>
      <Maximize2 size={15} aria-hidden="true" />Mostrar em tela cheia</button>}
  </div>;
}
