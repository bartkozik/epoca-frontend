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

// organizationSlug travels in the mutation's own variables rather than as a hook argument closed
// over by mutationFn/onSuccess: those callbacks always run with the options from the most recent
// render, so if a save starts in organization A and the user switches to B before it resolves, a
// hook-argument organizationSlug would write A's response into B's cache and never refresh A's
// list. Reading it from the variables TanStack captured at the actual mutate() call keeps it tied
// to the request that produced the response, independent of whatever the component re-renders with.
export function useUpdateIntegrationClientMutation(): UseMutationResult<
  IntegrationClient,
  IntegrationClientProblem,
  UpdateIntegrationClientMutationInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationSlug, clientId, input }: UpdateIntegrationClientMutationInput) => {
      const parsed = UpdateIntegrationClientInputSchema.safeParse(input);
      // IntegrationClientProblem is a typed value, not an Error -- callers pattern-match on .kind.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      if (!parsed.success) return Promise.reject(invalidInputProblem);

      return requests.updateIntegrationClient(organizationSlug, clientId, parsed.data).catch((error: unknown) => {
        const problem = normalizeIntegrationClientProblem(error);
        if (problem.kind === 'client-not-found') {
          queryClient.removeQueries({ queryKey: integrationClientQueryKey(organizationSlug, clientId) });
          evictIntegrationClientFromLists(queryClient, organizationSlug, clientId);
        }
        // IntegrationClientProblem is a typed value, not an Error -- callers pattern-match on .kind.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw problem;
      });
    },
    onSuccess: async (client, { organizationSlug }) => {
      // An in-flight details GET for this same key (e.g. the modal's still-open detail query)
      // can resolve after this write with an older response and silently overwrite it -- cancel
      // it first so its result is discarded instead of clobbering the just-saved version.
      await queryClient.cancelQueries({ queryKey: integrationClientQueryKey(organizationSlug, client.clientId) });
      queryClient.setQueryData(integrationClientQueryKey(organizationSlug, client.clientId), client);
      void queryClient.invalidateQueries({ queryKey: [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug], exact: false });
    },
  });
}
