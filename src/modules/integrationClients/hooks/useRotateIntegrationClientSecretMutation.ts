import {
  type IntegrationClient,
  type OneTimeIntegrationClientSecret,
} from '@/modules/integrationClients/models/integrationClientDto.model';
import { IntegrationClientVersionInputSchema } from '@/modules/integrationClients/models/integrationClientVersion.model';
import { invalidInputProblem, normalizeIntegrationClientProblem } from '@/modules/integrationClients/problem';
import { evictIntegrationClientFromLists } from '@/modules/integrationClients/queryCache';
import { INTEGRATION_CLIENTS_LIST_KEY, integrationClientQueryKey } from '@/modules/integrationClients/queryKeys';
import * as requests from '@/modules/integrationClients/requests';
import type { IntegrationClientProblem } from '@/modules/integrationClients/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface IntegrationClientVersionMutationInput {
  organizationSlug: string;
  clientId: string;
  expectedVersion: number;
}

// Both mutations below share this catch: normalize, evict the client from every cache on
// client-not-found, then rethrow so the caller's mutation.error still carries the typed problem
// (including 'stale-version', which the UI prompts a refetch/confirmation for).
const withProblemHandling = <T>(
  queryClient: ReturnType<typeof useQueryClient>,
  organizationSlug: string,
  clientId: string,
  request: () => Promise<T>,
): Promise<T> =>
  request().catch((error: unknown) => {
    const problem = normalizeIntegrationClientProblem(error);
    if (problem.kind === 'client-not-found') {
      queryClient.removeQueries({ queryKey: integrationClientQueryKey(organizationSlug, clientId) });
      evictIntegrationClientFromLists(queryClient, organizationSlug, clientId);
    }
    // IntegrationClientProblem is a typed value, not an Error -- callers pattern-match on .kind.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw problem;
  });

// Same rationale as integrationClientUpdateMutation.model.ts: organizationSlug travels in the
// mutation's own variables, not as a hook argument, so a rotate/revoke started in one organization
// can't have its response land in whatever organization the component has re-rendered to by the
// time it resolves.
export function useRotateIntegrationClientSecretMutation(): UseMutationResult<
  OneTimeIntegrationClientSecret,
  IntegrationClientProblem,
  IntegrationClientVersionMutationInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationSlug, clientId, expectedVersion }: IntegrationClientVersionMutationInput) => {
      const parsed = IntegrationClientVersionInputSchema.safeParse({ expectedVersion });
      // IntegrationClientProblem is a typed value, not an Error -- callers pattern-match on .kind.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      if (!parsed.success) return Promise.reject(invalidInputProblem);

      return withProblemHandling(queryClient, organizationSlug, clientId, () =>
        requests.rotateIntegrationClientSecret(organizationSlug, clientId, parsed.data.expectedVersion),
      );
    },
    onSuccess: async ({ client }, { organizationSlug }) => {
      // Same rationale as integrationClientUpdateMutation.model.ts: discard a details GET that's
      // still in flight for this client instead of letting it overwrite this write later.
      await queryClient.cancelQueries({ queryKey: integrationClientQueryKey(organizationSlug, client.clientId) });
      queryClient.setQueryData(integrationClientQueryKey(organizationSlug, client.clientId), client);
      void queryClient.invalidateQueries({ queryKey: [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug], exact: false });
    },
    // Same rationale as integrationClientCreateMutation.model.ts: the result carries a one-time
    // clientSecret, so pair gcTime: 0 with the caller's mutation.reset() on modal-close to actually
    // purge it from the MutationCache rather than just the hook's local view of it.
    gcTime: 0,
  });
}

export function useRevokeIntegrationClientMutation(): UseMutationResult<
  IntegrationClient,
  IntegrationClientProblem,
  IntegrationClientVersionMutationInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationSlug, clientId, expectedVersion }: IntegrationClientVersionMutationInput) => {
      const parsed = IntegrationClientVersionInputSchema.safeParse({ expectedVersion });
      // IntegrationClientProblem is a typed value, not an Error -- callers pattern-match on .kind.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      if (!parsed.success) return Promise.reject(invalidInputProblem);

      return withProblemHandling(queryClient, organizationSlug, clientId, () =>
        requests.revokeIntegrationClient(organizationSlug, clientId, parsed.data.expectedVersion),
      );
    },
    onSuccess: async (client, { organizationSlug }) => {
      // Same rationale as integrationClientUpdateMutation.model.ts: discard a details GET that's
      // still in flight for this client instead of letting it overwrite this write later.
      await queryClient.cancelQueries({ queryKey: integrationClientQueryKey(organizationSlug, client.clientId) });
      queryClient.setQueryData(integrationClientQueryKey(organizationSlug, client.clientId), client);
      void queryClient.invalidateQueries({ queryKey: [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug], exact: false });
    },
  });
}
