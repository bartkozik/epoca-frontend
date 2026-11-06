import { normalizeIntegrationClientProblem } from '@/modules/integrationClients/problem';
import { integrationClientsQueryKey } from '@/modules/integrationClients/queryKeys';
import * as requests from '@/modules/integrationClients/requests';
import type { IntegrationClient, IntegrationClientProblem } from '@/modules/integrationClients/types';
import { useCallback, useMemo, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';

const PAGE_SIZE = 20;

export type ListRequestState = 'idle' | 'loading' | 'success' | 'error';

export interface IntegrationClientsListResult {
  clients: IntegrationClient[];
  count: number;
  state: ListRequestState;
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  error: IntegrationClientProblem | null;
  hasNextPage: boolean;
  loadMore: () => void;
  retry: () => void;
  reset: () => void;
}

export function useIntegrationClientsList(organizationSlug: string): IntegrationClientsListResult {
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const [lastOrganizationSlug, setLastOrganizationSlug] = useState(organizationSlug);
  const queryClient = useQueryClient();

  // Reset during render on workspace changes; an effect runs too late to prevent queries for old page counts.
  if (organizationSlug !== lastOrganizationSlug) {
    setLastOrganizationSlug(organizationSlug);
    setPagesLoaded(1);
  }

  const queries = useQueries({
    queries: Array.from({ length: pagesLoaded }, (_, index) => {
      const pageNumber = index + 1;
      const params = { pageSize: PAGE_SIZE, pageNumber };
      return {
        queryKey: integrationClientsQueryKey(organizationSlug, params),
        queryFn: () =>
          requests.listIntegrationClients(organizationSlug, params).catch((error: unknown) => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw normalizeIntegrationClientProblem(error);
          }),
        enabled: organizationSlug !== '',
      };
    }),
  });

  const clients = useMemo(() => {
    const merged = new Map<string, IntegrationClient>();
    queries.forEach((query) => {
      query.data?.results.forEach((client) => merged.set(client.clientId, client));
    });
    return Array.from(merged.values());
  }, [queries]);

  const firstQuery = queries[0];
  const lastQuery = queries[queries.length - 1];
  const count = queries.reduce((result, query) => query.data?.count ?? result, 0);
  const isInitialLoading = pagesLoaded === 1 && (firstQuery?.isLoading ?? false);
  const isLoadingMore = pagesLoaded > 1 && (lastQuery?.isFetching ?? false);
  const failedQuery = queries.find((query) => query.isError);
  const hasError = failedQuery !== undefined;
  const error = (failedQuery?.error ?? null) as IntegrationClientProblem | null;
  const state: ListRequestState = hasError
    ? 'error'
    : isInitialLoading || isLoadingMore
      ? 'loading'
      : (firstQuery?.isSuccess ?? false)
        ? 'success'
        : 'idle';
  const hasNextPage = clients.length < count;

  const loadMore = useCallback(() => {
    if (queries.some((query) => query.isFetching)) return;
    setPagesLoaded((current) => current + 1);
  }, [queries]);

  const retry = useCallback(() => {
    if (queries.some((query) => query.isFetching)) return;
    void queryClient.refetchQueries({ queryKey: ['integrationClients', organizationSlug], exact: false });
  }, [organizationSlug, queries, queryClient]);

  const reset = useCallback(() => setPagesLoaded(1), []);

  return { clients, count, state, isInitialLoading, isLoadingMore, error, hasNextPage, loadMore, retry, reset };
}
