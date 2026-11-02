import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LOCAL_PROXY_METADATA_PATH, parseLocalProxyMetadata, writeLocalProxyMetadataSync } from './metadata';

test.afterEach(({ browserName: _browserName }, testInfo) => {
  const metadata = parseLocalProxyMetadata(JSON.parse(readFileSync(LOCAL_PROXY_METADATA_PATH, 'utf8')));
  const passed = testInfo.status === testInfo.expectedStatus;
  writeLocalProxyMetadataSync({ ...metadata, status: passed ? 'passed' : 'failed' });
});

test('local-staging-api-proxy @local-proxy forwards same-origin API requests without CORS', async ({ page }) => {
  const optionsRequests: string[] = [];
  const corsConsoleErrors: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'OPTIONS') optionsRequests.push(request.url());
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && /cors/i.test(message.text())) corsConsoleErrors.push(message.text());
  });

  await page.goto('/login');
  await page.getByTestId('loginEmailInput').fill(process.env.PLAYWRIGHT_LOCAL_PROXY_EMAIL as string);
  await page.getByTestId('loginPasswordInput').fill(process.env.PLAYWRIGHT_LOCAL_PROXY_PASSWORD as string);
  const organizationsResponse = page.waitForResponse(
    (response) => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/organizations'
  );
  await page.getByTestId('loginButton').click();
  await expect(page).toHaveURL(/\/working-time$/);

  const organizations = await organizationsResponse;
  expect(organizations.status()).toBe(200);
  const body = (await organizations.json()) as { results?: Array<{ id?: unknown; slug?: unknown }> };
  expect(body.results).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: process.env.PLAYWRIGHT_LOCAL_PROXY_ALLOWED_ORG_ID,
        slug: process.env.PLAYWRIGHT_LOCAL_PROXY_ORG_SLUG,
      }),
    ])
  );

  const result = await page.evaluate(async () => {
    const response = await fetch('/api/v1/organizations/ct530-nonexistent/work-units/ct530-nonexistent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'ct530-local-proxy-smoke' },
      body: JSON.stringify({ description: 'read-only negative smoke' }),
    });
    return { contentType: response.headers.get('content-type'), status: response.status, url: response.url };
  });

  expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:3000\/api\/v1\//);
  expect(result.contentType ?? '').not.toContain('text/html');
  expect(result.status).toBeGreaterThanOrEqual(400);
  expect(optionsRequests).toEqual([]);
  expect(corsConsoleErrors).toEqual([]);
});
