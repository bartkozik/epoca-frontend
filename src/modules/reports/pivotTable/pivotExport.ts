import { SpreadsheetFormat } from '@/modules/reports/types';
import { PIVOT_KEY, PIVOT_VALUE, type PivotValue } from './constants';
import type { PivotLabelResolver, PivotTranslate } from './pivotLabels';
import type {
  PivotExportFieldLabels,
  PivotExportMemberLabel,
  PivotExportPresentation,
  PivotExportProjection,
  PivotTableQueryParams,
  WorkUnitPivotExportRequest,
  WorkUnitPivotQueryRequest,
} from './types';

const SUPPORTED_DIMENSION_COUNT = 8;
const MAX_LABEL_CODE_POINTS = 140;
const MAX_LABEL_UTF8_BYTES = 560;
const MAX_MEMBER_ENTRY_BYTES = 768;
const MAX_SAFE_ARITHMETIC_VALUE = Number.MAX_SAFE_INTEGER;
const CALENDAR_DATE_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const ROUTE_MAX_BYTES = 64 * 1024 * 1024;
export const FIXED_ALLOWANCE_BYTES = 8_000_000;

export class PivotExportBudgetMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PivotExportBudgetMismatchError';
  }
}

interface BuildPivotExportPresentationArgs {
  memberIdentities: ReadonlyArray<Pick<PivotExportMemberLabel, 'key' | 'value'>>;
  query: Pick<WorkUnitPivotQueryRequest, 'rows' | 'columns'>;
  resolveLabel: PivotLabelResolver;
  t: PivotTranslate;
}

export const utf8ByteLength = (value: string, limit = MAX_SAFE_ARITHMETIC_VALUE): number => {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;

    if (bytes > limit) return bytes;
  }

  return bytes;
};

const saturatingMultiply = (left: number, right: number): number =>
  left > Math.floor(MAX_SAFE_ARITHMETIC_VALUE / right) ? MAX_SAFE_ARITHMETIC_VALUE : left * right;

const saturatingAdd = (left: number, right: number): number =>
  left > MAX_SAFE_ARITHMETIC_VALUE - right ? MAX_SAFE_ARITHMETIC_VALUE : left + right;

export const pivotExportMemberLimit = (maxDisplayValueCellCount: number): number =>
  saturatingMultiply(Math.max(0, maxDisplayValueCellCount), SUPPORTED_DIMENSION_COUNT);

export const pivotExportBodyBudget = (maxDisplayValueCellCount: number): number =>
  saturatingAdd(
    saturatingMultiply(pivotExportMemberLimit(maxDisplayValueCellCount), MAX_MEMBER_ENTRY_BYTES),
    FIXED_ALLOWANCE_BYTES,
  );

const normalizeLabel = (label: string): string => label.replace(/[\r\n\t]+/g, ' ');

const hasInvalidLabelCodePoints = (label: string): boolean => {
  let codePointCount = 0;

  for (let index = 0; index < label.length; index += 1) {
    const codeUnit = label.charCodeAt(index);
    let codePoint = codeUnit;

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = label.charCodeAt(index + 1);
      if (!(nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff)) return true;
      codePoint = 0x10000 + ((codeUnit - 0xd800) << 10) + (nextCodeUnit - 0xdc00);
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return true;

    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
    codePointCount += 1;
    if (codePointCount > MAX_LABEL_CODE_POINTS) return true;
  }

  return false;
};

const normalizeAndValidateLabel = (label: string): string => {
  const normalized = normalizeLabel(label);

  if (
    normalized.trim().length === 0 ||
    hasInvalidLabelCodePoints(normalized) ||
    utf8ByteLength(normalized, MAX_LABEL_UTF8_BYTES) > MAX_LABEL_UTF8_BYTES
  ) {
    throw new Error('Invalid pivot export presentation label');
  }

  return normalized;
};

