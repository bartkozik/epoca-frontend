import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { assertString as assertNonEmptyString, isRecord, assertExactKeys } from './validation-primitives.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;
const API_TIMEOUT_MS = 10_000;
const TRUSTED_GITLAB_ORIGIN = 'https://gitlab.company-5897fee414.example.invalid';
const TRUSTED_GITHUB_API_ORIGIN = 'https://api.github.com';
const TRUSTED_GITHUB_WEB_ORIGIN = 'https://github.com';
const GITLAB_PAGE_SIZE = 100;
const MAX_GITLAB_PAGES = 10;
export const TRUSTED_GITLAB_API_BASE = `${TRUSTED_GITLAB_ORIGIN}/api/v4`;
export const TRUSTED_GITHUB_API_BASE = TRUSTED_GITHUB_API_ORIGIN;
export const MAX_GITLAB_JSON_BYTES = 1024 * 1024;
export const MAX_GITLAB_ARTIFACT_BYTES = 10 * 1024 * 1024;
export const MAX_GITHUB_JSON_BYTES = 1024 * 1024;
export const MAX_GITHUB_ARTIFACT_BYTES = 2 * 1024 * 1024;
export const MAX_GITHUB_EVIDENCE_BYTES = 4 * 1024 * 1024;

/**
 * @typedef {object} ExternalGatePolicy
 * @property {string} id
 * @property {'gitlab'} provider
 * @property {string} projectId
 * @property {string} shaEnv
 * @property {string} job
 * @property {string} artifact
 *
 * @typedef {object} GitlabGateEvidence
 * @property {'external'} type
 * @property {'gitlab'} provider
 * @property {string} projectId
 * @property {string} shaEnv
 * @property {string} job
 * @property {string} artifact
 *
 * @typedef {object} GateEntry
 * @property {'gate'} kind
 * @property {string} id
 * @property {boolean} backfill
 * @property {string} reason
 * @property {string} command
 * @property {GitlabGateEvidence} evidence
 *
 * @typedef {object} BackendEvidenceDocument
 * @property {1} schemaVersion
 * @property {string} sha
 * @property {string} pipelineUrl
 * @property {string} jobUrl
 *
 * @typedef {object} ExternalEvidenceGitlabGate
 * @property {'gitlab'} provider
 * @property {string} projectId
 * @property {string} sha
 * @property {string} pipelineUrl
 * @property {string} jobUrl
 * @property {string} artifactName
 * @property {string} artifactSha256
 *
 * @typedef {object} ExternalEvidenceDocument
 * @property {1} schemaVersion
 * @property {ExternalEvidenceGitlabGate[]} gates
 *
 * @typedef {object} FetchBodyReaderLike
 * @property {() => Promise<{ done: boolean, value?: Uint8Array }>} read
 * @property {(reason?: unknown) => Promise<void>} cancel
 * @property {() => void} releaseLock
 *
 * @typedef {object} FetchResponseBodyLike
 * @property {() => FetchBodyReaderLike} getReader
 * @property {((reason?: unknown) => Promise<void>) | undefined} [cancel]
 *
 * @typedef {object} FetchHeadersLike
 * @property {(name: string) => string | null} get
 *
 * @typedef {object} FetchResponseLike
 * @property {number} status
 * @property {string} url
 * @property {FetchHeadersLike} headers
 * @property {FetchResponseBodyLike | null} [body]
 *
 * @typedef {(input: URL, init: Record<string, unknown>) => Promise<FetchResponseLike>} FetchImpl
 *
 * @typedef {object} GitLabPipeline
 * @property {number} id
 * @property {string} sha
 * @property {string} status
 * @property {string} web_url
 *
 * @typedef {object} GitLabJob
 * @property {number} id
 * @property {string} name
 * @property {string} status
 * @property {string} web_url
 *
 * @typedef {object} GitLabWebUrlExpectation
 * @property {string} projectId
 * @property {'pipelines' | 'jobs'} resource
 * @property {number} id
 *
 * @typedef {object} GitHubWebUrlExpectation
 * @property {string} repository
 * @property {number} runId
 * @property {'runs' | 'jobs'} resource
 * @property {number} [jobId]
 *
 * @typedef {object} GitHubRunPolicy
 * @property {string} workflow
 * @property {string} branch
 * @property {string} event
 *
 * @typedef {object} GitHubRun
 * @property {number} id
 * @property {number} run_attempt
 * @property {string} event
 * @property {string} head_branch
 * @property {string} head_sha
 * @property {string} status
 * @property {string} conclusion
 * @property {string} path
 * @property {string} html_url
 *
 * @typedef {object} GitHubJobPolicy
 * @property {string} job
 *
 * @typedef {object} GitHubJob
 * @property {number} id
 * @property {number} run_id
 * @property {string} head_sha
 * @property {string} status
 * @property {string} conclusion
 * @property {string} html_url
 *
 * @typedef {object} GitHubArtifactPolicy
 * @property {string} artifact
 *
 * @typedef {object} GitHubArtifactWorkflowRun
 * @property {number} id
 * @property {string} head_sha
 *
 * @typedef {object} GitHubArtifact
 * @property {number} id
 * @property {string} name
 * @property {boolean} expired
 * @property {string} archive_download_url
 * @property {GitHubArtifactWorkflowRun} workflow_run
 *
 * @typedef {object} GitHubArtifactFilePolicy
 * @property {string} file
 *
 * @typedef {object} GitHubSkillEvidencePolicy
 * @property {string} repository
 * @property {string} workflow
 * @property {string} branch
 * @property {string} event
 * @property {string} job
 * @property {string} evidenceProvider
 * @property {string} providerEndpoint
 * @property {string} model
 * @property {string} configSha256
 * @property {string} inventorySha256
 * @property {number} expectedCases
 *
 * @typedef {object} GitHubSkillEvidenceRun
 * @property {number} id
 * @property {number} run_attempt
 *
 * @typedef {object} ValidateGitHubSkillEvidenceOptions
 * @property {GitHubSkillEvidencePolicy} policy
 * @property {string} skillSha
 * @property {string} backendSha
 * @property {GitHubSkillEvidenceRun} run
 */

/** @type {Record<string, ExternalGatePolicy>} */
const EXTERNAL_GATE_POLICIES = Object.freeze({
  'gitlab:epoca/epoca': Object.freeze({
    id: 'CT-520',
    provider: 'gitlab',
    projectId: 'epoca/epoca',
    shaEnv: 'EPOCA_BACKEND_SHA',
    job: 'oauth_e2e',
    artifact: 'oauth-e2e-evidence.json',
  }),
});

/**
 * @param {unknown} value
 * @param {string} [label]
 * @returns {string}
 */
export const assertExactSha = (value, label = 'SHA') => {
  if (typeof value !== 'string' || !SHA_PATTERN.test(value))
    throw new Error(`${label} must be an exact 40-character SHA`);
  return value;
};

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {URL}
 */
const assertSafeHttpsUrl = (value, label) => {
  let url;
  try {
    url = new URL(/** @type {string} */ (value));
  } catch {
    throw new Error(`${label} must be a safe HTTPS URL`);
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname === '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.search !== ''
  ) {
    throw new Error(`${label} must be a safe HTTPS URL`);
  }
  return url;
};

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {URL}
 */
const assertTrustedGitLabWebUrl = (value, label) => {
  const candidate = assertSafeHttpsUrl(value, label);
  if (candidate.origin !== TRUSTED_GITLAB_ORIGIN) {
    throw new Error(`${label} must stay on the exact GitLab origin`);
  }
  return candidate;
};

