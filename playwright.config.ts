import { defineConfig, devices } from '@playwright/test';

const appBaseURL = 'http://127.0.0.1:5173';
const OAUTH_CLIENT_GREP = '@mr.*@oauth-client|@oauth-client.*@mr';
const OAUTH_CLIENT_RESOLVED_SELECTOR = 'PLAYWRIGHT_OAUTH_CLIENT_TARGETED_RESOLVED';
const grepValues = process.argv.flatMap((argument, index, values) => {
  if (argument === '--grep' || argument === '-g') return [values[index + 1] ?? ''];
  return argument.startsWith('--grep=') ? [argument.slice('--grep='.length)] : [];
});
const selector = process.env.PLAYWRIGHT_OAUTH_CLIENT_TARGETED;
if (selector !== undefined && selector !== 'true' && selector !== 'false') {
  throw new Error('PLAYWRIGHT_OAUTH_CLIENT_TARGETED must be exactly true or false');
}
const exactOAuthClientGrep = grepValues.includes(OAUTH_CLIENT_GREP);
const inheritedOAuthClientTarget = process.env[OAUTH_CLIENT_RESOLVED_SELECTOR] === 'true';
if (exactOAuthClientGrep) process.env[OAUTH_CLIENT_RESOLVED_SELECTOR] = 'true';
if (selector === 'true' && !exactOAuthClientGrep && !inheritedOAuthClientTarget) {
  throw new Error('Targeted OAuth client mock mode requires the exact guarded grep');
}
const oauthClientTargeted = selector === 'true' || exactOAuthClientGrep || inheritedOAuthClientTarget;
const mockChromium = { name: 'mock-chromium', use: { ...devices['Desktop Chrome'] } };

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: [
    'live/invitation-live.spec.ts',
    'live/release-*.spec.ts',
    'live/cross-stack.spec.ts',
    'live/local-proxy.spec.ts',
    'specs/corrections.spec.ts',
  ],
  grepInvert: oauthClientTargeted ? undefined : /@oauth-client/i,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  outputDir: oauthClientTargeted ? 'test-results/mock-oauth-client' : 'test-results/mock',
  reporter: process.env.CI
    ? [
        ['list'],
        [
          'junit',
          {
            outputFile: oauthClientTargeted ? 'test-results/e2e-oauth-client-junit.xml' : 'test-results/e2e-junit.xml',
          },
        ],
      ]
    : [
        ['list'],
        ['html', { open: 'never', ...(oauthClientTargeted ? { outputFolder: 'playwright-report/oauth-client' } : {}) }],
      ],
  expect: { timeout: 10_000 },
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
  use: {
    baseURL: appBaseURL,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    screenshot: oauthClientTargeted ? 'off' : 'only-on-failure',
    trace: oauthClientTargeted ? 'off' : 'on-first-retry',
    video: 'off',
  },
  projects: oauthClientTargeted
    ? [mockChromium]
    : [
        mockChromium,
        { name: 'mock-firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'mock-webkit', use: { ...devices['Desktop Safari'] } },
      ],
  webServer: {
    command:
      'CI=true EPOCA_LOCAL_PROXY_TARGET=http://127.0.0.1:19067 VITE_API_BASE_URL=/__e2e_api node .yarn/releases/yarn-4.18.0.cjs dev --port 5173 --strictPort',
    url: appBaseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
