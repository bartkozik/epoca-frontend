import type { PivotKey, PivotValue } from '../constants';
import type { PivotFilter, PivotOptions } from '../types';

export type PivotArea = 'available' | 'rows' | 'columns' | 'values' | 'filters';

export interface PivotLayout {
  rows: PivotKey[];
  columns: PivotKey[];
  values: PivotValue[];
  filters: PivotFilter[];
  options: PivotOptions;
}

export interface PivotFieldMove {
  field: string;
  destination: PivotArea;
  index: number;
}

export type PivotMoveRejection = 'FINAL_MEASURE' | 'INVALID_DESTINATION' | 'NO_CHANGE';

export type PivotMoveResult =
  { accepted: true; layout: PivotLayout } | { accepted: false; reason: PivotMoveRejection; layout: PivotLayout };
