// This file imports .ts sources directly, so plain `node --test` fails with
// ERR_MODULE_NOT_FOUND. Run it via the CI-equivalent loader command instead (see
// .gitlab-ci.yml): `node --no-warnings --experimental-strip-types
// --experimental-loader ./scripts/e2e/ts-resolve-loader.mjs --test <this file>`.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { boundedFetch } from '../../tests/e2e/live/network.ts';
import {
  assertOAuthClientMutationBinding,
  runLiveOAuthClientLifecycle,
} from '../../tests/e2e/live/oauthClientLifecycle.ts';

const guardedEnvironment = {
  PLAYWRIGHT_LIVE_OAUTH_CLIENT_DISPOSABLE_REVIEW: 'true',
  PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_ID: 'oauth-client-review-contract',
  PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_ORG_ID: 'review-org-id',
  PLAYWRIGHT_LIVE_OAUTH_CLIENT_REVIEW_HOSTS: 'oauth-client-review-contract.example.invalid,api.oauth-client-review-contract.example.invalid',
  PLAYWRIGHT_LIVE_ALLOWED_ORG_ID: 'review-org-id',
  PLAYWRIGHT_LIVE_ALLOWED_HOSTS: 'oauth-client-review-contract.example.invalid',
  PLAYWRIGHT_LIVE_ALLOWED_API_HOSTS: 'api.oauth-client-review-contract.example.invalid',
  PLAYWRIGHT_LIVE_BASE_URL: 'https://oauth-client-review-contract.example.invalid',
  PLAYWRIGHT_LIVE_API_BASE_URL: 'https://api.oauth-client-review-contract.example.invalid/api/v1',
  PLAYWRIGHT_LIVE_ORG_SLUG: 'review-org',
  PLAYWRIGHT_LIVE_OWNER_EMAIL: 'owner@example.invalid',
  PLAYWRIGHT_LIVE_OWNER_PASSWORD: 'contract-password',
  PLAYWRIGHT_LIVE_MANAGER_EMAIL: 'manager@example.invalid',
  PLAYWRIGHT_LIVE_MANAGER_PASSWORD: 'contract-password',
  PLAYWRIGHT_LIVE_PM_EMAIL: 'pm@example.invalid',
  PLAYWRIGHT_LIVE_PM_PASSWORD: 'contract-password',
  PLAYWRIGHT_LIVE_USER_EMAIL: 'user@example.invalid',
  PLAYWRIGHT_LIVE_USER_PASSWORD: 'contract-password',
  PLAYWRIGHT_LIVE_EMPLOYEE_EMAIL: 'employee@example.invalid',
  PLAYWRIGHT_LIVE_EMPLOYEE_PASSWORD: 'contract-password',
};

// Returns a resolved Promise (not a bare Response) so every fetcher call site below can stay
// a plain `return jsonResponse(...)` -- fetcher's declared return type is Promise<Response>.
const jsonResponse = (status, body) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

void test('operator guide documents bounded ambiguous-create polling and permanent-zero failure', async () => {
  const guide = await readFile(new URL('../../docs/testing/e2e.md', import.meta.url), 'utf8');
  assert.doesNotMatch(guide, /one bounded Owner list; zero matches is clean/);
  assert.match(guide, /page size 100/i);
  assert.match(guide, /10 pages/i);
  assert.match(guide, /128 total list requests/i);
  assert.match(guide, /250 ms bounded backoff/i);
  assert.match(guide, /permanent zero.*cleanup failure/i);
  assert.match(guide, /independent cleanup deadline and signal/i);
});

void test('boundedFetch rejects an excessive valid Content-Length before reading the body', async () => {
  let cancellations = 0;
  const source = new Response(
    new ReadableStream({
      cancel() {
        cancellations += 1;
      },
    }),
    { headers: { 'content-length': '9' } }
  );
  let readerCalls = 0;
  const getReader = source.body.getReader.bind(source.body);
  source.body.getReader = (...args) => {
    readerCalls += 1;
    return getReader(...args);
  };

  await assert.rejects(
    boundedFetch('https://example.invalid', {}, () => Promise.resolve(source), 100, 8),
    /response body exceeds/i
  );
  assert.equal(readerCalls, 0);
  assert.equal(cancellations, 1);
});

