import { type IntegrationClient } from '@/modules/integrationClients/models/integrationClientDto.model';
import type { IntegrationClientPage } from '@/modules/integrationClients/models/integrationClientList.model';
import { INTEGRATION_CLIENTS_LIST_KEY } from '@/modules/integrationClients/queryKeys';
import type { QueryClient } from '@tanstack/react-query';

export function evictIntegrationClientFromLists(
  queryClient: QueryClient,
  organizationSlug: string,
  clientId: string,
): void {
  queryClient.setQueriesData<IntegrationClientPage>(
    { queryKey: [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug], exact: false },
    (page) => {
      if (page === undefined) return page;
      // Guard against double-decrementing count when a client is evicted twice for the same
      // not-found error (e.g. the details query and the audit-events query 404 concurrently and
      // both call this) -- only recompute a page that actually still contains the client.
      const wasPresent = page.results.some((client) => client.clientId === clientId);
      if (!wasPresent) return page;
      return {
        ...page,
        results: page.results.filter((client) => client.clientId !== clientId),
        count: Math.max(0, page.count - 1),
      };
    },
  );
  void queryClient.invalidateQueries({ queryKey: [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug], exact: false });
}

export function patchIntegrationClientInLists(
  queryClient: QueryClient,
  organizationSlug: string,
  client: IntegrationClient,
): void {
  queryClient.setQueriesData<IntegrationClientPage>(
    { queryKey: [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug], exact: false },
    (page) =>
      page === undefined
        ? page
        : {
            ...page,
            results: page.results.map((listedClient) =>
              listedClient.clientId === client.clientId ? client : listedClient,
            ),
          },
  );
}
