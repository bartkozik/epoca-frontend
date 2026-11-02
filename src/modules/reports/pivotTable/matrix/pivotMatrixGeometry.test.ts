import {
  BODY_ROW_HEIGHT,
  COMPACT_MATRIX_GEOMETRY,
  HEADER_ROW_HEIGHT,
  headerRowOffset,
  matrixGeometryForViewport,
  matrixTableWidth,
  ROW_FIELD_WIDTH,
  ROW_STICKY_MAX_CONTAINER_RATIO,
  ROW_STICKY_MIN_VIEWPORT,
  rowFieldOffset,
  shouldFreezeRowFields,
  VALUE_COLUMN_WIDTH,
} from './pivotMatrixGeometry';

describe('pivot matrix geometry', () => {
  it('defines the approved cell rhythm and exact table width', () => {
    expect({
      BODY_ROW_HEIGHT,
      HEADER_ROW_HEIGHT,
      ROW_FIELD_WIDTH,
      ROW_STICKY_MAX_CONTAINER_RATIO,
      ROW_STICKY_MIN_VIEWPORT,
      VALUE_COLUMN_WIDTH,
    }).toEqual({
      BODY_ROW_HEIGHT: 48,
      HEADER_ROW_HEIGHT: 44,
      ROW_FIELD_WIDTH: 196,
      ROW_STICKY_MAX_CONTAINER_RATIO: 0.5,
      ROW_STICKY_MIN_VIEWPORT: 768,
      VALUE_COLUMN_WIDTH: 128,
    });
    expect(matrixTableWidth(2, 9)).toBe(1544);
    expect(rowFieldOffset(0)).toBe(0);
    expect(rowFieldOffset(3)).toBe(588);
    expect(headerRowOffset(3)).toBe(132);
  });

  it('freezes rows only at desktop/tablet width and below half of the matrix viewport', () => {
    expect(shouldFreezeRowFields(1200, 1000, 2)).toBe(true);
    expect(shouldFreezeRowFields(1200, 780, 2)).toBe(false);
    expect(shouldFreezeRowFields(767, 1200, 1)).toBe(false);
    expect(shouldFreezeRowFields(1200, 1600, 7)).toBe(false);
  });

  it('uses compact laptop geometry without coupling it to viewport height', () => {
    expect(matrixGeometryForViewport(1599)).toBe(COMPACT_MATRIX_GEOMETRY);
    expect(matrixGeometryForViewport(1600)).not.toBe(COMPACT_MATRIX_GEOMETRY);
    expect(matrixTableWidth(2, 9, COMPACT_MATRIX_GEOMETRY)).toBe(1360);
    expect(rowFieldOffset(1, COMPACT_MATRIX_GEOMETRY)).toBe(176);
    expect(headerRowOffset(2, COMPACT_MATRIX_GEOMETRY)).toBe(80);
  });
});
