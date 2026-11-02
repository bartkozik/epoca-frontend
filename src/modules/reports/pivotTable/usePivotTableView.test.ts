import { act, renderHook } from '@testing-library/react';
import { PIVOT_KEY, PIVOT_VALUE } from './constants';
import { DEFAULT_PIVOT_LAYOUT } from './layout/pivotLayout';
import { pivotLayoutStorageKey } from './layout/pivotLayoutStorage';
import { usePivotTableView } from './usePivotTableView';

let currentOrganizationSlug = 'acme';
let loggedInUserId: string | null = 'user-1';
vi.mock('@/modules/auth/AuthProvider', () => ({
  useAuth: () => ({ loggedInUser: loggedInUserId ? { id: loggedInUserId } : undefined }),
}));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: currentOrganizationSlug }),
}));

const mockStores = (organizationSlug = 'acme', userId: string | null = 'user-1'): void => {
  loggedInUserId = userId;
  currentOrganizationSlug = organizationSlug;
};

describe('usePivotTableView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('keeps a separate layout for every organization', () => {
    mockStores('acme');
    const { result, rerender } = renderHook(() => usePivotTableView());
    expect(result.current.layout).toEqual(DEFAULT_PIVOT_LAYOUT);

    act(() => {
      result.current.moveField({ field: PIVOT_KEY.PROJECT, destination: 'rows', index: 1 });
    });
    expect(result.current.layout.rows).toEqual([PIVOT_KEY.MONTH_YEAR, PIVOT_KEY.PROJECT, PIVOT_KEY.USER]);

    mockStores('beta');
    rerender();
    expect(result.current.layout).toEqual(DEFAULT_PIVOT_LAYOUT);

    mockStores('acme');
    rerender();
    expect(result.current.layout.rows).toEqual([PIVOT_KEY.MONTH_YEAR, PIVOT_KEY.PROJECT, PIVOT_KEY.USER]);
  });

  it('persists accepted presets per authenticated user and organization and restores them in a fresh hook instance', () => {
    mockStores('acme', 'user-1');
    const { result } = renderHook(() => usePivotTableView());

    act(() => {
      result.current.moveField({ field: PIVOT_KEY.PROJECT, destination: 'rows', index: 1 });
    });

    expect(JSON.parse(localStorage.getItem(pivotLayoutStorageKey('user-1', 'acme')) ?? '')).toMatchObject({
      version: 1,
      layout: { rows: [PIVOT_KEY.MONTH_YEAR, PIVOT_KEY.PROJECT, PIVOT_KEY.USER] },
    });

    mockStores('acme', 'user-1');
    const { result: freshResult } = renderHook(() => usePivotTableView());
    expect(freshResult.current.layout.rows).toEqual([PIVOT_KEY.MONTH_YEAR, PIVOT_KEY.PROJECT, PIVOT_KEY.USER]);
  });

  it('does not persist an anonymous layout', () => {
    mockStores('acme', null);
    const { result } = renderHook(() => usePivotTableView());

    act(() => {
      result.current.moveField({ field: PIVOT_KEY.PROJECT, destination: 'rows', index: 1 });
    });

    expect(localStorage).toHaveLength(0);
  });

  it('rejects a final-measure removal and a no-change move without persisting', () => {
    mockStores();
    const { result } = renderHook(() => usePivotTableView());

    expect(
      result.current.moveField({ field: PIVOT_VALUE.DURATION_SUM, destination: 'available', index: 0 }),
    ).toMatchObject({ accepted: false, reason: 'FINAL_MEASURE' });
    expect(result.current.moveField({ field: PIVOT_KEY.MONTH_YEAR, destination: 'rows', index: 0 })).toMatchObject({
      accepted: false,
      reason: 'NO_CHANGE',
    });
    expect(localStorage).toHaveLength(0);
  });

  it('applies a filter and independent options, each rejecting a no-op call', () => {
    mockStores();
    const { result } = renderHook(() => usePivotTableView());

    act(() => {
      result.current.moveField({ field: PIVOT_KEY.ENTRY_TYPE, destination: 'filters', index: 0 });
    });

    let applied = false;
    act(() => {
      applied = result.current.applyFilter(PIVOT_KEY.ENTRY_TYPE, ['Worklog']);
    });
    expect(applied).toBe(true);
    expect(result.current.layout.filters).toEqual([{ key: PIVOT_KEY.ENTRY_TYPE, includedValues: ['Worklog'] }]);

    let optionChanged = false;
    act(() => {
      optionChanged = result.current.setOption('columnSubtotals', false);
    });
    expect(optionChanged).toBe(true);
    expect(result.current.layout.options.columnSubtotals).toBe(false);

    expect(result.current.applyFilter(PIVOT_KEY.ENTRY_TYPE, [])).toBe(false);
    expect(result.current.setOption('columnSubtotals', false)).toBe(false);
  });

  it('resets the layout to the default preset', () => {
    mockStores();
    const { result } = renderHook(() => usePivotTableView());
    act(() => {
      result.current.moveField({ field: PIVOT_KEY.PROJECT, destination: 'rows', index: 1 });
    });
    expect(result.current.layout).not.toEqual(DEFAULT_PIVOT_LAYOUT);

    act(() => result.current.resetLayout());
    expect(result.current.layout).toEqual(DEFAULT_PIVOT_LAYOUT);
  });
});
