import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyBackendGates } from '../verify-backend-gates.mjs';
import * as externalGateVerifier from '../verify-external-gates.mjs';
import * as gateEvidence from './gate-evidence.mjs';
import {
  assertSafeGitLabTransaction,
  assertSafeGitLabWebUrl,
  gitLabGet,
  parseGitLabApiBase,
  readGitLabJson,
  selectExactSuccessfulJob,
  selectExactSuccessfulPipeline,
  selectExternalGates,
  validateBackendEvidenceDocument,
  validateExternalEvidenceDocument,
  writeEvidenceAtomically,
} from './gate-evidence.mjs';
import { loadCoverageFixture, loadCoverageMap } from './load-coverage-map.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const TRUSTED_API_BASE = 'https://gitlab.company-5897fee414.example.invalid/api/v4';
const PIPELINE_URL = 'https://gitlab.company-5897fee414.example.invalid/epoca/epoca/-/pipelines/42';
const JOB_URL = 'https://gitlab.company-5897fee414.example.invalid/epoca/epoca/-/jobs/84';
const textEncoder = new TextEncoder();

const makeStreamingResponse = ({
  chunks,
  contentLength,
  url = `${TRUSTED_API_BASE}/projects/epoca%2Fepoca/pipelines?page=1&per_page=100`,
  status = 200,
  headers = {},
}) => {
  const encoded = chunks.map((chunk) => (typeof chunk === 'string' ? textEncoder.encode(chunk) : chunk));
  const state = { arrayBufferCalls: 0, cancelled: false, pulls: 0 };
  let index = 0;
  const body = new ReadableStream({
    pull(controller) {
      state.pulls += 1;
      if (index < encoded.length) controller.enqueue(encoded[index++]);
      else controller.close();
    },
    cancel() {
      state.cancelled = true;
    },
  });
  const responseHeaders = new Headers(headers);
  if (contentLength !== undefined) responseHeaders.set('content-length', String(contentLength));
  const allBytes = Buffer.concat(encoded.map((chunk) => Buffer.from(chunk)));
  return {
    response: {
      status,
      url,
      headers: responseHeaders,
      body,
      json: () => Promise.resolve(JSON.parse(allBytes.toString('utf8'))),
      arrayBuffer: () => {
        state.arrayBufferCalls += 1;
        return Promise.resolve(allBytes.buffer);
      },
    },
    state,
  };
};

const makeJsonPageResponse = ({ items, page, totalPages, nextPage, link }) => {
  const json = JSON.stringify(items);
  const headers = {
    'x-page': String(page),
    'x-per-page': '100',
    'x-total-pages': String(totalPages),
    'x-next-page': nextPage === null ? '' : String(nextPage),
  };
  if (link !== undefined) headers.link = link;
  return makeStreamingResponse({ chunks: [json], contentLength: Buffer.byteLength(json), headers });
};

const backendDocument = {
  schemaVersion: 1,
  sha: SHA,
  pipelineUrl: PIPELINE_URL,
  jobUrl: JOB_URL,
};

const externalDocument = {
  schemaVersion: 1,
  gates: [
    {
      provider: 'gitlab',
      projectId: 'epoca/epoca',
      sha: SHA,
      pipelineUrl: PIPELINE_URL,
      jobUrl: JOB_URL,
      artifactName: 'oauth-e2e-evidence.json',
      artifactSha256: 'a'.repeat(64),
    },
  ],
};

void test('verifier modules are import-safe and expose orchestration without executing main', () => {
  assert.equal(typeof verifyBackendGates, 'function');
  assert.equal(typeof externalGateVerifier.verifyExternalGates, 'function');
});

void test('external verifier stays bound to the real coverage map without network or secrets', () => {
  assert.equal(typeof externalGateVerifier.loadConfiguredExternalGates, 'function');
  const realGates = selectExternalGates(loadCoverageMap().coverageMap);
  const fixtureGates = selectExternalGates(loadCoverageFixture().coverageMap);
  assert.notDeepEqual(realGates, fixtureGates, 'fixture must remain a distinct drift sentinel');
  assert.deepEqual(externalGateVerifier.loadConfiguredExternalGates(), realGates);
});

