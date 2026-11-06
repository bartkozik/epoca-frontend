import { queryClient } from '@/core/api';
import { DATE_FORMAT } from '@/core/utils/helpers';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import type { ReportDateRangeSnapshot } from '@/modules/reports/filterPanel/reportDateRange';
import type { ReportQuerySnapshot } from '@/modules/reports/filterPanel/types';
import { modelUnit } from '@/modules/workingTime/modelUnit';
import * as requests from '@/modules/workingTime/requests';
import type { RawUnitsOrder, ReportedUnit } from '@/modules/workingTime/types';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { reportedUnitsQueryKey } from '../queryKeys';

type ReportSnapshot = ReportDateRangeSnapshot | ReportQuerySnapshot;

const EMPTY_REPORTED_UNITS: ReportedUnit[] = [];

const isReportQuerySnapshot = (snapshot: ReportSnapshot): snapshot is ReportQuerySnapshot => 'projectIds' in snapshot;

const defaultSnapshot = (): ReportDateRangeSnapshot => ({
  fromDate: dayjs().startOf('day'),
  navigationMode: 'fixed-length',
  toDate: null,
  today: dayjs().startOf('day'),
});

function applyOrder(orders: RawUnitsOrder[], units: ReportedUnit[]): ReportedUnit[] {
  if (!orders.length) return units.map((unit, sequenceIndex) => ({ ...unit, sequenceIndex }));
  const positions = new Map(orders.flatMap((order) => order.ids.map((id, index) => [id, { date: order.date, index }])));
  return units
    .map((unit) => {
      const position = positions.get(unit.id);
      return position ? { ...unit, date: position.date, sequenceIndex: position.index } : unit;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.sequenceIndex - b.sequenceIndex);
}

export function useReportedUnits(): {
  reportedUnits: ReportedUnit[];
  loadingReportedUnits: boolean;
  reportedUnitsError: Error | null;
  hasReportedUnitsData: boolean;
  getReportedUnits: (snapshot?: ReportSnapshot) => Promise<void>;
  refreshReportedUnitsInBackground: (snapshot?: ReportSnapshot) => Promise<void>;
  refreshReportedUnits: (snapshot?: ReportSnapshot) => Promise<void>;
  isRefreshingReportedUnits: boolean;
} {
  const { contextOrganizationSlug, contextOrganizationUsers } = useWorkspace();
  const [snapshot, setSnapshot] = useState<ReportSnapshot>(defaultSnapshot);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const pendingExplicitFetchKeyRef = useRef<string | null>(null);
  const key = useMemo(
    () => reportedUnitsQueryKey(contextOrganizationSlug, snapshot),
    [contextOrganizationSlug, snapshot],
  );
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const currentSnapshot = snapshotRef.current;
      const filtered = isReportQuerySnapshot(currentSnapshot);
      const currentKey = reportedUnitsQueryKey(contextOrganizationSlug, currentSnapshot).join('|');
      const isExplicitFetch = pendingExplicitFetchKeyRef.current === currentKey;
      if (isExplicitFetch) pendingExplicitFetchKeyRef.current = null;
      const effectiveToday = currentSnapshot.toDate === null && !isExplicitFetch ? dayjs() : currentSnapshot.today;
      const response = await requests.getReportedUnits(contextOrganizationSlug, {
        includeArchived: false,
        dateFrom: currentSnapshot.fromDate.startOf('day').format(DATE_FORMAT.DAY_BE_FORMAT),
        dateTo: (currentSnapshot.toDate ?? effectiveToday).startOf('day').format(DATE_FORMAT.DAY_BE_FORMAT),
        projectId: filtered ? currentSnapshot.projectIds : [],
        userId: filtered ? currentSnapshot.userIds : [],
        clientId: filtered ? currentSnapshot.clientIds : [],
      });
      return applyOrder(
        response.data.orders,
        response.data.workUnits.results.map((raw, index) => modelUnit(raw, contextOrganizationUsers, index)),
      );
    },
    enabled: contextOrganizationSlug !== '',
    // Previous rows may remain while filters load, but never across organizations.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === contextOrganizationSlug ? previousData : undefined,
  });
  const refetch = query.refetch;
  const load = useCallback(
    async (nextSnapshot?: ReportSnapshot): Promise<void> => {
      if (nextSnapshot) {
        snapshotRef.current = nextSnapshot;
        setSnapshot(nextSnapshot);
        const nextKey = reportedUnitsQueryKey(contextOrganizationSlug, nextSnapshot).join('|');
        pendingExplicitFetchKeyRef.current = nextKey;
        if (nextKey !== key.join('|')) {
          void queryClient.invalidateQueries({
            queryKey: reportedUnitsQueryKey(contextOrganizationSlug, nextSnapshot),
            exact: true,
            refetchType: 'none',
          });
          return;
        }
      }
      await refetch();
    },
    [contextOrganizationSlug, key, refetch],
  );
  return {
    reportedUnits: query.data ?? EMPTY_REPORTED_UNITS,
    loadingReportedUnits: query.isLoading,
    reportedUnitsError: query.error,
    hasReportedUnitsData: query.data !== undefined,
    getReportedUnits: load,
    refreshReportedUnitsInBackground: load,
    refreshReportedUnits: load,
    isRefreshingReportedUnits: query.isFetching && query.isPlaceholderData,
  };
}

export const refreshReportedUnits = (_snapshot?: ReportSnapshot): Promise<void> =>
  queryClient
    .refetchQueries({ queryKey: ['reportedUnits'], type: 'active' }, { throwOnError: true })
    .then(() => undefined);

export const getReportedUnits = (_snapshot?: ReportSnapshot): Promise<void> =>
  queryClient.invalidateQueries({ queryKey: ['reportedUnits'], refetchType: 'active' }).then(() => undefined);
export const refreshReportedUnitsInBackground = refreshReportedUnits;

export const resetReportedUnitsForOrgSwitch = (): void => {
  queryClient.removeQueries({ queryKey: ['reportedUnits'] });
};
