import { PIVOT_KEY, PIVOT_VALUE, type PivotKey, type PivotValue } from '../constants';
import type { WorkUnitPivotQueryRequest } from '../types';
import type { PivotArea, PivotFieldMove, PivotLayout, PivotMoveResult } from './types';

const DIMENSIONS = Object.values(PIVOT_KEY);
const MEASURES = Object.values(PIVOT_VALUE);

export const DEFAULT_PIVOT_LAYOUT: PivotLayout = {
  rows: [PIVOT_KEY.MONTH_YEAR, PIVOT_KEY.USER],
  columns: [],
  values: [PIVOT_VALUE.DURATION_SUM],
  filters: [],
  options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
};

export const clonePivotLayout = (layout: PivotLayout): PivotLayout => ({
  rows: [...layout.rows],
  columns: [...layout.columns],
  values: [...layout.values],
  filters: layout.filters.map(({ key, includedValues }) => ({
    key,
    includedValues: includedValues === null ? null : [...includedValues],
  })),
  options: { ...layout.options },
});

const isDimension = (field: string): field is PivotKey => DIMENSIONS.some((dimension) => dimension === field);
const isMeasure = (field: string): field is PivotValue => MEASURES.some((measure) => measure === field);

export const getFieldArea = (layout: PivotLayout, field: string): PivotArea => {
  if (layout.rows.some((key) => key === field)) return 'rows';
  if (layout.columns.some((key) => key === field)) return 'columns';
  if (layout.values.some((value) => value === field)) return 'values';
  if (layout.filters.some(({ key }) => key === field)) return 'filters';
  return 'available';
};

export const getAvailableDimensions = (layout: PivotLayout): PivotKey[] =>
  DIMENSIONS.filter((dimension) => getFieldArea(layout, dimension) === 'available');

export const getAvailableMeasures = (layout: PivotLayout): PivotValue[] =>
  MEASURES.filter((measure) => getFieldArea(layout, measure) === 'available');

const insertAt = <T>(items: T[], item: T, index: number): void => {
  items.splice(Math.max(0, Math.min(index, items.length)), 0, item);
};

const layoutsMatch = (left: PivotLayout, right: PivotLayout): boolean => JSON.stringify(left) === JSON.stringify(right);

export const movePivotField = (layout: PivotLayout, move: PivotFieldMove): PivotMoveResult => {
  const original = clonePivotLayout(layout);
  const dimension = isDimension(move.field);
  const measure = isMeasure(move.field);

  if ((!dimension && !measure) || (dimension && move.destination === 'values')) {
    return { accepted: false, reason: 'INVALID_DESTINATION', layout: original };
  }
  if (measure && move.destination !== 'values' && move.destination !== 'available') {
    return { accepted: false, reason: 'INVALID_DESTINATION', layout: original };
  }
  if (measure && move.destination === 'available' && layout.values.length === 1 && layout.values[0] === move.field) {
    return { accepted: false, reason: 'FINAL_MEASURE', layout: original };
  }

  const next = clonePivotLayout(layout);
  const existingFilter = next.filters.find(({ key }) => key === move.field);
  next.rows = next.rows.filter((key) => key !== move.field);
  next.columns = next.columns.filter((key) => key !== move.field);
  next.values = next.values.filter((value) => value !== move.field);
  next.filters = next.filters.filter(({ key }) => key !== move.field);

  if (move.destination === 'rows' && dimension) insertAt(next.rows, move.field, move.index);
  if (move.destination === 'columns' && dimension) insertAt(next.columns, move.field, move.index);
  if (move.destination === 'values' && measure) insertAt(next.values, move.field, move.index);
  if (move.destination === 'filters' && dimension) {
    insertAt(next.filters, existingFilter ?? { key: move.field, includedValues: null }, move.index);
  }

  if (layoutsMatch(original, next)) return { accepted: false, reason: 'NO_CHANGE', layout: original };
  return { accepted: true, layout: next };
};

export const serializePivotLayout = (layout: PivotLayout): WorkUnitPivotQueryRequest => clonePivotLayout(layout);
