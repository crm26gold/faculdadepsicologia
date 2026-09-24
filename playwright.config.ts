import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  outputDir: 'test-results',
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3004', channel: process.env.CI ? undefined : 'msedge', headless: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', testMatch: /(?:workspace|agenda)\.spec\.ts/, use: { viewport: { width: 1440, height: 1080 } } },
    { name: 'mobile', testMatch: /(?:workspace|agenda)\.spec\.ts/, use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    ...(!process.env.PLAYWRIGHT_BASE_URL ? [
      { name: 'private', testMatch: /login\.spec\.ts/, use: { baseURL: 'http://127.0.0.1:3005' } },
      { name: 'local-data', testMatch: /persistence\.spec\.ts/, use: { baseURL: 'http://127.0.0.1:3006' } },
    ] : []),
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : [
    { command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3004', url: 'http://127.0.0.1:3004', env: { APP_MODE: 'demo', VERCEL: '', NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', APP_OWNER_USER_ID: '', APP_OWNER_EMAIL: '', SUPABASE_ACCESS_TOKEN: '', SUPABASE_SERVICE_ROLE_KEY: '', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GOOGLE_CLIENT_SECRET: '' } },
    { command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3005', url: 'http://127.0.0.1:3005', env: { APP_MODE: 'private', VERCEL: '', GOOGLE_AUTH_ENABLED: 'false', FACULDADE_LOCAL_PREVIEW: 'false', APP_ORIGIN: 'http://127.0.0.1:3005' } },
    { command: 'node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3006', url: 'http://127.0.0.1:3006', env: { APP_MODE: 'private', VERCEL: '', GOOGLE_AUTH_ENABLED: 'false', FACULDADE_LOCAL_PREVIEW: 'true' } },
  ],
});
