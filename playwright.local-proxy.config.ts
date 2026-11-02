import { defineConfig, devices } from '@playwright/test';
import { assertSafeApiTarget, parseHostList, type LiveTarget } from './tests/e2e/live/guard';
import { LIVE_SCHEMA_VERSION, writeLocalProxyMetadataSync } from './tests/e2e/live/metadata';

const listOnly = process.env.EPOCA_E2E_LIST_ONLY === 'true';
const localBaseURL = 'http://127.0.0.1:5173';
const inertBaseURL = 'https://e2e.invalid';

const configureProxyTarget = (): void => {
  // Also backs vite.config.ts's dev-server proxy target, so both stay in sync from one place.
  const proxyTarget = process.env.EPOCA_LOCAL_PROXY_TARGET;
  if (!proxyTarget?.trim()) {
    throw new Error('EPOCA_LOCAL_PROXY_TARGET is required');
  }
  const allowedOrganizationId = process.env.PLAYWRIGHT_LOCAL_PROXY_ALLOWED_ORG_ID ?? '';
  const organizationId = process.env.PLAYWRIGHT_LOCAL_PROXY_ORG_ID ?? '';
  const target: LiveTarget = {
    baseURL: proxyTarget,
    apiBaseURL: proxyTarget,
    allowedHosts: parseHostList(process.env.PLAYWRIGHT_LOCAL_PROXY_ALLOWED_HOSTS),
    allowedApiHosts: parseHostList(process.env.PLAYWRIGHT_LOCAL_PROXY_ALLOWED_HOSTS),
    allowedOrganizationId,
    organizationId,
  };
  const proxy = assertSafeApiTarget(target);
  if (!process.env.PLAYWRIGHT_LOCAL_PROXY_ORG_SLUG?.trim()) {
    throw new Error('PLAYWRIGHT_LOCAL_PROXY_ORG_SLUG is required');
  }
  const frontendSha = process.env.PLAYWRIGHT_LOCAL_PROXY_FRONTEND_SHA ?? '';
  const backendSha = process.env.PLAYWRIGHT_LOCAL_PROXY_BACKEND_SHA ?? '';
  if (!frontendSha.trim() || !backendSha.trim())
    throw new Error('Exact local-proxy frontend and backend SHAs are required');
  if (!process.env.PLAYWRIGHT_LOCAL_PROXY_EMAIL?.trim() || !process.env.PLAYWRIGHT_LOCAL_PROXY_PASSWORD) {
    throw new Error('Dedicated local-proxy staging credentials are required');
  }

  writeLocalProxyMetadataSync({
    schemaVersion: LIVE_SCHEMA_VERSION,
    proxyOrigin: proxy.origin,
    frontendSha,
    backendSha,
    status: 'pending',
  });
};

if (!listOnly) configureProxyTarget();

export default defineConfig({
  testDir: './tests/e2e/live',
  testMatch: 'local-proxy.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  globalTimeout: 180_000,
  outputDir: 'test-results/local-proxy',
  reporter: [['list'], ['junit', { outputFile: 'test-results/e2e-local-proxy-junit.xml' }]],
  use: {
    baseURL: listOnly ? inertBaseURL : localBaseURL,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'local-proxy-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: listOnly
    ? undefined
    : {
        command: 'CI=true VITE_API_BASE_URL=/api/v1 node .yarn/releases/yarn-4.18.0.cjs dev --port 5173 --strictPort',
        url: localBaseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
