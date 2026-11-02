import assert from 'node:assert/strict';
import test from 'node:test';
import { runAggregateE2E } from '../run-e2e-aggregate.mjs';

for (const tier of ['ci', 'all']) {
  void test(`${tier} listing forwards --list to every child and marks discovery only`, () => {
    const calls = [];
    assert.equal(runAggregateE2E({ tier, listOnly: true, environment: {}, spawnImpl: (...args) => {
      calls.push(args);
      return { status: 0 };
    } }), 0);
    assert.equal(calls.length, 4);
    for (const [, argv, options] of calls) {
      assert.equal(argv.at(-1), '--list');
      assert.equal(options.env.EPOCA_E2E_LIST_ONLY, 'true');
    }
  });
}

void test('aggregate stops on failure and preserves termination errors', () => {
  let calls = 0;
  assert.equal(runAggregateE2E({ tier: 'ci', spawnImpl: () => { calls += 1; return { status: 7 }; } }), 7);
  assert.equal(calls, 1);
  assert.throws(() => runAggregateE2E({ tier: 'ci', spawnImpl: () => ({ signal: 'SIGTERM' }) }), /SIGTERM/);
  assert.throws(() => runAggregateE2E({ tier: 'unknown', spawnImpl: () => assert.fail('must not spawn') }), /Unknown/);
});

void test('aggregate and targeted wrappers reject unsupported CLI arguments before launching tests', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const [script, args] of [
    ['scripts/run-e2e-aggregate.mjs', ['ci', '--unsupported']],
    ['scripts/e2e/run-oauth-client-mock.mjs', ['--grep', '@mr']],
    ['scripts/e2e/run-oauth-client-live.mjs', ['--unsupported']],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 5000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Usage|optional --list/);
  }
});

void test('targeted mock wrapper forwards --list to real Playwright discovery', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, ['scripts/e2e/run-oauth-client-mock.mjs', '--list'], {
    env: { ...process.env, CI: 'true', EPOCA_E2E_LIST_ONLY: 'true' },
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Listing tests:/);
  assert.match(result.stdout, /@oauth-client/);
  assert.doesNotMatch(result.stdout, /Running \d+ tests/);
});