const canonicalFieldLabels = (labels: PivotExportFieldLabels): PivotExportFieldLabels => {
  const canonical: PivotExportFieldLabels = {
    [PIVOT_KEY.USER]: normalizeAndValidateLabel(labels[PIVOT_KEY.USER]),
    [PIVOT_KEY.PROJECT]: normalizeAndValidateLabel(labels[PIVOT_KEY.PROJECT]),
    [PIVOT_KEY.CLIENT]: normalizeAndValidateLabel(labels[PIVOT_KEY.CLIENT]),
    [PIVOT_KEY.YEAR]: normalizeAndValidateLabel(labels[PIVOT_KEY.YEAR]),
    [PIVOT_KEY.MONTH_YEAR]: normalizeAndValidateLabel(labels[PIVOT_KEY.MONTH_YEAR]),
    [PIVOT_KEY.DATE]: normalizeAndValidateLabel(labels[PIVOT_KEY.DATE]),
    [PIVOT_KEY.ENTRY_TYPE]: normalizeAndValidateLabel(labels[PIVOT_KEY.ENTRY_TYPE]),
  };
  const taskLabel = labels[PIVOT_KEY.TASK];
  if (taskLabel !== undefined) {
    canonical[PIVOT_KEY.TASK] = normalizeAndValidateLabel(taskLabel);
  }
  return canonical;
};

const canonicalMeasureLabels = (labels: Record<PivotValue, string>): Record<PivotValue, string> => ({
  [PIVOT_VALUE.DURATION_SUM]: normalizeAndValidateLabel(labels[PIVOT_VALUE.DURATION_SUM]),
  [PIVOT_VALUE.DURATION_AVG]: normalizeAndValidateLabel(labels[PIVOT_VALUE.DURATION_AVG]),
  [PIVOT_VALUE.ENTRIES_COUNT]: normalizeAndValidateLabel(labels[PIVOT_VALUE.ENTRIES_COUNT]),
});

const canonicalMemberLabel = ({ key, value, label }: PivotExportMemberLabel): PivotExportMemberLabel | undefined => {
  const canonical = { key, value, label: normalizeAndValidateLabel(label) };
  return utf8ByteLength(JSON.stringify(canonical), MAX_MEMBER_ENTRY_BYTES) > MAX_MEMBER_ENTRY_BYTES
    ? undefined
    : canonical;
};

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

const canonicalQuery = ({
  rows,
  columns,
  values,
  filters,
  options,
}: WorkUnitPivotQueryRequest): WorkUnitPivotQueryRequest => ({
  rows: [...rows],
  columns: [...columns],
  values: [...values],
  filters: filters.map(({ key, includedValues }) => ({
    key,
    includedValues: includedValues === null ? null : [...includedValues],
  })),
  options: {
    rowSubtotals: options.rowSubtotals,
    columnSubtotals: options.columnSubtotals,
    grandTotals: options.grandTotals,
  },
});

const isLeapYear = (year: number): boolean => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

const canonicalProjection = ({ effectiveDateTo }: PivotExportProjection): PivotExportProjection => {
  const match = CALENDAR_DATE_PATTERN.exec(effectiveDateTo);
  if (!match) throw new Error('Invalid pivot export projection date');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year === 0 || day > daysInMonth(year, month)) {
    throw new Error('Invalid pivot export projection date');
  }

  return { effectiveDateTo };
};

const canonicalPresentation = ({
  fieldLabels,
  measureLabels,
  subtotalLabel,
  grandTotalLabel,
  noClientLabel,
  noTaskLabel,
  memberLabels,
}: PivotExportPresentation): PivotExportPresentation => ({
  fieldLabels: canonicalFieldLabels(fieldLabels),
  measureLabels: canonicalMeasureLabels(measureLabels),
  subtotalLabel: normalizeAndValidateLabel(subtotalLabel),
  grandTotalLabel: normalizeAndValidateLabel(grandTotalLabel),
  noClientLabel: normalizeAndValidateLabel(noClientLabel),
  ...(noTaskLabel !== undefined ? { noTaskLabel: normalizeAndValidateLabel(noTaskLabel) } : {}),
  memberLabels: memberLabels.map(canonicalMemberLabel).filter(isDefined),
});

