import { defineConfig, devices } from '@playwright/test';

const listing = process.env.EPOCA_E2E_LIST_ONLY === 'true';
const target = process.env.EPOCA_LOCAL_PROXY_TARGET;
if (!listing && target !== 'http://127.0.0.1:19068')
  throw new Error('Invitation live tests require the explicit owned loopback API on port 19068');
if (!listing && !process.env.INVITATION_BROWSER_ENV_FILE)
  throw new Error('Invitation live tests require their local runtime environment file');
const baseURL = 'http://127.0.0.1:3018';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'live/invitation-live.spec.ts',
  projects: [{ name: 'invitation-live-chromium', use: { ...devices['Desktop Chrome'] } }],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: 'test-results/invitation-live',
  use: { baseURL, locale: 'pl-PL', timezoneId: 'Europe/Warsaw', trace: 'off', video: 'off', screenshot: 'off' },
  webServer: listing
    ? undefined
    : {
        command: `EPOCA_LOCAL_PROXY_TARGET=http://127.0.0.1:19068 VITE_API_BASE_URL=/api/v1 "${process.execPath}" .yarn/releases/yarn-4.18.0.cjs dev --port 3018 --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
      },
});
