import { PIVOT_KEY } from '../constants';

export const dimensions = new Set<string>(Object.values(PIVOT_KEY));

export const getFieldLabelKey = (field: string): string =>
  dimensions.has(field) ? `pivot_table.dimensions.${field}` : `pivot_table.values.${field}`;
