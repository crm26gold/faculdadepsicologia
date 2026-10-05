import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
const empty = pathToFileURL(createRequire(`${process.cwd()}/tests/bootstrap.js`).resolve('server-only').replace(/index\.js$/, 'empty.js')).href;
registerHooks({ resolve: (specifier, context, next) => specifier === 'server-only' ? { url: empty, shortCircuit: true } : next(specifier, context) });
const config = (provider: 'groq'|'gemini') => ({ provider, model:'auto:rapido', key:'synthetic', base_url:'', gcp_project:'', gcp_location:'' });
test('Whisper transcreve sem depender da lista de modelos de chat', async () => {
  const { generateResilient } = await import('../src/lib/ai/providers');
  const original = globalThis.fetch; const paths: string[] = [];
  globalThis.fetch = (async input => { const url = new URL(String(input)); paths.push(url.pathname); return Response.json(url.pathname.endsWith('/models') ? { data: [] } : { text: 'Minha rotina de hoje.' }); }) as typeof fetch;
  try {
    const result = await generateResilient(config('groq'), { system:'transcreva', prompt:'ouça', audioTask:'transcribe', audio:{ mimeType:'audio/ogg', base64:Buffer.from('fixture').toString('base64') } });
    assert.equal(result.text,'Minha rotina de hoje.'); assert.equal(result.model,'whisper-large-v3-turbo');
    assert.deepEqual(paths, ['/openai/v1/audio/transcriptions']);
  } finally { globalThis.fetch = original; }
});
test('reserva mantém modo automático quando a chave principal não abre', async () => {
  process.env.AI_KEYS_SECRET = Buffer.alloc(32,7).toString('base64');
  const { sealKey } = await import('../src/lib/ai/crypto'); const { runtimeConfig } = await import('../src/lib/ai/runtime');
  const result = runtimeConfig({ ...config('gemini'), key_ciphertext:'corrupted', routing:'auto', alternatives:[{ ...config('groq'), key_ciphertext:sealKey('reserve') }] });
  assert.equal(result.provider,'groq'); assert.equal(result.routing,'auto');
});
test('voz automática mantém a ordem das chaves entre empresas', async () => {
  const { prepareLiveSession } = await import('../src/lib/voice/live-session');
  const original = globalThis.fetch; const visited: string[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input)); const headers = new Headers(init?.headers); const key = headers.get('x-goog-api-key') ?? headers.get('xi-api-key');
    if (url.pathname.endsWith('/models') || url.pathname.endsWith('/llm/list')) visited.push(key!);
    if (key === 'gemini-first') return Response.json({error:{status:'PERMISSION_DENIED'}},{status:403});
    if (key === 'eleven-second') return Response.json({detail:{status:'invalid_api_key'}},{status:401});
    if (url.pathname.endsWith('/models')) return Response.json({models:[{name:'models/gemini-3.8-live',supportedGenerationMethods:['bidiGenerateContent']}]});
    return Response.json({name:'auth_tokens/synthetic'});
  }) as typeof fetch;
  const shared = {base_url:'',gcp_project:'',gcp_location:''};
  try {
    const result = await prepareLiveSession({...shared,provider:'gemini',model:'auto:rapido',key:'gemini-first',routing:'auto', alternatives:[
      {...shared,provider:'elevenlabs',model:'auto:rapido',key:'eleven-second'}, {...shared,provider:'gemini',model:'auto:rapido',key:'gemini-third'},
    ]},'',[],{signal:AbortSignal.timeout(5000)});
    assert.equal(result.credentials.provider,'gemini'); assert.deepEqual(visited,['gemini-first','eleven-second','gemini-third']);
  } finally { globalThis.fetch = original; }
});
test('voz automática tem oito tentativas totais, sem multiplicar reservas por empresa', async () => {
  const { prepareLiveSession } = await import('../src/lib/voice/live-session');
  const original = globalThis.fetch; let calls = 0; const charged: string[] = [];
  globalThis.fetch = (async () => { calls++; return Response.json({error:{status:'UNAVAILABLE'}},{status:503}); }) as typeof fetch;
  const connections = Array.from({length:12},(_,index)=>({...config('gemini'),key:`bound-${index}`}));
  try {
    await assert.rejects(prepareLiveSession({...connections[0],routing:'auto',alternatives:connections.slice(1)},'',[],{signal:AbortSignal.timeout(5000),beforeAttempt:async row=>{charged.push(row.key);}}), {status:503});
    assert.equal(calls,8); assert.deepEqual(charged,connections.slice(0,8).map(row=>row.key));
  } finally { globalThis.fetch=original; }
});