/**
 * @param {unknown} document
 * @returns {BackendEvidenceDocument}
 */
export const validateBackendEvidenceDocument = (document) => {
  assertExactKeys(document, ['schemaVersion', 'sha', 'pipelineUrl', 'jobUrl'], 'backend evidence');
  if (document.schemaVersion !== 1) throw new Error('backend evidence schemaVersion must be 1');
  assertExactSha(document.sha, 'backend evidence SHA');
  assertTrustedGitLabWebUrl(document.pipelineUrl, 'backend evidence pipelineUrl');
  assertTrustedGitLabWebUrl(document.jobUrl, 'backend evidence jobUrl');
  return /** @type {BackendEvidenceDocument} */ (document);
};

/**
 * @param {unknown} document
 * @returns {ExternalEvidenceDocument}
 */
export const validateExternalEvidenceDocument = (document) => {
  assertExactKeys(document, ['schemaVersion', 'gates'], 'external evidence');
  if (document.schemaVersion !== 1) throw new Error('external evidence schemaVersion must be 1');
  if (!Array.isArray(document.gates) || document.gates.length !== Object.keys(EXTERNAL_GATE_POLICIES).length) {
    throw new Error('external evidence gates must contain every allowlisted gate exactly once');
  }
  const identities = new Set();
  for (const gate of document.gates) {
    if (isRecord(gate) && gate.provider === 'gitlab') {
      assertExactKeys(
        gate,
        ['provider', 'projectId', 'sha', 'pipelineUrl', 'jobUrl', 'artifactName', 'artifactSha256'],
        'external evidence gate',
      );
      const identity = `gitlab:${String(gate.projectId)}`;
      const policy = EXTERNAL_GATE_POLICIES[identity];
      if (policy === undefined || identities.has(identity)) {
        throw new Error(`external evidence gate has disallowed or duplicate identity: ${identity}`);
      }
      identities.add(identity);
      assertExactSha(gate.sha, `external evidence SHA for ${String(gate.projectId)}`);
      assertTrustedGitLabWebUrl(gate.pipelineUrl, `external evidence pipelineUrl for ${String(gate.projectId)}`);
      assertTrustedGitLabWebUrl(gate.jobUrl, `external evidence jobUrl for ${String(gate.projectId)}`);
      if (gate.artifactName !== policy.artifact) {
        throw new Error(`external evidence gate has invalid artifactName for ${String(gate.projectId)}`);
      }
      if (typeof gate.artifactSha256 !== 'string' || !CHECKSUM_PATTERN.test(gate.artifactSha256)) {
        throw new Error(`external evidence gate has invalid artifact checksum for ${String(gate.projectId)}`);
      }
      continue;
    }
    throw new Error('external evidence gate has invalid provider');
  }
  return /** @type {ExternalEvidenceDocument} */ (document);
};

/**
 * @param {unknown} coverageMap
 * @returns {GateEntry[]}
 */
export const selectExternalGates = (coverageMap) => {
  if (!Array.isArray(coverageMap)) throw new Error('external gate coverage map must be an array');
  const gates = coverageMap.filter(
    /**
     * @param {unknown} entry
     * @returns {entry is Record<string, unknown>}
     */
    (entry) => isRecord(entry) && entry.kind === 'gate' && isRecord(entry.evidence) && entry.evidence.type === 'external',
  );
  if (gates.length !== Object.keys(EXTERNAL_GATE_POLICIES).length) {
    throw new Error('external gate coverage must contain the exact allowlisted projects');
  }
  const identities = new Set();
  for (const gate of gates) {
    assertExactKeys(gate, ['kind', 'id', 'backfill', 'reason', 'command', 'evidence'], 'external gate');
    const evidence = gate.evidence;
    const identity =
      isRecord(evidence) && evidence.provider === 'gitlab'
        ? `gitlab:${String(evidence.projectId)}`
        : `invalid:${String(isRecord(evidence) ? evidence.provider : undefined)}`;
    const policy = EXTERNAL_GATE_POLICIES[identity];
    if (policy === undefined || gate.id !== policy.id || gate.backfill !== false || identities.has(identity)) {
      throw new Error(`external gate is not exactly allowlisted: ${identity}`);
    }
    assertExactKeys(
      evidence,
      ['type', ...Object.keys(policy).filter((key) => key !== 'id')],
      'external gate evidence',
    );
    for (const [key, value] of Object.entries(policy)) {
      if (key !== 'id' && evidence[key] !== value) {
        throw new Error(`external gate is not exactly allowlisted: ${identity}`);
      }
    }
    assertNonEmptyString(gate.reason, `external gate ${String(gate.id)} reason`);
    assertNonEmptyString(gate.command, `external gate ${String(gate.id)} command`);
    identities.add(identity);
  }
  return /** @type {GateEntry[]} */ (gates);
};

/**
 * @param {unknown} value
 * @returns {URL}
 */
export const parseGitLabApiBase = (value) => {
  let url;
  try {
    url = new URL(/** @type {string} */ (value));
  } catch {
    throw new Error('GitLab API base must be an exact HTTPS /api/v4 URL');
  }
  if (
    url.origin !== TRUSTED_GITLAB_ORIGIN ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    (url.pathname !== '/api/v4' && url.pathname !== '/api/v4/')
  ) {
    throw new Error(`GitLab API base must be the trusted GitLab API ${TRUSTED_GITLAB_API_BASE}`);
  }
  url.pathname = '/api/v4/';
  return url;
};

/**
 * @param {unknown} apiBaseUrl
 * @param {unknown} webUrl
 * @param {string} label
 * @param {unknown} expected
 * @returns {string}
 */
export const assertSafeGitLabWebUrl = (apiBaseUrl, webUrl, label, expected) => {
  const base = parseGitLabApiBase(apiBaseUrl);
  const candidate = assertTrustedGitLabWebUrl(webUrl, label);
  if (candidate.origin !== base.origin) throw new Error(`${label} must stay on the exact GitLab origin`);
  if (!isRecord(expected)) throw new Error(`${label} canonical GitLab web path expectation is required`);
  assertNonEmptyString(expected.projectId, `${label} expected projectId`);
  const projectSegments = expected.projectId.split('/');
  if (projectSegments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error(`${label} expected projectId must contain canonical namespace segments`);
  }
  if (expected.resource !== 'pipelines' && expected.resource !== 'jobs') {
    throw new Error(`${label} expected resource must be pipelines or jobs`);
  }
  if (!Number.isSafeInteger(expected.id) || /** @type {number} */ (expected.id) < 0) {
    throw new Error(`${label} expected resource ID must be a non-negative safe integer`);
  }
  const projectPath = projectSegments.map((segment) => encodeURIComponent(segment)).join('/');
  const expectedPath = `/${projectPath}/-/${expected.resource}/${String(expected.id)}`;
  if (candidate.pathname !== expectedPath) {
    throw new Error(`${label} must match canonical GitLab web path ${expectedPath}`);
  }
  return candidate.href;
};

/**
 * @param {{ apiBaseUrl: unknown, method: unknown, requestUrl: unknown, responseUrl: unknown, status: unknown }} transaction
 */
