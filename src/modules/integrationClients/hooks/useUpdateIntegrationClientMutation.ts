import { type IntegrationClient } from '@/modules/integrationClients/models/integrationClientDto.model';
import { UpdateIntegrationClientInputSchema } from '@/modules/integrationClients/models/integrationClientUpdate.model';
import { invalidInputProblem, normalizeIntegrationClientProblem } from '@/modules/integrationClients/problem';
import { evictIntegrationClientFromLists } from '@/modules/integrationClients/queryCache';
import { INTEGRATION_CLIENTS_LIST_KEY, integrationClientQueryKey } from '@/modules/integrationClients/queryKeys';
import * as requests from '@/modules/integrationClients/requests';
import type { IntegrationClientProblem, UpdateIntegrationClientInput } from '@/modules/integrationClients/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface UpdateIntegrationClientMutationInput {
  organizationSlug: string;
  clientId: string;
  input: UpdateIntegrationClientInput;
}

// Capture organizationSlug in mutation variables so a workspace switch cannot write the response into another cache.
export function useUpdateIntegrationClientMutation(): UseMutationResult<
  IntegrationClient,
  IntegrationClientProblem,
  UpdateIntegrationClientMutationInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationSlug, clientId, input }: UpdateIntegrationClientMutationInput) => {
      const parsed = UpdateIntegrationClientInputSchema.safeParse(input);
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      if (!parsed.success) return Promise.reject(invalidInputProblem);

      return requests.updateIntegrationClient(organizationSlug, clientId, parsed.data).catch((error: unknown) => {
        const problem = normalizeIntegrationClientProblem(error);
        if (problem.kind === 'client-not-found') {
          queryClient.removeQueries({ queryKey: integrationClientQueryKey(organizationSlug, clientId) });
          evictIntegrationClientFromLists(queryClient, organizationSlug, clientId);
        }
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw problem;
      });
    },
    onSuccess: async (client, { organizationSlug }) => {
      // Cancel older detail reads before they can overwrite the saved version.
      await queryClient.cancelQueries({ queryKey: integrationClientQueryKey(organizationSlug, client.clientId) });
      queryClient.setQueryData(integrationClientQueryKey(organizationSlug, client.clientId), client);
      void queryClient.invalidateQueries({ queryKey: [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug], exact: false });
    },
  });
}
