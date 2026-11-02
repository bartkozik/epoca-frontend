import { defineConfig, devices } from '@playwright/test';
import { assertOAuthClientTargetedSelection } from './tests/e2e/live/oauthClientTargetGuard';
import { assertSafeApiTarget, assertSafeLiveTarget, loadLiveTarget } from './tests/e2e/live/guard';

assertOAuthClientTargetedSelection();
const listOnly = process.env.EPOCA_E2E_LIST_ONLY === 'true';
const inertBaseURL = 'https://e2e.invalid';
const resolveBaseURL = (): string => {
  if (listOnly) return inertBaseURL;
  const target = loadLiveTarget();
  const frontend = assertSafeLiveTarget(target);
  if (frontend.hostname.endsWith('.invalid')) throw new Error('Reserved live targets cannot be executed');
  assertSafeApiTarget(target);
  return frontend.origin;
};
const baseURL = resolveBaseURL();

export default defineConfig({
  testDir: './tests/e2e/live',
  testMatch: 'cross-stack.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  globalTimeout: 300_000,
  outputDir: 'test-results/live',
  reporter: [['list'], ['junit', { outputFile: 'test-results/e2e-live-junit.xml' }]],
  globalSetup: listOnly ? undefined : './tests/e2e/live/global-setup.ts',
  globalTeardown: listOnly ? undefined : './tests/e2e/live/global-teardown.ts',
  use: {
    baseURL,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'live-chromium', use: { ...devices['Desktop Chrome'] } }],
});
