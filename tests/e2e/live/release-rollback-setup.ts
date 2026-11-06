import { withLifecycleDeadline } from './network';
import { releaseEnvironment, verifyReleaseVersions, writeReleaseReceipt } from './releaseEnvironment';
import { assertNoExistingLiveRunState } from './runState';

// Rollback verification must not provision or write data using the new version.
export default async function setup(): Promise<() => Promise<void>> {
  if (releaseEnvironment().phase !== 'rollback') throw new Error('Rollback setup requires rollback phase');
  await assertNoExistingLiveRunState();
  await withLifecycleDeadline(verifyReleaseVersions, 'Rollback read-only preflight');
  return writeReleaseReceipt;
}
