import { expect, test } from '@playwright/test';
import { loadLiveActors } from './actors';
import {
  assertManifestOwnership,
  assertRequiredLiveEnvironment,
  assertRuntimeApiTarget,
  assertSafeApiTarget,
  assertSafeLiveTarget,
  fetchAndValidateFrontendVersion,
  fetchAndValidateRuntimeApi,
  parseHostList,
  type LiveTarget,
} from './guard';
import type { LiveRunManifest } from './metadata';

const safeTarget = (overrides: Partial<LiveTarget> = {}): LiveTarget => ({
  baseURL: 'https://frontend-staging.example.test',
  allowedHosts: ['frontend-staging.example.test'],
  allowedApiHosts: ['api-staging.example.test'],
  apiBaseURL: 'https://api-staging.example.test/api/v1',
  allowedOrganizationId: 'organization-1',
  organizationId: 'organization-1',
  ...overrides,
});

const manifest = (overrides: Partial<LiveRunManifest> = {}): LiveRunManifest => ({
  schemaVersion: 2,
  runId: 'ct530-1234',
  organizationId: 'organization-1',
  organizationSlug: 'ct530-staging',
  frontendOrigin: 'https://frontend-staging.example.test',
  apiOrigin: 'https://api-staging.example.test',
  apiBaseURL: 'https://api-staging.example.test/api/v1',
  frontendSha: 'frontend-sha',
  backendSha: 'backend-sha',
  archivedUserId: 'archived-user-id',
  archivedWorkUnitId: 'archived-work-unit-id',
  archivedUserName: 'Archived Fixture',
  historicalDescription: 'E2E CT-530 archived fixture historical hours',
  userId: 'user-id',
  projectName: 'E2E ct530-1234 project',
  updatedDescription: 'E2E ct530-1234 updated description',
  owned: { clientIds: [], projectIds: [], workUnitIds: [] },
  ownership: [],
  intents: [],
  quarantined: [],
  ...overrides,
});

test('safe live targets require HTTPS exact allowlists and the exact organization @mr @technical', () => {
  expect(assertSafeLiveTarget(safeTarget()).origin).toBe('https://frontend-staging.example.test');
  expect(assertSafeApiTarget(safeTarget()).origin).toBe('https://api-staging.example.test');

  expect(() => assertSafeLiveTarget(safeTarget({ baseURL: 'http://frontend-staging.example.test' }))).toThrow(/https/i);
  expect(() => assertSafeApiTarget(safeTarget({ apiBaseURL: 'http://api-staging.example.test' }))).toThrow(/https/i);
  expect(() => assertSafeLiveTarget(safeTarget({ allowedHosts: [] }))).toThrow(/allowlist/i);
  expect(() => assertSafeApiTarget(safeTarget({ allowedApiHosts: [] }))).toThrow(/allowlist/i);
  expect(() => assertSafeLiveTarget(safeTarget({ allowedHosts: ['other.example.test'] }))).toThrow(/allowlist/i);
  expect(() => assertSafeApiTarget(safeTarget({ allowedApiHosts: ['other.example.test'] }))).toThrow(/allowlist/i);
  expect(() => assertSafeLiveTarget(safeTarget({ organizationId: 'organization-2' }))).toThrow(/organization/i);
});

test('safe live targets reject production frontend and API hostnames including subdomains @mr @technical', () => {
  expect(() =>
    assertSafeLiveTarget(safeTarget({ baseURL: 'https://epoca.company-5897fee414.example.invalid', allowedHosts: ['epoca.company-5897fee414.example.invalid'] }))
  ).toThrow(/production/i);
  expect(() =>
    assertSafeLiveTarget(
      safeTarget({ baseURL: 'https://preview.epoca.company-5897fee414.example.invalid', allowedHosts: ['preview.epoca.company-5897fee414.example.invalid'] })
    )
  ).toThrow(/production/i);
  expect(() =>
    assertSafeApiTarget(
      safeTarget({ apiBaseURL: 'https://api.epoca.company-5897fee414.example.invalid', allowedApiHosts: ['api.epoca.company-5897fee414.example.invalid'] })
    )
  ).toThrow(/production/i);
});

