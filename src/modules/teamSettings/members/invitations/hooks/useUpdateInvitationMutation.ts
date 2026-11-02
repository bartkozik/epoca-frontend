import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { InvitationDto } from '../models/invitationDto.model';
import type { InvitationUpdate } from '../models/invitationUpdate.model';
import type { InvitationProblem } from '../problem';
import { updateInvitation } from '../requests';
import { useInvitationInvalidation } from './useInvitationInvalidation';

export interface UpdateInvitationVariables {
  organizationSlug: string;
  invitationId: string;
  input: InvitationUpdate;
}

export function useUpdateInvitationMutation(): UseMutationResult<
  InvitationDto,
  InvitationProblem,
  UpdateInvitationVariables
> {
  const invalidate = useInvitationInvalidation();

  return useMutation<InvitationDto, InvitationProblem, UpdateInvitationVariables>({
    mutationFn: ({ organizationSlug, invitationId, input }) => updateInvitation(organizationSlug, invitationId, input),
    onSuccess: (_response, { organizationSlug, invitationId }) => invalidate(organizationSlug, invitationId),
    retry: false,
    gcTime: 0,
  });
}