export const assertSafeGitLabTransaction = ({ apiBaseUrl, method, requestUrl, responseUrl, status }) => {
  const base = parseGitLabApiBase(apiBaseUrl);
  if (method !== 'GET') throw new Error(`GitLab request method must be GET, received ${String(method)}`);
  let request;
  let response;
  try {
    request = new URL(/** @type {string} */ (requestUrl));
    response = new URL(/** @type {string} */ (responseUrl));
  } catch {
    throw new Error('GitLab request and response URLs must be valid');
  }
  if (
    request.origin !== base.origin ||
    !request.pathname.startsWith(base.pathname) ||
    request.username !== '' ||
    request.password !== '' ||
    request.hash !== ''
  ) {
    throw new Error('GitLab request escaped the exact API origin');
  }
  if (Number.isInteger(status) && /** @type {number} */ (status) >= 300 && /** @type {number} */ (status) < 400) {
    throw new Error(`GitLab redirect status is forbidden: ${String(status)}`);
  }
  if (response.href !== request.href) throw new Error('GitLab response URL changed or moved off-origin');
};

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {asserts value is unknown[]}
 */
const assertApiArray = (value, label) => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
};

/**
 * @param {unknown} pipelines
 * @param {string} sha
 * @returns {GitLabPipeline}
 */
export const selectExactSuccessfulPipeline = (pipelines, sha) => {
  assertExactSha(sha, 'pipeline SHA');
  assertApiArray(pipelines, 'GitLab pipelines');
  const candidates = /** @type {GitLabPipeline[]} */ (
    pipelines
      .filter(
        (pipeline) =>
          isRecord(pipeline) &&
          Number.isSafeInteger(pipeline.id) &&
          /** @type {number} */ (pipeline.id) >= 0 &&
          pipeline.sha === sha &&
          pipeline.status === 'success' &&
          typeof pipeline.web_url === 'string',
      )
  ).sort((left, right) => right.id - left.id);
  if (candidates.length === 0) throw new Error(`No exact successful pipeline exists for SHA ${sha}`);
  return candidates[0];
};

/**
 * @param {unknown} jobs
 * @param {string} jobName
 * @returns {GitLabJob}
 */
export const selectExactSuccessfulJob = (jobs, jobName) => {
  assertNonEmptyString(jobName, 'job name');
  assertApiArray(jobs, 'GitLab jobs');
  const candidates = /** @type {GitLabJob[]} */ (
    jobs
      .filter(
        (job) =>
          isRecord(job) &&
          Number.isSafeInteger(job.id) &&
          /** @type {number} */ (job.id) >= 0 &&
          job.name === jobName &&
          job.status === 'success' &&
          typeof job.web_url === 'string',
      )
  ).sort((left, right) => right.id - left.id);
  if (candidates.length === 0) throw new Error(`No exact successful job exists with name ${jobName}`);
  return candidates[0];
};

/**
 * @param {unknown} apiBaseUrl
 * @param {readonly unknown[]} pathSegments
 * @param {Record<string, unknown>} [search]
 * @returns {URL}
 */
const buildGitLabApiUrl = (apiBaseUrl, pathSegments, search) => {
  const url = parseGitLabApiBase(apiBaseUrl);
  url.pathname = `${url.pathname}${pathSegments.map((segment) => encodeURIComponent(String(segment))).join('/')}`;
  for (const [name, value] of Object.entries(search ?? {})) url.searchParams.append(name, String(value));
  return url;
};

/**
 * @param {{ fetchImpl: unknown, apiBaseUrl: unknown, token: unknown, pathSegments: unknown, search?: Record<string, unknown> }} request
 * @returns {Promise<FetchResponseLike>}
 */
export const gitLabGet = async ({ fetchImpl, apiBaseUrl, token, pathSegments, search }) => {
  if (typeof fetchImpl !== 'function') throw new Error('GitLab fetch implementation is unavailable');
  parseGitLabApiBase(apiBaseUrl);
  assertNonEmptyString(token, 'CI_JOB_TOKEN');
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) throw new Error('GitLab API path must be non-empty');
  const requestUrl = buildGitLabApiUrl(apiBaseUrl, pathSegments, search);
  const typedFetch = /** @type {FetchImpl} */ (fetchImpl);
  const response = await typedFetch(requestUrl, {
    method: 'GET',
    headers: { 'JOB-TOKEN': token, 'Accept-Encoding': 'identity' },
    redirect: 'manual',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!isRecord(response)) throw new Error('GitLab response must be an object');
  assertSafeGitLabTransaction({
    apiBaseUrl,
    method: 'GET',
    requestUrl: requestUrl.href,
    responseUrl: response.url,
    status: response.status,
  });
  return /** @type {FetchResponseLike} */ (response);
};

/**
 * @param {FetchResponseLike | undefined} response
 * @param {unknown} reason
 */
const cancelResponseBody = async (response, reason) => {
  try {
    await response?.body?.cancel?.(reason);
  } catch {
    // The original validation error is more useful than a secondary cancellation error.
  }
};

/**
 * @param {FetchResponseLike} response
 * @param {string} label
 * @param {number} maximumBytes
 * @param {string} kind
 * @returns {Promise<number>}
 */
const readContentLength = async (response, label, maximumBytes, kind) => {
  const rawLength = response?.headers?.get?.('content-length');
  if (typeof rawLength !== 'string' || !/^(0|[1-9]\d*)$/.test(rawLength)) {
    await cancelResponseBody(response, new Error(`${label} has missing or invalid content-length`));
    throw new Error(`${label} requires an exact content-length`);
  }
  const declaredLength = Number(rawLength);
  if (!Number.isSafeInteger(declaredLength)) {
    await cancelResponseBody(response, new Error(`${label} content-length is unsafe`));
    throw new Error(`${label} has an unsafe content-length`);
  }
  if (declaredLength > maximumBytes) {
    await cancelResponseBody(response, new Error(`${label} exceeds maximum ${kind} size`));
    throw new Error(`${label} exceeds the maximum ${kind} size`);
  }
  return declaredLength;
};

/**
 * @param {FetchResponseLike} response
 * @param {string} label
 * @param {number} maximumBytes
 * @param {string} kind
 * @returns {Promise<Buffer>}
 */
