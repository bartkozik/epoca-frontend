import assert from 'node:assert/strict';

const [baseUrl, expectedVersion, expectedPrefix] = process.argv.slice(2);
assert.ok(baseUrl, 'base URL is required');
assert.ok(expectedVersion, 'expected version is required');
assert.ok(expectedPrefix !== undefined, 'expected prefix is required (pass "" for root)');

const fetchWithRetry = async (url) => {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError;
};

const versionResponse = await fetchWithRetry(`${baseUrl}/frontend-version`);
assert.equal(await versionResponse.text(), `${expectedVersion}\n`);
assert.equal(versionResponse.headers.get('content-type')?.split(';', 1)[0], 'text/plain');

const spaResponse = await fetchWithRetry(`${baseUrl}/route-that-does-not-exist`);
assert.match(spaResponse.headers.get('content-type') ?? '', /text\/html/);
const html = await spaResponse.text();
assert.match(html, /<div id="root"><\/div>/);

assert.doesNotMatch(html, /__PUBLIC_URL__/, 'entrypoint.sh did not rewrite the __PUBLIC_URL__ token');
if (expectedPrefix !== '') {
  assert.ok(html.includes(`src="${expectedPrefix}/assets/env.js"`), `expected asset href prefixed with ${expectedPrefix}`);
} else {
  assert.ok(html.includes('src="/assets/env.js"'), 'expected root-relative asset href');
}

// Entry points with stable URLs must be revalidated so a deployment is picked up on the next load.
const assertNoCache = (response, label) =>
  assert.equal(response.headers.get('cache-control'), 'no-cache', `${label} must be served with Cache-Control: no-cache`);
assertNoCache(spaResponse, 'SPA fallback index.html');
assertNoCache(await fetchWithRetry(`${baseUrl}/`), 'directory index.html');
assertNoCache(await fetchWithRetry(`${baseUrl}/index.html`), 'index.html');
const envResponse = await fetchWithRetry(`${baseUrl}/assets/env.js`);
assertNoCache(envResponse, 'env.js');
assert.match(envResponse.headers.get('content-type') ?? '', /javascript/);

// Content-hashed bundles keep nginx's default caching behaviour.
const bundlePath = html.match(/src="([^"]*\/static\/js\/[^"]+\.js)"/)?.[1];
assert.ok(bundlePath, 'expected a content-hashed entry bundle in index.html');
const bundleResponse = await fetchWithRetry(new URL(bundlePath, `${baseUrl}/`).href);
assert.notEqual(bundleResponse.headers.get('cache-control'), 'no-cache', 'hashed bundles must stay cacheable');

console.log('Container version endpoint, SPA fallback, PUBLIC_URL rewrite, and cache headers are healthy.');
