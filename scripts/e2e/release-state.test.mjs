import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertPrivateStateRoot, isExpiredReleaseRun } from './release-state.mjs';

void test('janitor requires a private absolute real directory', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'ct527-state-'));
  try {
    assert.equal(assertPrivateStateRoot(root), root);
    assert.throws(() => assertPrivateStateRoot('relative'));
    mkdirSync(path.join(root, 'public'), { mode: 0o755 });
    assert.throws(() => assertPrivateStateRoot(path.join(root, 'public')));
    symlinkSync(root, path.join(root, 'link'));
    assert.throws(() => assertPrivateStateRoot(path.join(root, 'link')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
void test('janitor requires exact CT527 deploy run identity and 24-hour minimum age', () => {
  const now = Date.now();
  assert.equal(isExpiredReleaseRun('ct527-test-001-deploy', now - 86_400_001, now), true);
  for (const name of ['ct530-test-001-deploy', 'ct527-test-001-rollback', '../ct527-test-deploy'])
    assert.equal(isExpiredReleaseRun(name, 0, now), false);
  assert.equal(isExpiredReleaseRun('ct527-test-001-deploy', now - 60_000, now), false);
});
