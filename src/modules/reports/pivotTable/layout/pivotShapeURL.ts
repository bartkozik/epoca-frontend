import { PIVOT_KEY, PIVOT_VALUE, type PivotKey, type PivotValue } from '../constants';
import { clonePivotLayout } from './pivotLayout';
import type { PivotLayout } from './types';

/** Rows, columns and values of the pivot table: the part of the layout kept in the URL. */
export interface PivotShape {
  rows: PivotKey[];
  columns: PivotKey[];
  values: PivotValue[];
}

const SHAPE_PARAMS = ['rows', 'columns', 'values'] as const;

const isDimension = (value: string): value is PivotKey => Object.values(PIVOT_KEY).some((key) => key === value);
const isMeasure = (value: string): value is PivotValue => Object.values(PIVOT_VALUE).some((key) => key === value);

/** The shape from ?rows=…&columns=…&values=…, or null when the URL has none or it is not a valid table. */
export const readPivotShape = (params: URLSearchParams): PivotShape | null => {
  const rows = params.getAll('rows');
  const columns = params.getAll('columns');
  const values = params.getAll('values');
  const dimensions = [...rows, ...columns];
  if (values.length === 0 || !dimensions.every(isDimension) || !values.every(isMeasure)) return null;
  if (new Set(dimensions).size !== dimensions.length || new Set(values).size !== values.length) return null;
  return { rows: rows.filter(isDimension), columns: columns.filter(isDimension), values: values.filter(isMeasure) };
};

/** The params with the shape written as repeated rows, columns and values; other params stay. */
export const writePivotShape = (params: URLSearchParams, shape: PivotShape): URLSearchParams => {
  const next = withoutPivotShape(params);
  shape.rows.forEach((key) => next.append('rows', key));
  shape.columns.forEach((key) => next.append('columns', key));
  shape.values.forEach((value) => next.append('values', value));
  return next;
};

export const withoutPivotShape = (params: URLSearchParams): URLSearchParams => {
  const next = new URLSearchParams(params.toString());
  SHAPE_PARAMS.forEach((key) => next.delete(key));
  return next;
};

export const pivotShapeOf = ({ rows, columns, values }: PivotLayout): PivotShape => ({ rows, columns, values });

export const samePivotShape = (left: PivotShape, right: PivotShape): boolean =>
  SHAPE_PARAMS.every((key) => left[key].join() === right[key].join());

/** The layout with this shape. A filter on a field the shape now uses as a row or column is dropped. */
export const applyPivotShape = (layout: PivotLayout, shape: PivotShape): PivotLayout => {
  const next = clonePivotLayout(layout);
  const used = new Set<string>([...shape.rows, ...shape.columns]);
  return {
    ...next,
    rows: [...shape.rows],
    columns: [...shape.columns],
    values: [...shape.values],
    filters: next.filters.filter(({ key }) => !used.has(key)),
  };
};
