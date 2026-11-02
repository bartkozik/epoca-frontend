import { useQueryClient } from '@tanstack/react-query';
import { invitationQueryKey, invitationsQueryKey } from '../queryKeys';

export function useInvitationInvalidation(): (organizationSlug: string, invitationId: string) => Promise<void> {
  const queryClient = useQueryClient();

  return async (organizationSlug: string, invitationId: string) => {
    // Invalidate existing entries only. A late write must never recreate a cleared logout cache.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: invitationsQueryKey(organizationSlug), exact: true }),
      queryClient.invalidateQueries({ queryKey: invitationQueryKey(organizationSlug, invitationId), exact: true }),
    ]);
  };
}