test('safe targets honor configured live and local-proxy production domains @mr @technical', () => {
  const originalLive = process.env.PLAYWRIGHT_LIVE_PRODUCTION_DOMAINS;
  const originalLocal = process.env.PLAYWRIGHT_LOCAL_PROXY_PRODUCTION_DOMAINS;
  try {
    process.env.PLAYWRIGHT_LIVE_PRODUCTION_DOMAINS = 'prod-live.example.test';
    process.env.PLAYWRIGHT_LOCAL_PROXY_PRODUCTION_DOMAINS = 'prod-proxy.example.test';
    expect(() =>
      assertSafeLiveTarget(
        safeTarget({
          baseURL: 'https://preview.prod-live.example.test',
          allowedHosts: ['preview.prod-live.example.test'],
        })
      )
    ).toThrow(/production/i);
    expect(() =>
      assertSafeApiTarget(
        safeTarget({ apiBaseURL: 'https://prod-proxy.example.test', allowedApiHosts: ['prod-proxy.example.test'] })
      )
    ).toThrow(/production/i);
  } finally {
    if (originalLive === undefined) delete process.env.PLAYWRIGHT_LIVE_PRODUCTION_DOMAINS;
    else process.env.PLAYWRIGHT_LIVE_PRODUCTION_DOMAINS = originalLive;
    if (originalLocal === undefined) delete process.env.PLAYWRIGHT_LOCAL_PROXY_PRODUCTION_DOMAINS;
    else process.env.PLAYWRIGHT_LOCAL_PROXY_PRODUCTION_DOMAINS = originalLocal;
  }
});

test('host guards canonicalize trailing dots case IDNA and HTTPS ports @mr @technical', () => {
  expect(
    assertSafeLiveTarget(
      safeTarget({
        baseURL: 'https://FRONTEND-STAGING.EXAMPLE.TEST.:443',
        allowedHosts: ['frontend-staging.example.test'],
      })
    ).port
  ).toBe('');
  expect(
    assertSafeLiveTarget(
      safeTarget({
        baseURL: 'https://xn--bcher-kva.example.test',
        allowedHosts: ['BÜCHER.EXAMPLE.TEST.'],
      })
    ).hostname
  ).toBe('xn--bcher-kva.example.test');
  expect(() =>
    assertSafeLiveTarget(
      safeTarget({
        baseURL: 'https://frontend-staging.example.test:8443',
        allowedHosts: ['frontend-staging.example.test'],
      })
    )
  ).toThrow(/allowlist/i);
  expect(() =>
    assertSafeLiveTarget(
      safeTarget({
        baseURL: 'https://frontend-staging.example.test:8443',
        allowedHosts: ['FRONTEND-STAGING.EXAMPLE.TEST.:8443'],
      })
    )
  ).not.toThrow();
});

