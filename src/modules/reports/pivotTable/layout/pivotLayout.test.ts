import { PIVOT_KEY, PIVOT_VALUE } from '../constants';
import {
  DEFAULT_PIVOT_LAYOUT,
  getAvailableDimensions,
  getAvailableMeasures,
  getFieldArea,
  movePivotField,
} from './pivotLayout';
import type { PivotLayout } from './types';

const layout = (): PivotLayout => ({
  rows: [PIVOT_KEY.USER, PIVOT_KEY.PROJECT],
  columns: [PIVOT_KEY.MONTH_YEAR],
  values: [PIVOT_VALUE.DURATION_SUM],
  filters: [{ key: PIVOT_KEY.ENTRY_TYPE, includedValues: ['Worklog'] }],
  options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
});

describe('pivot layout', () => {
  it('defines the default layout as months then people in rows, with no column fields', () => {
    expect(DEFAULT_PIVOT_LAYOUT).toEqual({
      rows: [PIVOT_KEY.MONTH_YEAR, PIVOT_KEY.USER],
      columns: [],
      values: [PIVOT_VALUE.DURATION_SUM],
      filters: [],
      options: { rowSubtotals: true, columnSubtotals: true, grandTotals: true },
    });
  });

  it('moves a dimension atomically between areas without mutating the input', () => {
    const current = layout();
    const result = movePivotField(current, {
      field: PIVOT_KEY.PROJECT,
      destination: 'columns',
      index: 0,
    });

    expect(result).toEqual({
      accepted: true,
      layout: {
        ...current,
        rows: [PIVOT_KEY.USER],
        columns: [PIVOT_KEY.PROJECT, PIVOT_KEY.MONTH_YEAR],
      },
    });
    expect(current).toEqual(layout());
  });

  it('moves a dimension to Filters with select-all semantics and back to Available', () => {
    const filtered = movePivotField(layout(), {
      field: PIVOT_KEY.CLIENT,
      destination: 'filters',
      index: 1,
    });
    expect(filtered.accepted).toBe(true);
    if (!filtered.accepted) throw new Error('Expected accepted move');
    expect(filtered.layout.filters).toEqual([
      { key: PIVOT_KEY.ENTRY_TYPE, includedValues: ['Worklog'] },
      { key: PIVOT_KEY.CLIENT, includedValues: null },
    ]);

    const available = movePivotField(filtered.layout, {
      field: PIVOT_KEY.ENTRY_TYPE,
      destination: 'available',
      index: 0,
    });
    expect(available).toEqual({
      accepted: true,
      layout: { ...filtered.layout, filters: [{ key: PIVOT_KEY.CLIENT, includedValues: null }] },
    });
  });

  it('reorders fields inside an area and treats the same position as a no-op', () => {
    const reordered = movePivotField(layout(), {
      field: PIVOT_KEY.PROJECT,
      destination: 'rows',
      index: 0,
    });
    expect(reordered.accepted && reordered.layout.rows).toEqual([PIVOT_KEY.PROJECT, PIVOT_KEY.USER]);

    const unchanged = movePivotField(layout(), {
      field: PIVOT_KEY.USER,
      destination: 'rows',
      index: 0,
    });
    expect(unchanged).toEqual({ accepted: false, reason: 'NO_CHANGE', layout: layout() });
  });

  it('orders measures and rejects removing the final measure', () => {
    const withCount = movePivotField(layout(), {
      field: PIVOT_VALUE.ENTRIES_COUNT,
      destination: 'values',
      index: 0,
    });
    expect(withCount.accepted && withCount.layout.values).toEqual([
      PIVOT_VALUE.ENTRIES_COUNT,
      PIVOT_VALUE.DURATION_SUM,
    ]);

    expect(
      movePivotField(layout(), {
        field: PIVOT_VALUE.DURATION_SUM,
        destination: 'available',
        index: 0,
      }),
    ).toEqual({ accepted: false, reason: 'FINAL_MEASURE', layout: layout() });
  });

  it.each([
    [PIVOT_KEY.CLIENT, 'values'],
    [PIVOT_VALUE.DURATION_AVG, 'rows'],
    ['UnknownKey', 'columns'],
  ] as const)('rejects invalid field assignment %s → %s', (field, destination) => {
    expect(movePivotField(layout(), { field, destination, index: 0 })).toEqual({
      accepted: false,
      reason: 'INVALID_DESTINATION',
      layout: layout(),
    });
  });

  it('derives field placement and available fields deterministically', () => {
    const current = layout();
    expect(getFieldArea(current, PIVOT_KEY.USER)).toBe('rows');
    expect(getFieldArea(current, PIVOT_KEY.CLIENT)).toBe('available');
    expect(getFieldArea(current, PIVOT_VALUE.DURATION_SUM)).toBe('values');
    expect(getAvailableDimensions(current)).toEqual([PIVOT_KEY.CLIENT, PIVOT_KEY.YEAR, PIVOT_KEY.DATE, PIVOT_KEY.TASK]);
    expect(getAvailableMeasures(current)).toEqual([PIVOT_VALUE.DURATION_AVG, PIVOT_VALUE.ENTRIES_COUNT]);
  });
});
