import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { InvitationCancel } from '../models/invitationCancel.model';
import type { InvitationProblem } from '../problem';
import { cancelInvitation } from '../requests';
import { useInvitationInvalidation } from './useInvitationInvalidation';

export interface CancelInvitationVariables {
  organizationSlug: string;
  invitationId: string;
  input: InvitationCancel;
}

export function useCancelInvitationMutation(): UseMutationResult<void, InvitationProblem, CancelInvitationVariables> {
  const invalidate = useInvitationInvalidation();

  return useMutation<void, InvitationProblem, CancelInvitationVariables>({
    mutationFn: ({ organizationSlug, invitationId, input }) => cancelInvitation(organizationSlug, invitationId, input),
    onSuccess: (_response, { organizationSlug, invitationId }) => invalidate(organizationSlug, invitationId),
    retry: false,
    gcTime: 0,
  });
}