const readBoundedResponseBytes = async (response, label, maximumBytes, kind) => {
  if (response?.status !== 200) {
    await cancelResponseBody(response, new Error(`${label} returned a non-success response`));
    throw new Error(`${label} returned HTTP ${String(response?.status)}`);
  }
  const declaredLength = await readContentLength(response, label, maximumBytes, kind);
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error(`${label} returned no readable body`);
  }
  const reader = response.body.getReader();
  /** @type {Buffer[]} */
  const chunks = [];
  let receivedLength = 0;
  try {
    let readResult = await reader.read();
    while (!readResult.done) {
      const { value } = readResult;
      if (!(value instanceof Uint8Array)) throw new Error(`${label} returned a malformed body chunk`);
      const nextLength = receivedLength + value.byteLength;
      if (nextLength > maximumBytes) {
        await reader.cancel(new Error(`${label} exceeds maximum ${kind} size`));
        throw new Error(`${label} exceeds the maximum ${kind} size`);
      }
      if (nextLength > declaredLength) {
        await reader.cancel(new Error(`${label} exceeded declared content-length`));
        throw new Error(`${label} exceeded its declared content-length`);
      }
      chunks.push(Buffer.from(value));
      receivedLength = nextLength;
      readResult = await reader.read();
    }
    if (receivedLength !== declaredLength) {
      throw new Error(`${label} did not match its declared content-length`);
    }
    return Buffer.concat(chunks, receivedLength);
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch {
      // Preserve the bounded-read error.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
};

/**
 * @param {FetchResponseLike} response
 * @param {string} label
 * @returns {Promise<unknown>}
 */
export const readGitLabJson = async (response, label) => {
  const bytes = await readBoundedResponseBytes(response, label, MAX_GITLAB_JSON_BYTES, 'JSON');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} returned invalid UTF-8 JSON`);
  }
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
};

/**
 * @param {FetchResponseLike} response
 * @param {string} label
 * @returns {Promise<Buffer>}
 */
export const readGitLabArtifact = async (response, label) => {
  const bytes = await readBoundedResponseBytes(response, label, MAX_GITLAB_ARTIFACT_BYTES, 'artifact');
  if (bytes.length === 0) throw new Error(`${label} returned an empty artifact`);
  return bytes;
};

/**
 * @param {string | null} linkHeader
 */
const assertTrustedPaginationLink = (linkHeader) => {
  if (linkHeader === null) return;
  const links = [...linkHeader.matchAll(/<([^>]+)>/g)].map((match) => match[1]);
  if (links.length === 0) throw new Error('GitLab pagination link header is malformed');
  for (const link of links) {
    let url;
    try {
      url = new URL(link);
    } catch {
      throw new Error('GitLab pagination link header is malformed');
    }
    if (
      url.origin !== TRUSTED_GITLAB_ORIGIN ||
      !url.pathname.startsWith('/api/v4/') ||
      url.username !== '' ||
      url.password !== '' ||
      url.hash !== ''
    ) {
      throw new Error('GitLab pagination link must stay on the trusted GitLab API');
    }
  }
};

/**
 * @param {FetchHeadersLike} headers
 * @param {string} name
 * @param {{ allowEmpty?: boolean }} [options]
 * @returns {number | null}
 */
const readPaginationInteger = (headers, name, { allowEmpty = false } = {}) => {
  const value = headers?.get?.(name);
  if (allowEmpty && value === '') return null;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`GitLab pagination header ${name} is invalid`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`GitLab pagination header ${name} is unsafe`);
  return parsed;
};

/**
 * @param {FetchResponseLike} response
 * @param {number} expectedPage
 * @returns {number | null}
 */
const validatePaginationHeaders = (response, expectedPage) => {
  const page = readPaginationInteger(response.headers, 'x-page');
  const pageSize = readPaginationInteger(response.headers, 'x-per-page');
  const totalPages = readPaginationInteger(response.headers, 'x-total-pages');
  const nextPage = readPaginationInteger(response.headers, 'x-next-page', { allowEmpty: true });
  if (page !== expectedPage) throw new Error(`GitLab pagination returned page ${String(page)}, expected ${expectedPage}`);
  if (pageSize !== GITLAB_PAGE_SIZE) throw new Error(`GitLab pagination page size must be ${GITLAB_PAGE_SIZE}`);
  if (/** @type {number} */ (totalPages) > MAX_GITLAB_PAGES) {
    throw new Error(`GitLab pagination exceeds the ${MAX_GITLAB_PAGES}-page limit`);
  }
  if (/** @type {number} */ (page) > /** @type {number} */ (totalPages)) {
    throw new Error('GitLab pagination page exceeds total pages');
  }
  const expectedNextPage = /** @type {number} */ (page) < /** @type {number} */ (totalPages) ? /** @type {number} */ (page) + 1 : null;
  if (nextPage !== expectedNextPage) throw new Error('GitLab pagination next page is invalid');
  assertTrustedPaginationLink(response.headers?.get?.('link') ?? null);
  return nextPage;
};

/**
 * @param {{ fetchImpl: unknown, apiBaseUrl: unknown, token: unknown, pathSegments: unknown, search?: Record<string, unknown>, label: unknown }} request
 * @returns {Promise<unknown[]>}
 */
export const gitLabGetAllPages = async ({ fetchImpl, apiBaseUrl, token, pathSegments, search = {}, label }) => {
  assertNonEmptyString(label, 'GitLab pagination label');
  if (Object.hasOwn(search, 'page') || Object.hasOwn(search, 'per_page')) {
    throw new Error('GitLab pagination controls are managed internally');
  }
  /** @type {unknown[]} */
  const collected = [];
  /** @type {number | null} */
  let page = 1;
  while (page !== null) {
    const response = await gitLabGet({
      fetchImpl,
      apiBaseUrl,
      token,
      pathSegments,
      search: { ...search, page, per_page: GITLAB_PAGE_SIZE },
    });
    let nextPage;
    try {
      nextPage = validatePaginationHeaders(response, page);
    } catch (error) {
      await cancelResponseBody(response, error);
      throw error;
    }
    const items = await readGitLabJson(response, `${label} page ${page}`);
    assertApiArray(items, `${label} page ${page}`);
    if (items.length > GITLAB_PAGE_SIZE) {
      throw new Error(`GitLab pagination page result exceeds the ${GITLAB_PAGE_SIZE}-item page size for ${String(label)}`);
    }
    collected.push(...items);
    if (collected.length > GITLAB_PAGE_SIZE * MAX_GITLAB_PAGES) {
      throw new Error(`GitLab pagination exceeds the bounded result limit for ${String(label)}`);
    }
    page = nextPage;
  }
  return collected;
};

/**
 * @param {unknown} [value]
 * @returns {URL}
 */
export const parseGitHubApiBase = (value = TRUSTED_GITHUB_API_BASE) => {
  let url;
  try {
    url = new URL(/** @type {string} */ (value));
  } catch {
    throw new Error('GitHub API base must be the exact HTTPS api.github.com origin');
  }
  if (
    url.origin !== TRUSTED_GITHUB_API_ORIGIN ||
    url.pathname !== '/' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('GitHub API base must be the exact HTTPS api.github.com origin');
  }
  return url;
};

/**
 * @param {unknown} repository
 * @param {string} label
 * @returns {string[]}
 */
const canonicalRepositorySegments = (repository, label) => {
  assertNonEmptyString(repository, label);
  const segments = repository.split('/');
  if (
    segments.length !== 2 ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..' || !/^[A-Za-z0-9_.-]+$/.test(segment))
  ) {
    throw new Error(`${label} must be an exact owner/repository identity`);
  }
  return segments;
};

/**
 * @param {unknown} value
 * @param {string} label
 * @param {unknown} expected
 * @returns {string}
 */
export const assertSafeGitHubWebUrl = (value, label, expected) => {
  const candidate = assertSafeHttpsUrl(value, label);
  if (candidate.origin !== TRUSTED_GITHUB_WEB_ORIGIN) throw new Error(`${label} must stay on the exact GitHub origin`);
  if (!isRecord(expected)) throw new Error(`${label} canonical GitHub path expectation is required`);
  const repository = canonicalRepositorySegments(expected.repository, `${label} expected repository`).join('/');
  if (!Number.isSafeInteger(expected.runId) || /** @type {number} */ (expected.runId) < 1) {
    throw new Error(`${label} expected run ID must be a positive safe integer`);
  }
  let expectedPath = `/${repository}/actions/runs/${String(expected.runId)}`;
  if (expected.resource === 'jobs') {
    if (!Number.isSafeInteger(expected.jobId) || /** @type {number} */ (expected.jobId) < 1) {
      throw new Error(`${label} expected job ID must be a positive safe integer`);
    }
    expectedPath = `/${repository}/runs/${String(expected.runId)}/jobs/${String(expected.jobId)}`;
  } else if (expected.resource !== 'runs') {
    throw new Error(`${label} expected resource must be runs or jobs`);
  }
  if (candidate.pathname !== expectedPath) throw new Error(`${label} must match canonical GitHub path ${expectedPath}`);
  return candidate.href;
};

/**
 * @param {readonly unknown[]} pathSegments
 * @param {Record<string, unknown>} [search]
 * @returns {URL}
 */
const buildGitHubApiUrl = (pathSegments, search) => {
  if (!Array.isArray(pathSegments) || pathSegments.length === 0) throw new Error('GitHub API path must be non-empty');
  const url = parseGitHubApiBase();
  url.pathname = `/${pathSegments.map((segment) => encodeURIComponent(String(segment))).join('/')}`;
  for (const [name, value] of Object.entries(search ?? {})) url.searchParams.append(name, String(value));
  return url;
};

/**
 * @param {string} token
 * @returns {Record<string, string>}
 */
const githubApiHeaders = (token) => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2026-03-10',
  'User-Agent': 'epoca-ct-530-evidence-verifier',
  'Accept-Encoding': 'identity',
});

/**
 * @param {{ fetchImpl: unknown, token: unknown, pathSegments: unknown, search?: Record<string, unknown> }} request
 * @returns {Promise<FetchResponseLike>}
 */
export const githubApiGet = async ({ fetchImpl, token, pathSegments, search }) => {
  if (typeof fetchImpl !== 'function') throw new Error('GitHub fetch implementation is unavailable');
  assertNonEmptyString(token, 'EPOCA_GITHUB_ACTIONS_READ_TOKEN');
  const requestUrl = buildGitHubApiUrl(/** @type {readonly unknown[]} */ (pathSegments), search);
  const typedFetch = /** @type {FetchImpl} */ (fetchImpl);
  const response = await typedFetch(requestUrl, {
    method: 'GET',
    headers: githubApiHeaders(token),
    redirect: 'manual',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!isRecord(response)) throw new Error('GitHub response must be an object');
  if (/** @type {number} */ (response.status) >= 300 && /** @type {number} */ (response.status) < 400) {
    await cancelResponseBody(/** @type {FetchResponseLike} */ (response), new Error('GitHub API redirects are forbidden'));
    throw new Error(`GitHub API redirect status is forbidden: ${String(response.status)}`);
  }
  if (response.url !== requestUrl.href) {
    await cancelResponseBody(/** @type {FetchResponseLike} */ (response), new Error('GitHub API response URL changed'));
    throw new Error('GitHub API response escaped the exact request URL');
  }
  return /** @type {FetchResponseLike} */ (response);
};

/**
 * @param {FetchResponseLike} response
 * @param {string} label
 * @returns {Promise<unknown>}
 */
export const readGitHubJson = async (response, label) => {
  const bytes = await readBoundedResponseBytes(response, label, MAX_GITHUB_JSON_BYTES, 'JSON');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} returned invalid UTF-8 JSON`);
  }
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(text);
    return parsed;
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
};

