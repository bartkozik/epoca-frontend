import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { InvitationPage } from '../models/invitationList.model';
import type { InvitationProblem } from '../problem';
import { invitationsQueryKey } from '../queryKeys';
import { listAllInvitations } from '../requests';
import { isListedInvitation } from '../utils/invitation-management';

export function useInvitationsQuery(organizationSlug: string): UseQueryResult<InvitationPage, InvitationProblem> {
  return useQuery<InvitationPage, InvitationProblem>({
    queryKey: invitationsQueryKey(organizationSlug),
    queryFn: ({ signal }) => listAllInvitations(organizationSlug, signal),
    enabled: organizationSlug !== '',
    staleTime: 0,
    refetchIntervalInBackground: false,
    refetchInterval: (query) =>
      !query.state.error &&
      query.state.data?.results.some(
        (invitation) => isListedInvitation(invitation) && invitation.delivery.status === 'Started',
      )
        ? 2_000
        : false,
  });
}
