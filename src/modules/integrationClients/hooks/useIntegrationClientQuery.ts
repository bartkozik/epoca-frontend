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
        // Deliberately does NOT removeQueries its own key here -- this queryFn is that query's own
        // active fetch, and removing it mid-flight orphans the observer so it never sees the reject.
        // The error state alone (read via this hook's .error) is enough for a caller to react to.
        if (problem.kind === 'client-not-found') {
          evictIntegrationClientFromLists(queryClient, organizationSlug, clientId);
        }
        // IntegrationClientProblem is a typed value, not an Error -- callers pattern-match on .kind.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw problem;
      }),
    enabled: organizationSlug !== '' && clientId !== '',
    // Opening a client's details must confirm the server's current version before lifecycle actions
    // (which carry that version for optimistic-concurrency checks) are enabled. This hook's observer
    // stays mounted continuously in Integrations.tsx -- only `clientId` toggles between a real id and
    // '' (disabled) as the details view opens/closes -- so `refetchOnMount` never applies (it only
    // governs true observer-subscribe events, not an already-mounted observer's key changing).
    // staleTime: 0 instead makes every re-enable (closed -> reopened) a genuine network read, since
    // TanStack re-checks staleness whenever `enabled` flips back to true.
    staleTime: 0,
  });
}
