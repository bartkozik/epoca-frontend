import type { ReportQuerySnapshot } from '@/modules/reports/filterPanel/types';
import { serializePivotLayout } from '@/modules/reports/pivotTable/layout/pivotLayout';
import type { PivotLayout } from '@/modules/reports/pivotTable/layout/types';
import type { ReportDateRangeSnapshot } from './filterPanel/reportDateRange';

export const pivotTableQueryKey = (
  organizationSlug: string,
  layout: PivotLayout,
  filters: ReportQuerySnapshot | null,
): readonly [string, string, string, string] => [
  'pivotTable',
  organizationSlug,
  JSON.stringify(serializePivotLayout(layout)),
  filters
    ? JSON.stringify({
        clientIds: filters.clientIds,
        fromDate: filters.fromDate.toISOString(),
        projectIds: filters.projectIds,
        toDate: filters.toDate?.toISOString() ?? null,
        today: filters.today.toISOString(),
        userIds: filters.userIds,
      })
    : 'no-filters',
];

export const workUnitOverrideQueryKey = (
  organizationSlug: string,
  workUnitId: string,
): readonly [string, string, string] => ['workUnitOverride', organizationSlug, workUnitId];

// Pin upToVersion in the cache key so different historical snapshots cannot share a response.
export const workUnitOverrideHistoryQueryKey = (
  organizationSlug: string,
  workUnitId: string,
  upToVersion: number,
  pageNumber: number,
): readonly [string, string, string, number, number] => [
  'workUnitOverrideHistory',
  organizationSlug,
  workUnitId,
  upToVersion,
  pageNumber,
];

export const reportedUnitsQueryKey = (
  organizationSlug: string,
  snapshot: ReportDateRangeSnapshot | ReportQuerySnapshot,
): readonly [string, string, string] => [
  'reportedUnits',
  organizationSlug,
  JSON.stringify({
    ...snapshot,
    fromDate: snapshot.fromDate.toISOString(),
    toDate: snapshot.toDate?.toISOString() ?? null,
    today: snapshot.toDate === null ? null : snapshot.today.toISOString(),
  }),
];

export const reportFilterFacetsQueryKey = (
  organizationSlug: string,
  dateFrom: string,
  dateTo: string,
): readonly [string, string, string, string] => ['reportFilterFacets', organizationSlug, dateFrom, dateTo];

export const reportUsersQueryKey = (organizationSlug: string): readonly [string, string] =>
  ['reportUsers', organizationSlug] as const;
