import { CreateIntegrationClientInputSchema } from '@/modules/integrationClients/models/integrationClientCreate.model';
import { type OneTimeIntegrationClientSecret } from '@/modules/integrationClients/models/integrationClientDto.model';
import { invalidInputProblem, normalizeIntegrationClientProblem } from '@/modules/integrationClients/problem';
import { INTEGRATION_CLIENTS_LIST_KEY, integrationClientQueryKey } from '@/modules/integrationClients/queryKeys';
import * as requests from '@/modules/integrationClients/requests';
import type { CreateIntegrationClientInput, IntegrationClientProblem } from '@/modules/integrationClients/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface CreateIntegrationClientMutationInput {
  organizationSlug: string;
  input: CreateIntegrationClientInput;
}

export function useCreateIntegrationClientMutation(): UseMutationResult<
  OneTimeIntegrationClientSecret,
  IntegrationClientProblem,
  CreateIntegrationClientMutationInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationSlug, input }: CreateIntegrationClientMutationInput) => {
      const parsed = CreateIntegrationClientInputSchema.safeParse(input);
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      if (!parsed.success) return Promise.reject(invalidInputProblem);

      return requests.createIntegrationClient(organizationSlug, parsed.data).catch((error: unknown) => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw normalizeIntegrationClientProblem(error);
      });
    },
    onSuccess: async ({ client }, { organizationSlug }) => {
      await queryClient.cancelQueries({ queryKey: integrationClientQueryKey(organizationSlug, client.clientId) });
      queryClient.setQueryData(integrationClientQueryKey(organizationSlug, client.clientId), client);
      void queryClient.invalidateQueries({ queryKey: [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug], exact: false });
    },
    // Pair gcTime: 0 with reset() on close to remove one-time secrets from MutationCache.
    gcTime: 0,
  });
}
