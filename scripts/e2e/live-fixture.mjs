import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const FIXTURE_DESCRIPTION = 'E2E CT-530 archived fixture';
const FIXTURE_TASK_ID = 'CT-530';
const FIXTURE_IDEMPOTENCY_KEY = 'c7530000-0000-4530-8000-000000000001';
const LIVE_FIXTURE_DEVICE_ID = randomUUID();

/**
 * @typedef {Record<string, unknown>} JsonRecord
 *
 * @typedef {{
 *   PLAYWRIGHT_LIVE_ALLOWED_ORG_ID: string;
 *   PLAYWRIGHT_LIVE_ARCHIVED_USER_ID: string;
 *   PLAYWRIGHT_LIVE_ARCHIVED_WORK_UNIT_ID: string;
 * }} LiveFixtureValues
 */

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {JsonRecord}
 */
const asRecord = (value, label) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is malformed`);
  }
  return /** @type {JsonRecord} */ (value);
};

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} key
 * @returns {string}
 */
const required = (env, key) => {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required`);
  return value;
};

/**
 * @param {string} value
 * @param {string} label
 * @param {string} expectedHost
 * @returns {URL}
 */
const parseSafeUrl = (value, label, expectedHost) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must be credential-free HTTPS`);
  }
  if (url.hostname !== expectedHost) throw new Error(`${label} is outside the exact staging allowlist`);
  return url;
};

/**
 * @param {string} apiBaseURL
 * @param {string} pathname
 * @returns {URL}
 */
const apiEndpoint = (apiBaseURL, pathname) => {
  const base = new URL(apiBaseURL);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(pathname.replace(/^\//, ''), base);
};

/**
 * @param {typeof fetch} fetchImpl
 * @param {string} apiBaseURL
 * @param {string} pathname
 * @param {{ body?: unknown; headers?: Record<string, string>; method?: string; token?: string }} [options]
 * @returns {Promise<unknown>}
 */
const requestJson = async (fetchImpl, apiBaseURL, pathname, options = {}) => {
  const headers = { Accept: 'application/json', ...options.headers, 'device-id': LIVE_FIXTURE_DEVICE_ID };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetchImpl(apiEndpoint(apiBaseURL, pathname), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: 'error',
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Live fixture API ${options.method ?? 'GET'} ${pathname} failed with ${response.status}`);
  return text ? /** @type {unknown} */ (JSON.parse(text)) : null;
};

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
const accessToken = (value, label) => {
  const token = asRecord(value, label).accessToken;
  if (typeof token !== 'string' || !token) throw new Error(`${label} is malformed`);
  return token;
};

/**
 * @param {JsonRecord} user
 * @returns {string | undefined}
 */
const identityEmail = (user) => {
  if (!Array.isArray(user.identities)) return undefined;
  const identities = /** @type {unknown[]} */ (user.identities);
  const identity = identities.find(
    (entry) => typeof entry === 'object' && entry !== null && 'type' in entry && entry.type === 'MailAddress'
  );
  const value = identity && asRecord(identity, 'User identity').value;
  return typeof value === 'string' ? value : undefined;
};

/**
 * @param {unknown} value
 * @returns {JsonRecord[]}
 */
const organizationUsers = (value) => {
  if (!Array.isArray(value)) throw new Error('Organization users response is malformed');
  return value.map((entry) => asRecord(entry, 'Organization user'));
};

/**
 * @param {unknown} value
 * @returns {JsonRecord[]}
 */
const workUnits = (value) => {
  const root = asRecord(value, 'Work-unit response');
  const nested = root.workUnits;
  const candidate = nested && typeof nested === 'object' ? /** @type {JsonRecord} */ (nested).results : root.results;
  if (!Array.isArray(candidate)) throw new Error('Work-unit response is malformed');
  return candidate.map((entry) => asRecord(entry, 'Work unit'));
};

/**
 * @param {typeof fetch} fetchImpl
 * @param {URL} frontend
 * @returns {Promise<URL>}
 */