void test('boundedFetch stream-counts and cancels a chunked response that crosses its byte ceiling', async () => {
  let emitted = 0;
  let cancellations = 0;
  const source = new Response(
    new ReadableStream({
      pull(controller) {
        emitted += 1;
        if (emitted <= 2) controller.enqueue(new Uint8Array(5));
      },
      cancel() {
        cancellations += 1;
      },
    })
  );

  await assert.rejects(
    boundedFetch('https://example.invalid', {}, () => Promise.resolve(source), 100, 8),
    /response body exceeds/i
  );
  assert.ok(emitted >= 2);
  assert.equal(cancellations, 1);
});

void test('boundedFetch preserves a normal response below its byte ceiling', async () => {
  const response = await boundedFetch(
    'https://example.invalid',
    {},
    () => Promise.resolve(new Response('normal', { status: 201, headers: { 'content-type': 'text/plain' } })),
    100,
    8
  );

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('content-type'), 'text/plain');
  assert.equal(await response.text(), 'normal');
});

void test('boundedFetch owns tiny chunks without retaining their oversized backing buffers', async () => {
  const ownedBufferSizes = [];
  class TrackingView extends Uint8Array {
    slice(start, end) {
      const owned = super.slice(start, end);
      ownedBufferSizes.push(owned.buffer.byteLength);
      return owned;
    }
  }
  const oversizedBacking = new ArrayBuffer(1024 * 1024);
  const tinyView = new TrackingView(oversizedBacking, 512, 3);
  tinyView.set([1, 2, 3]);
  const response = await boundedFetch(
    'https://example.invalid',
    {},
    () =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(tinyView);
              controller.close();
            },
          })
        )
      ),
    100,
    8
  );

  assert.deepEqual(ownedBufferSizes, [3]);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
});

void test('ambiguous create timeout reconciles its recorded intent and revokes the exact client', async () => {
  const calls = [];
  const created = {
    clientId: 'epoca_oauth_client_v1_ambiguous',
    name: 'oauth-client-review-contract-rotation',
    status: 'Active',
    version: 1,
  };
  const fetcher = (input, init) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
    if (url.pathname.endsWith('/auth/login')) return jsonResponse(200, { accessToken: 'owner-access-placeholder' });
    if (url.pathname.endsWith('/organizations/review-org') && init?.method === 'GET') {
      return jsonResponse(200, { id: 'review-org-id' });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'POST') {
      throw new Error('connection closed after commit');
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'GET') {
      return jsonResponse(200, { count: 1, results: [created] });
    }
    if (url.pathname.endsWith(`/oauth-clients/${created.clientId}`)) return jsonResponse(200, created);
    if (url.pathname.endsWith(`/oauth-clients/${created.clientId}/revoke`)) {
      return jsonResponse(200, { ...created, status: 'Revoked', version: 2 });
    }
    throw new Error('unexpected contract request');
  };

  await assert.rejects(
    runLiveOAuthClientLifecycle({ env: guardedEnvironment, fetcher }),
    /connection closed after commit/
  );
  assert.ok(calls.includes('GET /api/v1/organizations/review-org/oauth-clients?pageNumber=1&pageSize=100'));
  assert.ok(calls.includes(`POST /api/v1/organizations/review-org/oauth-clients/${created.clientId}/revoke`));
});

void test('ambiguous create reconciliation polls after an initial zero until the exact client becomes visible', async () => {
  let lists = 0;
  let revocations = 0;
  const created = {
    clientId: 'epoca_oauth_client_v1_delayed',
    name: 'oauth-client-review-contract-rotation',
    status: 'Active',
    version: 1,
  };
  const fetcher = (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/auth/login')) return jsonResponse(200, { accessToken: 'owner-access-placeholder' });
    if (url.pathname.endsWith('/organizations/review-org') && init?.method === 'GET') {
      return jsonResponse(200, { id: 'review-org-id' });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'POST') {
      throw new Error('connection closed after commit');
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'GET') {
      lists += 1;
      return jsonResponse(200, lists === 1 ? { count: 0, results: [] } : { count: 1, results: [created] });
    }
    if (url.pathname.endsWith(`/${created.clientId}`)) return jsonResponse(200, created);
    if (url.pathname.endsWith(`/${created.clientId}/revoke`)) {
      revocations += 1;
      return jsonResponse(200, { ...created, status: 'Revoked', version: 2 });
    }
    throw new Error('unexpected contract request');
  };

  await assert.rejects(
    runLiveOAuthClientLifecycle({
      env: guardedEnvironment,
      fetcher,
      cleanupTimeoutMs: 100,
      sleep: () => Promise.resolve(),
    }),
    /connection closed after commit/
  );
  assert.equal(lists, 2);
  assert.equal(revocations, 1);
});