void test('backend evidence accepts only its exact safe schema', () => {
  assert.deepEqual(validateBackendEvidenceDocument(backendDocument), backendDocument);
  const invalid = [
    { ...backendDocument, schemaVersion: 2 },
    { ...backendDocument, sha: '' },
    { ...backendDocument, pipelineUrl: 'http://gitlab.example/pipeline/42' },
    { ...backendDocument, pipelineUrl: 'https://attacker.example/pipeline/42' },
    { ...backendDocument, token: 'secret' },
    { schemaVersion: 1, sha: SHA, pipelineUrl: PIPELINE_URL },
  ];
  for (const document of invalid) {
    assert.throws(() => validateBackendEvidenceDocument(document), /backend evidence/i);
  }
});

void test('external evidence accepts only provider-native identity, exact SHA, safe URLs, artifact, and checksums', () => {
  assert.deepEqual(validateExternalEvidenceDocument(externalDocument), externalDocument);
  const invalid = [
    { ...externalDocument, schemaVersion: 2 },
    { ...externalDocument, token: 'secret' },
    { ...externalDocument, gates: [] },
    { ...externalDocument, gates: [...externalDocument.gates, externalDocument.gates[0]] },
    {
      ...externalDocument,
      gates: [{ ...externalDocument.gates[0], projectId: 'epoca' }],
    },
    {
      ...externalDocument,
      gates: [{ ...externalDocument.gates[0], artifactSha256: 'not-a-checksum' }],
    },
    {
      ...externalDocument,
      gates: [{ ...externalDocument.gates[0], shaEnv: 'EPOCA_BACKEND_SHA' }],
    },
    {
      ...externalDocument,
      gates: [{ ...externalDocument.gates[0], jobUrl: 'https://user:secret@gitlab.example/job/84' }],
    },
    {
      ...externalDocument,
      gates: externalDocument.gates.map((gate, index) =>
        index === 0 ? { ...gate, jobUrl: 'https://attacker.example/job/84' } : gate
      ),
    },
  ];
  for (const document of invalid) {
    assert.throws(() => validateExternalEvidenceDocument(document), /external evidence/i);
  }
});

void test('trusted fixture yields only the exact backend OAuth external gate', () => {
  const { coverageMap } = loadCoverageFixture();
  assert.deepEqual(
    selectExternalGates(coverageMap).map(({ id, evidence }) => ({ id, ...evidence })),
    [
      {
        id: 'CT-520',
        type: 'external',
        provider: 'gitlab',
        projectId: 'epoca/epoca',
        shaEnv: 'EPOCA_BACKEND_SHA',
        job: 'oauth_e2e',
        artifact: 'oauth-e2e-evidence.json',
      },
    ]
  );
});

void test('external gate selection rejects broader projects, wrong jobs/artifacts, and unknown keys', () => {
  const { coverageMap } = loadCoverageFixture();
  const index = coverageMap.findIndex(({ id }) => id === 'CT-520');
  const mutate = (evidence) => {
    const candidate = structuredClone(coverageMap);
    candidate[index].evidence = evidence;
    return candidate;
  };
  const source = coverageMap[index].evidence;
  const invalid = [
    { ...source, projectId: 'epoca' },
    { ...source, projectId: 'epoca/epoca/frontend' },
    { ...source, shaEnv: 'CI_COMMIT_SHA' },
    { ...source, job: 'test_backend' },
    { ...source, artifact: '../oauth-e2e-evidence.json' },
    { ...source, header: 'PRIVATE-TOKEN' },
  ];
  for (const evidence of invalid) {
    assert.throws(() => selectExternalGates(mutate(evidence)), /external gate/i);
  }
});

