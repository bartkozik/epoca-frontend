import { PIVOT_KEY, PIVOT_VALUE } from '../constants';
import { DEFAULT_PIVOT_LAYOUT } from './pivotLayout';
import { loadPivotLayout, pivotLayoutStorageKey, savePivotLayout } from './pivotLayoutStorage';

describe('pivotLayoutStorage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips one versioned preset per user and organization without writing the default on read', () => {
    const key = pivotLayoutStorageKey('user-1', 'acme');
    const preset = {
      ...DEFAULT_PIVOT_LAYOUT,
      rows: [PIVOT_KEY.USER, PIVOT_KEY.PROJECT],
      values: [PIVOT_VALUE.DURATION_SUM, PIVOT_VALUE.ENTRIES_COUNT],
    };

    expect(loadPivotLayout('user-1', 'acme')).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();

    savePivotLayout('user-1', 'acme', preset);

    expect(loadPivotLayout('user-1', 'acme')).toEqual(preset);
    expect(JSON.parse(localStorage.getItem(key) ?? '')).toEqual({ version: 1, layout: preset });
    expect(loadPivotLayout('user-2', 'acme')).toBeNull();
    expect(loadPivotLayout('user-1', 'beta')).toBeNull();
  });

  it.each([
    { version: 2, layout: DEFAULT_PIVOT_LAYOUT },
    { version: 1, layout: { ...DEFAULT_PIVOT_LAYOUT, values: [] } },
    {
      version: 1,
      layout: { ...DEFAULT_PIVOT_LAYOUT, columns: [PIVOT_KEY.USER, PIVOT_KEY.MONTH_YEAR] },
    },
    { version: 1, layout: { ...DEFAULT_PIVOT_LAYOUT, rows: ['UnknownKey'] } },
    {
      version: 1,
      layout: { ...DEFAULT_PIVOT_LAYOUT, options: { ...DEFAULT_PIVOT_LAYOUT.options, grandTotals: 'yes' } },
    },
  ])('ignores and removes an invalid or outdated preset %#', (stored) => {
    const key = pivotLayoutStorageKey('user-1', 'acme');
    localStorage.setItem(key, JSON.stringify(stored));

    expect(loadPivotLayout('user-1', 'acme')).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('round-trips a TaskKey filter including its null no-task member', () => {
    const preset = {
      ...DEFAULT_PIVOT_LAYOUT,
      filters: [{ key: PIVOT_KEY.TASK, includedValues: ['PROJ-1', null] }],
    };

    savePivotLayout('user-1', 'acme', preset);

    expect(loadPivotLayout('user-1', 'acme')).toEqual(preset);
  });

  it('rejects a stored TaskKey filter member of the wrong type', () => {
    const key = pivotLayoutStorageKey('user-1', 'acme');
    const stored = {
      version: 1,
      layout: {
        ...DEFAULT_PIVOT_LAYOUT,
        filters: [{ key: PIVOT_KEY.TASK, includedValues: [42] }],
      },
    };
    localStorage.setItem(key, JSON.stringify(stored));

    expect(loadPivotLayout('user-1', 'acme')).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('returns defensive clones instead of sharing stored arrays', () => {
    savePivotLayout('user-1', 'acme', DEFAULT_PIVOT_LAYOUT);

    const first = loadPivotLayout('user-1', 'acme');
    first?.rows.push(PIVOT_KEY.PROJECT);

    expect(loadPivotLayout('user-1', 'acme')).toEqual(DEFAULT_PIVOT_LAYOUT);
  });
});
