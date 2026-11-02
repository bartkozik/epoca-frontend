import { normalizeIntegrationClientProblem } from '@/modules/integrationClients/problem';
import { evictIntegrationClientFromLists } from '@/modules/integrationClients/queryCache';
import {
  integrationClientAuditEventsQueryKey,
  integrationClientQueryKey,
} from '@/modules/integrationClients/queryKeys';
import * as requests from '@/modules/integrationClients/requests';
import type { IntegrationClientAuditEvent, IntegrationClientProblem } from '@/modules/integrationClients/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';

const PAGE_SIZE = 20;

export type AuditRequestState = 'idle' | 'loading' | 'success' | 'error';

export interface IntegrationClientAuditEventsListResult {
  auditEvents: IntegrationClientAuditEvent[];
  state: AuditRequestState;
  hasNextPage: boolean;
  error: IntegrationClientProblem | null;
  loadMore: () => void;
  retry: () => void;
}

// Same "accumulate independently-cached pages via useQueries" shape as useIntegrationClientsList,
// scoped per client so switching the details selection starts a fresh accumulation -- matches the
// old store's invalidateAudit-on-ownership-change behavior.
export function useIntegrationClientAuditEventsList(
  organizationSlug: string,
  clientId: string | null,
): IntegrationClientAuditEventsListResult {
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const queryClient = useQueryClient();

  useEffect(() => setPagesLoaded(1), [clientId]);

  const enabled = organizationSlug !== '' && clientId !== null && clientId !== '';
  const queries = useQueries({
    queries: Array.from({ length: pagesLoaded }, (_, index) => {
      const pageNumber = index + 1;
      const pagination = { pageSize: PAGE_SIZE, pageNumber };
      return {
        queryKey: clientId
          ? integrationClientAuditEventsQueryKey(organizationSlug, clientId, pagination)
          : (['integrationClientAuditEvents', organizationSlug, '', pageNumber, PAGE_SIZE] as const),
        queryFn: () =>
          requests
            .listIntegrationClientAuditEvents(organizationSlug, clientId ?? '', pagination)
            .catch((error: unknown) => {
              const problem = normalizeIntegrationClientProblem(error);
              if (problem.kind === 'client-not-found' && clientId) {
                queryClient.removeQueries({ queryKey: integrationClientQueryKey(organizationSlug, clientId) });
                evictIntegrationClientFromLists(queryClient, organizationSlug, clientId);
              }
              // Same rationale as useIntegrationClientsList.
              // eslint-disable-next-line @typescript-eslint/only-throw-error
              throw problem;
            }),
        enabled,
      };
    }),
  });

  const auditEvents = useMemo(() => {
    const merged = new Map<string, IntegrationClientAuditEvent>();
    queries.forEach((query) => {
      query.data?.results.forEach((event) => merged.set(event.id, event));
    });
    return Array.from(merged.values());
  }, [queries]);

  const firstQuery = queries[0];
  // The newest page's own data is undefined for the whole duration its fetch is in flight -- reading
  // count from it alone would flicker to 0 mid-pagination and spuriously hide the "load more" action.
  // Walk forward and keep the most recent page that actually has data.
  const count = queries.reduce((result, query) => query.data?.count ?? result, 0);
  const failedQuery = queries.find((query) => query.isError);
  const hasError = failedQuery !== undefined;
  // queryFn only ever throws a normalized IntegrationClientProblem (see normalizeIntegrationClientProblem
  // above) -- useQueries' default TError generic is Error, not the actual thrown type.
  const error = (failedQuery?.error ?? null) as IntegrationClientProblem | null;
  const isLoading = queries.some((query) => query.isFetching);
  const state: AuditRequestState = hasError
    ? 'error'
    : isLoading
      ? 'loading'
      : (firstQuery?.isSuccess ?? false)
        ? 'success'
        : 'idle';
  const hasNextPage = auditEvents.length < count;

  const loadMore = useCallback(() => {
    if (queries.some((query) => query.isFetching)) return;
    setPagesLoaded((current) => current + 1);
  }, [queries]);

  const retry = useCallback(() => {
    if (!clientId || queries.some((query) => query.isFetching)) return;
    void queryClient.refetchQueries({
      queryKey: ['integrationClientAuditEvents', organizationSlug, clientId],
      exact: false,
    });
  }, [clientId, organizationSlug, queries, queryClient]);

  return { auditEvents, state, hasNextPage, error, loadMore, retry };
}
