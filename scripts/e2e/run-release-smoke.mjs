import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { assertPrivateStateRoot } from './release-state.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const receiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.literal('passed'),
    runId: z.string().regex(/^ct527-[a-z0-9][a-z0-9-]{5,100}$/),
    phase: z.enum(['deploy', 'rollback']),
    fixtureId: z.string().regex(/^ct527-[a-z0-9-]+$/),
    frontendSha: z.string().regex(/^[a-f0-9]{40}$/),
    backendSha: z.string().regex(/^[a-f0-9]{40}$/),
    cleanup: z.literal(true),
  })
  .strict();

/** @param {unknown} value @param {NodeJS.ProcessEnv} environment */
export function validateReleaseReceipt(value, environment) {
  const receipt = receiptSchema.parse(value);
  if (
    receipt.runId !== environment.EPOCA_RELEASE_RUN_ID ||
    receipt.phase !== environment.EPOCA_RELEASE_PHASE ||
    receipt.fixtureId !== environment.PLAYWRIGHT_RELEASE_FIXTURE_ID ||
    receipt.frontendSha !== environment.PLAYWRIGHT_LIVE_FRONTEND_SHA ||
    receipt.backendSha !== environment.PLAYWRIGHT_LIVE_BACKEND_SHA
  )
    throw new Error('Release receipt does not match this invocation');
  return receipt;
}

const reportSpecSchema = z.object({
  title: z.string(),
  tests: z
    .array(
      z.object({
        projectName: z.literal('release-chromium'),
        status: z.literal('expected'),
        results: z.array(z.object({ status: z.literal('passed') })).length(1),
      }),
    )
    .length(1),
});

/** @param {unknown} value @returns {string[]} */
function passedScenarioTitles(value) {
  const suite = z
    .object({
      specs: z.array(reportSpecSchema).default([]),
      suites: z.array(z.unknown()).default([]),
    })
    .parse(value);
  return [...suite.specs.map((spec) => spec.title), ...suite.suites.flatMap(passedScenarioTitles)];
}

/** @param {unknown} value @param {string} phase */
export function validateReleaseReport(value, phase) {
  z.enum(['deploy', 'rollback']).parse(phase);
  const expected = phase === 'deploy' ? 2 : 1;
  const report = z
    .object({
      stats: z.object({
        expected: z.literal(expected),
        unexpected: z.literal(0),
        skipped: z.literal(0),
        flaky: z.literal(0),
      }),
      errors: z.array(z.unknown()).length(0),
      suites: z.array(z.unknown()),
    })
    .parse(value);
  const titles = report.suites.flatMap(passedScenarioTitles);
  const prefixes =
    phase === 'deploy' ? ['CT-527 @live deploy [pl] ', 'CT-527 @live deploy [en] '] : ['CT-527 @live rollback '];
  if (
    titles.length !== expected ||
    prefixes.some((prefix) => titles.filter((title) => title.startsWith(prefix)).length !== 1)
  )
    throw new Error('Release report does not contain the required phase/language scenarios');
}

/** @param {string} phase */
export function buildReleaseArguments(phase) {
  z.enum(['deploy', 'rollback']).parse(phase);
  return [
    require.resolve('@playwright/test/cli'),
    'test',
    '-c',
    'playwright.release.config.ts',
    '--project=release-chromium',
  ];
}

/** @param {string[]} args */
export function runReleaseSmoke(args) {
  const output = path.join(root, 'safe-artifacts/release-smoke.json');
  rmSync(output, { force: true });
  const [phase, option, ...extra] = args;
  if (!phase || extra.length || (option !== undefined && option !== '--list'))
    throw new Error('Usage: run-release-smoke.mjs deploy|rollback [--list]');
  const command = buildReleaseArguments(phase);
  const listOnly = option === '--list';
  if (!listOnly && (process.env.EPOCA_RELEASE_VERIFICATION !== 'true' || process.env.EPOCA_RELEASE_PHASE !== phase))
    throw new Error('Explicit release phase opt-in is required');
  const environment = { ...process.env, EPOCA_RELEASE_PHASE: phase };
  if (listOnly) {
    const listed = spawnSync(process.execPath, [...command, '--list'], {
      cwd: root,
      env: { ...environment, EPOCA_E2E_LIST_ONLY: 'true' },
      stdio: 'inherit',
    });
    return listed.status ?? 1;
  }
  const runId = receiptSchema.shape.runId.parse(environment.EPOCA_RELEASE_RUN_ID);
  const stateRoot = assertPrivateStateRoot(process.env.EPOCA_RELEASE_STATE_ROOT);
  const directory = path.join(stateRoot, `${runId}-${phase}`);
  mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
  mkdirSync(directory, { mode: 0o700 });
  const privateLog = openSync(path.join(directory, 'browser.log'), 'wx', 0o600);
  command[3] = path.join(root, 'playwright.release.config.ts');
  let result;
  try {
    result = spawnSync(process.execPath, command, {
      cwd: directory,
      env: environment,
      stdio: ['ignore', privateLog, privateLog],
      timeout: 600_000,
      killSignal: 'SIGTERM',
    });
  } finally {
    closeSync(privateLog);
  }
  if (result.error || result.signal || result.status !== 0) {
    console.error(
      'Release smoke failed; private run state retained for guarded cleanup. No success artifact published.',
    );
    return 1;
  }
  /** @type {unknown} */
  const report = JSON.parse(readFileSync(path.join(directory, 'test-results/release-results.json'), 'utf8'));
  validateReleaseReport(report, phase);
  /** @type {unknown} */
  const value = JSON.parse(readFileSync(path.join(directory, 'test-results/release-receipt.json'), 'utf8'));
  const receipt = validateReleaseReceipt(value, environment);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  rmSync(directory, { recursive: true });
  console.log(`CT-527 ${phase} passed with verified cleanup and exact deployed commits.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runReleaseSmoke(process.argv.slice(2));
  } catch {
    console.error('Release smoke validation failed; no success should be accepted.');
    process.exitCode = 1;
  }
}