void test('ambiguous create reconciliation treats permanent zero visibility as an independent cleanup failure', async () => {
  let lists = 0;
  const fetcher = (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/auth/login')) return jsonResponse(200, { accessToken: 'owner-access-placeholder' });
    if (url.pathname.endsWith('/organizations/review-org') && init?.method === 'GET') {
      return jsonResponse(200, { id: 'review-org-id' });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'POST') {
      throw new Error('connection closed after commit');
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'GET') {
      lists += 1;
      return jsonResponse(200, { count: 0, results: [] });
    }
    throw new Error('unexpected contract request');
  };

  await assert.rejects(
    runLiveOAuthClientLifecycle({ env: guardedEnvironment, fetcher, cleanupTimeoutMs: 20 }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      assert.match(String(error.errors[0]), /connection closed after commit/);
      assert.match(String(error.errors[1]), /independent deadline/);
      return true;
    }
  );
  assert.ok(lists >= 1);
});

void test('ambiguous create reconciliation follows bounded pagination to an exact later-page match', async () => {
  const pageNumbers = [];
  let revocations = 0;
  const created = {
    clientId: 'epoca_oauth_client_v1_later_page',
    name: 'oauth-client-review-contract-rotation',
    status: 'Active',
    version: 1,
  };
  const other = (index) => ({
    clientId: `epoca_oauth_client_v1_other_${index}`,
    name: `other-${index}`,
    status: 'Active',
    version: 1,
  });
  const fetcher = (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/auth/login')) return jsonResponse(200, { accessToken: 'owner-access-placeholder' });
    if (url.pathname.endsWith('/organizations/review-org') && init?.method === 'GET') {
      return jsonResponse(200, { id: 'review-org-id' });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'POST') {
      throw new Error('connection closed after commit');
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'GET') {
      const pageNumber = Number(url.searchParams.get('pageNumber'));
      pageNumbers.push(pageNumber);
      return jsonResponse(200, {
        count: 101,
        results: pageNumber === 1 ? Array.from({ length: 100 }, (_, index) => other(index)) : [created],
      });
    }
    if (url.pathname.endsWith(`/${created.clientId}`)) return jsonResponse(200, created);
    if (url.pathname.endsWith(`/${created.clientId}/revoke`)) {
      revocations += 1;
      return jsonResponse(200, { ...created, status: 'Revoked', version: 2 });
    }
    throw new Error('unexpected contract request');
  };

  await assert.rejects(
    runLiveOAuthClientLifecycle({ env: guardedEnvironment, fetcher }),
    /connection closed after commit/
  );
  assert.deepEqual(pageNumbers, [1, 2]);
  assert.equal(revocations, 1);
});

void test('ambiguous create reconciliation fails closed above its total pagination bound', async () => {
  const fetcher = (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/auth/login')) return jsonResponse(200, { accessToken: 'owner-access-placeholder' });
    if (url.pathname.endsWith('/organizations/review-org') && init?.method === 'GET') {
      return jsonResponse(200, { id: 'review-org-id' });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'POST') {
      throw new Error('connection closed after commit');
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'GET') {
      return jsonResponse(200, { count: 1001, results: [] });
    }
    throw new Error('unexpected contract request');
  };

  await assert.rejects(runLiveOAuthClientLifecycle({ env: guardedEnvironment, fetcher }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.match(String(error.errors[1]), /bounded page limit/);
    return true;
  });
});

