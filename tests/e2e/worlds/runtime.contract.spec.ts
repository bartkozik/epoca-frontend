import { expect, test } from '@playwright/test';
import type { MockHandler } from '../fixtures/handlers/types';
import {
  canonicalizeApiPath,
  createMockApiDispatcher,
  installMockApi,
  parseMockRequest,
  validateMockHandlers,
} from '../fixtures/mockApi';
import { buildWorld } from './index';
import { createWorldRuntime, IdempotencyConflictError } from './runtime';

const jsonHandler = (overrides: Partial<MockHandler> = {}): MockHandler => ({
  id: 'contract-handler',
  method: 'POST',
  path: /^\/contract$/,
  handle: () => ({ status: 200, json: { ok: true } }),
  ...overrides,
});

test('runtime mutations never escape the current test @mr @technical', () => {
  const first = createWorldRuntime(buildWorld('world-5'));
  const second = createWorldRuntime(buildWorld('world-5'));
  first.state.workUnits[0].description = 'changed in first runtime';
  expect(second.state.workUnits[0].description).not.toBe('changed in first runtime');
});

test('idempotency replay returns one created unit @mr @technical', () => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  const command = { key: 'retry-key-1', fingerprint: 'POST:stable-payload' };
  const first = runtime.claimIdempotency(command, { id: 'created-unit' });
  const replay = runtime.claimIdempotency(command, { id: 'different-unit' });
  expect(first).toEqual({ result: { id: 'created-unit' }, replayed: false });
  expect(replay).toEqual({ result: { id: 'created-unit' }, replayed: true });
});

test('idempotency replays never expose the cached result reference @mr @technical', () => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  const command = { key: 'retry-key-1', fingerprint: 'POST:stable-payload' };
  runtime.claimIdempotency(command, { unit: { id: 'created-unit' } });

  const firstReplay = runtime.claimIdempotency(command, { unit: { id: 'ignored-unit' } });
  firstReplay.result.unit.id = 'mutated-by-caller';
  const secondReplay = runtime.claimIdempotency(command, { unit: { id: 'ignored-again' } });

  expect(secondReplay).toEqual({ result: { unit: { id: 'created-unit' } }, replayed: true });
  expect(secondReplay.result).not.toBe(firstReplay.result);
});

test('idempotency keys reject a different fingerprint @mr @technical', () => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  runtime.claimIdempotency({ key: 'retry-key-1', fingerprint: 'POST:first' }, { id: 'one' });

  expect(() => runtime.claimIdempotency({ key: 'retry-key-1', fingerprint: 'POST:second' }, { id: 'two' })).toThrow(
    IdempotencyConflictError
  );
});

test('runtime rejects an actor absent from its world @mr @technical', () => {
  const runtime = createWorldRuntime(buildWorld('world-1'));
  expect(() => runtime.setActor('owner')).toThrow('Actor owner is unavailable in world-1');
  expect(() => runtime.setActor('anonymous')).not.toThrow();
});

test('named failures never leak into another runtime @mr @technical', () => {
  const selected = createWorldRuntime(buildWorld('world-5'));
  const clean = createWorldRuntime(buildWorld('world-5'));
  selected.activateFailure('network-drop');

  expect(selected.consumeFailure('network-drop')?.key).toBe('network-drop');
  expect(clean.consumeFailure('network-drop')).toBeNull();
});

test('a non-selected failure never fires @mr @technical', () => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  runtime.activateFailure('conflict');

  expect(runtime.consumeFailure('network-drop')).toBeNull();
  expect(runtime.consumeFailure('conflict')?.key).toBe('conflict');
});

test('the selected failure is consumed exactly once @mr @technical', () => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  runtime.activateFailure('expired-result');

  expect(runtime.consumeFailure('expired-result')?.key).toBe('expired-result');
  expect(runtime.consumeFailure('expired-result')).toBeNull();
});

test('no failure is active by default @mr @technical', () => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  expect(runtime.consumeFailure('unsupported-fingerprint')).toBeNull();
});

test('duplicate handler IDs and equivalent method paths are rejected @mr @technical', () => {
  expect(() => validateMockHandlers([jsonHandler(), jsonHandler({ path: /^\/other$/ })])).toThrow(
    'Duplicate mock handler ID: contract-handler'
  );

  expect(() =>
    validateMockHandlers([jsonHandler(), jsonHandler({ id: 'equivalent-handler', path: /^\/contract$/ })])
  ).toThrow('Duplicate mock route: POST /^\\/contract$/');
});

