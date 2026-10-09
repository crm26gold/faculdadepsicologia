import 'server-only';
import { ImageResponse } from 'next/og';
import type { ScreenModel } from './screen-model';

// The visual summary an assistant sends: the screen's own information, drawn on the server with the light theme.
// It is not a capture of the screen, and the image says so; a real capture needs a browser (docs/FUNDACAO_ASSISTENTE.md).
const color = { canvas: '#f5f8fc', surface: '#ffffff', ink: '#0b2338', muted: '#57697b', line: '#dce5ee', brand: '#123f61', focus: '#387aab', gold: '#c49a48', red: '#a33a3a', tint: '#eaf2fa' };
const WIDTH = 1080;

export function screenHeight(model: ScreenModel) {
  const rows = model.sections.reduce((total, section) => total + 92 + Math.max(1, section.rows.length) * 64, 0);
  const changes = model.changes ? 100 + model.changes.labels.length * 36 : 0;
  return Math.min(2600, 250 + (model.highlight ? 150 : 0) + changes + rows + 70);
}

export async function renderScreen(model: ScreenModel, generatedAt: string): Promise<Uint8Array> {
  const image = new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: color.canvas, padding: 48, color: color.ink, fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 28, fontWeight: 700, color: color.brand }}>
        Jornada Plena<span style={{ color: color.gold }}>.</span>
        <span style={{ display: 'flex', marginLeft: 18, fontSize: 20, fontWeight: 600, color: color.muted }}>Resumo visual · não é captura da tela</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 18 }}>
        <div style={{ display: 'flex', fontSize: 56, fontWeight: 700 }}>{model.title}</div>
        <div style={{ display: 'flex', fontSize: 28, color: color.muted, marginTop: 6 }}>{model.subtitle}</div>
      </div>
      {model.changes && <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28, padding: '20px 28px', background: color.tint, border: `2px solid ${color.focus}`, borderRadius: 20 }}>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: color.brand }}>{model.changes.labels.length ? `O que mudou agora · ${model.changes.at}` : 'Nenhuma alteração desta conexão nas últimas 24 horas'}</div>
        {model.changes.labels.map((label, index) => <div key={index} style={{ display: 'flex', fontSize: 22, marginTop: 10 }}>{`• ${label.slice(0, 88)}`}</div>)}
      </div>}
      {model.highlight && <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28, padding: '24px 28px', background: color.surface, border: `2px solid ${color.focus}`, borderRadius: 20 }}>
        <div style={{ display: 'flex', fontSize: 24, color: color.muted }}>{model.highlight.label}</div>
        <div style={{ display: 'flex', fontSize: 54, fontWeight: 700, marginTop: 6, color: model.highlight.negative ? color.red : color.brand }}>{model.highlight.value}</div>
      </div>}
      {model.sections.map(section => <div key={section.title} style={{ display: 'flex', flexDirection: 'column', marginTop: 28, padding: '20px 28px', background: color.surface, border: `1px solid ${color.line}`, borderRadius: 20 }}>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: color.brand, marginBottom: 6 }}>{section.title}</div>
        {section.rows.length ? section.rows.map((row, index) => <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 64, borderTop: index ? `1px solid ${color.line}` : 'none',
          ...(row.recent ? { background: color.tint, borderLeft: `6px solid ${color.focus}`, paddingLeft: 14, paddingRight: 10 } : {}) }}>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 640 }}>
            <div style={{ display: 'flex', fontSize: 26, fontWeight: row.recent ? 700 : 400 }}>{row.primary.slice(0, 70)}</div>
            {row.secondary && <div style={{ display: 'flex', fontSize: 20, color: color.muted }}>{row.secondary.slice(0, 80)}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {row.recent && <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, color: color.surface, background: color.focus, borderRadius: 999, padding: '4px 14px', marginRight: row.badge ? 14 : 0 }}>agora</div>}
            {row.badge && <div style={{ display: 'flex', fontSize: 24, fontWeight: 700, color: color.ink }}>{row.badge.slice(0, 30)}</div>}
          </div>
        </div>) : <div style={{ display: 'flex', fontSize: 24, color: color.muted, minHeight: 64, alignItems: 'center' }}>{section.empty}</div>}
      </div>)}
      <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 24, fontSize: 20, color: color.muted }}>Resumo visual gerado com os dados da sua conta, não é uma captura da tela · {generatedAt}</div>
    </div>,
    { width: WIDTH, height: screenHeight(model) },
  );
  return new Uint8Array(await image.arrayBuffer());
}
