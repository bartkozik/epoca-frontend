import { type IntegrationClient } from '@/modules/integrationClients/models/integrationClientDto.model';
import { normalizeIntegrationClientProblem } from '@/modules/integrationClients/problem';
import { evictIntegrationClientFromLists } from '@/modules/integrationClients/queryCache';
import { integrationClientQueryKey } from '@/modules/integrationClients/queryKeys';
import * as requests from '@/modules/integrationClients/requests';
import type { IntegrationClientProblem } from '@/modules/integrationClients/types';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

export function useIntegrationClientQuery(
  organizationSlug: string,
  clientId: string,
): UseQueryResult<IntegrationClient, IntegrationClientProblem> {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: integrationClientQueryKey(organizationSlug, clientId),
    queryFn: () =>
      requests.getIntegrationClient(organizationSlug, clientId).catch((error: unknown) => {
        const problem = normalizeIntegrationClientProblem(error);
        // Removing this actively fetching query would orphan its observer before it receives the rejection.
        if (problem.kind === 'client-not-found') {
          evictIntegrationClientFromLists(queryClient, organizationSlug, clientId);
        }
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw problem;
      }),
    enabled: organizationSlug !== '' && clientId !== '',
    // The observer stays mounted across reopenings; staleTime: 0 forces a fresh version before lifecycle actions.
    staleTime: 0,
  });
}