void test('GitLab API base requires exact HTTPS api/v4 origin without credentials, query, or fragment', () => {
  assert.equal(parseGitLabApiBase(TRUSTED_API_BASE).href, `${TRUSTED_API_BASE}/`);
  assert.equal(parseGitLabApiBase(`${TRUSTED_API_BASE}/`).href, `${TRUSTED_API_BASE}/`);
  for (const value of [
    'https://attacker.example/api/v4',
    'https://gitlab.company-5897fee414.example.invalid:8443/api/v4',
    'http://gitlab.company-5897fee414.example.invalid/api/v4',
    'https://user:user-a56f022410a5@example.test/api/v4',
    'https://gitlab.company-5897fee414.example.invalid/api/v3',
    'https://gitlab.company-5897fee414.example.invalid/api/v4/projects',
    'https://gitlab.company-5897fee414.example.invalid/api/v4?token=secret',
    'https://gitlab.company-5897fee414.example.invalid/api/v4#fragment',
  ]) {
    assert.throws(() => parseGitLabApiBase(value), /GitLab API/i);
  }
});

void test('GitLab evidence URLs require the canonical project, resource type, and selected ID', () => {
  const expectedPipeline = { projectId: 'epoca/epoca', resource: 'pipelines', id: 42 };
  assert.equal(assertSafeGitLabWebUrl(TRUSTED_API_BASE, PIPELINE_URL, 'pipeline URL', expectedPipeline), PIPELINE_URL);
  const encodedProjectUrl = 'https://gitlab.company-5897fee414.example.invalid/group%20name/project%20name/-/jobs/7';
  assert.equal(
    assertSafeGitLabWebUrl(TRUSTED_API_BASE, encodedProjectUrl, 'encoded job URL', {
      projectId: 'group name/project name',
      resource: 'jobs',
      id: 7,
    }),
    encodedProjectUrl
  );

  for (const webUrl of [
    'https://gitlab.company-5897fee414.example.invalid/',
    'https://gitlab.company-5897fee414.example.invalid/other/project/-/pipelines/42',
    'https://gitlab.company-5897fee414.example.invalid/epoca/epoca/-/jobs/42',
    'https://gitlab.company-5897fee414.example.invalid/epoca/epoca/-/pipelines/43',
    'https://gitlab.company-5897fee414.example.invalid/epoca%2Fepoca/-/pipelines/42',
    'https://gitlab.company-5897fee414.example.invalid/epoca/epoca/-/pipelines/42?download=1',
    'https://gitlab.company-5897fee414.example.invalid/epoca/epoca/-/pipelines/42#details',
  ]) {
    assert.throws(
      () => assertSafeGitLabWebUrl(TRUSTED_API_BASE, webUrl, 'pipeline URL', expectedPipeline),
      /canonical GitLab web path|safe HTTPS/i,
      webUrl
    );
  }
});

void test('untrusted GitLab origins are rejected before fetch can receive a token', async () => {
  let fetchCalls = 0;
  await assert.rejects(
    () =>
      gitLabGet({
        fetchImpl: () => {
          fetchCalls += 1;
          throw new Error('fetch must not run');
        },
        apiBaseUrl: 'https://attacker.example/api/v4',
        token: 'test-job-token',
        pathSegments: ['projects', 'epoca/epoca', 'pipelines'],
      }),
    /trusted GitLab API/i
  );
  assert.equal(fetchCalls, 0);
});

void test('GitLab transactions allow GET only and reject redirects, off-origin, or changed response URLs', () => {
  const valid = {
    apiBaseUrl: TRUSTED_API_BASE,
    method: 'GET',
    requestUrl: 'https://gitlab.company-5897fee414.example.invalid/api/v4/projects/epoca%2Fepoca/pipelines?sha=abc',
    responseUrl: 'https://gitlab.company-5897fee414.example.invalid/api/v4/projects/epoca%2Fepoca/pipelines?sha=abc',
    status: 200,
  };
  assert.doesNotThrow(() => assertSafeGitLabTransaction(valid));
  const invalid = [
    { ...valid, method: 'POST' },
    { ...valid, requestUrl: 'https://evil.example/api/v4/projects/1' },
    { ...valid, status: 302 },
    { ...valid, responseUrl: 'https://objects.example/artifact.json' },
    { ...valid, responseUrl: `${valid.requestUrl}&redirected=true` },
  ];
  for (const transaction of invalid) {
    assert.throws(() => assertSafeGitLabTransaction(transaction), /GitLab (request|response|redirect|method)/i);
  }
});

