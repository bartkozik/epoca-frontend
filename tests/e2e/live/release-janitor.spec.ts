import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { withReleaseLock } from '../../../scripts/e2e/release-lock.mjs';
import { assertPrivateStateRoot } from '../../../scripts/e2e/release-state.mjs';
import teardown from './global-teardown';
import { loadLiveTarget } from './guard';
import { LIVE_MANIFEST_PATH } from './metadata';
import { releaseRunId } from './releasePolicy';
import { readActiveLiveRunIdentity, readBoundLiveRunManifest } from './runState';

test('CT-527 janitor reuses exact bound ownership cleanup', async () => {
  if (process.env.EPOCA_RELEASE_JANITOR !== 'true') throw new Error('Janitor requires explicit opt-in');
  const runId = releaseRunId(process.env.EPOCA_RELEASE_RUN_ID ?? '');
  const root = assertPrivateStateRoot(process.env.EPOCA_RELEASE_STATE_ROOT);
  const lockDirectory = path.join(root, '.janitor-locks');
  mkdirSync(lockDirectory, { recursive: true, mode: 0o700 });
  assertPrivateStateRoot(lockDirectory);
  await withReleaseLock(path.join(lockDirectory, `${runId}-deploy.lock`), async () => {
    if (!existsSync(LIVE_MANIFEST_PATH)) return;
    const identity = await readActiveLiveRunIdentity();
    if (identity.runId !== runId) throw new Error('Janitor run binding differs');
    await readBoundLiveRunManifest(identity, loadLiveTarget());
    await teardown();
  });
});
