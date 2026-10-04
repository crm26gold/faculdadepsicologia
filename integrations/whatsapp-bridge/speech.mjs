import { readFile, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { EdgeTTS } from 'node-edge-tts';
import ffmpeg from 'ffmpeg-static';
import { speechText } from './protocol.mjs';

export async function synthesize(text, selectedVoice, stateDir) {
  const prefix = join(stateDir, randomUUID()); const mp3 = `${prefix}.mp3`; const ogg = `${prefix}.ogg`;
  try {
    const tts = new EdgeTTS({ voice: ['pt-BR-AntonioNeural', 'pt-BR-FranciscaNeural'].includes(selectedVoice) ? selectedVoice : 'pt-BR-AntonioNeural',
      lang: 'pt-BR', rate: '-8%', outputFormat: 'audio-24khz-48kbitrate-mono-mp3', saveSubtitles: false, timeout: 15_000 });
    await tts.ttsPromise(speechText(text), mp3);
    if (!ffmpeg) throw new Error('Conversor de áudio indisponível.');
    await promisify(execFile)(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-i', mp3, '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'libopus', '-b:a', '32k', ogg], { timeout: 15_000, windowsHide: true, maxBuffer: 500_000 });
    const bytes = await promisify(readFile)(ogg);
    if (bytes.length > 2_000_000) throw new Error('Resposta de áudio muito longa.');
    return bytes;
  } finally { for (const path of [mp3, ogg]) rmSync(path, { force: true }); }
}
