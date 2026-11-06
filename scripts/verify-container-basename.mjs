import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const [baseUrl, prefix] = process.argv.slice(2);
assert.ok(baseUrl, 'base URL is required');
assert.ok(prefix, 'non-root PUBLIC_URL prefix is required (e.g. /teams/epoca)');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}${prefix}/working-time`, { waitUntil: 'networkidle' });

  const redirectedUrl = new URL(page.url());
  assert.ok(
    redirectedUrl.pathname.startsWith(`${prefix}/`),
    `expected the client-side redirect to keep the "${prefix}" prefix, got "${redirectedUrl.pathname}"`
  );
  await page.getByTestId('loginEmailInput').waitFor({ state: 'visible' });

  const reloadResponse = await page.reload({ waitUntil: 'networkidle' });
  assert.equal(reloadResponse?.status(), 200, `reloading ${page.url()} did not return 200`);
  await page.getByTestId('loginEmailInput').waitFor({ state: 'visible' });

  assert.deepEqual(pageErrors, [], `unexpected page error(s): ${pageErrors.join('; ')}`);
} finally {
  await browser.close();
}

console.log(`Non-root PUBLIC_URL ("${prefix}") survives client-side routing and a reload.`);
