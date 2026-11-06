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
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw problem;
  });

export function useRotateIntegrationClientSecretMutation(): UseMutationResult<
  OneTimeIntegrationClientSecret,
  IntegrationClientProblem,
  IntegrationClientVersionMutationInput
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ organizationSlug, clientId, expectedVersion }: IntegrationClientVersionMutationInput) => {
      const parsed = IntegrationClientVersionInputSchema.safeParse({ expectedVersion });
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      if (!parsed.success) return Promise.reject(invalidInputProblem);

      return withProblemHandling(queryClient, organizationSlug, clientId, () =>
        requests.rotateIntegrationClientSecret(organizationSlug, clientId, parsed.data.expectedVersion),
      );
    },
    onSuccess: async ({ client }, { organizationSlug }) => {
      await queryClient.cancelQueries({ queryKey: integrationClientQueryKey(organizationSlug, client.clientId) });
      queryClient.setQueryData(integrationClientQueryKey(organizationSlug, client.clientId), client);
      void queryClient.invalidateQueries({ queryKey: [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug], exact: false });
    },
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
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      if (!parsed.success) return Promise.reject(invalidInputProblem);

      return withProblemHandling(queryClient, organizationSlug, clientId, () =>
        requests.revokeIntegrationClient(organizationSlug, clientId, parsed.data.expectedVersion),
      );
    },
    onSuccess: async (client, { organizationSlug }) => {
      await queryClient.cancelQueries({ queryKey: integrationClientQueryKey(organizationSlug, client.clientId) });
      queryClient.setQueryData(integrationClientQueryKey(organizationSlug, client.clientId), client);
      void queryClient.invalidateQueries({ queryKey: [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug], exact: false });
    },
  });
}
