import teardown from './global-teardown';
import { withLifecycleDeadline } from './network';
import { provisionLiveWorld } from './provisionWorld';
import { releaseEnvironment, verifyReleaseVersions, writeReleaseReceipt } from './releaseEnvironment';

export default async function setup(): Promise<() => Promise<void>> {
  const environment = releaseEnvironment();
  if (environment.phase !== 'deploy') throw new Error('Deploy setup requires deploy phase');
  await withLifecycleDeadline(async (signal) => {
    await verifyReleaseVersions(signal);
    await provisionLiveWorld(signal, environment.runId);
  }, 'Release provisioning');
  return async () => {
    await teardown();
    await writeReleaseReceipt();
  };
}
