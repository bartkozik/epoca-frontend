import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Real-browser companion to verify-container-runtime.mjs's plain-fetch checks: those confirm
// nginx serves the SPA and rewrites __PUBLIC_URL__ correctly, but not that the app running inside
// the browser actually keeps a non-root PUBLIC_URL prefix in the address bar once React Router
// takes over client-side navigation (Router.tsx's basename={env.publicUrl} wiring) -- exactly the
// gap CT-525's spec-compliance review found: BrowserRouter with no basename matched routes against
// the full prefixed pathname, found nothing, and its wildcard <Navigate> redirected to a bare,
// unprefixed path, which then 404'd on nginx on the next reload or shared link.
const [baseUrl, prefix] = process.argv.slice(2);
assert.ok(baseUrl, 'base URL is required');
assert.ok(prefix, 'non-root PUBLIC_URL prefix is required (e.g. /teams/epoca)');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // Unauthenticated: the real container has no live backend session, so this immediately hits the
  // client-side redirect to the login route -- exactly the wildcard <Navigate> path that used to
  // drop the prefix.
  await page.goto(`${baseUrl}${prefix}/working-time`, { waitUntil: 'networkidle' });

  const redirectedUrl = new URL(page.url());
  assert.ok(
    redirectedUrl.pathname.startsWith(`${prefix}/`),
    `expected the client-side redirect to keep the "${prefix}" prefix, got "${redirectedUrl.pathname}"`
  );
  await page.getByTestId('loginEmailInput').waitFor({ state: 'visible' });

  // The failure mode this guards against only shows up on a *second* request at the
  // prefix-dropped URL (nginx's location block doesn't cover it) -- reload at the URL React
  // Router actually navigated to and confirm nginx still serves the real app, not a 404.
  const reloadResponse = await page.reload({ waitUntil: 'networkidle' });
  assert.equal(reloadResponse?.status(), 200, `reloading ${page.url()} did not return 200`);
  await page.getByTestId('loginEmailInput').waitFor({ state: 'visible' });

  assert.deepEqual(pageErrors, [], `unexpected page error(s): ${pageErrors.join('; ')}`);
} finally {
  await browser.close();
}

console.log(`Non-root PUBLIC_URL ("${prefix}") survives client-side routing and a reload.`);
