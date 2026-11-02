import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');
const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

void test('Playwright JSON reporter writes parseable JSON to stdout', () => {
  const result = spawnSync(
    process.execPath,
    [
      playwrightCli,
      'test',
      'tests/e2e/runner.contract.spec.ts',
      '--project=mock-chromium',
      '--list',
      '--reporter=json',
    ],
    { cwd: repositoryRoot, encoding: 'utf8' }
  );

  assert.equal(result.status, 0, result.stderr);
  let report;
  assert.doesNotThrow(() => {
    report = JSON.parse(result.stdout);
  }, result.stdout);
  assert.deepEqual(
    report.suites.map(({ file }) => file),
    ['runner.contract.spec.ts']
  );
});
