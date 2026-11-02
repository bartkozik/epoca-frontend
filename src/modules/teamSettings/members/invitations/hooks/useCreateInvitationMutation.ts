import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { InvitationCreateSchema, type InvitationCreate } from '../models/invitationCreate.model';
import type { InvitationDto } from '../models/invitationDto.model';
import { parseInvitationInput, type InvitationProblem } from '../problem';
import { createInvitation } from '../requests';
import { useInvitationIdempotency } from './useInvitationIdempotency';
import { useInvitationInvalidation } from './useInvitationInvalidation';

export interface CreateInvitationVariables {
  organizationSlug: string;
  input: InvitationCreate;
  /** Change when explicitly starting a new logical attempt, e.g. reopening a form. */
  attemptId?: string;
}

export function useCreateInvitationMutation(): UseMutationResult<
  InvitationDto,
  InvitationProblem,
  CreateInvitationVariables
> {
  const execute = useInvitationIdempotency();
  const invalidate = useInvitationInvalidation();

  return useMutation<InvitationDto, InvitationProblem, CreateInvitationVariables>({
    mutationFn: async ({ organizationSlug, input, attemptId }) => {
      const body = parseInvitationInput(InvitationCreateSchema, input);

      return execute([organizationSlug], body, (key) => createInvitation(organizationSlug, body, key), attemptId);
    },
    onSuccess: (response, { organizationSlug }) => invalidate(organizationSlug, response.id),
    retry: false,
    gcTime: 0,
  });
}