test('host guards reject canonical production names userinfo and malformed entries @mr @technical', () => {
  expect(() =>
    assertSafeLiveTarget(safeTarget({ baseURL: 'https://EPOCA.COMPANY-5897FEE414.EXAMPLE.INVALID.', allowedHosts: ['epoca.company-5897fee414.example.invalid'] }))
  ).toThrow(/production/i);
  expect(() =>
    assertSafeApiTarget(
      safeTarget({ apiBaseURL: 'https://API.EPOCA.COMPANY-5897FEE414.EXAMPLE.INVALID..', allowedApiHosts: ['api.epoca.company-5897fee414.example.invalid'] })
    )
  ).toThrow(/production/i);
  expect(() =>
    assertSafeLiveTarget(
      safeTarget({
        baseURL: 'https://user:pass@frontend-staging.example.test',
        allowedHosts: ['frontend-staging.example.test'],
      })
    )
  ).toThrow(/credentials/i);

  for (const malformed of [
    'user@frontend-staging.example.test',
    'frontend-staging.example.test/path',
    'frontend-staging.example.test?query=1',
    'frontend-staging.example.test#fragment',
    'https://frontend-staging.example.test',
    'frontend-staging.example.test:not-a-port',
  ]) {
    expect(() => parseHostList(malformed)).toThrow(/host/i);
  }

  const previous = process.env.PLAYWRIGHT_LIVE_PRODUCTION_DOMAINS;
  try {
    process.env.PLAYWRIGHT_LIVE_PRODUCTION_DOMAINS = 'BÜCHER.EXAMPLE.TEST.';
    expect(() =>
      assertSafeLiveTarget(
        safeTarget({
          baseURL: 'https://preview.xn--bcher-kva.example.test.',
          allowedHosts: ['preview.xn--bcher-kva.example.test'],
        })
      )
    ).toThrow(/production/i);
  } finally {
    if (previous === undefined) delete process.env.PLAYWRIGHT_LIVE_PRODUCTION_DOMAINS;
    else process.env.PLAYWRIGHT_LIVE_PRODUCTION_DOMAINS = previous;
  }
});

test('runtime API validation rejects missing malformed switched and unsafe origins @mr @technical', () => {
  const sameOriginTarget = safeTarget({
    apiBaseURL: 'https://frontend-staging.example.test/api/v1',
    allowedApiHosts: ['frontend-staging.example.test'],
  });
  expect(assertRuntimeApiTarget(sameOriginTarget, '/api/v1').href).toBe('https://frontend-staging.example.test/api/v1');
  expect(() => assertRuntimeApiTarget(safeTarget(), '')).toThrow(/API_BASE_URL/i);
  expect(() => assertRuntimeApiTarget(safeTarget(), 'not a url with spaces')).toThrow(/API_BASE_URL/i);
  expect(() => assertRuntimeApiTarget(safeTarget(), 'http://api-staging.example.test')).toThrow(/https/i);
  expect(() => assertRuntimeApiTarget(safeTarget(), 'https://other.example.test')).toThrow(/allowlist/i);
  expect(() =>
    assertRuntimeApiTarget(
      safeTarget({ allowedApiHosts: ['api-staging.example.test', 'api-other.example.test'] }),
      'https://api-other.example.test/api/v1'
    )
  ).toThrow(/origin/i);
});

test('a pre-aborted lifecycle signal prevents the runtime env fetch from starting @mr @technical', async () => {
  const controller = new AbortController();
  controller.abort(new DOMException('Lifecycle expired', 'AbortError'));
  let fetchCalls = 0;

  await expect(
    fetchAndValidateRuntimeApi(
      safeTarget(),
      () => {
        fetchCalls += 1;
        return Promise.resolve(
          new Response("window.env = { API_BASE_URL: 'https://api-staging.example.test/api/v1' };")
        );
      },
      controller.signal
    )
  ).rejects.toThrow(/Lifecycle expired/i);
  expect(fetchCalls).toBe(0);
});

test('live evidence requires the exact deployed frontend SHA before credentials or mutations @mr @technical', async () => {
  const expectedSha = '1234567890abcdef1234567890abcdef12345678';
  let request: { init?: RequestInit; url: string } | undefined;

  await expect(
    fetchAndValidateFrontendVersion(safeTarget(), expectedSha, (input: RequestInfo | URL, init?: RequestInit) => {
      request = { init, url: input instanceof Request ? input.url : String(input) };
      return Promise.resolve(
        new Response(`${expectedSha}\n`, { headers: { 'Content-Type': 'text/plain' }, status: 200 })
      );
    })
  ).resolves.toBe(expectedSha);
  expect(request?.url).toBe('https://frontend-staging.example.test/frontend-version');
  expect(request?.init).toMatchObject({ method: 'GET', redirect: 'error' });

  await expect(
    fetchAndValidateFrontendVersion(safeTarget(), expectedSha, () =>
      Promise.resolve(
        new Response('abcdefabcdefabcdefabcdefabcdefabcdefabcd\n', {
          headers: { 'Content-Type': 'text/plain' },
          status: 200,
        })
      )
    )
  ).rejects.toThrow(/deployed frontend SHA/i);
});

