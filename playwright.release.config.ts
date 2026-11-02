import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { releaseEnvironment } from './tests/e2e/live/releaseEnvironment';

const listing = process.env.EPOCA_E2E_LIST_ONLY === 'true';
const environment = listing ? undefined : releaseEnvironment();
const phase = environment?.phase ?? process.env.EPOCA_RELEASE_PHASE;
if (phase !== 'deploy' && phase !== 'rollback') throw new Error('Select exactly one release phase');
export default defineConfig({
  testDir: './tests/e2e/live',
  testMatch: `release-${phase}.spec.ts`,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  timeout: 120_000,
  globalTimeout: 480_000,
  outputDir: path.resolve('test-results/browser'),
  reporter: listing
    ? [['line']]
    : [['line'], ['json', { outputFile: path.resolve('test-results/release-results.json') }]],
  globalSetup: listing ? undefined : `./tests/e2e/live/release-${phase}-setup.ts`,
  use: {
    baseURL: environment?.frontend.origin ?? 'https://e2e.invalid',
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'release-chromium', use: devices['Desktop Chrome'] }],
});
