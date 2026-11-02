import { unlink } from 'node:fs/promises';
import { loadLiveTarget } from './guard';
import { LIVE_MANIFEST_PATH } from './metadata';
import { withLifecycleDeadline } from './network';
import { authenticateOwnerForCleanup, cleanupOwnedLiveData } from './provisionWorld';
import { readActiveLiveRunIdentity, readBoundLiveRunManifest, releaseLiveRunLock } from './runState';

export default async function globalTeardown(): Promise<void> {
  await withLifecycleDeadline(async (signal) => {
    signal.throwIfAborted();
    const identity = await readActiveLiveRunIdentity();
    const configuredTarget = loadLiveTarget();
    const manifest = await readBoundLiveRunManifest(identity, configuredTarget);
    const { ownerToken, target } = await authenticateOwnerForCleanup(manifest, configuredTarget, signal);
    await cleanupOwnedLiveData(manifest, target, ownerToken, signal);
    const cleaned = await readBoundLiveRunManifest(identity, target);
    if (
      cleaned.owned.clientIds.length > 0 ||
      cleaned.owned.projectIds.length > 0 ||
      cleaned.owned.workUnitIds.length > 0 ||
      cleaned.intents.length > 0 ||
      cleaned.quarantined.length > 0
    ) {
      throw new Error('Guarded live teardown left unresolved ownership evidence');
    }
    signal.throwIfAborted();
    await releaseLiveRunLock(identity);
    await unlink(LIVE_MANIFEST_PATH);
  }, 'Guarded live teardown');
}
