import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/live',
  testMatch: 'release-janitor.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 150_000,
  globalTimeout: 160_000,
  reporter: [['line']],
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
