import { ROLE_PERMISSIONS } from '@/app/routing/rolePermissions';
import { DATE_FORMAT } from '@/core/utils/helpers';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import {
  computeFilterFacets,
  FacetSelection,
  FILTER_FACETS_REQUEST,
  FilterFacets,
  toFacetCells,
} from '@/modules/reports/filterPanel/filterFacets';
import { reportFilterFacetsQueryKey } from '@/modules/reports/queryKeys';
import * as requests from '@/modules/reports/requests';
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';

export type FilterFacetsStatus = 'unavailable' | 'idle' | 'loading' | 'ready' | 'error';

interface UseReportFilterFacetsArgs {
  fromDate: Dayjs;
  toDate: Dayjs | null;
  selection: FacetSelection;
}

interface UseReportFilterFacetsResult {
  status: FilterFacetsStatus;
  facets: FilterFacets | null;
  request: () => void;
  retry: () => void;
}

export function useReportFilterFacets({
  fromDate,
  toDate,
  selection,
}: UseReportFilterFacetsArgs): UseReportFilterFacetsResult {
  const auth = useAuth();
  const { contextOrganizationSlug } = useWorkspace();
  const canReadHours = auth.hasAccess(ROLE_PERMISSIONS.Manager);
  const [requested, setRequested] = useState(false);

  const dateFrom = fromDate.startOf('day').format(DATE_FORMAT.DAY_BE_FORMAT);
  const dateTo = (toDate ?? dayjs()).startOf('day').format(DATE_FORMAT.DAY_BE_FORMAT);

  const query = useQuery({
    queryKey: reportFilterFacetsQueryKey(contextOrganizationSlug, dateFrom, dateTo),
    queryFn: async ({ signal }) => {
      const response = await requests.getPivotTable(
        contextOrganizationSlug,
        FILTER_FACETS_REQUEST,
        { dateFrom, dateTo, projectId: [], userId: [], clientId: [] },
        signal,
      );
      return toFacetCells(response.cells);
    },
    enabled: canReadHours && requested && contextOrganizationSlug !== '',
    retry: false,
  });

  const { clientIds, projectIds, userIds } = selection;
  const facets = useMemo(
    () => (query.data ? computeFilterFacets(query.data, { clientIds, projectIds, userIds }) : null),
    [clientIds, projectIds, query.data, userIds],
  );

  const request = useCallback(() => setRequested(true), []);
  const { refetch } = query;
  const retry = useCallback(() => void refetch(), [refetch]);

  let status: FilterFacetsStatus = 'idle';
  if (!canReadHours) status = 'unavailable';
  else if (query.isError) status = 'error';
  else if (query.data) status = 'ready';
  else if (requested) status = 'loading';

  return { status, facets, request, retry };
}