test('state-only RegExp flags do not make duplicate routes distinct @mr @technical', () => {
  for (const path of [/^\/contract$/g, new RegExp('^/contract$', 'd')]) {
    expect(() => validateMockHandlers([jsonHandler(), jsonHandler({ id: `equivalent-${path.flags}`, path })])).toThrow(
      `Duplicate mock route: POST ${path.toString()}`
    );
  }
});

test('canonical paths keep one leading slash and sort repeated query values @mr @technical', async () => {
  expect(canonicalizeApiPath('organizations/iterators')).toBe('/organizations/iterators');
  expect(canonicalizeApiPath('///organizations/iterators')).toBe('/organizations/iterators');

  const runtime = createWorldRuntime(buildWorld('world-5'));
  const dispatcher = createMockApiDispatcher(runtime, [
    jsonHandler({
      method: 'GET',
      query: { role: ['Manager', 'Owner'] },
    }),
  ]);
  const response = await dispatcher.dispatch(
    parseMockRequest({
      method: 'GET',
      url: 'http://127.0.0.1:5173/__e2e_api/contract?role=Owner&role=Manager',
    })
  );

  expect(response.status).toBe(200);
  expect(runtime.journal.entries[0].query).toEqual({ role: ['Manager', 'Owner'] });
});

test('matching is strict for headers query and JSON bodies @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  const dispatcher = createMockApiDispatcher(runtime, [
    jsonHandler({
      body: { description: 'exact', nested: { enabled: true } },
      headers: { 'x-contract': 'strict' },
      query: { includeArchived: ['true'] },
    }),
  ]);

  await expect(
    dispatcher.dispatch(
      parseMockRequest({
        body: { description: 'different', nested: { enabled: true } },
        headers: { 'x-contract': 'strict' },
        method: 'POST',
        url: 'http://127.0.0.1:5173/__e2e_api/contract?includeArchived=true',
      })
    )
  ).rejects.toThrow('body mismatch');
});

test('unknown API requests report method path world and actor @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  runtime.setActor('owner');
  const dispatcher = createMockApiDispatcher(runtime, []);

  await expect(
    dispatcher.dispatch(
      parseMockRequest({
        method: 'DELETE',
        url: 'http://127.0.0.1:5173/__e2e_api/unknown?secret=ignored',
      })
    )
  ).rejects.toThrow('Unknown API request: DELETE /unknown (world-5, owner)');
});

test('journal redacts secrets and bounds response previews @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  const dispatcher = createMockApiDispatcher(runtime, [
    jsonHandler({
      body: { accessToken: 'request-secret', password: 'request-password' },
      handle: () => ({
        status: 200,
        headers: { 'Set-Cookie': 'session=response-secret' },
        body: 'x'.repeat(2_500),
      }),
    }),
  ]);

  await dispatcher.dispatch(
    parseMockRequest({
      body: { accessToken: 'request-secret', password: 'request-password' },
      headers: { Authorization: 'Bearer header-secret', Cookie: 'session=request-secret' },
      method: 'POST',
      url: 'http://127.0.0.1:5173/__e2e_api/contract',
    })
  );

  const entry = runtime.journal.entries[0];
  expect(entry.requestHeaders).toEqual({ authorization: '[REDACTED]', cookie: '[REDACTED]' });
  expect(entry.requestBody).toEqual({ accessToken: '[REDACTED]', password: '[REDACTED]' });
  expect(entry.responseHeaders).toEqual({ 'set-cookie': '[REDACTED]' });
  expect(entry.responseBody).toHaveLength(2_000);
  expect(JSON.stringify(entry)).not.toContain('request-secret');
  expect(JSON.stringify(entry)).not.toContain('response-secret');
});

test('journal redacts one-time OAuth secrets without hiding public secret versions @mr @technical', async () => {
  const runtime = createWorldRuntime(buildWorld('world-6'));
  const dispatcher = createMockApiDispatcher(runtime, [
    jsonHandler({
      handle: () => ({
        status: 201,
        json: { client: { secretVersion: 2 }, clientSecret: 'runtime-only-value' },
      }),
    }),
  ]);

  await dispatcher.dispatch(
    parseMockRequest({ method: 'POST', url: 'http://127.0.0.1:5173/__e2e_api/contract' })
  );

  expect(runtime.journal.entries[0].responseBody).toEqual({
    client: { secretVersion: 2 },
    clientSecret: '[REDACTED]',
  });
  expect(JSON.stringify(runtime.journal.entries[0])).not.toContain('runtime-only-value');
});

