import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ensureLiveArchiveFixture } from './live-fixture.mjs';

// Returns a resolved Promise (not a bare Response) so every fetchImpl call site below can stay
// a plain `return jsonResponse(...)` -- fetchImpl's declared return type is Promise<Response>.
const jsonResponse = (body, status = 200) =>
  Promise.resolve(new Response(status === 204 ? null : body === null ? '' : JSON.stringify(body), { status }));

const environment = {
  PLAYWRIGHT_LIVE_ALLOWED_HOST: 'epoca-staging.company-5897fee414.example.invalid',
  PLAYWRIGHT_LIVE_ALLOWED_API_HOST: 'epoca-staging.company-5897fee414.example.invalid',
  PLAYWRIGHT_LIVE_BASE_URL: 'https://epoca-staging.company-5897fee414.example.invalid',
  PLAYWRIGHT_LIVE_API_BASE_URL: 'https://epoca-staging.company-5897fee414.example.invalid/api/v1',
  PLAYWRIGHT_LIVE_ORG_SLUG: 'iteratorstesting',
  LIVE_FIXTURE_OWNER_EMAIL: 'owner@example.test',
  LIVE_FIXTURE_OWNER_PASSWORD: 'owner-secret',
  LIVE_FIXTURE_USER_EMAIL: 'fixture@example.test',
  LIVE_FIXTURE_USER_PASSWORD: 'fixture-secret',
  LIVE_FIXTURE_SOURCE_WORK_UNIT_ID: 'source-unit',
};

const user = (archived) => ({
  id: 'fixture-user',
  archived,
  identities: [{ type: 'MailAddress', value: environment.LIVE_FIXTURE_USER_EMAIL }],
});

const unitsResponse = (results) => ({ workUnits: { results } });

const makeOutput = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ct530-live-fixture-'));
  return path.join(directory, 'fixture.env');
};

