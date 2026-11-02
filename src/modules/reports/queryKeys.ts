import type { ReportQuerySnapshot } from '@/modules/reports/filterPanel/types';
import { serializePivotLayout } from '@/modules/reports/pivotTable/layout/pivotLayout';
import type { PivotLayout } from '@/modules/reports/pivotTable/layout/types';
import type { ReportDateRangeSnapshot } from './filterPanel/reportDateRange';

// Flat, entity-prefixed key: any of organization/layout/filters differing is a genuinely
// different query -- there is no narrower invalidation target, matching how the removed pivot
// table store always refetched in full on any layout or filter change rather than patching in
// place.
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

// Keyed on the pinned upToVersion (not just org/work-unit), since two sessions viewing the
// same work unit at different snapshot versions must never share a cache entry -- matches
// this hook's existing "pinned upToVersion" invariant.
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
    // An open-ended range means "through today". The day is request context, not a filter.
    today: snapshot.toDate === null ? null : snapshot.today.toISOString(),
  }),
];

// Hours per client × project × user for one period; filter selections are applied in the browser.
export const reportFilterFacetsQueryKey = (
  organizationSlug: string,
  dateFrom: string,
  dateTo: string,
): readonly [string, string, string, string] => ['reportFilterFacets', organizationSlug, dateFrom, dateTo];

export const reportUsersQueryKey = (organizationSlug: string): readonly [string, string] =>
  ['reportUsers', organizationSlug] as const;