test('installed routing serves env.js and aborts unexpected external origins @mr @technical', async ({ page }) => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  await Promise.all([installMockApi(page, runtime), installMockApi(page, runtime)]);
  await page.goto('/login');

  const env = await page.evaluate(async () => fetch('/assets/env.js').then((response) => response.text()));
  expect(env).toBe('window.env={API_BASE_URL:\'/__e2e_api\',PUBLIC_URL:""};');
  const externalResult = await page.evaluate(async () =>
    fetch('https://fonts.googleapis.com/css2?family=Inter').then(
      () => 'resolved',
      () => 'aborted'
    )
  );
  expect(externalResult).toBe('aborted');
});

test('installed routing aborts same-origin proxy namespaces before they can escape @mr @technical', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const runtime = createWorldRuntime(buildWorld('world-5'));
  const failedRequests: string[] = [];
  const responses: string[] = [];
  context.on('requestfailed', (request) => failedRequests.push(request.url()));
  context.on('response', (response) => responses.push(response.url()));
  await installMockApi(page, runtime);

  await expect(page.goto('http://127.0.0.1:5173/login')).resolves.toMatchObject({ status: expect.any(Function) });
  const assetResponse = await page.goto('http://127.0.0.1:5173/robots.txt');
  expect(assetResponse?.status()).toBe(200);
  expect(await assetResponse?.text()).toContain('User-agent');
  const mockResponse = await page.goto('http://127.0.0.1:5173/__e2e_api/organizations/iterators/saml/authn');
  expect(mockResponse?.status()).toBe(200);
  expect(runtime.journal.last('GET', '/organizations/iterators/saml/authn')?.handlerId).toBe('saml-authn');

  const journalSize = runtime.journal.entries.length;
  const blockedUrls = ['http://127.0.0.1:5173/api', 'http://127.0.0.1:5173/api/v1/organizations'];
  const outcomes: string[] = [];
  for (const url of blockedUrls) {
    const blockedPage = await context.newPage();
    await installMockApi(blockedPage, runtime);
    outcomes.push(
      await blockedPage.goto(url).then(
        () => 'resolved',
        () => 'aborted'
      )
    );
    await blockedPage.close();
  }

  expect(outcomes).toEqual(['aborted', 'aborted']);
  expect(failedRequests).toEqual(expect.arrayContaining(blockedUrls));
  expect(responses).toEqual(expect.not.arrayContaining(blockedUrls));
  expect(runtime.journal.entries).toHaveLength(journalSize);

  const boundaryPage = await context.newPage();
  await installMockApi(boundaryPage, runtime);
  for (const pathname of ['/apiary', '/apiary?view=report', '/api-v2']) {
    const boundaryResponse = await boundaryPage.goto(`http://127.0.0.1:5173${pathname}`);
    expect(boundaryResponse?.status(), pathname).toBe(200);
  }

  const jsonNavigationPage = await context.newPage();
  await installMockApi(jsonNavigationPage, runtime);
  await jsonNavigationPage.route('**/navigation-ct530', async (route) => {
    await route.fallback({ headers: { ...(await route.request().allHeaders()), accept: 'application/json' } });
  });
  await expect(jsonNavigationPage.goto('http://127.0.0.1:5173/navigation-ct530')).rejects.toThrow();
  expect(failedRequests).toContain('http://127.0.0.1:5173/navigation-ct530');
  expect(responses).not.toContain('http://127.0.0.1:5173/navigation-ct530');
  await context.close();
});