test('frontend identity validation rejects invalid expectations and malformed responses fail closed @mr @technical', async () => {
  let fetchCalls = 0;
  const fetcher = (): Promise<Response> => {
    fetchCalls += 1;
    return Promise.resolve(new Response('not-a-sha', { headers: { 'Content-Type': 'text/html' }, status: 200 }));
  };

  await expect(fetchAndValidateFrontendVersion(safeTarget(), 'not-a-sha', fetcher)).rejects.toThrow(/SHA/i);
  expect(fetchCalls).toBe(0);
  await expect(
    fetchAndValidateFrontendVersion(safeTarget(), '1234567890abcdef1234567890abcdef12345678', fetcher)
  ).rejects.toThrow(/text\/plain|deployed frontend SHA/i);
});

test('live environment validation rejects missing fixtures actor credentials and SHAs @mr @technical', () => {
  const validEnvironment = {
    archivedUserId: 'archived-user-id',
    archivedWorkUnitId: 'archived-work-unit-id',
    frontendSha: 'frontend-sha',
    backendSha: 'backend-sha',
  };

  expect(() => assertRequiredLiveEnvironment(validEnvironment)).not.toThrow();
  expect(() => assertRequiredLiveEnvironment({ ...validEnvironment, archivedUserId: '' })).toThrow(/archived/i);
  expect(() => assertRequiredLiveEnvironment({ ...validEnvironment, archivedWorkUnitId: '' })).toThrow(/archived/i);
  expect(() => assertRequiredLiveEnvironment({ ...validEnvironment, frontendSha: '' })).toThrow(/SHA/i);
  expect(() => assertRequiredLiveEnvironment({ ...validEnvironment, backendSha: '' })).toThrow(/SHA/i);

  expect(() =>
    loadLiveActors({
      PLAYWRIGHT_LIVE_OWNER_EMAIL: 'owner@example.test',
      PLAYWRIGHT_LIVE_OWNER_PASSWORD: '',
    })
  ).toThrow(/credential/i);

  expect(
    loadLiveActors({
      PLAYWRIGHT_LIVE_OWNER_EMAIL: 'owner@example.test',
      PLAYWRIGHT_LIVE_OWNER_PASSWORD: 'owner-password',
      PLAYWRIGHT_LIVE_MANAGER_EMAIL: 'manager@example.test',
      PLAYWRIGHT_LIVE_MANAGER_PASSWORD: 'manager-password',
      PLAYWRIGHT_LIVE_PM_EMAIL: 'pm@example.test',
      PLAYWRIGHT_LIVE_PM_PASSWORD: 'pm-password',
      PLAYWRIGHT_LIVE_USER_EMAIL: 'user@example.test',
      PLAYWRIGHT_LIVE_USER_PASSWORD: 'user-password',
      PLAYWRIGHT_LIVE_EMPLOYEE_EMAIL: 'employee@example.test',
      PLAYWRIGHT_LIVE_EMPLOYEE_PASSWORD: 'employee-password',
    }).employee.email
  ).toBe('employee@example.test');
});

test('manifest ownership rejects teardown for another organization or origin @mr @technical', () => {
  expect(() => assertManifestOwnership(manifest(), safeTarget())).not.toThrow();
  expect(() => assertManifestOwnership(manifest({ organizationId: 'organization-2' }), safeTarget())).toThrow(
    /organization/i
  );
  expect(() =>
    assertManifestOwnership(manifest({ frontendOrigin: 'https://other.example.test' }), safeTarget())
  ).toThrow(/origin/i);
  expect(() => assertManifestOwnership(manifest({ apiOrigin: 'https://other.example.test' }), safeTarget())).toThrow(
    /origin/i
  );
});