/**
 * @param {unknown} runs
 * @param {GitHubRunPolicy} policy
 * @param {string} sha
 * @returns {GitHubRun}
 */
export const selectExactSuccessfulGitHubRun = (runs, policy, sha) => {
  assertApiArray(runs, 'GitHub workflow runs');
  assertExactSha(sha, 'GitHub workflow run SHA');
  if (!isRecord(policy)) throw new Error('GitHub workflow run policy is required');
  const expectedWorkflowPath = `${policy.workflow}@${policy.branch}`;
  const candidates = /** @type {GitHubRun[]} */ (
    runs.filter(
      (run) =>
        isRecord(run) &&
        Number.isSafeInteger(run.id) &&
        /** @type {number} */ (run.id) > 0 &&
        Number.isSafeInteger(run.run_attempt) &&
        /** @type {number} */ (run.run_attempt) > 0 &&
        run.event === policy.event &&
        run.head_branch === policy.branch &&
        run.head_sha === sha &&
        run.status === 'completed' &&
        run.conclusion === 'success' &&
        run.path === expectedWorkflowPath &&
        typeof run.html_url === 'string',
    )
  );
  if (candidates.length === 0) throw new Error(`No exact successful GitHub push run exists for SHA ${sha}`);
  const runIds = new Set(candidates.map(({ id }) => id));
  if (runIds.size !== 1) throw new Error(`Exactly one successful GitHub push run ID is required for SHA ${sha}`);
  const attempts = new Set();
  for (const { run_attempt: attempt } of candidates) {
    if (attempts.has(attempt)) throw new Error('GitHub workflow run contains a duplicate successful attempt');
    attempts.add(attempt);
  }
  return [...candidates].sort((left, right) => right.run_attempt - left.run_attempt)[0];
};

/**
 * @param {unknown} jobs
 * @param {GitHubJobPolicy} policy
 * @param {GitHubRun} run
 * @returns {GitHubJob}
 */
export const selectExactSuccessfulGitHubJob = (jobs, policy, run) => {
  assertApiArray(jobs, 'GitHub workflow jobs');
  if (!isRecord(policy) || !isRecord(run)) throw new Error('GitHub workflow job policy and run are required');
  const candidates = /** @type {GitHubJob[]} */ (
    jobs.filter(
      (job) =>
        isRecord(job) &&
        Number.isSafeInteger(job.id) &&
        /** @type {number} */ (job.id) > 0 &&
        job.run_id === run.id &&
        job.head_sha === run.head_sha &&
        job.status === 'completed' &&
        job.conclusion === 'success' &&
        typeof job.html_url === 'string',
    )
  );
  if (jobs.length !== 1 || candidates.length !== 1) {
    throw new Error(`Exactly one successful GitHub job is required for protected job ID ${String(policy.job)}`);
  }
  return candidates[0];
};

/**
 * @param {unknown} artifacts
 * @param {GitHubArtifactPolicy} policy
 * @param {GitHubRun} run
 * @returns {GitHubArtifact}
 */
export const selectExactGitHubArtifact = (artifacts, policy, run) => {
  assertApiArray(artifacts, 'GitHub workflow artifacts');
  if (!isRecord(policy) || !isRecord(run)) throw new Error('GitHub artifact policy and run are required');
  const candidates = /** @type {GitHubArtifact[]} */ (
    artifacts.filter(
      (artifact) =>
        isRecord(artifact) &&
        Number.isSafeInteger(artifact.id) &&
        /** @type {number} */ (artifact.id) > 0 &&
        artifact.name === policy.artifact &&
        artifact.expired === false &&
        typeof artifact.archive_download_url === 'string' &&
        isRecord(artifact.workflow_run) &&
        artifact.workflow_run.id === run.id &&
        artifact.workflow_run.head_sha === run.head_sha,
    )
  );
  if (candidates.length !== 1 || artifacts.length !== 1) {
    throw new Error(`GitHub workflow must expose exactly one non-expired ${String(policy.artifact)} artifact`);
  }
  return candidates[0];
};

/**
 * @param {unknown} archiveUrl
 * @returns {URL}
 */
const parseExactArtifactApiUrl = (archiveUrl) => {
  let url;
  try {
    url = new URL(/** @type {string} */ (archiveUrl));
  } catch {
    throw new Error('GitHub artifact download URL is invalid');
  }
  if (
    url.origin !== TRUSTED_GITHUB_API_ORIGIN ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    !/^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/artifacts\/[1-9]\d*\/zip$/.test(url.pathname)
  ) {
    throw new Error('GitHub artifact download URL must stay on the exact API artifact path');
  }
  return url;
};

