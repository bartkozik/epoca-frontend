import { defineConfig, devices } from '@playwright/test';

const port = 3017;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: 'test-results/pivot-table',
  projects: [
    {
      name: 'desktop-chromium',
      testMatch: '**/pivotTable.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'touch-chromium',
      testMatch: '**/pivotTable.touch.spec.ts',
      use: { ...devices['Pixel 5'], viewport: { height: 1200, width: 800 } },
    },
  ],
  reporter: process.env.CI
    ? [
        ['list'],
        ['junit', { outputFile: 'test-results/e2e-pivot-table-junit.xml' }],
      ]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/pivot-table' }]],
  retries: process.env.CI ? 1 : 0,
  testDir: './tests/pivotTable',
  timeout: 45_000,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `EPOCA_LOCAL_PROXY_TARGET=http://127.0.0.1:19067 VITE_API_BASE_URL=${baseURL}/api "${process.execPath}" .yarn/releases/yarn-4.18.0.cjs dev --port ${port} --strictPort`,
    reuseExistingServer: false,
    timeout: 180_000,
    url: baseURL,
  },
  workers: 1,
});