void test('GitLab JSON bodies require honest bounded content lengths and never use arrayBuffer', async () => {
  assert.equal(typeof gateEvidence.MAX_GITLAB_JSON_BYTES, 'number');

  const missing = makeStreamingResponse({ chunks: ['[]'] });
  await assert.rejects(() => readGitLabJson(missing.response, 'missing JSON length'), /content-length/i);
  assert.equal(missing.state.cancelled, true);
  assert.equal(missing.state.pulls, 0);
  assert.equal(missing.state.arrayBufferCalls, 0);

  const oversized = makeStreamingResponse({
    chunks: ['[]'],
    contentLength: gateEvidence.MAX_GITLAB_JSON_BYTES + 1,
  });
  await assert.rejects(() => readGitLabJson(oversized.response, 'oversized JSON'), /maximum JSON size/i);
  assert.equal(oversized.state.cancelled, true);
  assert.equal(oversized.state.pulls, 0);
  assert.equal(oversized.state.arrayBufferCalls, 0);

  const lying = makeStreamingResponse({ chunks: ['[0]'], contentLength: 2 });
  await assert.rejects(() => readGitLabJson(lying.response, 'lying JSON length'), /declared content-length/i);
  assert.equal(lying.state.arrayBufferCalls, 0);

  const oversizedChunk = makeStreamingResponse({
    chunks: [new Uint8Array(gateEvidence.MAX_GITLAB_JSON_BYTES + 1)],
    contentLength: gateEvidence.MAX_GITLAB_JSON_BYTES,
  });
  await assert.rejects(() => readGitLabJson(oversizedChunk.response, 'oversized JSON chunk'), /maximum JSON size/i);
  assert.equal(oversizedChunk.state.arrayBufferCalls, 0);
});

void test('external artifacts use the same bounded streaming rules for missing, oversized, and lying lengths', async () => {
  assert.equal(typeof gateEvidence.readGitLabArtifact, 'function');
  assert.equal(typeof gateEvidence.MAX_GITLAB_ARTIFACT_BYTES, 'number');

  const missing = makeStreamingResponse({ chunks: ['artifact'] });
  await assert.rejects(() => gateEvidence.readGitLabArtifact(missing.response, 'missing artifact'), /content-length/i);
  assert.equal(missing.state.cancelled, true);
  assert.equal(missing.state.arrayBufferCalls, 0);

  const oversized = makeStreamingResponse({
    chunks: ['artifact'],
    contentLength: gateEvidence.MAX_GITLAB_ARTIFACT_BYTES + 1,
  });
  await assert.rejects(
    () => gateEvidence.readGitLabArtifact(oversized.response, 'oversized artifact'),
    /maximum artifact size/i
  );
  assert.equal(oversized.state.cancelled, true);
  assert.equal(oversized.state.arrayBufferCalls, 0);

  const lying = makeStreamingResponse({ chunks: ['artifact'], contentLength: 3 });
  await assert.rejects(
    () => gateEvidence.readGitLabArtifact(lying.response, 'lying artifact'),
    /declared content-length/i
  );
  assert.equal(lying.state.arrayBufferCalls, 0);
});

