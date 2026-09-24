import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

// Run against a fresh `npm run build`. All identities and credentials below are synthetic.
const projectId = 'prj_NX7DcoSWkdMgUdsSHsazXEy2skM3';
const demoProjectId = 'prj_synthetic_demo';
const banner = 'Demonstração — dados fictícios. Não insira informações pessoais.';
const pending = 'Configuração do Google pendente';
const demoEnv = { APP_MODE: 'demo', VERCEL: '1', VERCEL_PROJECT_ID: demoProjectId, DEMO_VERCEL_PROJECT_ID: demoProjectId };
const credentials = [
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_ACCESS_TOKEN',
  'APP_OWNER_USER_ID', 'APP_OWNER_EMAIL', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_ID',
];
const cases = [
  { name: 'produção sem configuração', env: {} },
  { name: 'produção Vercel com flags antigas continua fechada', env: { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_ID: projectId, FACULDADE_PROTECTED_PREVIEW: 'true', FACULDADE_LOCAL_PREVIEW: 'true' } },
  { name: 'preview Vercel sem opt-in', env: { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: projectId } },
  { name: 'preview Vercel com opt-in antigo continua fechado', env: { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: projectId, FACULDADE_PROTECTED_PREVIEW: 'true' } },
  { name: 'projeto desconhecido continua fechado', env: { VERCEL: '1', VERCEL_PROJECT_ID: 'prj_unknown', GOOGLE_AUTH_ENABLED: 'true', APP_OWNER_EMAIL: 'owner@example.invalid', APP_OWNER_USER_ID: '11111111-1111-4111-8111-111111111111' } },
  { name: 'demo local explícita', env: { APP_MODE: 'demo' }, openDemo: true },
  { name: 'demo Vercel no projeto isolado', env: demoEnv, openDemo: true },
  { name: 'demo Vercel sem projeto fixado', env: { ...demoEnv, DEMO_VERCEL_PROJECT_ID: '' } },
  { name: 'demo Vercel em projeto desconhecido', env: { ...demoEnv, VERCEL_PROJECT_ID: 'prj_unknown' } },
  { name: 'demo rejeita projeto privado mesmo fixado', env: { ...demoEnv, VERCEL_PROJECT_ID: projectId, DEMO_VERCEL_PROJECT_ID: projectId } },
  { name: 'demo com credencial não abre nem por prévia local', env: { APP_MODE: 'demo', FACULDADE_LOCAL_PREVIEW: 'true', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-forbidden-key' } },
  { name: 'demo rejeita credencial de serviço', env: { ...demoEnv, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-forbidden-key' } },
  { name: 'demo rejeita proprietário configurado', env: { ...demoEnv, APP_OWNER_EMAIL: 'owner@example.invalid' } },
];

function scenarioEnvironment(scenario, origin) {
  const env = { ...process.env };
  // Empty values also prevent Next from restoring credentials from local .env files.
  for (const name of Object.keys(env)) {
    if (/^(?:APP_|DEMO_|FACULDADE_|VERCEL|SUPABASE_|NEXT_PUBLIC_|OPENAI_|ANTHROPIC_|GOOGLE_)/i.test(name)) env[name] = '';
  }
  for (const name of credentials) env[name] = '';
  return {
    ...env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    APP_MODE: '', APP_ORIGIN: origin, GOOGLE_AUTH_ENABLED: 'false',
    FACULDADE_LOCAL_PREVIEW: 'false', FACULDADE_PROTECTED_PREVIEW: 'false', FACULDADE_CLOUD_WORKSPACE: 'false',
    VERCEL: '', VERCEL_ENV: '', VERCEL_PROJECT_ID: '', VERCEL_URL: '', DEMO_VERCEL_PROJECT_ID: '',
    ...scenario.env,
  };
}

async function freePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

for (const scenario of cases) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const env = scenarioEnvironment(scenario, origin);
  const requestOrigin = env.VERCEL ? 'https://gate.example.invalid' : origin;
  env.APP_ORIGIN = requestOrigin;
  const request = (path, options = {}) => fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(5000), ...options });
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env,
  });
  let logs = '';
  let spawnError;
  server.on('error', (error) => { spawnError = error; });
  server.stdout.on('data', (chunk) => { logs = (logs + chunk).slice(-12000); });
  server.stderr.on('data', (chunk) => { logs = (logs + chunk).slice(-12000); });
  try {
    let response;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (spawnError) throw spawnError;
      if (server.exitCode !== null || server.signalCode !== null) throw new Error('Servidor terminou antes do teste: ' + logs);
      try { response = await request('/'); break; } catch { await delay(250); }
    }
    assert.ok(response, 'Servidor de produção não iniciou. ' + logs);
    assert.equal(response.status, 200);
    const html = await response.text();
    if (scenario.openDemo) {
      // Demo data initializes in the browser; SSR must expose its permanent warning.
      assert.ok(html.includes(banner), 'Demo deve exibir o aviso permanente.');
      assert.ok(!html.includes(pending), 'Demo autorizada não deve exibir o gate.');
    } else {
      assert.ok(html.includes(pending), 'Configuração inválida deve manter o gate fechado.');
      assert.ok(!html.includes(banner), 'Configuração inválida não deve abrir a demo.');
      assert.ok(!html.includes('Começar meu espaço'));
    }

    const demoRequested = env.APP_MODE === 'demo';
    const api = await request('/api/workspace');
    assert.equal(api.status, demoRequested ? 404 : 401);
    assert.match(api.headers.get('cache-control') ?? '', /no-store/);
    for (const Origin of [undefined, 'https://unauthorized.example.invalid', requestOrigin]) {
      const headers = { 'Content-Type': 'application/json', ...(Origin ? { Origin } : {}) };
      assert.equal((await request('/api/workspace', { method: 'PUT', headers, body: '{}' })).status,
        demoRequested ? 404 : Origin === requestOrigin ? 401 : 403);
      assert.equal((await request('/auth/google', { method: 'POST', headers })).status,
        demoRequested ? 404 : Origin === requestOrigin ? 503 : 403);
    }
    const password = await request('/auth/login', { method: 'POST' });
    assert.equal(password.status, demoRequested ? 404 : 410);
    assert.match(password.headers.get('cache-control') ?? '', /no-store/);
    for (const query of ['', '?error=access_denied', '?code=synthetic-code&error=access_denied']) {
      assert.equal((await request('/auth/callback' + query)).status, demoRequested ? 404 : 503);
    }
    if (demoRequested) assert.equal((await request('/auth/logout', { method: 'POST', headers: { Origin: requestOrigin } })).status, 404);
    console.log(`PASS: ${scenario.name}; ${demoRequested ? 'APIs e autenticação 404' : 'API anônima 401; origem indevida 403; senha 410; Google pendente 503'}.`);
  } catch (error) {
    throw new Error(`${scenario.name}: ${error.message}\n${logs}`, { cause: error });
  } finally {
    if (server.pid && server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
  }
}

console.log(`PASS: ${cases.length} cenários locais de produção. OAuth real não foi exercitado.`);
