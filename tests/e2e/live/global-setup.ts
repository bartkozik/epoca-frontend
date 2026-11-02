import { assertOAuthClientTargetedSelection } from './oauthClientTargetGuard';
import { withLifecycleDeadline } from './network';
import { provisionLiveWorld } from './provisionWorld';

export default async function globalSetup(): Promise<void> {
  assertOAuthClientTargetedSelection();
  await withLifecycleDeadline(provisionLiveWorld, 'Guarded live provisioning');
}
