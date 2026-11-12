import { defineConfig } from '@playwright/test';

const bun = process.env.BUN_EXECUTABLE ?? 'bun';
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/browser',
  use: {
    baseURL: 'http://127.0.0.1:3199',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: `"${bun}" src/server.ts`,
    url: 'http://127.0.0.1:3199/healthz',
    timeout: 15_000,
    reuseExistingServer: false,
    env: {
      BASIC_AUTH_PASSWORD: '',
      DATABASE_PATH: `./.tools/e2e-${Date.now()}.sqlite3`,
      HOST: '127.0.0.1',
      PORT: '3199',
      APP_TIMEZONE: 'Europe/Berlin',
    },
  },
});
