import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { InvitationDto } from '../models/invitationDto.model';
import type { InvitationProblem } from '../problem';
import { invitationQueryKey } from '../queryKeys';
import { getInvitation } from '../requests';

export function useInvitationQuery(
  organizationSlug: string,
  invitationId: string,
): UseQueryResult<InvitationDto, InvitationProblem> {
  return useQuery<InvitationDto, InvitationProblem>({
    queryKey: invitationQueryKey(organizationSlug, invitationId),
    queryFn: ({ signal }) => getInvitation(organizationSlug, invitationId, signal),
    enabled: organizationSlug !== '' && invitationId !== '',
    staleTime: 0,
  });
}