/**
 * @param {unknown} archiveUrl
 * @param {unknown} repository
 * @param {unknown} artifactId
 * @returns {string}
 */
export const assertExactGitHubArtifactApiUrl = (archiveUrl, repository, artifactId) => {
  const candidate = parseExactArtifactApiUrl(archiveUrl);
  const segments = canonicalRepositorySegments(repository, 'GitHub artifact repository');
  if (!Number.isSafeInteger(artifactId) || /** @type {number} */ (artifactId) < 1) {
    throw new Error('GitHub artifact ID must be positive');
  }
  const expected = buildGitHubApiUrl(['repos', ...segments, 'actions', 'artifacts', artifactId, 'zip']);
  if (candidate.href !== expected.href) throw new Error('GitHub artifact download URL does not match its selected identity');
  return candidate.href;
};

/**
 * @param {{ fetchImpl: unknown, token: unknown, archiveUrl: unknown }} request
 * @returns {Promise<Buffer>}
 */
export const downloadGitHubArtifact = async ({ fetchImpl, token, archiveUrl }) => {
  if (typeof fetchImpl !== 'function') throw new Error('GitHub fetch implementation is unavailable');
  assertNonEmptyString(token, 'EPOCA_GITHUB_ACTIONS_READ_TOKEN');
  const requestUrl = parseExactArtifactApiUrl(archiveUrl);
  const typedFetch = /** @type {FetchImpl} */ (fetchImpl);
  const redirectResponse = await typedFetch(requestUrl, {
    method: 'GET',
    headers: githubApiHeaders(token),
    redirect: 'manual',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!isRecord(redirectResponse) || redirectResponse.url !== requestUrl.href || redirectResponse.status !== 302) {
    await cancelResponseBody(
      /** @type {FetchResponseLike} */ (redirectResponse),
      new Error('GitHub artifact API must return one manual redirect'),
    );
    throw new Error('GitHub artifact API must return one exact manual redirect');
  }
  const typedRedirectResponse = /** @type {FetchResponseLike} */ (redirectResponse);
  const location = typedRedirectResponse.headers?.get?.('location');
  let signedUrl;
  try {
    signedUrl = new URL(/** @type {string} */ (location));
  } catch {
    throw new Error('GitHub artifact redirect location is invalid');
  }
  const trustedArtifactHost =
    signedUrl.hostname === 'objects.githubusercontent.com' ||
    signedUrl.hostname.endsWith('.actions.githubusercontent.com') ||
    signedUrl.hostname.endsWith('.blob.core.windows.net');
  if (
    signedUrl.protocol !== 'https:' ||
    signedUrl.hostname === '' ||
    signedUrl.port !== '' ||
    signedUrl.username !== '' ||
    signedUrl.password !== '' ||
    signedUrl.hash !== '' ||
    signedUrl.origin === TRUSTED_GITHUB_API_ORIGIN ||
    !trustedArtifactHost
  ) {
    throw new Error('GitHub artifact redirect location must use a trusted credential-free artifact HTTPS host');
  }
  const response = await typedFetch(signedUrl, {
    method: 'GET',
    headers: { 'Accept-Encoding': 'identity' },
    redirect: 'manual',
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!isRecord(response) || response.url !== signedUrl.href) {
    await cancelResponseBody(/** @type {FetchResponseLike} */ (response), new Error('GitHub signed artifact response URL changed'));
    throw new Error('GitHub signed artifact response escaped its exact URL');
  }
  const bytes = await readBoundedResponseBytes(
    /** @type {FetchResponseLike} */ (response),
    'GitHub evidence artifact',
    MAX_GITHUB_ARTIFACT_BYTES,
    'artifact',
  );
  if (bytes.length === 0) throw new Error('GitHub evidence artifact is empty');
  return bytes;
};

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

/**
 * @param {Buffer} bytes
 * @returns {number}
 */
const crc32 = (bytes) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

/**
 * @param {Buffer} bytes
 * @param {number} offset
 * @param {string} label
 * @returns {number}
 */
const readUInt16 = (bytes, offset, label) => {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error(`GitHub artifact has truncated ${label}`);
  return bytes.readUInt16LE(offset);
};

/**
 * @param {Buffer} bytes
 * @param {number} offset
 * @param {string} label
 * @returns {number}
 */
const readUInt32 = (bytes, offset, label) => {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error(`GitHub artifact has truncated ${label}`);
  return bytes.readUInt32LE(offset);
};

/**
 * @param {Buffer} bytes
 * @returns {string}
 */
const decodeZipName = (bytes) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('GitHub artifact filename is not valid UTF-8');
  }
};

/**
 * @param {Buffer} bytes
 * @param {number} start
 * @param {number} end
 * @param {number} checksum
 * @param {number} compressedSize
 * @param {number} uncompressedSize
 */
const validateDataDescriptor = (bytes, start, end, checksum, compressedSize, uncompressedSize) => {
  const length = end - start;
  const withSignature = length === 16 && readUInt32(bytes, start, 'data descriptor') === 0x08074b50;
  if (length !== 12 && !withSignature) throw new Error('GitHub artifact has an invalid data descriptor');
  const offset = start + (withSignature ? 4 : 0);
  if (
    readUInt32(bytes, offset, 'data descriptor CRC') !== checksum ||
    readUInt32(bytes, offset + 4, 'data descriptor compressed size') !== compressedSize ||
    readUInt32(bytes, offset + 8, 'data descriptor uncompressed size') !== uncompressedSize
  ) {
    throw new Error('GitHub artifact data descriptor does not match its central directory');
  }
};

/**
 * @param {unknown} archiveBytes
 * @param {GitHubArtifactFilePolicy} policy
 * @param {{ includeBytes?: boolean }} [options]
 * @returns {unknown}
 */
