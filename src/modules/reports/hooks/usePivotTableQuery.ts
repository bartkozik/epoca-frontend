import { queryClient } from '@/core/api/queryClient';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { getEffectiveReportEndDate } from '@/modules/reports/filterPanel/reportDateRange';
import type { ReportQuerySnapshot } from '@/modules/reports/filterPanel/types';
import { clonePivotLayout, serializePivotLayout } from '@/modules/reports/pivotTable/layout/pivotLayout';
import type { PivotLayout } from '@/modules/reports/pivotTable/layout/types';
import { buildPivotMatrix } from '@/modules/reports/pivotTable/matrix/buildPivotMatrix';
import { PivotResultTooLargeError } from '@/modules/reports/pivotTable/matrix/completeMonthAxis';
import { buildPivotMemberIdentities } from '@/modules/reports/pivotTable/pivotLabels';
import type {
  PivotExportSnapshot,
  PivotTableQueryParams,
  WorkUnitPivotQueryResponse,
} from '@/modules/reports/pivotTable/types';
import { pivotTableQueryKey } from '@/modules/reports/queryKeys';
import * as requests from '@/modules/reports/requests';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export type PivotErrorKind = 'contract' | 'forbidden' | 'generic' | 'invalidConfiguration' | 'resultTooLarge';

interface PivotTableQueryData {
  response: WorkUnitPivotQueryResponse;
  exportSnapshot: PivotExportSnapshot | null;
}

export interface PivotTableQueryState {
  response: WorkUnitPivotQueryResponse | null;
  exportSnapshot: PivotExportSnapshot | null;
  errorKind: PivotErrorKind | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  retry: () => void;
}

// Deep-cloned defensively at the moment the snapshot is used to build a request -- a caller
// passing the SAME mutable ReportQuerySnapshot object and continuing to mutate its arrays
// afterwards must not change what an in-flight request already sent.
const cloneGlobalFilters = (snapshot: ReportQuerySnapshot): ReportQuerySnapshot => ({
  ...snapshot,
  clientIds: [...snapshot.clientIds],
  fromDate: snapshot.fromDate.clone(),
  projectIds: [...snapshot.projectIds],
  toDate: snapshot.toDate?.clone() ?? null,
  today: snapshot.today.clone(),
  userIds: [...snapshot.userIds],
});

const clonePivotQueryParams = (params: PivotTableQueryParams): PivotTableQueryParams => ({
  clientId: [...params.clientId],
  dateFrom: params.dateFrom,
  ...(params.dateTo ? { dateTo: params.dateTo } : {}),
  projectId: [...params.projectId],
  userId: [...params.userId],
});

const createQueryParams = (snapshot: ReportQuerySnapshot): PivotTableQueryParams => ({
  clientId: [...snapshot.clientIds],
  dateFrom: snapshot.fromDate.format('YYYY-MM-DD'),
  ...(snapshot.toDate ? { dateTo: snapshot.toDate.format('YYYY-MM-DD') } : {}),
  projectId: [...snapshot.projectIds],
  userId: [...snapshot.userIds],
});

export const mapPivotErrorKind = (error: unknown): PivotErrorKind => {
  if (error instanceof PivotResultTooLargeError) return 'resultTooLarge';
  if (error instanceof Error && error.message.startsWith('Invalid pivot response:')) return 'contract';
  if (typeof error !== 'object' || error === null) return 'generic';

  const response = (error as { response?: { data?: { code?: unknown }; status?: unknown } }).response;
  if (response?.status === 403) return 'forbidden';
  if (response?.status === 400 && response.data?.code === 'PIVOT_INVALID_CONFIGURATION') return 'invalidConfiguration';
  if (response?.status === 422 && response.data?.code === 'PIVOT_RESULT_TOO_LARGE') return 'resultTooLarge';
  return 'generic';
};

export const evictPivotTableCache = (): void => {
  queryClient.removeQueries({ queryKey: ['pivotTable'], exact: false });
};

export function usePivotTableQuery(layout: PivotLayout, filters: ReportQuerySnapshot | null): PivotTableQueryState {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;

  const query = useQuery({
    queryKey: pivotTableQueryKey(organizationSlug, layout, filters),
    queryFn: async (): Promise<PivotTableQueryData> => {
      const acceptedFilters = cloneGlobalFilters(filters as ReportQuerySnapshot);
      const request = serializePivotLayout(layout);
      const params = createQueryParams(acceptedFilters);
      const projection = {
        dateFrom: acceptedFilters.fromDate.format('YYYY-MM-DD'),
        effectiveDateTo: getEffectiveReportEndDate(acceptedFilters).format('YYYY-MM-DD'),
      };

      const nextResponse = await requests.getPivotTable(organizationSlug, request, params);
      buildPivotMatrix(nextResponse, request, projection);

      const exportSnapshot: PivotExportSnapshot | null =
        nextResponse.cells.length === 0
          ? null
          : {
              organizationSlug,
              projection,
              query: clonePivotLayout(request),
              params: clonePivotQueryParams(params),
              memberIdentities: buildPivotMemberIdentities(nextResponse, request, projection),
              maxDisplayValueCellCount: nextResponse.result.maxDisplayValueCellCount,
            };

      return { response: nextResponse, exportSnapshot };
    },
    enabled: filters !== null,
    retry: false,
    // Pinned to 0, overriding the shared client's 60s default: the query key already changes on
    // every genuine layout/filter change (see pivotTableQueryKey above), but a user can toggle a
    // field's position back and forth (e.g. reorder A/B then reorder them back) and land on a key
    // identical to one visited under a minute ago. Without this, that revisit silently serves the
    // stale cached response instead of refetching -- contradicting this file's own "always
    // refetched in full on any layout or filter change" intent.
    staleTime: 0,
  });

  // Sticky "last accepted" state: only ever advanced on a genuine success, so a later failed
  // fetch (different query key) can never clear or replace what's already displayed.
  const [accepted, setAccepted] = useState<PivotTableQueryData | null>(null);
  useEffect(() => {
    if (query.data) setAccepted(query.data);
  }, [query.data]);

  return {
    response: accepted?.response ?? null,
    exportSnapshot: accepted?.exportSnapshot ?? null,
    errorKind: query.error ? mapPivotErrorKind(query.error) : null,
    isInitialLoading: query.isFetching && accepted === null,
    isRefreshing: query.isFetching && accepted !== null,
    retry: (): void => void query.refetch(),
  };
}