void test('bounded pagination finds exact pipelines and jobs on page two using only rebuilt trusted URLs', async () => {
  assert.equal(typeof gateEvidence.gitLabGetAllPages, 'function');
  const requests = [];
  const pagedFetch = (pages) => (request, options) => {
    requests.push({ href: request.href, options });
    const page = Number(request.searchParams.get('page'));
    const pageResponse = makeJsonPageResponse(pages[page - 1]);
    pageResponse.response.url = request.href;
    return Promise.resolve(pageResponse.response);
  };

  const pipelines = await gateEvidence.gitLabGetAllPages({
    fetchImpl: pagedFetch([
      {
        items: [{ id: 41, sha: 'f'.repeat(40), status: 'success', web_url: `${PIPELINE_URL}-wrong` }],
        page: 1,
        totalPages: 2,
        nextPage: 2,
      },
      {
        items: [{ id: 42, sha: SHA, status: 'success', web_url: PIPELINE_URL }],
        page: 2,
        totalPages: 2,
        nextPage: null,
      },
    ]),
    apiBaseUrl: TRUSTED_API_BASE,
    token: 'test-job-token',
    pathSegments: ['projects', 'epoca/epoca', 'pipelines'],
    search: { sha: SHA, status: 'success' },
    label: 'pipeline pages',
  });
  assert.equal(selectExactSuccessfulPipeline(pipelines, SHA).id, 42);

  const jobs = await gateEvidence.gitLabGetAllPages({
    fetchImpl: pagedFetch([
      {
        items: [{ id: 83, name: 'other', status: 'success', web_url: `${JOB_URL}-wrong` }],
        page: 1,
        totalPages: 2,
        nextPage: 2,
      },
      {
        items: [{ id: 84, name: 'oauth_e2e', status: 'success', web_url: JOB_URL }],
        page: 2,
        totalPages: 2,
        nextPage: null,
      },
    ]),
    apiBaseUrl: TRUSTED_API_BASE,
    token: 'test-job-token',
    pathSegments: ['projects', 'epoca/epoca', 'pipelines', 42, 'jobs'],
    search: { 'scope[]': 'success' },
    label: 'job pages',
  });
  assert.equal(selectExactSuccessfulJob(jobs, 'oauth_e2e').id, 84);
  assert.equal(requests.length, 4);
  assert.deepEqual(
    requests.map(({ href }) => new URL(href).searchParams.get('page')),
    ['1', '2', '1', '2']
  );
  assert.equal(
    requests.every(({ href }) => new URL(href).origin === 'https://gitlab.company-5897fee414.example.invalid'),
    true
  );
  assert.equal(
    requests.every(
      ({ options }) =>
        options.method === 'GET' && options.redirect === 'manual' && options.headers['Accept-Encoding'] === 'identity'
    ),
    true
  );
});

void test('pagination rejects off-origin links, invalid next pages, and an unbounded page count', async () => {
  assert.equal(typeof gateEvidence.gitLabGetAllPages, 'function');
  const cases = [
    {
      response: {
        items: [],
        page: 1,
        totalPages: 2,
        nextPage: 2,
        link: '<https://attacker.example/api/v4/projects/1?page=2>; rel="next"',
      },
      pattern: /pagination link.*trusted GitLab API/i,
    },
    {
      response: { items: [], page: 1, totalPages: 2, nextPage: 3 },
      pattern: /next page/i,
    },
    {
      response: { items: [], page: 1, totalPages: 11, nextPage: 2 },
      pattern: /page limit/i,
    },
    {
      response: {
        items: Array.from({ length: 101 }, (_, id) => ({ id })),
        page: 1,
        totalPages: 1,
        nextPage: null,
      },
      pattern: /page result.*page size/i,
    },
  ];

  for (const { response, pattern } of cases) {
    let calls = 0;
    const fetchImpl = (request) => {
      calls += 1;
      const pageResponse = makeJsonPageResponse(response);
      pageResponse.response.url = request.href;
      return Promise.resolve(pageResponse.response);
    };
    await assert.rejects(
      () =>
        gateEvidence.gitLabGetAllPages({
          fetchImpl,
          apiBaseUrl: TRUSTED_API_BASE,
          token: 'test-job-token',
          pathSegments: ['projects', 'epoca/epoca', 'pipelines'],
          search: { sha: SHA },
          label: 'unsafe pages',
        }),
      pattern
    );
    assert.equal(calls, 1);
  }
});