export const extractGitHubEvidenceArtifact = (archiveBytes, policy, { includeBytes = false } = {}) => {
  if (!Buffer.isBuffer(archiveBytes) && !(archiveBytes instanceof Uint8Array)) {
    throw new Error('GitHub artifact must be a byte buffer');
  }
  const bytes = Buffer.from(archiveBytes);
  if (bytes.length === 0 || bytes.length > MAX_GITHUB_ARTIFACT_BYTES) {
    throw new Error('GitHub artifact compressed size is outside its bound');
  }
  if (!isRecord(policy) || typeof policy.file !== 'string') throw new Error('GitHub artifact policy is required');
  const eocdOffset = bytes.length - 22;
  if (eocdOffset < 0 || readUInt32(bytes, eocdOffset, 'end record') !== 0x06054b50) {
    throw new Error('GitHub artifact must end with an exact ZIP end record');
  }
  if (
    readUInt16(bytes, eocdOffset + 4, 'disk number') !== 0 ||
    readUInt16(bytes, eocdOffset + 6, 'central disk number') !== 0 ||
    readUInt16(bytes, eocdOffset + 8, 'disk entries') !== 1 ||
    readUInt16(bytes, eocdOffset + 10, 'total entries') !== 1 ||
    readUInt16(bytes, eocdOffset + 20, 'ZIP comment length') !== 0
  ) {
    throw new Error('GitHub artifact must contain exactly one entry on one disk without a comment');
  }
  const centralSize = readUInt32(bytes, eocdOffset + 12, 'central directory size');
  const centralOffset = readUInt32(bytes, eocdOffset + 16, 'central directory offset');
  if (centralOffset + centralSize !== eocdOffset || readUInt32(bytes, centralOffset, 'central header') !== 0x02014b50) {
    throw new Error('GitHub artifact central directory is malformed');
  }
  const versionMadeBy = readUInt16(bytes, centralOffset + 4, 'creator version');
  const flags = readUInt16(bytes, centralOffset + 8, 'central flags');
  const method = readUInt16(bytes, centralOffset + 10, 'compression method');
  const checksum = readUInt32(bytes, centralOffset + 16, 'CRC');
  const compressedSize = readUInt32(bytes, centralOffset + 20, 'compressed size');
  const uncompressedSize = readUInt32(bytes, centralOffset + 24, 'uncompressed size');
  const nameLength = readUInt16(bytes, centralOffset + 28, 'filename length');
  const extraLength = readUInt16(bytes, centralOffset + 30, 'extra length');
  const commentLength = readUInt16(bytes, centralOffset + 32, 'comment length');
  const diskStart = readUInt16(bytes, centralOffset + 34, 'disk start');
  const externalAttributes = readUInt32(bytes, centralOffset + 38, 'external attributes');
  const localOffset = readUInt32(bytes, centralOffset + 42, 'local header offset');
  const centralEnd = centralOffset + 46 + nameLength + extraLength + commentLength;
  if (
    centralEnd !== eocdOffset ||
    diskStart !== 0 ||
    compressedSize === 0xffffffff ||
    uncompressedSize === 0xffffffff ||
    localOffset === 0xffffffff ||
    localOffset !== 0 ||
    (flags & ~0x808) !== 0 ||
    (flags & 0x800) === 0 ||
    (method !== 0 && method !== 8) ||
    uncompressedSize > MAX_GITHUB_EVIDENCE_BYTES
  ) {
    throw new Error('GitHub artifact entry metadata is unsupported or unsafe');
  }
  const centralName = decodeZipName(bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength));
  if (
    centralName !== policy.file ||
    centralName.includes('\\') ||
    centralName.startsWith('/') ||
    centralName.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    throw new Error('GitHub artifact contains an unexpected or unsafe filename');
  }
  const creatorSystem = versionMadeBy >>> 8;
  const unixMode = externalAttributes >>> 16;
  if (creatorSystem === 3 && unixMode !== 0 && (unixMode & 0o170000) !== 0o100000) {
    throw new Error('GitHub artifact entry must be a non-symlink regular file');
  }
  if (readUInt32(bytes, localOffset, 'local header') !== 0x04034b50) {
    throw new Error('GitHub artifact local header is malformed');
  }
  const localFlags = readUInt16(bytes, localOffset + 6, 'local flags');
  const localMethod = readUInt16(bytes, localOffset + 8, 'local method');
  const localChecksum = readUInt32(bytes, localOffset + 14, 'local CRC');
  const localCompressedSize = readUInt32(bytes, localOffset + 18, 'local compressed size');
  const localUncompressedSize = readUInt32(bytes, localOffset + 22, 'local uncompressed size');
  const localNameLength = readUInt16(bytes, localOffset + 26, 'local filename length');
  const localExtraLength = readUInt16(bytes, localOffset + 28, 'local extra length');
  const localNameStart = localOffset + 30;
  const dataStart = localNameStart + localNameLength + localExtraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > centralOffset || localFlags !== flags || localMethod !== method) {
    throw new Error('GitHub artifact local entry does not match its central directory');
  }
  const localName = decodeZipName(bytes.subarray(localNameStart, localNameStart + localNameLength));
  if (localName !== centralName) throw new Error('GitHub artifact local filename does not match');
  if ((flags & 0x8) === 0) {
    if (
      localChecksum !== checksum ||
      localCompressedSize !== compressedSize ||
      localUncompressedSize !== uncompressedSize ||
      dataEnd !== centralOffset
    ) {
      throw new Error('GitHub artifact local sizes or checksum do not match');
    }
  } else {
    validateDataDescriptor(bytes, dataEnd, centralOffset, checksum, compressedSize, uncompressedSize);
  }
  const compressed = bytes.subarray(dataStart, dataEnd);
  let contents;
  try {
    contents = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_GITHUB_EVIDENCE_BYTES });
  } catch {
    throw new Error('GitHub artifact evidence file could not be decompressed safely');
  }
  if (contents.length !== uncompressedSize || crc32(contents) !== checksum) {
    throw new Error('GitHub artifact evidence file failed its size or CRC check');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(contents);
  } catch {
    throw new Error('GitHub artifact evidence file is not valid UTF-8');
  }
  try {
    /** @type {unknown} */
    const document = JSON.parse(text);
    return includeBytes ? { document, bytes: contents } : document;
  } catch {
    throw new Error('GitHub artifact evidence file is not valid JSON');
  }
};

/**
 * @param {unknown} value
 * @param {boolean} expected
 * @param {string} label
 */
const assertBoolean = (value, expected, label) => {
  if (value !== expected) throw new Error(`GitHub skill evidence ${label} is invalid`);
};

/**
 * @param {unknown} value
 * @returns {boolean}
 */
const isCanonicalUtcTimestamp = (value) => {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/.exec(value);
  if (match === null) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysPerMonth[month - 1] &&
    Number(hourText) <= 23 &&
    Number(minuteText) <= 59 &&
    Number(secondText) <= 59
  );
};

/**
 * @param {unknown} document
 * @param {ValidateGitHubSkillEvidenceOptions} options
 * @returns {unknown}
 */
