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

// TanStack has no built-in "N independently-cached pages accumulated into one list" primitive that
// also shares cache entries (and therefore invalidation) with the rest of this module's mutations --
// useInfiniteQuery keeps its pages in one opaque cache entry, which the mutation hooks'
// setQueriesData/invalidateQueries (keyed per page) can't reach into. useQueries lets
// each loaded page remain its own cache entry under the same integrationClientsQueryKey, so a
// create/update/rotate/revoke's list invalidation (see integrationClients/queryCache.ts's
// evictIntegrationClientFromLists and every mutation's onSuccess) refetches every page this hook has
// loaded, exactly like the old store's "refresh page one, merge into the accumulated list" behavior.
export function useIntegrationClientsList(organizationSlug: string): IntegrationClientsListResult {
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const [lastOrganizationSlug, setLastOrganizationSlug] = useState(organizationSlug);
  const queryClient = useQueryClient();

  // Integrations.tsx isn't remounted on an organization switch, so accumulated pages from the
  // previous organization must be dropped. Adjusting state during render (React's documented
  // pattern for deriving state from a changed prop) rather than in a useEffect matters here: an
  // effect-based reset still lets useQueries build and fire one query per previously-loaded page for
  // the NEW organizationSlug on the render where the prop already changed but pagesLoaded hasn't
  // been reset yet -- the effect only cleans that up one render too late. This throws away that
  // render's output and re-renders immediately with pagesLoaded already back to 1, before useQueries
  // ever sees the new organizationSlug with a stale page count.
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
            // IntegrationClientProblem is a deliberate RFC7807-style discriminated union, not an
            // Error -- every caller already treats query/mutation errors as `unknown` and reads
            // `.kind` off them.
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
  // The newest page's own data is undefined for the whole duration its fetch is in flight -- reading
  // count from it alone would flicker to 0 mid-pagination. Walk forward and keep the most recent
  // page that actually has data, so an in-flight next page doesn't blank out a known-good total.
  const count = queries.reduce((result, query) => query.data?.count ?? result, 0);
  const isInitialLoading = pagesLoaded === 1 && (firstQuery?.isLoading ?? false);
  const isLoadingMore = pagesLoaded > 1 && (lastQuery?.isFetching ?? false);
  const failedQuery = queries.find((query) => query.isError);
  const hasError = failedQuery !== undefined;
  // queryFn only ever throws a normalized IntegrationClientProblem (see normalizeIntegrationClientProblem
  // above) -- useQueries' default TError generic is Error, not the actual thrown type.
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