export const buildPivotExportPresentation = ({
  memberIdentities,
  query,
  resolveLabel,
  t,
}: BuildPivotExportPresentationArgs): PivotExportPresentation => {
  const usesTaskKey = query.rows.includes(PIVOT_KEY.TASK) || query.columns.includes(PIVOT_KEY.TASK);

  return {
    fieldLabels: {
      [PIVOT_KEY.USER]: t(`pivot_table.dimensions.${PIVOT_KEY.USER}`),
      [PIVOT_KEY.PROJECT]: t(`pivot_table.dimensions.${PIVOT_KEY.PROJECT}`),
      [PIVOT_KEY.CLIENT]: t(`pivot_table.dimensions.${PIVOT_KEY.CLIENT}`),
      [PIVOT_KEY.YEAR]: t(`pivot_table.dimensions.${PIVOT_KEY.YEAR}`),
      [PIVOT_KEY.MONTH_YEAR]: t(`pivot_table.dimensions.${PIVOT_KEY.MONTH_YEAR}`),
      [PIVOT_KEY.DATE]: t(`pivot_table.dimensions.${PIVOT_KEY.DATE}`),
      [PIVOT_KEY.ENTRY_TYPE]: t(`pivot_table.dimensions.${PIVOT_KEY.ENTRY_TYPE}`),
      ...(usesTaskKey ? { [PIVOT_KEY.TASK]: t(`pivot_table.dimensions.${PIVOT_KEY.TASK}`) } : {}),
    },
    measureLabels: {
      [PIVOT_VALUE.DURATION_SUM]: t(`pivot_table.values.${PIVOT_VALUE.DURATION_SUM}`),
      [PIVOT_VALUE.DURATION_AVG]: t(`pivot_table.values.${PIVOT_VALUE.DURATION_AVG}`),
      [PIVOT_VALUE.ENTRIES_COUNT]: t(`pivot_table.values.${PIVOT_VALUE.ENTRIES_COUNT}`),
    },
    subtotalLabel: t('pivot_table.table.subtotal'),
    grandTotalLabel: t('pivot_table.table.grand_total'),
    noClientLabel: resolveLabel(PIVOT_KEY.CLIENT, null),
    ...(usesTaskKey ? { noTaskLabel: resolveLabel(PIVOT_KEY.TASK, null) } : {}),
    memberLabels: memberIdentities.map(({ key, value }) => ({ key, value, label: resolveLabel(key, value) })),
  };
};

export const serializePivotExportRequest = (
  { query, projection, presentation }: WorkUnitPivotExportRequest,
  maxDisplayValueCellCount: number,
): string => {
  const memberLimit = pivotExportMemberLimit(maxDisplayValueCellCount);
  const bodyBudget = pivotExportBodyBudget(maxDisplayValueCellCount);

  if (bodyBudget > ROUTE_MAX_BYTES) {
    throw new PivotExportBudgetMismatchError('Pivot export configuration exceeds the route limit');
  }
  if (presentation.memberLabels.length > memberLimit) {
    throw new Error('Pivot export member label limit exceeded');
  }

  const canonical: WorkUnitPivotExportRequest = {
    query: canonicalQuery(query),
    projection: canonicalProjection(projection),
    presentation: canonicalPresentation(presentation),
  };
  const serialized = JSON.stringify(canonical);
  if (utf8ByteLength(serialized, bodyBudget) > bodyBudget) {
    throw new Error('Pivot export request exceeds the configured body budget');
  }
  return serialized;
};

export const pivotExportFileName = (params: PivotTableQueryParams, format: SpreadsheetFormat): string =>
  `pivot_table_${params.dateFrom}_${params.dateTo ?? 'open'}.${format}`;
