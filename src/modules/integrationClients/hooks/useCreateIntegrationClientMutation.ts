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

// Same rationale as integrationClientUpdateMutation.model.ts: organizationSlug travels in the
// mutation's own variables, not as a hook argument, so a create started in one organization can't
// have its response land in whatever organization the component has re-rendered to by the time it
// resolves.
export function useCreateIntegrationClientMutation(): UseMutationResult<
  OneTimeIntegrationClientSecret,
  IntegrationClientProblem,
  CreateIntegrationClientMutationInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationSlug, input }: CreateIntegrationClientMutationInput) => {
      const parsed = CreateIntegrationClientInputSchema.safeParse(input);
      // IntegrationClientProblem is a typed value, not an Error -- callers pattern-match on .kind.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      if (!parsed.success) return Promise.reject(invalidInputProblem);

      return requests.createIntegrationClient(organizationSlug, parsed.data).catch((error: unknown) => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw normalizeIntegrationClientProblem(error);
      });
    },
    onSuccess: async ({ client }, { organizationSlug }) => {
      // Same rationale as integrationClientUpdateMutation.model.ts: discard a details GET that's
      // still in flight for this client instead of letting it overwrite this write later.
      await queryClient.cancelQueries({ queryKey: integrationClientQueryKey(organizationSlug, client.clientId) });
      queryClient.setQueryData(integrationClientQueryKey(organizationSlug, client.clientId), client);
      void queryClient.invalidateQueries({ queryKey: [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug], exact: false });
    },
    // The result carries a one-time clientSecret that must not outlive the modal that shows it.
    // gcTime: 0 makes this mutation's cache entry eligible for immediate garbage collection once
    // unobserved, so pairing this with the caller's mutation.reset() on modal-close actually purges
    // the secret from the QueryClient's MutationCache, not just the hook's local view of it.
    gcTime: 0,
  });
}
