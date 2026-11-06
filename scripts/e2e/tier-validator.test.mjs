import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import { z } from 'zod';
import * as tierCli from '../validate-e2e-tiers.mjs';
import { parsePlaywrightInventory as parseInventory } from './coverage-inventory.mjs';
import { validateTierInventory, validateTierRun } from './tier-validator.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gitLabCi = z
  .record(z.unknown())
  .parse(yaml.parse(readFileSync(path.join(repositoryRoot, '.gitlab-ci.yml'), 'utf8')));
const packageJson = z
  .object({ scripts: z.record(z.string()), devDependencies: z.record(z.string()) })
  .parse(JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')));
const ruleSchema = z.object({ if: z.string(), when: z.string().optional(), allow_failure: z.boolean().optional() });
const jobSchema = z
  .object({
    script: z.array(z.string()),
    rules: z.array(ruleSchema).optional(),
    artifacts: z
      .object({
        paths: z.array(z.string()),
        reports: z.object({ junit: z.string().optional(), dotenv: z.string().optional() }).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
/** @param {string} name */
const requireJob = (name) => {
  assert.ok(gitLabCi[name], `GitLab CI job ${name} must exist`);
  return jobSchema.parse(gitLabCi[name]);
};
/** @param {string} json @param {{repositoryRoot: string}} options @returns {unknown[]} */
const parsePlaywrightInventory = (json, options) => parseInventory(json, options);
/** @typedef {{ source: string, branch: string, tag: string, defaultBranch?: string, janitor?: boolean, clean?: boolean, verification?: boolean, phase?: string }} Pipeline */
/** @param {string} expression @param {Pipeline} pipeline */
const ruleMatches = (expression, pipeline) => {
  switch (expression) {
    case '$EPOCA_CLEAN_RELEASE_BUILD == "true" || $EPOCA_RELEASE_VERIFICATION == "true" || $EPOCA_RELEASE_JANITOR == "true"':
      return pipeline.clean === true || pipeline.verification === true || pipeline.janitor === true;
    case '$EPOCA_RELEASE_VERIFICATION == "true" || $EPOCA_RELEASE_JANITOR == "true"':
      return pipeline.verification === true || pipeline.janitor === true;
    case '$EPOCA_CLEAN_RELEASE_BUILD == "true" && ($CI_PIPELINE_SOURCE == "api" || $CI_PIPELINE_SOURCE == "web")':
      return pipeline.clean === true && ['api', 'web'].includes(pipeline.source);
    case '$CI_PIPELINE_SOURCE == "merge_request_event"':
      return pipeline.source === 'merge_request_event';
    case '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH':
      return Boolean(pipeline.branch) && pipeline.branch === pipeline.defaultBranch;
    case '$CI_COMMIT_BRANCH == "staging"':
      return pipeline.branch === 'staging';
    case '$CI_PIPELINE_SOURCE == "api" && $EPOCA_RELEASE_VERIFICATION == "true" && $EPOCA_RELEASE_PHASE == "deploy"':
    case '$CI_PIPELINE_SOURCE == "web" && $EPOCA_RELEASE_VERIFICATION == "true" && $EPOCA_RELEASE_PHASE == "deploy"':
    case '$CI_PIPELINE_SOURCE == "api" && $EPOCA_RELEASE_VERIFICATION == "true" && $EPOCA_RELEASE_PHASE == "rollback"':
    case '$CI_PIPELINE_SOURCE == "web" && $EPOCA_RELEASE_VERIFICATION == "true" && $EPOCA_RELEASE_PHASE == "rollback"':
      return (
        expression.startsWith(`$CI_PIPELINE_SOURCE == "${pipeline.source}"`) &&
        pipeline.verification === true &&
        expression.endsWith(`$EPOCA_RELEASE_PHASE == "${pipeline.phase}"`)
      );
    case '$CI_PIPELINE_SOURCE == "schedule" && $EPOCA_RELEASE_JANITOR == "true"':
    case '$CI_PIPELINE_SOURCE == "web" && $EPOCA_RELEASE_JANITOR == "true"':
      return expression.startsWith(`$CI_PIPELINE_SOURCE == "${pipeline.source}"`) && pipeline.janitor === true;
    case '$EPOCA_RELEASE_JANITOR == "true"':
      return pipeline.janitor === true;
    case '$CI_PIPELINE_SOURCE == "schedule"':
      return pipeline.source === 'schedule';
    case '$CI_PIPELINE_SOURCE == "web"':
      return pipeline.source === 'web';
    case '$CI_COMMIT_BRANCH == "demo"':
      return pipeline.branch === 'demo';
    case '$CI_COMMIT_TAG':
      return Boolean(pipeline.tag);
    default:
      throw new Error(`Unsupported GitLab rule expression in contract: ${String(expression)}`);
  }
};

/** @param {z.infer<typeof ruleSchema>[]} rules @param {Pipeline} pipeline */
const resolveFirstMatchingRule = (rules, pipeline) => {
  const rule = rules.find(({ if: expression }) => ruleMatches(expression, pipeline));
  if (!rule || rule.when === 'never') return null;
  return {
    mode: rule.when === 'manual' ? 'manual' : 'automatic',
    allowFailure: rule.allow_failure ?? false,
  };
};

const ordinaryTierExclusion = {
  if: '$EPOCA_CLEAN_RELEASE_BUILD == "true" || $EPOCA_RELEASE_VERIFICATION == "true" || $EPOCA_RELEASE_JANITOR == "true"',
  when: 'never',
};
const scheduledTagAndManualWebRules = [
  ordinaryTierExclusion,
  { if: '$CI_PIPELINE_SOURCE == "schedule"' },
  { if: '$CI_PIPELINE_SOURCE == "web"', when: 'manual', allow_failure: false },
  { if: '$CI_COMMIT_TAG' },
];

const protectedEnvironmentRules = [
  ordinaryTierExclusion,
  { if: '$CI_PIPELINE_SOURCE == "schedule"' },
  { if: '$CI_PIPELINE_SOURCE == "web"', when: 'manual', allow_failure: false },
];

const selectionSchema = z.object({
  extends: z.string().optional(),
  rules: z.array(ruleSchema).optional(),
  only: z.array(z.string()).optional(),
  except: z.array(z.string()).optional(),
});
/** @param {string} name @returns {z.infer<typeof selectionSchema>} */
const jobSelection = (name) => {
  const job = selectionSchema.parse(gitLabCi[name]);
  return job.extends ? { ...jobSelection(job.extends), ...job } : job;
};
/** @param {Pipeline} pipeline */
const pipelineJobs = (pipeline) =>
  Object.fromEntries(
    Object.keys(gitLabCi)
      .filter((name) => name !== 'stages' && !name.startsWith('.'))
      .flatMap((name) => {
        const job = jobSelection(name);
        if (job.rules) {
          const selected = resolveFirstMatchingRule(job.rules, pipeline);
          return selected ? [[name, selected]] : [];
        }
        assert.deepEqual(job.except, ['branches'], `${name} unsupported legacy selector`);
        assert.ok(job.only?.length, `${name} requires a supported selector`);
        const matchesTag = job.only.some((pattern) => {
          assert.ok(pattern.startsWith('/') && pattern.endsWith('/'), `${name} requires a regex selector`);
          return new RegExp(pattern.slice(1, -1)).test(pipeline.tag);
        });
        return !pipeline.branch && matchesTag ? [[name, { mode: 'automatic', allowFailure: false }]] : [];
      }),
  );
const ordinaryTierJobs = [
  'e2e_full',
  'verify_backend_gates',
  'verify_external_e2e_gates',
  'seed_live_archive_fixture',
  'e2e_live',
  'e2e_local_proxy',
];
const nodeJobs = ['lint', 'test', 'typecheck', 'validate_e2e', 'build_frontend'];
/** @param {string[]} automatic @param {string[]} [manual] */
const expectedJobs = (automatic, manual = []) => {
  /** @type {Record<string, { mode: string, allowFailure: boolean }>} */
  const selected = {};
  for (const name of automatic) selected[name] = { mode: 'automatic', allowFailure: false };
  for (const name of manual) selected[name] = { mode: 'manual', allowFailure: false };
  return selected;
};

for (const source of ['api', 'web']) {
  for (const branch of ['staging', 'main', 'feature/release']) {
    const pipeline = { source, branch, tag: '', defaultBranch: 'main' };
    const credentialScan = branch === pipeline.defaultBranch ? ['credential_scan'] : [];
    void test(`clean release ${source} on ${branch} has only automatic verification/build jobs`, () => {
      assert.deepEqual(
        pipelineJobs({ ...pipeline, clean: true }),
        expectedJobs([...nodeJobs, ...credentialScan, 'build_staging_frontend_image', 'verify_docker_image']),
      );
    });
    for (const [phase, smokeJob] of [
      ['deploy', 'deploy_e2e_smoke'],
      ['rollback', 'post_rollback_e2e_smoke'],
    ]) {
      void test(`release ${phase} smoke ${source} on ${branch} selects only the requested smoke and scanner`, () => {
        const expected =
          source === 'api' ? expectedJobs([...credentialScan, smokeJob]) : expectedJobs(credentialScan, [smokeJob]);
        assert.deepEqual(pipelineJobs({ ...pipeline, verification: true, phase }), expected);
      });
    }
  }
}

for (const source of ['web', 'schedule']) {
  void test(`ordinary ${source} retains its complete job set and manual behavior`, () => {
    const pipeline = { source, branch: 'feature/release', tag: '', defaultBranch: 'main' };
    assert.deepEqual(
      pipelineJobs(pipeline),
      source === 'web' ? expectedJobs([], ordinaryTierJobs) : expectedJobs(ordinaryTierJobs),
    );
    assert.deepEqual(
      pipelineJobs({ ...pipeline, janitor: true }),
      source === 'web' ? expectedJobs([], ['release_fixture_janitor']) : expectedJobs(['release_fixture_janitor']),
    );
  });
}

void test('ordinary default branch and version tags retain their complete job sets', () => {
  assert.deepEqual(
    pipelineJobs({ source: 'push', branch: 'main', defaultBranch: 'main', tag: '' }),
    expectedJobs([...nodeJobs, 'credential_scan', 'build_staging_frontend_image', 'deploy_staging_frontend']),
  );
  assert.deepEqual(
    pipelineJobs({ source: 'push', branch: '', tag: 'v1.2.3' }),
    expectedJobs(['verify_backend_gates', 'verify_external_e2e_gates', 'build_and_push_versioned_docker_image']),
  );
});

const makeReport = ({
  projectName = 'mock-chromium',
  tags = ['@mr', 'technical'],
  title = 'discovers one test',
  file = 'tests/e2e/fixture.spec.ts',
  errors = [],
} = {}) => ({
  config: { rootDir: '/repo' },
  suites: [
    {
      title: file,
      file,
      specs: [],
      suites: [
        {
          title: 'outer suite',
          file,
          specs: [],
          suites: [
            {
              title: 'inner suite',
              file,
              suites: [],
              specs: [{ title, file, tags, tests: [{ projectName }] }],
            },
          ],
        },
      ],
    },
  ],
  errors,
});

const makeResult = (report = makeReport(), overrides = {}) => ({
  status: 0,
  signal: null,
  stdout: JSON.stringify(report),
  stderr: '',
  error: undefined,
  ...overrides,
});

void test('recursive inventory composes full titles, normalizes tags, and preserves project and spec', () => {
  const inventory = parsePlaywrightInventory(JSON.stringify(makeReport()), { repositoryRoot: '/repo' });
  assert.deepEqual(inventory, [
    {
      projectName: 'mock-chromium',
      spec: 'tests/e2e/fixture.spec.ts',
      title: 'outer suite inner suite discovers one test',
      tags: ['mr', 'technical'],
    },
  ]);
});

void test('inventory rejects invalid JSON, reporter errors, zero tests, and malformed suite/test shapes', () => {
  assert.throws(() => parsePlaywrightInventory('{invalid', { repositoryRoot: '/repo' }), /invalid Playwright JSON/i);
  assert.throws(
    () =>
      parsePlaywrightInventory(JSON.stringify({ ...makeReport(), errors: [{ message: 'bad reporter' }] }), {
        repositoryRoot: '/repo',
      }),
    /reporter errors/i,
  );
  assert.throws(
    () =>
      parsePlaywrightInventory(JSON.stringify({ config: { rootDir: '/repo' }, suites: [], errors: [] }), {
        repositoryRoot: '/repo',
      }),
    /zero tests/i,
  );
  assert.throws(
    () =>
      parsePlaywrightInventory(JSON.stringify({ config: { rootDir: '/repo' }, suites: {}, errors: [] }), {
        repositoryRoot: '/repo',
      }),
    /suites.*array/i,
  );
  assert.throws(
    () =>
      parsePlaywrightInventory(
        JSON.stringify({ config: { rootDir: '/repo' }, suites: [{ title: 'x', specs: {} }], errors: [] }),
        { repositoryRoot: '/repo' },
      ),
    /specs.*array/i,
  );
  const malformedTest = makeReport();
  malformedTest.suites[0].suites[0].suites[0].specs[0].tests = [{ projectName: '' }];
  assert.throws(
    () => parsePlaywrightInventory(JSON.stringify(malformedTest), { repositoryRoot: '/repo' }),
    /projectName/i,
  );
});

void test('inventory rejects duplicate project plus spec plus full-title source identities', () => {
  const report = makeReport();
  report.suites.push(structuredClone(report.suites[0]));
  assert.throws(
    () => parsePlaywrightInventory(JSON.stringify(report), { repositoryRoot: '/repo' }),
    /ambiguous source identity/i,
  );
});

void test('tier run rejects nonzero status, signal, stderr, invalid JSON, reporter errors, and zero inventory', () => {
  assert.throws(() => validateTierRun('mr', makeResult(makeReport(), { status: 1 })), /status 1/i);
  assert.throws(() => validateTierRun('mr', makeResult(makeReport(), { signal: 'SIGTERM' })), /SIGTERM/i);
  assert.throws(() => validateTierRun('mr', makeResult(makeReport(), { stderr: 'credential warning' })), /stderr/i);
  assert.throws(
    () => validateTierRun('mr', makeResult(makeReport(), { stdout: '{invalid' })),
    /invalid Playwright JSON/i,
  );
  assert.throws(
    () => validateTierRun('mr', makeResult(makeReport({ errors: [{ message: 'collect failed' }] }))),
    /reporter errors/i,
  );
  assert.throws(
    () => validateTierRun('mr', makeResult({ config: { rootDir: '/repo' }, suites: [], errors: [] })),
    /zero tests/i,
  );
});

void test('OAuth client is an allowed selector tag but never a primary tier tag', () => {
  assert.equal(
    validateTierInventory(
      'mr',
      parsePlaywrightInventory(JSON.stringify(makeReport({ tags: ['@mr', '@oauth-client'] })), {
        repositoryRoot: '/repo',
      }),
    ).count,
    1,
  );
  assert.throws(
    () =>
      validateTierInventory(
        'mr',
        parsePlaywrightInventory(JSON.stringify(makeReport({ tags: ['@oauth-client'] })), { repositoryRoot: '/repo' }),
      ),
    /exactly one primary tag/i,
  );
});

void test('tier runner options enforce a deterministic timeout and kill signal', () => {
  assert.equal(typeof tierCli.buildPlaywrightListSpawnOptions, 'function');
  const options = tierCli.buildPlaywrightListSpawnOptions({
    repositoryRoot: '/repo',
    environment: { PATH: '/trusted/bin' },
  });
  assert.equal(options.cwd, '/repo');
  assert.equal(options.timeout, 60_000);
  assert.equal(options.killSignal, 'SIGKILL');
  assert.equal(options.encoding, 'utf8');
  assert.equal(options.env.CI, 'true');
  assert.equal(options.env.EPOCA_E2E_LIST_ONLY, 'true');
  assert.equal(options.env.PATH, '/trusted/bin');
});

void test('tier runner timeout force-kills a real child that ignores SIGTERM', (context) => {
  const timeoutMs = 750;
  const productionOptions = tierCli.buildPlaywrightListSpawnOptions({
    repositoryRoot: process.cwd(),
    environment: { PATH: process.env.PATH },
  });
  const options = { ...productionOptions, timeout: timeoutMs };
  assert.equal(options.killSignal, 'SIGKILL');
  assert.equal(options.timeout, timeoutMs);

  const sandbox = mkdtempSync(path.join(tmpdir(), 'ct-530-tier-timeout-'));
  const pidPath = path.join(sandbox, 'child.pid');
  const childProcess = { pid: undefined };
  context.after(() => {
    if (Number.isSafeInteger(childProcess.pid)) {
      try {
        process.kill(childProcess.pid, 'SIGKILL');
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    }
    rmSync(sandbox, { recursive: true, force: true });
  });

  const childSource = [
    "const { writeFileSync } = require('node:fs');",
    "process.on('SIGTERM', () => {});",
    `writeFileSync(${JSON.stringify(pidPath)}, String(process.pid));`,
    'setTimeout(() => process.exit(97), 4000);',
    'setInterval(() => {}, 100);',
  ].join('\n');
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, ['--eval', childSource], options);
  const elapsedMs = Date.now() - startedAt;
  childProcess.pid = Number(readFileSync(pidPath, 'utf8'));

  assert.equal(result.error?.code, 'ETIMEDOUT');
  assert.equal(result.status, null);
  assert.equal(result.signal, 'SIGKILL');
  assert.ok(elapsedMs < 3_000, `force-kill took ${elapsedMs} ms`);
});

void test('tier run reports spawn timeouts clearly', () => {
  const error = Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' });
  assert.throws(
    () => validateTierRun('mr', makeResult(makeReport(), { status: null, error }), { timeoutMs: 60_000 }),
    /mr Playwright runner timed out after 60000 ms/i,
  );
});

void test('every test requires exactly one primary tag and only optional visual or technical tags', () => {
  const noPrimary = parsePlaywrightInventory(JSON.stringify(makeReport({ tags: ['technical'] })), {
    repositoryRoot: '/repo',
  });
  assert.throws(() => validateTierInventory('mr', noPrimary), /exactly one primary tag/i);

  const multiple = parsePlaywrightInventory(JSON.stringify(makeReport({ tags: ['mr', '@full'] })), {
    repositoryRoot: '/repo',
  });
  assert.throws(() => validateTierInventory('mr', multiple), /exactly one primary tag/i);

  const unknown = parsePlaywrightInventory(JSON.stringify(makeReport({ tags: ['mr', 'smoke'] })), {
    repositoryRoot: '/repo',
  });
  assert.throws(() => validateTierInventory('mr', unknown), /unknown tag.*smoke/i);
});

void test('MR allows only mock Chromium with primary mr', () => {
  const valid = parsePlaywrightInventory(JSON.stringify(makeReport()), { repositoryRoot: '/repo' });
  assert.deepEqual(validateTierInventory('mr', valid), { tier: 'mr', count: 1, projects: ['mock-chromium'] });

  const badProject = parsePlaywrightInventory(JSON.stringify(makeReport({ projectName: 'mock-firefox' })), {
    repositoryRoot: '/repo',
  });
  assert.throws(() => validateTierInventory('mr', badProject), /disallowed project/i);

  const badTier = parsePlaywrightInventory(JSON.stringify(makeReport({ tags: ['full'] })), { repositoryRoot: '/repo' });
  assert.throws(() => validateTierInventory('mr', badTier), /disallowed primary tag/i);
});

void test('full allows three mock projects and primary full or mr', () => {
  const inventories = [
    makeReport({ projectName: 'mock-chromium', tags: ['full', 'visual'], title: 'full chromium' }),
    makeReport({ projectName: 'mock-firefox', tags: ['mr'], title: 'mr firefox' }),
    makeReport({ projectName: 'mock-webkit', tags: ['full'], title: 'full webkit' }),
  ].flatMap((report) => parsePlaywrightInventory(JSON.stringify(report), { repositoryRoot: '/repo' }));
  assert.deepEqual(validateTierInventory('full', inventories), {
    tier: 'full',
    count: 3,
    projects: ['mock-chromium', 'mock-firefox', 'mock-webkit'],
  });
  const live = parsePlaywrightInventory(JSON.stringify(makeReport({ projectName: 'live-chromium', tags: ['live'] })), {
    repositoryRoot: '/repo',
  });
  assert.throws(() => validateTierInventory('full', live), /disallowed project/i);
});

void test('live and local-proxy tiers require their exact project and primary tag', () => {
  const live = parsePlaywrightInventory(JSON.stringify(makeReport({ projectName: 'live-chromium', tags: ['@live'] })), {
    repositoryRoot: '/repo',
  });
  assert.deepEqual(validateTierInventory('live', live), { tier: 'live', count: 1, projects: ['live-chromium'] });

  const localProxy = parsePlaywrightInventory(
    JSON.stringify(makeReport({ projectName: 'local-proxy-chromium', tags: ['local-proxy'] })),
    { repositoryRoot: '/repo' },
  );
  assert.deepEqual(validateTierInventory('local-proxy', localProxy), {
    tier: 'local-proxy',
    count: 1,
    projects: ['local-proxy-chromium'],
  });

  assert.throws(() => validateTierInventory('live', localProxy), /disallowed project/i);
  assert.throws(() => validateTierInventory('local-proxy', live), /disallowed project/i);
});

void test('tier fixtures reject cross-tier projects, empty full discovery, and unknown tags after a zero exit', () => {
  for (const projectName of ['mock-firefox', 'mock-webkit']) {
    assert.throws(
      () => validateTierRun('mr', makeResult(makeReport({ projectName })), { repositoryRoot: '/repo' }),
      /mr inventory has disallowed project/i,
    );
  }

  assert.throws(
    () =>
      validateTierRun('full', makeResult({ config: { rootDir: '/repo' }, suites: [], errors: [] }, { status: 0 }), {
        repositoryRoot: '/repo',
      }),
    /zero tests/i,
  );

  /** @type {Array<[string, string[]]>} */
  const disallowedProjectTierCases = [
    ['live', ['live']],
    ['local-proxy', ['local-proxy']],
  ];
  for (const [tier, tags] of disallowedProjectTierCases) {
    assert.throws(
      () =>
        validateTierRun(tier, makeResult(makeReport({ projectName: 'mock-chromium', tags })), {
          repositoryRoot: '/repo',
        }),
      new RegExp(`${tier} inventory has disallowed project`, 'i'),
    );
  }

  assert.throws(
    () =>
      validateTierRun('mr', makeResult(makeReport({ tags: ['mr', 'unrecognized-grep-tag'] }), { status: 0 }), {
        repositoryRoot: '/repo',
      }),
    /unknown tag.*unrecognized-grep-tag/i,
  );
});

void test('package scripts preserve aggregate and guarded E2E tier selectors', () => {
  assert.deepEqual(
    {
      ci: packageJson.scripts['test:e2e:ci'],
      all: packageJson.scripts['test:e2e:all'],
      mr: packageJson.scripts['test:e2e:mr'],
      full: packageJson.scripts['test:e2e:full'],
      live: packageJson.scripts['test:e2e:live'],
      localProxy: packageJson.scripts['test:e2e:local-proxy'],
    },
    {
      ci: 'node scripts/run-e2e-aggregate.mjs ci',
      all: 'node scripts/run-e2e-aggregate.mjs all',
      mr: 'node scripts/run-e2e-aggregate.mjs ci',
      full: 'node scripts/run-e2e-aggregate.mjs all',
      live: 'playwright test -c playwright.live.config.ts --project=live-chromium --grep @live',
      localProxy:
        'playwright test -c playwright.local-proxy.config.ts --project=local-proxy-chromium --grep @local-proxy',
    },
  );
  assert.equal(packageJson.devDependencies['js-yaml'], '4.1.0');
});

void test('aggregate CI owns override and pivot coverage without legacy feature pipelines', () => {
  assert.equal(packageJson.scripts['test:e2e:ci'], 'node scripts/run-e2e-aggregate.mjs ci');
  assert.equal(packageJson.scripts['test:e2e:all'], 'node scripts/run-e2e-aggregate.mjs all');
  assert.equal(packageJson.scripts['test:e2e:mr'], 'node scripts/run-e2e-aggregate.mjs ci');
  assert.equal(packageJson.scripts['test:e2e:full'], 'node scripts/run-e2e-aggregate.mjs all');

  assert.equal(gitLabCi.pm_classification_e2e, undefined);
  assert.equal(gitLabCi.staging_pm_classification_lifecycle, undefined);
  assert.equal(existsSync(path.join(repositoryRoot, '.gitlab/ci/staging-pm-classification-acceptance.yml')), false);
  assert.equal(readFileSync(path.join(repositoryRoot, '.gitlab-ci.yml'), 'utf8').includes('ct512'), false);

  assert.match(requireJob('e2e_mr').script.join('\n'), /test:e2e:ci/);
  assert.match(requireJob('e2e_full').script.join('\n'), /test:e2e:all/);
});

void test('OAuth client secret-bearing jobs scan before collection and publish only post-scan safe artifacts', () => {
  for (const name of ['e2e_mr', 'e2e_full', 'e2e_live']) {
    const job = requireJob(name);
    const artifactContract = name === 'e2e_full' ? requireJob('e2e_mr').artifacts : job.artifacts;
    const script = job.script.join('\n');
    assert.match(script, /artifact-scanner\.mjs/);
    assert.match(script, /safe-artifacts/);
    assert.ok(script.indexOf('test:e2e') < script.indexOf('artifact-scanner.mjs'));
    assert.deepEqual(artifactContract.paths, ['safe-artifacts/']);
    assert.match(artifactContract.reports.junit, /^safe-artifacts\//);
  }
  const liveConfig = readFileSync(path.join(repositoryRoot, 'playwright.live.config.ts'), 'utf8');
  assert.match(liveConfig, /trace:\s*'off'/);
  assert.match(liveConfig, /video:\s*'off'/);
  assert.match(liveConfig, /screenshot:\s*'off'/);

  for (const name of ['e2e_mr', 'e2e_full']) {
    const script = requireJob(name).script.join('\n');
    assert.match(script, /artifact-scanner\.mjs[^\n]+test-results(?:\n|$)/);
    assert.doesNotMatch(script, /artifact-scanner\.mjs[^\n]+playwright-report/);
  }
  for (const configFile of [
    'playwright.config.ts',
    'playwright.work-unit-overrides.config.ts',
    'playwright.pivot-table.config.ts',
  ]) {
    const config = readFileSync(path.join(repositoryRoot, configFile), 'utf8');
    const ciReporterStart = config.indexOf('reporter: process.env.CI');
    const localReporterStart = config.indexOf('\n    :', ciReporterStart);
    assert.notEqual(ciReporterStart, -1);
    assert.notEqual(localReporterStart, -1);
    assert.doesNotMatch(config.slice(ciReporterStart, localReporterStart), /\['html'/);
  }
});

void test('aggregate runner exposes deterministic CI and full command manifests', () => {
  const runner = path.join(repositoryRoot, 'scripts/run-e2e-aggregate.mjs');
  /** @param {string} tier @returns {unknown} */
  const readManifest = (tier) => {
    const result = spawnSync(process.execPath, [runner, '--print', tier], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      timeout: 5_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  };

  assert.deepEqual(readManifest('ci'), [
    ['playwright', 'test', '--project=mock-chromium', '--grep', '@mr'],
    ['test:e2e:mock:oauth-client'],
    ['playwright', 'test', '--config=playwright.work-unit-overrides.config.ts'],
    ['playwright', 'test', '--config=playwright.pivot-table.config.ts', '--project=desktop-chromium'],
  ]);
  assert.deepEqual(readManifest('all'), [
    ['playwright', 'test', '--project=mock-chromium', '--project=mock-firefox', '--project=mock-webkit'],
    ['test:e2e:mock:oauth-client'],
    ['playwright', 'test', '--config=playwright.work-unit-overrides.config.ts'],
    ['playwright', 'test', '--config=playwright.pivot-table.config.ts'],
  ]);
});

void test('validate_e2e is the exact Node-only gate with final coverage wiring', () => {
  const job = requireJob('validate_e2e');
  assert.equal(job.extends, '.node_yarn_job');
  assert.equal(job.stage, 'test');
  assert.doesNotMatch(
    job.script.join('\n'),
    /experimental-specifier-resolution=node --test scripts\/e2e\/integration-client-audit\.test\.mjs/,
  );
  assert.deepEqual(job.script, [
    'test "$(node --version)" = "v22.23.2"',
    'node .yarn/releases/yarn-4.18.0.cjs typecheck:e2e',
    'node --test scripts/e2e/aggregate-list.test.mjs scripts/e2e/artifact-scanner.test.mjs scripts/e2e/oauth-client-live-target.test.mjs scripts/e2e/oauth-client-mock-target.test.mjs scripts/e2e/coverage-validator.test.mjs scripts/e2e/coverage-cli.test.mjs scripts/e2e/gate-evidence.test.mjs scripts/e2e/live-fixture.test.mjs scripts/e2e/tier-validator.test.mjs',
    'node --no-warnings --experimental-strip-types --test scripts/e2e/request-journal.test.mjs',
    'node --no-warnings --experimental-strip-types --experimental-loader ./scripts/e2e/ts-resolve-loader.mjs --test scripts/e2e/integration-client-audit.test.mjs',
    'node --no-warnings --experimental-strip-types --experimental-loader ./scripts/e2e/ts-resolve-loader.mjs --test scripts/e2e/oauth-client-lifecycle.test.mjs',
    'node scripts/validate-e2e-coverage.mjs',
    'node scripts/validate-e2e-tiers.mjs',
  ]);
});

void test('mock browser jobs pin Playwright and keep MR, schedule, and web rules exact', () => {
  const mr = requireJob('e2e_mr');
  assert.equal(mr.image, 'mcr.microsoft.com/playwright:v1.49.1-noble');
  assert.equal(mr.stage, 'test');
  assert.equal(mr.timeout, '20m');
  assert.deepEqual(mr.variables, { EPOCA_E2E_VISUAL_PLATFORM: 'playwright-1.49.1-noble' });
  assert.deepEqual(mr.before_script, [
    'node --version',
    'node .yarn/releases/yarn-4.18.0.cjs install --immutable',
    'test "$(node .yarn/releases/yarn-4.18.0.cjs playwright --version)" = "Version 1.49.1"',
  ]);
  assert.match(mr.script.join('\n'), /test:e2e:ci[\s\S]*artifact-scanner\.mjs/);
  assert.deepEqual(mr.artifacts, {
    when: 'always',
    expire_in: '7 days',
    reports: { junit: 'safe-artifacts/test-results/e2e*-junit.xml' },
    paths: ['safe-artifacts/'],
  });
  assert.deepEqual(mr.rules, [{ if: '$CI_PIPELINE_SOURCE == "merge_request_event"' }]);

  const full = requireJob('e2e_full');
  assert.equal(full.extends, 'e2e_mr');
  assert.equal(full.timeout, '45m');
  assert.match(full.script.join('\n'), /test:e2e:all[\s\S]*artifact-scanner\.mjs/);
  assert.deepEqual(full.rules, [
    ordinaryTierExclusion,
    { if: '$CI_PIPELINE_SOURCE == "schedule"' },
    { if: '$CI_PIPELINE_SOURCE == "web"', when: 'manual', allow_failure: false },
  ]);
});

void test('every aggregate domain publishes a distinct JUnit file collected by the aggregate job', () => {
  const mockConfig = readFileSync(path.join(repositoryRoot, 'playwright.config.ts'), 'utf8');
  const overrideConfig = readFileSync(path.join(repositoryRoot, 'playwright.work-unit-overrides.config.ts'), 'utf8');
  const pivotConfig = readFileSync(path.join(repositoryRoot, 'playwright.pivot-table.config.ts'), 'utf8');
  assert.match(mockConfig, /test-results\/e2e-oauth-client-junit\.xml/);
  assert.match(mockConfig, /test-results\/e2e-junit\.xml/);
  assert.match(overrideConfig, /test-results\/e2e-work-unit-overrides-junit\.xml/);
  assert.match(pivotConfig, /test-results\/e2e-pivot-table-junit\.xml/);
  assert.match(overrideConfig, /"\$\{process\.execPath\}" \.yarn\/releases\/yarn-4\.18\.0\.cjs dev/);
  assert.match(pivotConfig, /"\$\{process\.execPath\}" \.yarn\/releases\/yarn-4\.18\.0\.cjs dev/);
});

void test('exact-SHA gate jobs keep evidence artifacts and non-MR rules separate', () => {
  const backend = requireJob('verify_backend_gates');
  assert.equal(backend.extends, '.node_yarn_job');
  assert.equal(backend.stage, 'test');
  assert.deepEqual(backend.script, ['test -n "$EPOCA_BACKEND_SHA"', 'node scripts/verify-backend-gates.mjs']);
  assert.deepEqual(backend.artifacts, {
    when: 'always',
    expire_in: '7 days',
    paths: ['test-results/backend-gates.json'],
  });
  assert.deepEqual(backend.rules, scheduledTagAndManualWebRules);

  const external = requireJob('verify_external_e2e_gates');
  assert.equal(external.extends, '.node_yarn_job');
  assert.equal(external.stage, 'test');
  assert.deepEqual(external.script, ['test -n "$EPOCA_BACKEND_SHA"', 'node scripts/verify-external-gates.mjs']);
  assert.deepEqual(external.artifacts, {
    when: 'always',
    expire_in: '7 days',
    paths: ['test-results/external-gates.json'],
  });
  assert.deepEqual(external.rules, scheduledTagAndManualWebRules);
});

void test('credentialed jobs are independent and archive only sanitized JUnit and metadata files', () => {
  const expected = {
    e2e_live: {
      script: [
        'export PLAYWRIGHT_LIVE_OWNER_EMAIL="$E2E_OWNER_EMAIL"',
        'export PLAYWRIGHT_LIVE_OWNER_PASSWORD="$E2E_OWNER_PASSWORD"',
        'export PLAYWRIGHT_LIVE_MANAGER_EMAIL="$E2E_MANAGER_EMAIL"',
        'export PLAYWRIGHT_LIVE_MANAGER_PASSWORD="$E2E_MANAGER_PASSWORD"',
        'export PLAYWRIGHT_LIVE_PM_EMAIL="$E2E_PROJECT_OWNER_EMAIL"',
        'export PLAYWRIGHT_LIVE_PM_PASSWORD="$E2E_PROJECT_OWNER_PASSWORD"',
        'export PLAYWRIGHT_LIVE_USER_EMAIL="$E2E_PROJECT_OWNER_EMAIL"',
        'export PLAYWRIGHT_LIVE_USER_PASSWORD="$E2E_PROJECT_OWNER_PASSWORD"',
        'export PLAYWRIGHT_LIVE_EMPLOYEE_EMAIL="$E2E_EMPLOYEE_2_EMAIL"',
        'export PLAYWRIGHT_LIVE_EMPLOYEE_PASSWORD="$E2E_EMPLOYEE_2_PASSWORD"',
        'set +e\nnode .yarn/releases/yarn-4.18.0.cjs test:e2e:live\ne2e_status=$?\nset -e\nnode scripts/e2e/artifact-scanner.mjs safe-artifacts "$CI_BUILDS_DIR/.epoca-e2e-quarantine/$CI_JOB_ID" --publish=test-results/e2e-live-junit.xml --publish=test-results/live-run-metadata.json test-results\nexit "$e2e_status"\n',
      ],
      junit: 'safe-artifacts/test-results/e2e-live-junit.xml',
      paths: ['safe-artifacts/'],
    },
    e2e_local_proxy: {
      script: [
        'export PLAYWRIGHT_LOCAL_PROXY_EMAIL="$E2E_PROJECT_OWNER_EMAIL"',
        'export PLAYWRIGHT_LOCAL_PROXY_PASSWORD="$E2E_PROJECT_OWNER_PASSWORD"',
        'export PLAYWRIGHT_LOCAL_PROXY_ALLOWED_ORG_ID="$PLAYWRIGHT_LIVE_ALLOWED_ORG_ID"',
        'export PLAYWRIGHT_LOCAL_PROXY_ORG_ID="$PLAYWRIGHT_LIVE_ALLOWED_ORG_ID"',
        'node .yarn/releases/yarn-4.18.0.cjs test:e2e:local-proxy',
      ],
      junit: 'test-results/e2e-local-proxy-junit.xml',
      paths: ['test-results/e2e-local-proxy-junit.xml', 'test-results/local-proxy-metadata.json'],
    },
  };

  for (const [name, contract] of Object.entries(expected)) {
    const job = requireJob(name);
    assert.equal(Object.hasOwn(job, 'extends'), false, `${name} must not extend e2e_mr`);
    assert.equal(job.image, 'mcr.microsoft.com/playwright:v1.49.1-noble');
    assert.equal(job.stage, 'test');
    assert.deepEqual(job.environment, { name: 'staging' });
    assert.deepEqual(job.needs, [{ job: 'seed_live_archive_fixture', artifacts: true }]);
    assert.deepEqual(job.before_script, [
      'node --version',
      'node .yarn/releases/yarn-4.18.0.cjs install --immutable',
      'test "$(node .yarn/releases/yarn-4.18.0.cjs playwright --version)" = "Version 1.49.1"',
    ]);
    assert.deepEqual(job.script, contract.script);
    assert.deepEqual(job.artifacts, {
      when: 'always',
      expire_in: '7 days',
      reports: { junit: contract.junit },
      paths: contract.paths,
    });
    assert.deepEqual(job.rules, protectedEnvironmentRules);
  }
});

void test('live fixture setup is a protected non-deploy dependency with sanitized dotenv output', () => {
  const fixture = requireJob('seed_live_archive_fixture');
  assert.equal(fixture.extends, '.node_yarn_job');
  assert.equal(fixture.stage, 'test');
  assert.deepEqual(fixture.environment, { name: 'staging' });
  assert.deepEqual(fixture.tags, ['e2e-dind']);
  assert.deepEqual(fixture.script, [
    'export LIVE_FIXTURE_OWNER_EMAIL="$E2E_OWNER_EMAIL"',
    'export LIVE_FIXTURE_OWNER_PASSWORD="$E2E_OWNER_PASSWORD"',
    'export LIVE_FIXTURE_USER_EMAIL="$E2E_EMPLOYEE_EMAIL"',
    'export LIVE_FIXTURE_USER_PASSWORD="$E2E_EMPLOYEE_PASSWORD"',
    'export LIVE_FIXTURE_SOURCE_WORK_UNIT_ID="$E2E_MANAGER_WORK_UNIT_ID"',
    'node scripts/e2e/seed-live-fixture.mjs',
  ]);
  assert.deepEqual(fixture.artifacts, {
    expire_in: '7 days',
    reports: { dotenv: 'test-results/live-fixture.env' },
    paths: ['test-results/live-fixture.env'],
  });
  assert.deepEqual(fixture.rules, protectedEnvironmentRules);
  assert.equal(JSON.stringify(gitLabCi.deploy_staging_frontend).includes('seed_live_archive_fixture'), false);
});

void test('first-match rules keep every web variant manual while preserving non-web triggers', () => {
  const pipelines = {
    schedule: { source: 'schedule', branch: '', tag: '' },
    web: { source: 'web', branch: 'feature/ct-530', tag: '' },
    'web+demo': { source: 'web', branch: 'demo', tag: '' },
    'web+tag': { source: 'web', branch: '', tag: 'v1.2.3' },
    'non-web demo': { source: 'push', branch: 'demo', tag: '' },
    'non-web tag': { source: 'push', branch: '', tag: 'v1.2.3' },
    'ordinary MR': { source: 'merge_request_event', branch: 'feature/ct-530', tag: '' },
  };
  const expected = {
    schedule: { mode: 'automatic', allowFailure: false },
    web: { mode: 'manual', allowFailure: false },
    'web+demo': { mode: 'manual', allowFailure: false },
    'web+tag': { mode: 'manual', allowFailure: false },
    'non-web demo': null,
    'non-web tag': { mode: 'automatic', allowFailure: false },
    'ordinary MR': null,
  };
  for (const name of ['verify_backend_gates', 'verify_external_e2e_gates']) {
    const actual = Object.fromEntries(
      Object.entries(pipelines).map(([label, pipeline]) => [
        label,
        resolveFirstMatchingRule(requireJob(name).rules, pipeline),
      ]),
    );
    assert.deepEqual(actual, expected, `${name} first-match truth table`);
  }

  for (const name of ['e2e_live', 'e2e_local_proxy']) {
    const actual = Object.fromEntries(
      Object.entries(pipelines).map(([label, pipeline]) => [
        label,
        resolveFirstMatchingRule(requireJob(name).rules, pipeline),
      ]),
    );
    assert.deepEqual(
      actual,
      {
        ...expected,
        'non-web tag': null,
      },
      `${name} first-match truth table`,
    );
  }
});

void test('CT-527 janitor schedules exclude all ordinary live jobs without changing their normal schedules', () => {
  for (const name of [
    'e2e_full',
    'e2e_live',
    'e2e_local_proxy',
    'seed_live_archive_fixture',
    'verify_backend_gates',
    'verify_external_e2e_gates',
  ]) {
    const rules = requireJob(name).rules;
    assert.deepEqual(rules[0], ordinaryTierExclusion);
    assert.equal(
      resolveFirstMatchingRule(rules, { source: 'schedule', branch: 'staging', tag: '', janitor: true }),
      null,
    );
    assert.deepEqual(resolveFirstMatchingRule(rules, { source: 'schedule', branch: 'staging', tag: '' }), {
      mode: 'automatic',
      allowFailure: false,
    });
  }
});
