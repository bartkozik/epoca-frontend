import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { getAggregateCommands } from '../run-e2e-aggregate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** @param {string} relative */
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');

const configSchema = z.object({
  grepInvert: z.string().optional(),
  use: z.record(z.unknown()),
  projects: z.array(z.object({ name: z.string() })),
  outputDir: z.string(),
  reporter: z.array(z.tuple([z.string(), z.object({ outputFile: z.string().optional() }).optional()])),
});

const evaluateConfig = (argv = [], environment = {}) => {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PLAYWRIGHT_')) delete env[key];
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-strip-types',
      '--input-type=module',
      '--eval',
      `
    process.argv = ${JSON.stringify(argv)};
    const { default: config } = await import('./playwright.config.ts');
    console.log(JSON.stringify(config, (_, value) => value instanceof RegExp ? value.source : value));
  `,
    ],
    { cwd: root, env: { ...env, ...environment, CI: 'true' }, encoding: 'utf8', timeout: 5000 },
  );
  return { ...result, config: result.status === 0 ? configSchema.parse(JSON.parse(result.stdout)) : undefined };
};

void test('normal mocks keep diagnostics; sensitive OAuth mocks disable capture and isolate reports', () => {
  const normal = evaluateConfig();
  assert.equal(normal.status, 0, normal.stderr);
  assert.equal(normal.config.grepInvert, '@oauth-client');
  assert.equal(normal.config.use.screenshot, 'only-on-failure');
  assert.equal(normal.config.use.trace, 'on-first-retry');
  assert.equal(normal.config.projects.length, 3);
  for (const argv of [
    ['--grep', '@mr.*@oauth-client|@oauth-client.*@mr'],
    ['--grep=@mr.*@oauth-client|@oauth-client.*@mr'],
  ]) {
    const targeted = evaluateConfig(argv, { PLAYWRIGHT_OAUTH_CLIENT_TARGETED: 'true' });
    assert.equal(targeted.status, 0, targeted.stderr);
    const config = targeted.config;
    assert.equal(config.grepInvert, undefined);
    for (const option of ['screenshot', 'trace', 'video']) assert.equal(config.use[option], 'off');
    assert.deepEqual(
      config.projects.map(({ name }) => name),
      ['mock-chromium'],
    );
    assert.notEqual(config.outputDir, normal.config.outputDir);
    assert.notEqual(config.reporter[1][1].outputFile, normal.config.reporter[1][1].outputFile);
  }
});

void test('mock selector fails closed on invalid markers and broad grep, and retains worker inheritance', () => {
  for (const [argv, marker] of [
    [[], 'invalid'],
    [[], 'true'],
    [['--grep', '@mr'], 'true'],
  ]) {
    assert.notEqual(evaluateConfig(argv, { PLAYWRIGHT_OAUTH_CLIENT_TARGETED: marker }).status, 0);
  }
  const worker = evaluateConfig([], { PLAYWRIGHT_OAUTH_CLIENT_TARGETED_RESOLVED: 'true' });
  assert.equal(worker.status, 0, worker.stderr);
  assert.equal(worker.config.use.trace, 'off');
});

void test('CI and full aggregates run normal discovery plus the guarded OAuth client mock command', () => {
  for (const tier of ['ci', 'all']) {
    const commands = getAggregateCommands(tier);
    assert.ok(commands.some((command) => command.includes('test:e2e:mock:oauth-client')));
    assert.ok(commands.some((command) => command[0] === 'playwright' && command[1] === 'test'));
  }
  const wrapper = read('scripts/e2e/run-oauth-client-mock.mjs');
  assert.match(wrapper, /PLAYWRIGHT_OAUTH_CLIENT_TARGETED/);
  assert.match(wrapper, /--project=mock-chromium/);
  assert.match(wrapper, /@mr\.\*@oauth-client\|@oauth-client\.\*@mr/);
});

void test('CI validates OAuth client security contracts and scans before publishing aggregate artifacts', () => {
  const ci = read('.gitlab-ci.yml');
  for (const contract of [
    'oauth-client-mock-target.test.mjs',
    'request-journal.test.mjs',
    'integration-client-audit.test.mjs',
    'oauth-client-lifecycle.test.mjs',
  ]) {
    assert.match(ci, new RegExp(contract.replaceAll('.', '\\.')));
  }
  const mrJob = ci.slice(ci.indexOf('e2e_mr:'), ci.indexOf('e2e_full:'));
  assert.ok(mrJob.indexOf('test:e2e:ci') < mrJob.indexOf('artifact-scanner.mjs'));
  assert.match(mrJob, /paths:\n\s+- safe-artifacts\//);
  assert.doesNotMatch(mrJob, /paths:\n(?:\s+- (?!safe-artifacts)[^\n]+\n)+/);
});