test('installed routing aborts unknown same-origin fetches before the CRA proxy fallback @mr @technical', async ({
  page,
}) => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  const failedRequests: string[] = [];
  const responses: string[] = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  page.on('response', (response) => responses.push(response.url()));
  await installMockApi(page, runtime);
  await page.goto('/login');
  await expect(page.getByTestId('loginEmailInput')).toBeVisible();
  expect(responses.some((url) => new URL(url).pathname === '/src/main.tsx')).toBe(true);
  // Unlike CRA's production-style content-hashed `/static/media/...` output, Vite's dev server
  // serves imported assets straight from their source-relative path with no hash.
  await expect
    .poll(() => responses.some((url) => /\/src\/core\/theme\/assets\/svg\/new-logo\.svg$/.test(new URL(url).pathname)))
    .toBe(true);

  const missingImageUrl = 'http://127.0.0.1:5173/static/unexpected-ct530.png?case=image';
  const imageOutcomes = await page.evaluate(async () => {
    const loadImage = (src: string): Promise<string> =>
      new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve('loaded');
        image.onerror = () => resolve('aborted');
        image.src = src;
      });
    return Promise.all([loadImage('/favicon/favicon-32x32.png'), loadImage('/static/unexpected-ct530.png?case=image')]);
  });
  expect(imageOutcomes).toEqual(['loaded', 'aborted']);

  const unexpectedUrls = [
    'http://127.0.0.1:5173/unexpected-ct530?case=get',
    'http://127.0.0.1:5173/unexpected-ct530?case=post',
    'http://127.0.0.1:5173/static/unexpected-ct530?case=fetch',
  ];
  const journalSize = runtime.journal.entries.length;
  const outcomes = await page.evaluate(async ([getUrl, postUrl, staticFetchUrl]) => {
    const settle = (request: Promise<Response>): Promise<string> =>
      request.then(
        () => 'resolved',
        () => 'aborted'
      );
    return Promise.all([
      settle(fetch(getUrl)),
      settle(fetch(postUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })),
      settle(fetch(staticFetchUrl)),
    ]);
  }, unexpectedUrls);

  expect(outcomes).toEqual(['aborted', 'aborted', 'aborted']);
  expect(failedRequests).toEqual(expect.arrayContaining([...unexpectedUrls, missingImageUrl]));
  expect(responses).toEqual(expect.not.arrayContaining(unexpectedUrls));
  expect(responses).not.toContain(missingImageUrl);
  expect(runtime.journal.entries.slice(journalSize).map(({ path }) => path)).not.toEqual(
    expect.arrayContaining(['/unexpected-ct530', '/static/unexpected-ct530.png'])
  );
});

test('installed routing protects new pages in the same browser context @mr @technical', async ({ page }) => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  const failedRequests: string[] = [];
  const responses: string[] = [];
  page.context().on('requestfailed', (request) => failedRequests.push(request.url()));
  page.context().on('response', (response) => responses.push(response.url()));
  await installMockApi(page, runtime);
  await expect(installMockApi(page, createWorldRuntime(buildWorld('world-5')))).rejects.toThrow(
    'Mock API is already installed with another runtime or handler set'
  );
  await page.goto('/login');

  const childPage = await page.context().newPage();
  await childPage.goto('/login');
  await expect(childPage.getByTestId('loginEmailInput')).toBeVisible();
  await expect.poll(() => runtime.journal.entries.length).toBeGreaterThan(0);
  const sameOriginUrl = 'http://127.0.0.1:5173/unexpected-child-ct530';
  const otherOriginUrl = 'http://127.0.0.1:1/unexpected-child-ct530';
  const journalSize = runtime.journal.entries.length;
  const outcomes = await childPage.evaluate(
    async ([sameOrigin, otherOrigin]) => {
      const settle = (request: Promise<Response>): Promise<string> =>
        request.then(
          () => 'resolved',
          () => 'aborted'
        );
      return Promise.all([settle(fetch(sameOrigin)), settle(fetch(otherOrigin))]);
    },
    [sameOriginUrl, otherOriginUrl]
  );

  expect(outcomes).toEqual(['aborted', 'aborted']);
  expect(failedRequests).toContain(sameOriginUrl);
  expect(responses).toEqual(expect.not.arrayContaining([sameOriginUrl, otherOriginUrl]));
  expect(runtime.journal.entries.slice(journalSize).map(({ path }) => path)).not.toContain('/unexpected-child-ct530');
});

test('installed routing closes unexpected WebSockets with the mock policy @mr @technical', async ({ page }) => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  const openedWebSockets: string[] = [];
  page.on('websocket', (webSocket) => openedWebSockets.push(webSocket.url()));
  await installMockApi(page, runtime);
  await page.goto('/login');
  await expect(page.getByTestId('loginEmailInput')).toBeVisible();
  // Vite's HMR client connects with a per-server-instance random `token` query param (unlike CRA's
  // fixed `/ws` path), so match on origin + root pathname rather than an exact URL.
  await expect
    .poll(() =>
      openedWebSockets.some((url) => {
        const parsed = new URL(url);
        return parsed.origin === 'ws://127.0.0.1:5173' && parsed.pathname === '/';
      })
    )
    .toBe(true);

  const results = await page.evaluate(
    (urls) =>
      Promise.all(
        urls.map(
          (url) =>
            new Promise<{ code: number; reason: string }>((resolve) => {
              const socket = new WebSocket(url);
              socket.onclose = (event) => resolve({ code: event.code, reason: event.reason });
            })
        )
      ),
    ['ws://127.0.0.1:5173/unexpected-ct530-ws', 'wss://example.invalid/unexpected-ct530-ws']
  );

  expect(results).toEqual([
    { code: 1008, reason: 'Mock E2E blocks unexpected WebSocket' },
    { code: 1008, reason: 'Mock E2E blocks unexpected WebSocket' },
  ]);
});