void test('ambiguous create reconciliation caps total requests across visibility polls', async () => {
  let lists = 0;
  const fetcher = (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/auth/login')) return jsonResponse(200, { accessToken: 'owner-access-placeholder' });
    if (url.pathname.endsWith('/organizations/review-org') && init?.method === 'GET') {
      return jsonResponse(200, { id: 'review-org-id' });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'POST') {
      throw new Error('connection closed after commit');
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'GET') {
      lists += 1;
      return jsonResponse(200, { count: 0, results: [] });
    }
    throw new Error('unexpected contract request');
  };

  await assert.rejects(
    runLiveOAuthClientLifecycle({
      env: guardedEnvironment,
      fetcher,
      cleanupTimeoutMs: 1_000,
      sleep: () => Promise.resolve(),
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(String(error.errors[1]), /bounded request budget/);
      return true;
    }
  );
  assert.equal(lists, 128);
});

void test('malformed create response reconciles its recorded intent and revokes the exact client', async () => {
  const calls = [];
  const created = {
    clientId: 'epoca_oauth_client_v1_malformed',
    name: 'oauth-client-review-contract-rotation',
    status: 'Active',
    version: 1,
  };
  const fetcher = (input, init) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? 'GET'} ${url.pathname}${url.search}`);
    if (url.pathname.endsWith('/auth/login')) return jsonResponse(200, { accessToken: 'owner-access-placeholder' });
    if (url.pathname.endsWith('/organizations/review-org') && init?.method === 'GET') {
      return jsonResponse(200, { id: 'review-org-id' });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'POST') {
      return Promise.resolve(new Response('{', { status: 201, headers: { 'content-type': 'application/json' } }));
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'GET') {
      return jsonResponse(200, { count: 1, results: [created] });
    }
    if (url.pathname.endsWith(`/${created.clientId}`)) return jsonResponse(200, created);
    if (url.pathname.endsWith(`/${created.clientId}/revoke`)) {
      return jsonResponse(200, { ...created, status: 'Revoked', version: 2 });
    }
    throw new Error('unexpected contract request');
  };

  await assert.rejects(runLiveOAuthClientLifecycle({ env: guardedEnvironment, fetcher }), /malformed JSON/);
  assert.ok(calls.includes('GET /api/v1/organizations/review-org/oauth-clients?pageNumber=1&pageSize=100'));
  assert.ok(calls.includes(`POST /api/v1/organizations/review-org/oauth-clients/${created.clientId}/revoke`));
});

void test('rotate and renewal bindings accept exact identity and one-step version transitions', () => {
  const before = {
    clientId: 'epoca_oauth_client_v1_binding',
    name: 'oauth-client-review-contract-rotation',
    organizationId: 'review-org-id',
    organizationSlug: 'review-org',
    status: 'Active',
    version: 3,
  };
  assert.doesNotThrow(() =>
    assertOAuthClientMutationBinding(
      'OAuth secret rotation',
      before,
      { ...before, version: 4 },
      'review-org-id',
      'review-org'
    )
  );
  assert.throws(
    () =>
      assertOAuthClientMutationBinding(
        'OAuth client renewal',
        before,
        { ...before, version: 5 },
        'review-org-id',
        'review-org'
      ),
    /version transition is invalid/
  );
});

void test('rotate rejects a response bound to the wrong client identity before using its credential', async () => {
  const active = {
    clientId: 'epoca_oauth_client_v1_rotation_contract',
    name: 'oauth-client-review-contract-rotation',
    status: 'Active',
    version: 1,
  };
  const oneTimeCredential = ['OAUTH_CLIENT', 'SECRET', 'SENTINEL', 'rotation'].join('_');
  const fetcher = (input, init) => {
    const url = new URL(String(input));
    const authorization = new Headers(init?.headers).get('authorization');
    if (url.pathname.endsWith('/auth/login')) return jsonResponse(200, { accessToken: 'owner-access-placeholder' });
    if (url.pathname.endsWith('/organizations/review-org') && authorization === 'Bearer owner-access-placeholder') {
      return jsonResponse(200, { id: 'review-org-id' });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'POST') {
      return jsonResponse(201, { client: active, clientSecret: oneTimeCredential });
    }
    if (url.pathname.endsWith('/oauth/token')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: 'oauth-access-placeholder',
            token_type: 'Bearer',
            expires_in: 300,
            scope: 'organization:read',
          }),
          { status: 200, headers: { 'cache-control': 'no-store', pragma: 'no-cache' } }
        )
      );
    }
    if (url.pathname.endsWith('/organizations/review-org')) return jsonResponse(200, { id: 'review-org-id' });
    if (url.pathname.endsWith(`/${active.clientId}/rotate-secret`)) {
      return jsonResponse(200, {
        client: { ...active, clientId: 'epoca_oauth_client_v1_wrong', version: 2 },
        clientSecret: oneTimeCredential,
      });
    }
    if (url.pathname.endsWith(`/${active.clientId}`) && init?.method === 'GET') return jsonResponse(200, active);
    if (url.pathname.endsWith(`/${active.clientId}/revoke`)) {
      return jsonResponse(200, { ...active, status: 'Revoked', version: 2 });
    }
    throw new Error('unexpected contract request');
  };

  await assert.rejects(runLiveOAuthClientLifecycle({ env: guardedEnvironment, fetcher }), /rotation.*identity/i);
});

void test('ambiguous create reconciliation fails closed when an exact intent has multiple matches', async () => {
  const revocations = [];
  const matching = (clientId) => ({
    clientId,
    name: 'oauth-client-review-contract-rotation',
    status: 'Active',
    version: 1,
  });
  const fetcher = (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/auth/login')) return jsonResponse(200, { accessToken: 'owner-access-placeholder' });
    if (url.pathname.endsWith('/organizations/review-org') && init?.method === 'GET') {
      return jsonResponse(200, { id: 'review-org-id' });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'POST') {
      throw new Error('connection closed after commit');
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'GET') {
      return jsonResponse(200, {
        count: 2,
        results: [matching('epoca_oauth_client_v1_first'), matching('epoca_oauth_client_v1_second')],
      });
    }
    if (url.pathname.endsWith('/revoke')) revocations.push(url.pathname);
    throw new Error('unexpected contract request');
  };

  await assert.rejects(runLiveOAuthClientLifecycle({ env: guardedEnvironment, fetcher }), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 2);
    assert.match(String(error.errors[1]), /multiple exact matches/);
    return true;
  });
  assert.deepEqual(revocations, []);
});

void test('cleanup uses a fresh bounded signal after the main lifecycle signal expires', async () => {
  let mainSignal;
  let cleanupSignal;
  let cleanupSignalWasActive = false;
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/auth/login')) return jsonResponse(200, { accessToken: 'owner-access-placeholder' });
    if (url.pathname.endsWith('/organizations/review-org') && init?.method === 'GET') {
      return jsonResponse(200, { id: 'review-org-id' });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'POST') {
      mainSignal = init.signal;
      return new Promise((resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => {
            const reason = init.signal.reason;
            reject(reason instanceof Error ? reason : new Error(String(reason)));
          },
          { once: true }
        );
        setTimeout(() => reject(new Error('fallback before lifecycle deadline')), 50);
      });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'GET') {
      cleanupSignal = init.signal;
      cleanupSignalWasActive = !init.signal.aborted;
      return jsonResponse(200, { count: 0, results: [] });
    }
    throw new Error('unexpected contract request');
  };

  await assert.rejects(
    runLiveOAuthClientLifecycle({ env: guardedEnvironment, fetcher, lifecycleTimeoutMs: 10, cleanupTimeoutMs: 100 })
  );
  assert.equal(mainSignal.aborted, true);
  assert.notEqual(cleanupSignal, mainSignal);
  assert.equal(cleanupSignalWasActive, true);
  assert.equal(cleanupSignal.aborted, false);
});

void test('reports both an expired lifecycle and its independent cleanup failure', async () => {
  const fetcher = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/auth/login')) return jsonResponse(200, { accessToken: 'owner-access-placeholder' });
    if (url.pathname.endsWith('/organizations/review-org') && init?.method === 'GET') {
      return jsonResponse(200, { id: 'review-org-id' });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'POST') {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => {
            const reason = init.signal.reason;
            reject(reason instanceof Error ? reason : new Error(String(reason)));
          },
          { once: true }
        );
      });
    }
    if (url.pathname.endsWith('/oauth-clients') && init?.method === 'GET') {
      return jsonResponse(200, { count: 'invalid', results: [] });
    }
    throw new Error('unexpected contract request');
  };

  await assert.rejects(
    runLiveOAuthClientLifecycle({ env: guardedEnvironment, fetcher, lifecycleTimeoutMs: 10, cleanupTimeoutMs: 100 }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 2);
      assert.match(String(error.errors[0]), /hard deadline/);
      assert.match(String(error.errors[1]), /not bounded/);
      return true;
    }
  );
});
