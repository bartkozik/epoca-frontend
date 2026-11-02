import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildReleaseArguments, validateReleaseReceipt, validateReleaseReport } from './run-release-smoke.mjs';

const receipt = {
  schemaVersion: 1,
  status: 'passed',
  runId: 'ct527-contract-001',
  phase: 'deploy',
  fixtureId: 'ct527-compat-v1',
  frontendSha: 'a'.repeat(40),
  backendSha: 'b'.repeat(40),
  cleanup: true,
};
const environment = {
  EPOCA_RELEASE_RUN_ID: receipt.runId,
  EPOCA_RELEASE_PHASE: receipt.phase,
  PLAYWRIGHT_RELEASE_FIXTURE_ID: receipt.fixtureId,
  PLAYWRIGHT_LIVE_FRONTEND_SHA: receipt.frontendSha,
  PLAYWRIGHT_LIVE_BACKEND_SHA: receipt.backendSha,
};
void test('release wrapper restricts selection and rejects false cleanup or stale receipt', () => {
  assert.deepEqual(validateReleaseReceipt(receipt, environment), receipt);
  for (const changed of [
    { cleanup: false },
    { runId: 'ct527-other' },
    { phase: 'rollback' },
    { status: 'failed' },
    { frontendSha: 'c'.repeat(40) },
    { fixtureId: 'ct527-other' },
    { token: 'not-allowed' },
  ])
    assert.throws(() => validateReleaseReceipt({ ...receipt, ...changed }, environment));
  assert.ok(buildReleaseArguments('deploy').includes('playwright.release.config.ts'));
  assert.throws(() => buildReleaseArguments('all'));
});
void test('rollback setup is structurally separate from mutating provision and cleanup', () => {
  const source = readFileSync(new URL('../../tests/e2e/live/release-rollback-setup.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"].*(provisionWorld|global-setup|global-teardown)/);
  assert.match(source, /assertNoExistingLiveRunState/);
  const config = readFileSync(new URL('../../playwright.release.config.ts', import.meta.url), 'utf8');
  assert.match(config, /testMatch: `release-\$\{phase\}\.spec\.ts`/);
  for (const kind of ['trace', 'video', 'screenshot']) assert.match(config, new RegExp(`${kind}: 'off'`));
});

/** @param {string} title */
const reportTest = (title) => ({
  title,
  tests: [{ projectName: 'release-chromium', status: 'expected', results: [{ status: 'passed' }] }],
});
const deployTitles = ['pl', 'en'].map((language) => `CT-527 @live deploy [${language}] smoke`);
/** @param {string[]} titles */
const reportFor = (titles) => ({
  stats: { expected: titles.length, unexpected: 0, skipped: 0, flaky: 0 },
  errors: [],
  suites: [{ suites: [{ specs: titles.map(reportTest) }] }],
});

void test('release report requires both PL and EN deployment scenarios, and one rollback scenario', () => {
  assert.doesNotThrow(() => validateReleaseReport(reportFor(deployTitles), 'deploy'));
  assert.doesNotThrow(() => validateReleaseReport(reportFor(['CT-527 @live rollback smoke']), 'rollback'));
  for (const titles of [
    [],
    [deployTitles[0]],
    [deployTitles[1]],
    [deployTitles[0], deployTitles[0]],
    ['unrelated pl', 'unrelated en'],
    [...deployTitles, deployTitles[0]],
  ]) {
    assert.throws(() => validateReleaseReport(reportFor(titles), 'deploy'));
  }
  assert.throws(() => validateReleaseReport(reportFor(deployTitles), 'rollback'));
  assert.throws(() => validateReleaseReport(reportFor(deployTitles), 'unknown'));
});

void test('release wrapper rejects skipped scenarios, retries, failed results and reporter errors', () => {
  const report = reportFor(deployTitles);
  for (const changed of [
    { expected: 0 },
    { expected: 1 },
    { expected: 3 },
    { skipped: 1 },
    { unexpected: 1 },
    { flaky: 1 },
  ])
    assert.throws(() => validateReleaseReport({ ...report, stats: { ...report.stats, ...changed } }, 'deploy'));
  assert.throws(() => validateReleaseReport({ ...report, errors: [{ message: 'setup failed' }] }, 'deploy'));
  assert.throws(() => validateReleaseReport({ ...report, suites: [] }, 'deploy'));
  const wrongProject = reportFor(deployTitles);
  wrongProject.suites[0].suites[0].specs[1].tests[0].projectName = 'other';
  assert.throws(() => validateReleaseReport(wrongProject, 'deploy'));
  const failed = reportFor(deployTitles);
  failed.suites[0].suites[0].specs[1].tests[0].results[0].status = 'failed';
  assert.throws(() => validateReleaseReport(failed, 'deploy'));
  const retried = reportFor(deployTitles);
  retried.suites[0].suites[0].specs[1].tests[0].results.push({ status: 'passed' });
  assert.throws(() => validateReleaseReport(retried, 'deploy'));
});
