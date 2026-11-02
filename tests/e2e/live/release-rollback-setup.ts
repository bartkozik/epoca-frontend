import { withLifecycleDeadline } from './network';
import { releaseEnvironment, verifyReleaseVersions, writeReleaseReceipt } from './releaseEnvironment';
import { assertNoExistingLiveRunState } from './runState';

// Deliberately no provisioning/cleanup imports: rollback cannot write new-version data.
export default async function setup(): Promise<() => Promise<void>> {
  if (releaseEnvironment().phase !== 'rollback') throw new Error('Rollback setup requires rollback phase');
  await assertNoExistingLiveRunState();
  await withLifecycleDeadline(verifyReleaseVersions, 'Rollback read-only preflight');
  return writeReleaseReceipt;
}