void test('creates one dedicated work unit, deassigns its organization membership and preserves the account', async () => {
  const requests = [];
  let deassigned = false;
  let fixtureCreated = false;
  const fetchImpl = (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({
      url: url.href,
      method,
      body,
      authorization: init.headers?.Authorization,
      deviceId: init.headers?.['device-id'],
      idempotencyKey: init.headers?.['Idempotency-Key'],
    });
    if (url.pathname === '/assets/env.js')
      return Promise.resolve(new Response("window.__ENV__ = { API_BASE_URL: '/api/v1' };"));
    if (url.pathname === '/api/v1/auth/login') {
      return jsonResponse({
        accessToken: body.email === environment.LIVE_FIXTURE_OWNER_EMAIL ? 'owner-token' : 'user-token',
      });
    }
    if (url.pathname === '/api/v1/organizations/iteratorstesting' && !url.search) {
      return jsonResponse({ id: 'organization-id' });
    }
    if (url.pathname.endsWith('/users') && url.searchParams.get('includeArchived') === 'true') {
      return jsonResponse(deassigned ? [] : [user(false)]);
    }
    if (url.pathname === '/api/v1/users' && url.searchParams.get('email') === environment.LIVE_FIXTURE_USER_EMAIL) {
      return jsonResponse([user(false)]);
    }
    if (url.pathname.endsWith('/users/deassign')) {
      deassigned = true;
      return jsonResponse(null, 204);
    }
    if (url.pathname.endsWith('/work-units') && method === 'POST') {
      fixtureCreated = true;
      return jsonResponse({ id: 'fixture-unit', userId: 'fixture-user', description: 'E2E CT-530 archived fixture' });
    }
    if (url.pathname.endsWith('/work-units') && url.searchParams.get('id') === 'source-unit') {
      return jsonResponse(
        unitsResponse([{ id: 'source-unit', userId: 'fixture-user', projectClient: { projectId: 'project-id' } }])
      );
    }
    if (url.pathname.endsWith('/work-units')) {
      return jsonResponse(
        unitsResponse(
          fixtureCreated
            ? [{ id: 'fixture-unit', userId: 'fixture-user', description: 'E2E CT-530 archived fixture' }]
            : []
        )
      );
    }
    return jsonResponse({ error: 'unexpected' }, 404);
  };
  const outputPath = await makeOutput();

  const values = await ensureLiveArchiveFixture({
    env: environment,
    fetchImpl,
    now: () => new Date('2026-08-25T12:00:00Z'),
    outputPath,
  });

  assert.deepEqual(values, {
    PLAYWRIGHT_LIVE_ALLOWED_ORG_ID: 'organization-id',
    PLAYWRIGHT_LIVE_ARCHIVED_USER_ID: 'fixture-user',
    PLAYWRIGHT_LIVE_ARCHIVED_WORK_UNIT_ID: 'fixture-unit',
  });
  assert.equal(requests.filter(({ url, method }) => url.endsWith('/work-units') && method === 'POST').length, 1);
  assert.equal(requests.filter(({ url }) => url.endsWith('/users/deassign')).length, 1);
  assert.equal(
    requests.some(({ url, method }) => method === 'DELETE' && url.includes('/users/')),
    false
  );
  const deviceIds = requests.filter(({ url }) => url.includes('/api/v1/')).map(({ deviceId }) => deviceId);
  assert.equal(
    deviceIds.every((deviceId) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(deviceId)),
    true
  );
  assert.equal(new Set(deviceIds).size, 1);
  const create = requests.find(({ url, method }) => url.endsWith('/work-units') && method === 'POST');
  assert.match(create.idempotencyKey, /^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
  assert.deepEqual(create.body, {
    entryType: 'Worklog',
    projectId: 'project-id',
    date: '2026-08-25',
    duration: 'PT1M',
    description: 'E2E CT-530 archived fixture',
    taskId: 'CT-530',
    isDraft: false,
  });
  assert.equal(create.authorization, 'Bearer user-token');
  assert.equal(
    await readFile(outputPath, 'utf8'),
    'PLAYWRIGHT_LIVE_ALLOWED_ORG_ID=organization-id\n' +
      'PLAYWRIGHT_LIVE_ARCHIVED_USER_ID=fixture-user\n' +
      'PLAYWRIGHT_LIVE_ARCHIVED_WORK_UNIT_ID=fixture-unit\n'
  );
});

void test('reuses an already deassigned fixture without employee login, mutation or duplication', async () => {
  const requests = [];
  const fetchImpl = (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ url: url.href, method, body });
    if (url.pathname === '/assets/env.js')
      return Promise.resolve(new Response("window.__ENV__ = { API_BASE_URL: '/api/v1' };"));
    if (url.pathname === '/api/v1/auth/login') return jsonResponse({ accessToken: 'owner-token' });
    if (url.pathname === '/api/v1/organizations/iteratorstesting' && !url.search)
      return jsonResponse({ id: 'organization-id' });
    if (url.pathname.endsWith('/users') && url.searchParams.get('includeArchived') === 'true') return jsonResponse([]);
    if (url.pathname === '/api/v1/users' && url.searchParams.get('email') === environment.LIVE_FIXTURE_USER_EMAIL) {
      return jsonResponse([user(false)]);
    }
    if (url.pathname.endsWith('/work-units')) {
      return jsonResponse(
        unitsResponse([{ id: 'fixture-unit', userId: 'fixture-user', description: 'E2E CT-530 archived fixture' }])
      );
    }
    return jsonResponse({ error: 'unexpected' }, 404);
  };

  await ensureLiveArchiveFixture({ env: environment, fetchImpl, outputPath: await makeOutput() });

  assert.equal(requests.filter(({ url }) => url.endsWith('/auth/login')).length, 1);
  assert.equal(
    requests.some(({ url, method }) => method === 'POST' && !url.endsWith('/auth/login')),
    false
  );
  assert.equal(
    requests.some(({ url }) => url.endsWith('/users/deassign')),
    false
  );
});

