import { createHash } from 'node:crypto';
import current from './contract.json';

// The contract is what a connected app keeps from the Jornada: the tool list (names, descriptions, schemas) and the
// instructions. ChatGPT and Claude keep their copy until the person refreshes the connector. contract.json holds the
// fingerprint of the one this server answers with and its version (the day it changed); the MCP contract test checks
// that it matches and rewrites both with UPDATE_MCP_CONTRACT=1, so the version moves on its own whenever the contract does.
export const MCP_CONTRACT: { version: string; hash: string } = current;

export const contractHash = (tools: unknown, instructions: string) =>
  createHash('sha256').update(JSON.stringify({ tools, instructions })).digest('hex').slice(0, 12);

/** The next version: today's date (São Paulo), with .2, .3… for further changes on the same day. */
export function nextVersion(previous: string, now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now).replaceAll('-', '.');
  if (!previous.startsWith(day)) return day;
  return `${day}.${Number(previous.slice(day.length + 1) || 1) + 1}`;
}

/** The connection last listed an older contract, or never told us which (connected before versions were recorded). */
export const contractOutdated = (seen: string | null | undefined) => seen !== undefined && seen !== MCP_CONTRACT.hash;

/** Appended to tool results while the connection is outdated; written for the assistant to pass on. */
export const outdatedNotice = `Aviso da Jornada Plena: este conector está com uma versão antiga das ferramentas (a atual é ${MCP_CONTRACT.version}); alguns recursos novos podem não funcionar. Diga isso à pessoa uma vez nesta conversa, em uma frase, e como atualizar: no ChatGPT, Configurações › Aplicativos e conectores › Jornada Plena › Atualizar (ou desconectar e conectar de novo), depois um chat novo; no Claude, Configurações › Conectores › Jornada Plena › desconectar e conectar. Em seguida, responda o pedido normalmente.`;

/** How the Jornada presents itself to a connecting app: name, version, site and icon. */
export function mcpIdentity(origin: string | null) {
  return {
    name: 'jornada-plena', title: 'Jornada Plena', version: MCP_CONTRACT.version,
    description: 'Sua vida organizada: agenda, estudos, anotações, finanças, metas, foco e avisos.',
    ...(origin ? { websiteUrl: origin, icons: [
      { src: `${origin}/brand/icone-512.png`, mimeType: 'image/png', sizes: ['512x512'] },
      { src: `${origin}/brand/icone-192.png`, mimeType: 'image/png', sizes: ['192x192'] },
      { src: `${origin}/brand/simbolo.svg`, mimeType: 'image/svg+xml', sizes: ['any'] },
    ] } : {}),
  };
}