const runtimeApiBaseURL = async (fetchImpl, frontend) => {
  const response = await fetchImpl(new URL('/assets/env.js', frontend.origin), {
    headers: { Accept: 'application/javascript,text/javascript' },
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Unable to read staging env.js');
  const script = await response.text();
  const value = script.match(/API_BASE_URL\s*:\s*(['"])(.*?)\1/)?.[2]
    ?? script.match(/\[['"]API_BASE_URL['"]\]\s*=\s*(['"])(.*?)\1/)?.[2];
  if (!value?.trim()) throw new Error('Staging env.js does not define API_BASE_URL');
  return new URL(value, frontend.origin);
};

/**
 * @param {string} userId
 * @returns {URLSearchParams}
 */
const fixtureQuery = (userId) => new URLSearchParams({
  dateFrom: '1970-01-01',
  dateTo: '2099-12-31',
  userId,
});

/**
 * @param {string} id
 * @returns {URLSearchParams}
 */
const sourceQuery = (id) => new URLSearchParams({ id, dateFrom: '1970-01-01', dateTo: '2099-12-31' });

/**
 * @param {typeof fetch} fetchImpl
 * @param {string} apiBaseURL
 * @param {string} organizationPath
 * @param {string} ownerToken
 * @param {string} userId
 * @returns {Promise<JsonRecord | undefined>}
 */
const findFixture = async (fetchImpl, apiBaseURL, organizationPath, ownerToken, userId) => {
  const units = workUnits(await requestJson(
    fetchImpl,
    apiBaseURL,
    `${organizationPath}/work-units?${fixtureQuery(userId)}`,
    { token: ownerToken }
  ));
  const candidates = units.filter(
    (unit) => unit.userId === userId && unit.description === FIXTURE_DESCRIPTION && typeof unit.id === 'string'
  );
  if (candidates.length > 1) throw new Error('Archived live fixture is ambiguous');
  return candidates[0];
};

/**
 * @param {JsonRecord} source
 * @param {string} userId
 * @returns {string}
 */
const sourceProjectId = (source, userId) => {
  if (source.userId !== userId) throw new Error('Fixture source work unit belongs to another user');
  const projectClient = asRecord(source.projectClient, 'Fixture source project');
  if (typeof projectClient.projectId !== 'string' || !projectClient.projectId) {
    throw new Error('Fixture source work unit has no project');
  }
  return projectClient.projectId;
};

/**
 * @param {string} outputPath
 * @param {LiveFixtureValues} values
 * @returns {Promise<void>}
 */
const writeDotenv = async (outputPath, values) => {
  const body = Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n';
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, body, { encoding: 'utf8', mode: 0o600 });
};

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv;
 *   fetchImpl?: typeof fetch;
 *   now?: () => Date;
 *   outputPath?: string;
 * }} [options]
 * @returns {Promise<LiveFixtureValues>}
 */
export const ensureLiveArchiveFixture = async ({
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date(),
  outputPath = path.resolve('test-results/live-fixture.env'),
} = {}) => {
  const frontendHost = required(env, 'PLAYWRIGHT_LIVE_ALLOWED_HOST');
  const apiHost = required(env, 'PLAYWRIGHT_LIVE_ALLOWED_API_HOST');
  const frontend = parseSafeUrl(required(env, 'PLAYWRIGHT_LIVE_BASE_URL'), 'Live fixture frontend', frontendHost);
  const configuredApi = parseSafeUrl(required(env, 'PLAYWRIGHT_LIVE_API_BASE_URL'), 'Live fixture API', apiHost);
  const runtimeApi = parseSafeUrl((await runtimeApiBaseURL(fetchImpl, frontend)).href, 'Runtime live fixture API', apiHost);
  if (runtimeApi.href !== configuredApi.href) throw new Error('Runtime API differs from the approved live fixture API');

  const organizationSlug = required(env, 'PLAYWRIGHT_LIVE_ORG_SLUG');
  const organizationPath = `/organizations/${encodeURIComponent(organizationSlug)}`;
  const ownerLogin = await requestJson(fetchImpl, runtimeApi.href, '/auth/login', {
    method: 'POST',
    body: {
      email: required(env, 'LIVE_FIXTURE_OWNER_EMAIL'),
      password: required(env, 'LIVE_FIXTURE_OWNER_PASSWORD'),
    },
  });
  const ownerToken = accessToken(ownerLogin, 'Fixture owner login response');
  const organization = asRecord(
    await requestJson(fetchImpl, runtimeApi.href, organizationPath, { token: ownerToken }),
    'Organization'
  );
  if (typeof organization.id !== 'string' || !organization.id) throw new Error('Organization has no ID');
  const organizationId = organization.id;

  const usersPath = `${organizationPath}/users?includeArchived=true`;
  let users = organizationUsers(await requestJson(fetchImpl, runtimeApi.href, usersPath, { token: ownerToken }));
  const fixtureEmail = required(env, 'LIVE_FIXTURE_USER_EMAIL');
  const activeMembership = users.find((user) => identityEmail(user) === fixtureEmail);
  let fixtureUser = activeMembership;
  if (!fixtureUser) {
    const globalUsersPath = `/users?${new URLSearchParams({ email: fixtureEmail })}`;
    const matches = organizationUsers(
      await requestJson(fetchImpl, runtimeApi.href, globalUsersPath, { token: ownerToken })
    ).filter((user) => identityEmail(user) === fixtureEmail);
    if (matches.length !== 1) throw new Error('Fixture user lookup is not unique');
    [fixtureUser] = matches;
  }
  if (!fixtureUser || typeof fixtureUser.id !== 'string') {
    throw new Error('Fixture user is unavailable');
  }
  const fixtureUserId = fixtureUser.id;

  let fixture = await findFixture(fetchImpl, runtimeApi.href, organizationPath, ownerToken, fixtureUserId);
  if (activeMembership) {
    if (!fixture) {
      const userLogin = await requestJson(fetchImpl, runtimeApi.href, '/auth/login', {
        method: 'POST',
        body: { email: fixtureEmail, password: required(env, 'LIVE_FIXTURE_USER_PASSWORD') },
      });
      const userToken = accessToken(userLogin, 'Fixture user login response');
      const sourceId = required(env, 'LIVE_FIXTURE_SOURCE_WORK_UNIT_ID');
      const source = workUnits(await requestJson(
        fetchImpl,
        runtimeApi.href,
        `${organizationPath}/work-units?${sourceQuery(sourceId)}`,
        { token: userToken }
      )).find((unit) => unit.id === sourceId);
      if (!source) throw new Error('Fixture source work unit is missing');
      const projectId = sourceProjectId(source, fixtureUserId);
      const created = asRecord(await requestJson(fetchImpl, runtimeApi.href, `${organizationPath}/work-units`, {
        method: 'POST',
        token: userToken,
        headers: { 'Idempotency-Key': FIXTURE_IDEMPOTENCY_KEY },
        body: {
          entryType: 'Worklog',
          projectId,
          date: now().toISOString().slice(0, 10),
          duration: 'PT1M',
          description: FIXTURE_DESCRIPTION,
          taskId: FIXTURE_TASK_ID,
          isDraft: false,
        },
      }), 'Created fixture work unit');
      if (typeof created.id !== 'string' || !created.id) throw new Error('Created fixture work unit has no ID');
      fixture = created;
    }

    await requestJson(fetchImpl, runtimeApi.href, `${organizationPath}/users/deassign`, {
      method: 'POST',
      token: ownerToken,
      body: { userId: fixtureUserId },
    });
    users = organizationUsers(await requestJson(fetchImpl, runtimeApi.href, usersPath, { token: ownerToken }));
  }

  if (users.some((user) => user.id === fixtureUserId)) {
    throw new Error('Live fixture user is still assigned to the organization');
  }
  fixture = await findFixture(fetchImpl, runtimeApi.href, organizationPath, ownerToken, fixtureUserId);
  if (!fixture || typeof fixture.id !== 'string') throw new Error('Archived live fixture work unit is missing');
  const fixtureId = fixture.id;

  const values = {
    PLAYWRIGHT_LIVE_ALLOWED_ORG_ID: organizationId,
    PLAYWRIGHT_LIVE_ARCHIVED_USER_ID: fixtureUserId,
    PLAYWRIGHT_LIVE_ARCHIVED_WORK_UNIT_ID: fixtureId,
  };
  await writeDotenv(outputPath, values);
  return values;
};

/**
 * @returns {Promise<void>}
 */
export const runLiveFixtureCli = async () => {
  const values = await ensureLiveArchiveFixture();
  console.log(`Verified historical live fixture for organization ${values.PLAYWRIGHT_LIVE_ALLOWED_ORG_ID}`);
};
