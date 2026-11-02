import { PIVOT_KEY, type PivotKey, type PivotValue } from './constants';

export interface PivotDuration {
  seconds: number;
  nanoseconds: number;
}

export type PivotEntryType = 'Worklog' | 'Note';

export type PivotFilterValue = string | number | null;

export interface PivotFilter {
  key: PivotKey;
  includedValues: PivotFilterValue[] | null;
}

export interface PivotOptions {
  rowSubtotals: boolean;
  columnSubtotals: boolean;
  grandTotals: boolean;
}

export interface WorkUnitPivotQueryRequest {
  rows: PivotKey[];
  columns: PivotKey[];
  values: PivotValue[];
  filters: PivotFilter[];
  options: PivotOptions;
}

export type PivotCoordinateKind = 'Leaf' | 'Subtotal' | 'GrandTotal';

export interface PivotPathSegment {
  key: PivotKey;
  value: PivotFilterValue;
}

export interface PivotCoordinate {
  kind: PivotCoordinateKind;
  path: PivotPathSegment[];
}

export interface PivotMetricValues {
  durationSum?: PivotDuration;
  durationAvg?: PivotDuration | null;
  entriesCount?: number;
}

export interface PivotCell {
  row: PivotCoordinate;
  column: PivotCoordinate;
  values: PivotMetricValues;
}

export interface PivotFilterMember {
  value: PivotFilterValue;
  available: boolean;
}

export interface PivotFilterMembers {
  key: PivotKey;
  members: PivotFilterMember[];
}

export interface PivotResultMetadata {
  cellCount: number;
  displayValueCellCount: number;
  maxDisplayValueCellCount: number;
}

export interface WorkUnitPivotQueryResponse {
  cells: PivotCell[];
  filterMembers: PivotFilterMembers[];
  result: PivotResultMetadata;
}

export interface PivotTableQueryParams {
  dateFrom: string;
  dateTo?: string;
  projectId: string[];
  userId: string[];
  clientId: string[];
}

export interface PivotMonthAxisProjection {
  dateFrom: string;
  effectiveDateTo: string;
}

export interface PivotExportMemberLabel {
  key: PivotKey;
  value: PivotFilterValue;
  label: string;
}

export type PivotExportFieldLabels = Partial<Record<PivotKey, string>> &
  Record<Exclude<PivotKey, typeof PIVOT_KEY.TASK>, string>;

export interface PivotExportPresentation {
  fieldLabels: PivotExportFieldLabels;
  measureLabels: Record<PivotValue, string>;
  subtotalLabel: string;
  grandTotalLabel: string;
  noClientLabel: string;
  noTaskLabel?: string;
  memberLabels: PivotExportMemberLabel[];
}

export interface PivotExportProjection {
  effectiveDateTo: string;
}

export interface WorkUnitPivotExportRequest {
  query: WorkUnitPivotQueryRequest;
  projection: PivotExportProjection;
  presentation: PivotExportPresentation;
}

export interface PivotExportSnapshot {
  organizationSlug: string;
  projection: PivotMonthAxisProjection;
  query: WorkUnitPivotQueryRequest;
  params: PivotTableQueryParams;
  memberIdentities: Array<Pick<PivotExportMemberLabel, 'key' | 'value'>>;
  maxDisplayValueCellCount: number;
}
