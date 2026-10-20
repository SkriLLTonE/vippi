import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against a production build:
 * - default: `vite preview` on :4173 + API on :3000 (PUBLIC_APP_URL must equal the web origin);
 * - E2E_BASE_URL=http://localhost:8080 to test the docker compose stack (no servers started).
 */
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './e2e',
  timeout: 6 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    locale: 'ru-RU',
    timezoneId: 'Asia/Tashkent',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: external
    ? undefined
    : [
        {
          command: 'pnpm --filter @vippi/api start',
          cwd: '../..',
          url: 'http://localhost:3000/api/health/ready',
          env: { PUBLIC_APP_URL: baseURL },
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: 'pnpm exec vite build && pnpm exec vite preview',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 180_000,
        },
      ],
});