export const validateGitHubSkillEvidence = (document, { policy, skillSha, backendSha, run }) => {
  /** @param {string} message */
  const fail = (message) => {
    throw new Error(`GitHub skill evidence ${message}`);
  };
  try {
    assertExactKeys(
      document,
      ['schemaVersion', 'repositories', 'workflow', 'runner', 'fingerprints', 'timing', 'summary', 'cases', 'cleanup', 'secretScan'],
      'GitHub skill evidence',
    );
    if (document.schemaVersion !== 1) fail('schemaVersion is invalid');
    assertExactKeys(document.repositories, ['skill', 'backend'], 'GitHub skill evidence repositories');
    for (const name of ['skill', 'backend']) {
      assertExactKeys(document.repositories[name], ['name', 'sha'], `GitHub skill evidence ${name} repository`);
    }
    assertExactSha(skillSha, 'expected GitHub skill SHA');
    assertExactSha(backendSha, 'expected GitHub backend SHA');
    if (!isRecord(document.repositories.skill) || !isRecord(document.repositories.backend)) {
      fail('repository identity does not match');
    }
    const skillRepository = document.repositories.skill;
    const backendRepository = document.repositories.backend;
    if (
      skillRepository.name !== policy.repository ||
      skillRepository.sha !== skillSha ||
      backendRepository.name !== 'iterators/epoca' ||
      backendRepository.sha !== backendSha
    ) {
      fail('repository identity does not match');
    }
    assertExactKeys(document.workflow, ['path', 'ref', 'event', 'runId', 'jobId', 'attempt'], 'GitHub skill evidence workflow');
    const workflow = document.workflow;
    if (
      workflow.path !== policy.workflow ||
      workflow.ref !== `refs/heads/${policy.branch}` ||
      workflow.event !== policy.event ||
      workflow.runId !== String(run.id) ||
      workflow.jobId !== policy.job ||
      workflow.attempt !== run.run_attempt
    ) {
      fail('workflow identity does not match');
    }
    assertExactKeys(
      document.runner,
      [
        'id',
        'version',
        'nodeVersion',
        'provider',
        'providerEndpoint',
        'model',
        'temperature',
        'retries',
        'caseTimeoutSeconds',
        'cleanupTimeoutSeconds',
      ],
      'GitHub skill evidence runner',
    );
    const runner = document.runner;
    const expectedRunner = {
      id: 'it-epoca-api-evaluator',
      version: '1.0.0',
      nodeVersion: '24.18.1',
      provider: policy.evidenceProvider,
      providerEndpoint: policy.providerEndpoint,
      model: policy.model,
      temperature: 0,
      retries: 0,
      caseTimeoutSeconds: 120,
      cleanupTimeoutSeconds: 120,
    };
    if (Object.entries(expectedRunner).some(([key, value]) => runner[key] !== value)) fail('runner identity is invalid');
    assertExactKeys(document.fingerprints, ['configSha256', 'inventorySha256'], 'GitHub skill evidence fingerprints');
    const fingerprints = document.fingerprints;
    if (fingerprints.configSha256 !== policy.configSha256 || fingerprints.inventorySha256 !== policy.inventorySha256) {
      fail('fingerprints do not match');
    }
    assertExactKeys(document.timing, ['startedAt', 'finishedAt'], 'GitHub skill evidence timing');
    const timing = document.timing;
    if (
      !isCanonicalUtcTimestamp(timing.startedAt) ||
      !isCanonicalUtcTimestamp(timing.finishedAt) ||
      /** @type {string} */ (timing.finishedAt) < /** @type {string} */ (timing.startedAt)
    ) {
      fail('timing is invalid');
    }
    assertExactKeys(document.summary, ['expected', 'passed', 'failed', 'skipped', 'retried'], 'GitHub skill evidence summary');
    const summary = document.summary;
    if (
      summary.expected !== policy.expectedCases ||
      summary.passed !== policy.expectedCases ||
      summary.failed !== 0 ||
      summary.skipped !== 0 ||
      summary.retried !== 0 ||
      !Array.isArray(document.cases) ||
      document.cases.length !== policy.expectedCases
    ) {
      fail('success counts do not match');
    }
    const caseIds = new Set();
    for (const entry of /** @type {unknown[]} */ (document.cases)) {
      assertExactKeys(entry, ['id', 'status', 'outcome', 'attempts', 'durationMs', 'details'], 'GitHub skill evidence case');
      if (
        typeof entry.id !== 'string' ||
        !/^(?:OAUTH-E2E-02[789]|CT-522-[A-Z0-9-]+)$/.test(entry.id) ||
        caseIds.has(entry.id) ||
        entry.status !== 'passed' ||
        (entry.outcome !== 'passed' && entry.outcome !== 'safe-stop') ||
        entry.attempts !== 1 ||
        !Number.isSafeInteger(entry.durationMs) ||
        /** @type {number} */ (entry.durationMs) < 0 ||
        /** @type {number} */ (entry.durationMs) > 120_000
      ) {
        fail('case inventory is invalid');
      }
      caseIds.add(entry.id);
      assertExactKeys(
        entry.details,
        ['reasonCode', 'missingCapability', 'scopeEscalationAttempts', 'fixtureRevoked', 'postRevocationAuthAttempts'],
        'GitHub skill evidence case details',
      );
      const details = entry.details;
      if (
        (details.reasonCode !== null && (typeof details.reasonCode !== 'string' || !/^[A-Z][A-Z0-9_]+$/.test(details.reasonCode))) ||
        (details.missingCapability !== null &&
          (typeof details.missingCapability !== 'string' || !/^[a-z][a-z0-9-]*:(?:read|write)$/.test(details.missingCapability))) ||
        details.scopeEscalationAttempts !== 0 ||
        typeof details.fixtureRevoked !== 'boolean' ||
        (details.postRevocationAuthAttempts !== 0 && details.postRevocationAuthAttempts !== 1)
      ) {
        fail('case details are invalid');
      }
    }
    assertExactKeys(document.cleanup, ['attempted', 'fixtureRevoked', 'servicesStopped', 'success'], 'GitHub skill evidence cleanup');
    const cleanup = document.cleanup;
    assertBoolean(cleanup.attempted, true, 'cleanup attempted');
    assertBoolean(cleanup.fixtureRevoked, true, 'cleanup fixtureRevoked');
    assertBoolean(cleanup.servicesStopped, true, 'cleanup servicesStopped');
    assertBoolean(cleanup.success, true, 'cleanup success');
    assertExactKeys(document.secretScan, ['status', 'filesScanned', 'findings'], 'GitHub skill evidence secret scan');
    const secretScan = document.secretScan;
    if (secretScan.status !== 'passed' || secretScan.filesScanned !== 1 || secretScan.findings !== 0) {
      fail('secret scan is invalid');
    }
    return document;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GitHub skill evidence')) throw error;
    throw new Error(`GitHub skill evidence is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
const isPathWithin = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

/**
 * @param {string} candidate
 */
const lstatIfExists = async (candidate) => {
  try {
    return await lstat(candidate);
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error)?.code === 'ENOENT') return null;
    throw error;
  }
};

// Security boundary: allowedRoot and its ancestors must not be concurrently mutated by another same-UID process.
// Portable Node APIs lack openat/renameat directory binding, so escapes and static symlinks are rejected here,
// while that same-UID TOCTOU race remains outside this helper's guarantees.
/**
 * @param {unknown} outputPath
 * @param {unknown} allowedRoot
 * @returns {Promise<string>}
 */
const resolveSafeEvidenceOutput = async (outputPath, allowedRoot) => {
  assertNonEmptyString(outputPath, 'evidence output path');
  assertNonEmptyString(allowedRoot, 'evidence allowed root');
  const root = path.resolve(allowedRoot);
  const output = path.resolve(outputPath);
  if (!isPathWithin(root, output)) throw new Error('evidence output path escapes its allowed root');

  await mkdir(root, { recursive: true, mode: 0o700 });
  const rootStats = await lstat(root);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error('evidence allowed root must be a real directory without symlinks');
  }
  const parent = path.dirname(output);
  const relativeParent = path.relative(root, parent);
  let current = root;
  for (const segment of relativeParent === '' ? [] : relativeParent.split(path.sep)) {
    current = path.join(current, segment);
    let stats = await lstatIfExists(current);
    if (stats === null) {
      await mkdir(current, { mode: 0o700 });
      stats = await lstat(current);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`evidence output parent contains a symlink: ${current}`);
    }
  }
  const outputStats = await lstatIfExists(output);
  if (outputStats?.isSymbolicLink()) throw new Error('evidence output file must not be a symlink');
  return output;
};

/**
 * @param {unknown} outputPath
 * @param {unknown} document
 * @param {(document: unknown) => unknown} validator
 * @param {{ allowedRoot?: unknown }} [options]
 * @returns {Promise<void>}
 */
export const writeEvidenceAtomically = async (outputPath, document, validator, { allowedRoot } = {}) => {
  validator(document);
  const safeOutputPath = await resolveSafeEvidenceOutput(outputPath, allowedRoot);
  const directory = path.dirname(safeOutputPath);
  const temporaryPath = path.join(directory, `.${path.basename(safeOutputPath)}.${process.pid}.${randomUUID()}.tmp`);
  let renamed = false;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporaryPath, safeOutputPath);
    renamed = true;
  } finally {
    if (!renamed) await rm(temporaryPath, { force: true });
  }
};