void test('atomic evidence writes reject escapes and symlinked parents', async (context) => {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'ct-530-gate-write-'));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const allowedRoot = path.join(sandbox, 'test-results');
  const outsideRoot = path.join(sandbox, 'outside');
  await mkdir(allowedRoot);
  await mkdir(outsideRoot);
  await symlink(outsideRoot, path.join(allowedRoot, 'linked'));

  await assert.rejects(
    () =>
      writeEvidenceAtomically(
        path.join(allowedRoot, 'linked', 'backend-gates.json'),
        backendDocument,
        validateBackendEvidenceDocument,
        { allowedRoot }
      ),
    /symlink/i
  );
  assert.deepEqual(await readdir(outsideRoot), []);

  await assert.rejects(
    () =>
      writeEvidenceAtomically(
        path.join(allowedRoot, '..', 'escaped.json'),
        backendDocument,
        validateBackendEvidenceDocument,
        { allowedRoot }
      ),
    /escapes.*allowed root/i
  );
});

void test('atomic evidence writes remove temporary files after a real rename failure', async (context) => {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'ct-530-gate-rename-'));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const allowedRoot = path.join(sandbox, 'test-results');
  const outputPath = path.join(allowedRoot, 'backend-gates.json');
  await mkdir(outputPath, { recursive: true });

  await assert.rejects(() =>
    writeEvidenceAtomically(outputPath, backendDocument, validateBackendEvidenceDocument, { allowedRoot })
  );
  assert.deepEqual(
    (await readdir(allowedRoot)).filter((name) => name.endsWith('.tmp')),
    []
  );
});

void test('atomic evidence writes succeed inside the explicit boundary', async (context) => {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'ct-530-gate-success-'));
  context.after(() => rm(sandbox, { recursive: true, force: true }));
  const allowedRoot = path.join(sandbox, 'test-results');
  const outputPath = path.join(allowedRoot, 'backend-gates.json');
  await mkdir(allowedRoot);

  await writeEvidenceAtomically(outputPath, backendDocument, validateBackendEvidenceDocument, { allowedRoot });
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), backendDocument);
});

void test('pipeline and job selection requires exact successful SHA and exact successful job', () => {
  assert.equal(
    selectExactSuccessfulPipeline(
      [
        { id: 41, sha: SHA, status: 'success', web_url: 'https://gitlab.example/p/41' },
        { id: 42, sha: SHA, status: 'success', web_url: PIPELINE_URL },
      ],
      SHA
    ).id,
    42
  );
  assert.throws(
    () =>
      selectExactSuccessfulPipeline([{ id: 42, sha: 'f'.repeat(40), status: 'success', web_url: PIPELINE_URL }], SHA),
    /exact successful pipeline/i
  );
  assert.throws(
    () => selectExactSuccessfulPipeline([{ id: 42, sha: SHA, status: 'failed', web_url: PIPELINE_URL }], SHA),
    /exact successful pipeline/i
  );

  assert.equal(
    selectExactSuccessfulJob(
      [
        { id: 83, name: 'oauth_e2e', status: 'success', web_url: 'https://gitlab.example/j/83' },
        { id: 84, name: 'oauth_e2e', status: 'success', web_url: JOB_URL },
      ],
      'oauth_e2e'
    ).id,
    84
  );
  assert.throws(
    () =>
      selectExactSuccessfulJob([{ id: 84, name: 'test_backend', status: 'success', web_url: JOB_URL }], 'oauth_e2e'),
    /exact successful job/i
  );
  assert.throws(
    () => selectExactSuccessfulJob([{ id: 84, name: 'oauth_e2e', status: 'failed', web_url: JOB_URL }], 'oauth_e2e'),
    /exact successful job/i
  );
});
