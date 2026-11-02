import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { InvitationDto } from '../models/invitationDto.model';
import { InvitationResendSchema, type InvitationResend } from '../models/invitationResend.model';
import { parseInvitationInput, type InvitationProblem } from '../problem';
import { resendInvitation } from '../requests';
import { useInvitationIdempotency } from './useInvitationIdempotency';
import { useInvitationInvalidation } from './useInvitationInvalidation';

export interface ResendInvitationVariables {
  organizationSlug: string;
  invitationId: string;
  input: InvitationResend;
  attemptId?: string;
}

export function useResendInvitationMutation(): UseMutationResult<
  InvitationDto,
  InvitationProblem,
  ResendInvitationVariables
> {
  const execute = useInvitationIdempotency();
  const invalidate = useInvitationInvalidation();

  return useMutation<InvitationDto, InvitationProblem, ResendInvitationVariables>({
    mutationFn: async ({ organizationSlug, invitationId, input, attemptId }) => {
      const body = parseInvitationInput(InvitationResendSchema, input);

      return execute(
        [organizationSlug, invitationId],
        body,
        (key) => resendInvitation(organizationSlug, invitationId, body, key),
        attemptId,
      );
    },
    onSuccess: (_response, { organizationSlug, invitationId }) => invalidate(organizationSlug, invitationId),
    retry: false,
    gcTime: 0,
  });
}