void test('fails closed before mutation when the source work unit belongs to another user', async () => {
  const requests = [];
  const fetchImpl = (input, init = {}) => {
    const url = new URL(input);
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ url: url.href, method: init.method ?? 'GET' });
    if (url.pathname === '/assets/env.js')
      return Promise.resolve(new Response("window.__ENV__ = { API_BASE_URL: '/api/v1' };"));
    if (url.pathname === '/api/v1/auth/login')
      return jsonResponse({
        accessToken: body.email === environment.LIVE_FIXTURE_OWNER_EMAIL ? 'owner-token' : 'user-token',
      });
    if (url.pathname === '/api/v1/organizations/iteratorstesting' && !url.search)
      return jsonResponse({ id: 'organization-id' });
    if (url.pathname.endsWith('/users')) return jsonResponse([user(false)]);
    if (url.pathname.endsWith('/work-units') && url.searchParams.get('id') === 'source-unit') {
      return jsonResponse(
        unitsResponse([{ id: 'source-unit', userId: 'another-user', projectClient: { projectId: 'project-id' } }])
      );
    }
    if (url.pathname.endsWith('/work-units')) return jsonResponse(unitsResponse([]));
    return jsonResponse({ error: 'unexpected' }, 404);
  };

  await assert.rejects(
    ensureLiveArchiveFixture({ env: environment, fetchImpl, outputPath: await makeOutput() }),
    /belongs to another user/
  );
  assert.equal(
    requests.some(({ url }) => url.endsWith('/users/deassign')),
    false
  );
  assert.equal(
    requests.some(({ url, method }) => url.endsWith('/work-units') && method === 'POST'),
    false
  );
});

void test('rejects a runtime API outside the exact configured path', async () => {
  const fetchImpl = (input) => {
    const url = new URL(input);
    if (url.pathname === '/assets/env.js')
      return Promise.resolve(new Response("window.__ENV__ = { API_BASE_URL: '/wrong' };"));
    throw new Error('credentials must not be used');
  };

  await assert.rejects(
    ensureLiveArchiveFixture({ env: environment, fetchImpl, outputPath: await makeOutput() }),
    /differs from the approved/
  );
});

void test('keeps fixture setup separate from deploy and wires protected consumers through sanitized dotenv IDs', async () => {
  const ci = await readFile(new URL('../../.gitlab-ci.yml', import.meta.url), 'utf8');
  const seed = ci.slice(ci.indexOf('seed_live_archive_fixture:'), ci.indexOf('\ne2e_live:'));
  const live = ci.slice(ci.indexOf('e2e_live:'), ci.indexOf('\ne2e_local_proxy:'));
  const localProxy = ci.slice(ci.indexOf('e2e_local_proxy:'), ci.indexOf('\nbuild_frontend:'));
  const deploy = ci.slice(ci.indexOf('deploy_staging_frontend:'), ci.indexOf('\nverify_docker_image:'));

  assert.match(seed, /environment:\n\s+name: staging/);
  assert.match(seed, /node scripts\/e2e\/seed-live-fixture\.mjs/);
  assert.match(seed, /dotenv: test-results\/live-fixture\.env/);
  assert.match(live, /job: seed_live_archive_fixture/);
  assert.match(localProxy, /job: seed_live_archive_fixture/);
  assert.match(live, /export PLAYWRIGHT_LIVE_USER_EMAIL="\$E2E_PROJECT_OWNER_EMAIL"/);
  assert.match(live, /export PLAYWRIGHT_LIVE_EMPLOYEE_EMAIL="\$E2E_EMPLOYEE_2_EMAIL"/);
  assert.match(live, /export PLAYWRIGHT_LIVE_EMPLOYEE_PASSWORD="\$E2E_EMPLOYEE_2_PASSWORD"/);
  assert.doesNotMatch(live, /PLAYWRIGHT_LIVE_USER_EMAIL:\s*\$E2E_PROJECT_OWNER_EMAIL/);
  assert.doesNotMatch(live, /PLAYWRIGHT_LIVE_USER_EMAIL[^\n]*\$E2E_EMPLOYEE_EMAIL/);
  assert.match(seed, /export LIVE_FIXTURE_OWNER_PASSWORD="\$E2E_OWNER_PASSWORD"/);
  assert.doesNotMatch(seed, /LIVE_FIXTURE_OWNER_PASSWORD:\s*\$E2E_OWNER_PASSWORD/);
  assert.doesNotMatch(deploy, /fixture|ct-?5(?:12|22|30)/i);
});
