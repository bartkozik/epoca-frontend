export const ROW_FIELD_WIDTH = 196;
export const VALUE_COLUMN_WIDTH = 128;
export const HEADER_ROW_HEIGHT = 44;
export const BODY_ROW_HEIGHT = 48;
export const COMPACT_ROW_FIELD_WIDTH = 176;
export const COMPACT_VALUE_COLUMN_WIDTH = 112;
export const COMPACT_HEADER_ROW_HEIGHT = 40;
export const COMPACT_BODY_ROW_HEIGHT = 44;
export const ROW_STICKY_MIN_VIEWPORT = 768;
export const ROW_STICKY_MAX_CONTAINER_RATIO = 0.5;
export const MATRIX_COMPACT_MAX_VIEWPORT = 1599;

export interface PivotMatrixGeometry {
  bodyRowHeight: number;
  density: 'comfortable' | 'compact';
  headerRowHeight: number;
  rowFieldWidth: number;
  valueColumnWidth: number;
}

export const COMFORTABLE_MATRIX_GEOMETRY: PivotMatrixGeometry = {
  bodyRowHeight: BODY_ROW_HEIGHT,
  density: 'comfortable',
  headerRowHeight: HEADER_ROW_HEIGHT,
  rowFieldWidth: ROW_FIELD_WIDTH,
  valueColumnWidth: VALUE_COLUMN_WIDTH,
};

export const COMPACT_MATRIX_GEOMETRY: PivotMatrixGeometry = {
  bodyRowHeight: COMPACT_BODY_ROW_HEIGHT,
  density: 'compact',
  headerRowHeight: COMPACT_HEADER_ROW_HEIGHT,
  rowFieldWidth: COMPACT_ROW_FIELD_WIDTH,
  valueColumnWidth: COMPACT_VALUE_COLUMN_WIDTH,
};

export const matrixGeometryForViewport = (viewportWidth: number): PivotMatrixGeometry =>
  viewportWidth <= MATRIX_COMPACT_MAX_VIEWPORT ? COMPACT_MATRIX_GEOMETRY : COMFORTABLE_MATRIX_GEOMETRY;

export const matrixTableWidth = (
  rowFieldCount: number,
  renderedValueColumnCount: number,
  geometry: PivotMatrixGeometry = COMFORTABLE_MATRIX_GEOMETRY,
): number => rowFieldCount * geometry.rowFieldWidth + renderedValueColumnCount * geometry.valueColumnWidth;

export const rowFieldOffset = (
  fieldIndex: number,
  geometry: PivotMatrixGeometry = COMFORTABLE_MATRIX_GEOMETRY,
): number => fieldIndex * geometry.rowFieldWidth;

export const headerRowOffset = (
  headerLevel: number,
  geometry: PivotMatrixGeometry = COMFORTABLE_MATRIX_GEOMETRY,
): number => headerLevel * geometry.headerRowHeight;

export const shouldFreezeRowFields = (
  viewportWidth: number,
  containerWidth: number,
  rowFieldCount: number,
  geometry: PivotMatrixGeometry = COMFORTABLE_MATRIX_GEOMETRY,
): boolean =>
  viewportWidth >= ROW_STICKY_MIN_VIEWPORT &&
  rowFieldCount * geometry.rowFieldWidth <= containerWidth * ROW_STICKY_MAX_CONTAINER_RATIO;
