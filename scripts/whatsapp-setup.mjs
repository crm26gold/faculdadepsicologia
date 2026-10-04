import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { execFileSync, spawn } from 'node:child_process';
import { validConfig } from '../integrations/whatsapp-bridge/protocol.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'integrations', 'whatsapp-bridge');
const state = join(root, '.state'); mkdirSync(state, { recursive: true, mode: 0o700 });
const defaultFile = join(homedir(), 'Downloads', 'jornada-whatsapp-config.json');
const prompt = createInterface({ input: process.stdin, output: process.stdout });
try {
  console.info('Baixe a configuração em Administração › WhatsApp › Criar conexão. Não cole chaves neste terminal nem no chat.');
  const answer = await prompt.question(`Caminho do arquivo JSON [${defaultFile}]: `);
  const config = validConfig(JSON.parse(readFileSync(answer.trim().replace(/^"|"$/g, '') || defaultFile, 'utf8')));
  writeFileSync(join(state, 'config.json'), JSON.stringify(config), { mode: 0o600 });
  if (process.platform === 'win32') execFileSync('icacls.exe', [state, '/inheritance:r', '/grant:r', `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(OI)(CI)F`], { stdio: 'ignore', windowsHide: true });
  const npm = process.env.npm_execpath;
  if (!npm || !existsSync(npm)) throw new Error('Execute com npm run whatsapp:setup.');
  console.info('Instalando a ponte pelo lockfile. A primeira instalação também prepara Chromium e o conversor de áudio.');
  execFileSync(process.execPath, [npm, 'ci', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', windowsHide: true });
  console.info('Volte ao painel da Jornada para escanear o QR Code. Mantenha este terminal e o computador ligados. Ctrl+C encerra a ponte.');
  const child = spawn(process.execPath, ['bridge.mjs'], { cwd: root, stdio: 'inherit', windowsHide: true });
  child.on('exit', code => process.exitCode = code ?? 1);
} catch { console.error('Não consegui iniciar. Confira se selecionou o JSON baixado pela Jornada, se a internet está ativa e se Node.js 24 está instalado.'); process.exitCode = 1; }
finally { prompt.close(); }
