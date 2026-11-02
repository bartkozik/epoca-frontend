import { PIVOT_KEY, PIVOT_VALUE, type PivotKey, type PivotValue } from '../constants';
import type { PivotFilterValue } from '../types';
import { clonePivotLayout } from './pivotLayout';
import type { PivotLayout } from './types';

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = 'epoca:pivot-table-layout';
const DIMENSIONS = new Set<string>(Object.values(PIVOT_KEY));
const MEASURES = new Set<string>(Object.values(PIVOT_VALUE));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasUniqueValues = (values: unknown[]): boolean =>
  new Set(values.map((value) => JSON.stringify(value))).size === values.length;

const isDimensionArray = (value: unknown): value is PivotKey[] =>
  Array.isArray(value) &&
  value.every((field) => typeof field === 'string' && DIMENSIONS.has(field)) &&
  hasUniqueValues(value);

const isMeasureArray = (value: unknown): value is PivotValue[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((field) => typeof field === 'string' && MEASURES.has(field)) &&
  hasUniqueValues(value);

const isFilterValue = (key: PivotKey, value: unknown): value is PivotFilterValue => {
  if (key === PIVOT_KEY.USER || key === PIVOT_KEY.PROJECT) return typeof value === 'string' && UUID_PATTERN.test(value);
  if (key === PIVOT_KEY.CLIENT) return value === null || (typeof value === 'string' && UUID_PATTERN.test(value));
  if (key === PIVOT_KEY.YEAR) return typeof value === 'number' && Number.isInteger(value);
  if (key === PIVOT_KEY.MONTH_YEAR) return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
  if (key === PIVOT_KEY.DATE) return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (key === PIVOT_KEY.TASK) return value === null || typeof value === 'string';
  return value === 'Worklog' || value === 'Note';
};

const isFilters = (value: unknown): value is PivotLayout['filters'] =>
  Array.isArray(value) &&
  value.every((filter) => {
    if (!isRecord(filter) || typeof filter.key !== 'string' || !DIMENSIONS.has(filter.key)) return false;
    const key = filter.key as PivotKey;
    const includedValues = filter.includedValues;
    return (
      includedValues === null ||
      (Array.isArray(includedValues) &&
        includedValues.length > 0 &&
        includedValues.every((member) => isFilterValue(key, member)) &&
        hasUniqueValues(includedValues))
    );
  });

const isOptions = (value: unknown): value is PivotLayout['options'] =>
  isRecord(value) &&
  typeof value.rowSubtotals === 'boolean' &&
  typeof value.columnSubtotals === 'boolean' &&
  typeof value.grandTotals === 'boolean';

const isPivotLayout = (value: unknown): value is PivotLayout => {
  if (!isRecord(value)) return false;
  if (!isDimensionArray(value.rows) || !isDimensionArray(value.columns) || !isMeasureArray(value.values)) return false;
  if (!isFilters(value.filters) || !isOptions(value.options)) return false;

  const assignedDimensions = [...value.rows, ...value.columns, ...value.filters.map(({ key }) => key)];
  return hasUniqueValues(assignedDimensions);
};

export const pivotLayoutStorageKey = (userId: string, organizationSlug: string): string =>
  `${STORAGE_PREFIX}:v${STORAGE_VERSION}:${encodeURIComponent(userId)}:${encodeURIComponent(organizationSlug)}`;

const removeStoredLayout = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // A blocked storage area should never prevent the pivot from using its safe default.
  }
};

export const loadPivotLayout = (userId: string, organizationSlug: string): PivotLayout | null => {
  const key = pivotLayoutStorageKey(userId, organizationSlug);
  try {
    const serialized = localStorage.getItem(key);
    if (serialized === null) return null;
    const stored: unknown = JSON.parse(serialized);
    if (!isRecord(stored) || stored.version !== STORAGE_VERSION || !isPivotLayout(stored.layout)) {
      removeStoredLayout(key);
      return null;
    }
    return clonePivotLayout(stored.layout);
  } catch {
    removeStoredLayout(key);
    return null;
  }
};

export const savePivotLayout = (userId: string, organizationSlug: string, layout: PivotLayout): void => {
  try {
    localStorage.setItem(
      pivotLayoutStorageKey(userId, organizationSlug),
      JSON.stringify({ version: STORAGE_VERSION, layout: clonePivotLayout(layout) }),
    );
  } catch {
    // The current in-memory layout stays usable when storage is unavailable or full.
  }
};
