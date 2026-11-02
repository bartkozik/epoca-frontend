import { PIVOT_KEY, PIVOT_VALUE } from '../constants';
import { DEFAULT_PIVOT_LAYOUT } from './pivotLayout';
import {
  applyPivotShape,
  pivotShapeOf,
  readPivotShape,
  samePivotShape,
  withoutPivotShape,
  writePivotShape,
} from './pivotShapeURL';

describe('pivot shape in the URL', () => {
  it('writes rows, columns and values as plain repeated params and keeps the other params', () => {
    const params = writePivotShape(new URLSearchParams('startDate=2026-10-01&rows=TaskKey'), {
      rows: [PIVOT_KEY.CLIENT, PIVOT_KEY.PROJECT],
      columns: [PIVOT_KEY.MONTH_YEAR],
      values: [PIVOT_VALUE.DURATION_SUM],
    });

    expect(params.toString()).toBe(
      'startDate=2026-10-01&rows=ClientKey&rows=ProjectKey&columns=MonthYearKey&values=DurationSum',
    );
  });

  it('reads back what it wrote, including no columns', () => {
    const shape = { rows: [PIVOT_KEY.PROJECT, PIVOT_KEY.USER], columns: [], values: [PIVOT_VALUE.DURATION_SUM] };

    expect(readPivotShape(writePivotShape(new URLSearchParams(), shape))).toEqual(shape);
  });

  it.each([
    ['no values', 'rows=UserKey&columns=MonthYearKey'],
    ['an unknown field', 'rows=Nonsense&values=DurationSum'],
    ['a measure as a row', 'rows=DurationSum&values=DurationSum'],
    ['a field used twice', 'rows=UserKey&columns=UserKey&values=DurationSum'],
  ])('ignores a URL with %s', (_case, search) => {
    expect(readPivotShape(new URLSearchParams(search))).toBeNull();
  });

  it('removes only the shape params', () => {
    expect(withoutPivotShape(new URLSearchParams('rows=UserKey&clients=c1&values=DurationSum')).toString()).toBe(
      'clients=c1',
    );
  });

  it('applies a shape and drops filters on fields that became rows or columns', () => {
    const layout = {
      ...DEFAULT_PIVOT_LAYOUT,
      filters: [
        { key: PIVOT_KEY.PROJECT, includedValues: ['p1'] },
        { key: PIVOT_KEY.ENTRY_TYPE, includedValues: null },
      ],
    };
    const next = applyPivotShape(layout, {
      rows: [PIVOT_KEY.PROJECT],
      columns: [],
      values: [PIVOT_VALUE.DURATION_SUM],
    });

    expect(next.rows).toEqual([PIVOT_KEY.PROJECT]);
    expect(next.filters).toEqual([{ key: PIVOT_KEY.ENTRY_TYPE, includedValues: null }]);
    expect(next.options).toEqual(layout.options);
    expect(
      samePivotShape(pivotShapeOf(next), { rows: [PIVOT_KEY.PROJECT], columns: [], values: ['DurationSum'] }),
    ).toBe(true);
  });
});
