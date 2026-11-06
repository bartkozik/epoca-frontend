import {
  applyReorderPlan,
  computeAppendNewUnitPlan,
  computeMoveToDatePlan,
  computeReorderPlan,
  useAppendNewUnitMutation,
  useMoveUnitToDateMutation,
  useReorderUnitsMutation,
} from '@/modules/workingTime/hooks/useReorderMutation';
import { unitsQueryKey } from '@/modules/workingTime/queryKeys';
import * as requests from '@/modules/workingTime/requests';
import { RawUnit, RawUnitResults, Unit, UnitState, WorkUnitEntryType } from '@/modules/workingTime/types';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

const originalTimeZone = process.env.TZ;
process.env.TZ = 'UTC';
afterAll(() => {
  process.env.TZ = originalTimeZone;
});

vi.mock('@/modules/organizations/WorkspaceProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/organizations/WorkspaceProvider')>()),
  useWorkspace: () => ({ contextOrganizationSlug: 'acme', contextOrganizationUsers: [] }),
}));

vi.mock('@/modules/workingTime/requests', () => ({ changeUnitsOrder: vi.fn(), updateUnitDate: vi.fn() }));
const changeUnitsOrderMock = requests.changeUnitsOrder as unknown as ReturnType<typeof vi.fn>;
const updateUnitDateMock = requests.updateUnitDate as unknown as ReturnType<typeof vi.fn>;

const projectClient = {
  projectName: 'Epoca',
  clientId: 'client-1',
  projectId: 'project-1',
  clientName: 'Iterators',
  clientColor: '#123456',
  clientTexture: '',
  projectDescription: 'Time reporting',
};

const createRawUnit = (overrides: Partial<RawUnit> = {}): RawUnit => ({
  entryType: WorkUnitEntryType.Worklog,
  modifiedAt: '2026-07-28T08:00:00.000Z',
  duration: 'PT8H',
  projectClient,
  description: 'Implement CT-514',
  taskId: 'CT-514',
  id: 'unit-1',
  date: '2026-07-28',
  createdAt: '2026-07-28T08:00:00.000Z',
  userId: 'user-1',
  state: UnitState.Active,
  ...overrides,
});

const createUnit = (id: string, date: string, sequenceIndex: number): Unit =>
  ({ ...createRawUnit({ id, date }), sequenceIndex }) as Unit;

const rawResults = (
  results: RawUnit[] = [],
  orders: RawUnitResults['orders'] = [],
  draftIds: string[] = [],
): RawUnitResults => ({
  workUnits: { count: results.length, results },
  orders,
  draftIds,
});

describe('computeMoveToDatePlan', () => {
  it('appends the moved unit after the target day units, ordered by sequenceIndex', () => {
    const units = [
      createUnit('unit-a', '2026-07-29', 1),
      createUnit('unit-b', '2026-07-29', 0),
      createUnit('unit-moved', '2026-07-28', 0),
      createUnit('unit-c', '2026-07-30', 0),
    ];

    expect(computeMoveToDatePlan(units, 'unit-moved', new Date('2026-07-29T12:00:00'))).toEqual({
      movedUnitId: 'unit-moved',
      formattedDate: '2026-07-29',
      orderedUnitIds: ['unit-b', 'unit-a', 'unit-moved'],
    });
  });

  it('plans a lone unit onto an empty day', () => {
    const units = [createUnit('unit-moved', '2026-07-28', 0)];

    expect(computeMoveToDatePlan(units, 'unit-moved', new Date('2026-08-05T12:00:00'))?.orderedUnitIds).toEqual([
      'unit-moved',
    ]);
  });

  it('returns null when the unit is not found', () => {
    const units = [createUnit('unit-a', '2026-07-28', 0)];

    expect(computeMoveToDatePlan(units, 'missing', new Date('2026-07-29T12:00:00'))).toBeNull();
  });
});

describe('computeAppendNewUnitPlan', () => {
  it('appends the new unit after the existing units on its date, ordered by sequenceIndex', () => {
    const units = [
      createUnit('unit-a', '2026-07-29', 1),
      createUnit('unit-b', '2026-07-29', 0),
      createUnit('unit-c', '2026-07-30', 0),
    ];

    expect(computeAppendNewUnitPlan(units, 'unit-new', new Date('2026-07-29T12:00:00'))).toEqual({
      movedUnitId: 'unit-new',
      formattedDate: '2026-07-29',
      orderedUnitIds: ['unit-b', 'unit-a', 'unit-new'],
    });
  });

  it('plans a lone new unit onto an empty day', () => {
    expect(computeAppendNewUnitPlan([], 'unit-new', new Date('2026-08-05T12:00:00')).orderedUnitIds).toEqual([
      'unit-new',
    ]);
  });
});

describe('computeReorderPlan', () => {
  it('drops the active unit at the over unit position and shifts the rest of that day down', () => {
    const units = [
      createUnit('unit-a', '2026-07-28', 0),
      createUnit('unit-b', '2026-07-28', 1),
      createUnit('unit-c', '2026-07-28', 2),
    ];

    expect(computeReorderPlan(units, 'unit-c', 'unit-a')).toEqual({
      movedUnitId: 'unit-c',
      formattedDate: '2026-07-28',
      orderedUnitIds: ['unit-c', 'unit-a', 'unit-b'],
    });
  });

  it('leaves units before the insertion point in place', () => {
    const units = [
      createUnit('unit-a', '2026-07-28', 0),
      createUnit('unit-b', '2026-07-28', 1),
      createUnit('unit-c', '2026-07-28', 2),
    ];

    expect(computeReorderPlan(units, 'unit-a', 'unit-c')?.orderedUnitIds).toEqual(['unit-b', 'unit-a', 'unit-c']);
  });

  it('moves an active unit in from another day and ignores units on unrelated days', () => {
    const units = [
      createUnit('unit-a', '2026-07-28', 0),
      createUnit('unit-b', '2026-07-28', 1),
      createUnit('unit-other', '2026-07-30', 0),
    ];

    expect(computeReorderPlan(units, 'unit-other', 'unit-b')).toEqual({
      movedUnitId: 'unit-other',
      formattedDate: '2026-07-28',
      orderedUnitIds: ['unit-a', 'unit-other', 'unit-b'],
    });
  });

  it('returns null when either id is not found', () => {
    const units = [createUnit('unit-a', '2026-07-28', 0)];

    expect(computeReorderPlan(units, 'missing', 'unit-a')).toBeNull();
    expect(computeReorderPlan(units, 'unit-a', 'missing')).toBeNull();
  });
});

describe('applyReorderPlan', () => {
  it('re-dates the moved raw unit, strips it from its old day and writes the new day order', () => {
    const data = rawResults(
      [
        createRawUnit({ id: 'unit-a', date: '2026-07-29' }),
        createRawUnit({ id: 'unit-b', date: '2026-07-29' }),
        createRawUnit({ id: 'unit-moved', date: '2026-07-28' }),
      ],
      [
        { date: '2026-07-28', ids: ['unit-moved', 'unit-x'] },
        { date: '2026-07-29', ids: ['unit-a', 'unit-b'] },
      ],
      ['draft-1'],
    );

    const result = applyReorderPlan(data, {
      movedUnitId: 'unit-moved',
      formattedDate: '2026-07-29',
      orderedUnitIds: ['unit-a', 'unit-b', 'unit-moved'],
    });

    expect(result.orders).toEqual([
      { date: '2026-07-28', ids: ['unit-x'] },
      { date: '2026-07-29', ids: ['unit-a', 'unit-b', 'unit-moved'] },
    ]);
    expect(result.workUnits.results.find((unit) => unit.id === 'unit-moved')?.date).toBe('2026-07-29');
    expect(result.draftIds).toEqual(['draft-1']);
  });

  it('drops an orders entry emptied by stripping the moved id', () => {
    const data = rawResults(
      [createRawUnit({ id: 'unit-moved', date: '2026-07-28' })],
      [{ date: '2026-07-28', ids: ['unit-moved'] }],
    );

    const result = applyReorderPlan(data, {
      movedUnitId: 'unit-moved',
      formattedDate: '2026-08-01',
      orderedUnitIds: ['unit-moved'],
    });

    expect(result.orders).toEqual([{ date: '2026-08-01', ids: ['unit-moved'] }]);
  });

  it('replaces only that day ids for a same-day reorder', () => {
    const data = rawResults(
      [createRawUnit({ id: 'unit-a' }), createRawUnit({ id: 'unit-b' })],
      [
        { date: '2026-07-28', ids: ['unit-a', 'unit-b'] },
        { date: '2026-07-29', ids: ['unit-c'] },
      ],
    );

    const result = applyReorderPlan(data, {
      movedUnitId: 'unit-b',
      formattedDate: '2026-07-28',
      orderedUnitIds: ['unit-b', 'unit-a'],
    });

    expect(result.orders).toEqual([
      { date: '2026-07-28', ids: ['unit-b', 'unit-a'] },
      { date: '2026-07-29', ids: ['unit-c'] },
    ]);
  });

  it('does not mutate the input data', () => {
    const movedRawUnit = createRawUnit({ id: 'unit-moved', date: '2026-07-28' });
    const oldDateOrder = { date: '2026-07-28', ids: ['unit-moved', 'unit-x'] };
    const data = rawResults([movedRawUnit], [oldDateOrder]);
    const snapshot = structuredClone(data);

    const result = applyReorderPlan(data, {
      movedUnitId: 'unit-moved',
      formattedDate: '2026-07-29',
      orderedUnitIds: ['unit-moved'],
    });

    expect(data).toEqual(snapshot);
    expect(movedRawUnit.date).toBe('2026-07-28');
    expect(oldDateOrder.ids).toEqual(['unit-moved', 'unit-x']);
    expect(result).not.toBe(data);
    expect(result.orders).not.toBe(data.orders);
    expect(result.workUnits.results).not.toBe(data.workUnits.results);
  });
});

const dto = { dateFrom: '2026-07-27', dateTo: '2026-08-02' };
const queryKey = unitsQueryKey('acme', dto);

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

const seededData = (): RawUnitResults =>
  rawResults(
    [
      createRawUnit({ id: 'unit-a', date: '2026-07-28' }),
      createRawUnit({ id: 'unit-b', date: '2026-07-28' }),
      createRawUnit({ id: 'unit-c', date: '2026-07-28' }),
    ],
    [{ date: '2026-07-28', ids: ['unit-a', 'unit-b', 'unit-c'] }],
  );

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.clearAllMocks();
});

describe('useReorderUnitsMutation', () => {
  it('sends the new order then the unit date, and keeps the optimistic cache update', async () => {
    queryClient.setQueryData(queryKey, seededData());
    changeUnitsOrderMock.mockResolvedValue(undefined);
    updateUnitDateMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useReorderUnitsMutation(dto), { wrapper });
    result.current.mutate({ activeId: 'unit-c', overId: 'unit-a' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(changeUnitsOrderMock).toHaveBeenCalledWith('acme', '2026-07-28', ['unit-c', 'unit-a', 'unit-b']);
    expect(updateUnitDateMock).toHaveBeenCalledWith('acme', 'unit-c', '2026-07-28');
    expect(changeUnitsOrderMock.mock.invocationCallOrder[0]).toBeLessThan(
      updateUnitDateMock.mock.invocationCallOrder[0],
    );
    expect(queryClient.getQueryData<RawUnitResults>(queryKey)?.orders).toEqual([
      { date: '2026-07-28', ids: ['unit-c', 'unit-a', 'unit-b'] },
    ]);
  });

  it('restores the whole previous cache entry when the request fails, siblings included', async () => {
    const previousData = seededData();
    queryClient.setQueryData(queryKey, previousData);
    changeUnitsOrderMock.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useReorderUnitsMutation(dto), { wrapper });
    result.current.mutate({ activeId: 'unit-c', overId: 'unit-a' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<RawUnitResults>(queryKey)).toEqual(previousData);
  });

  it('rejects without calling the order request when an id is unknown', async () => {
    queryClient.setQueryData(queryKey, seededData());

    const { result } = renderHook(() => useReorderUnitsMutation(dto), { wrapper });
    result.current.mutate({ activeId: 'missing', overId: 'unit-a' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(changeUnitsOrderMock).not.toHaveBeenCalled();
    expect(updateUnitDateMock).not.toHaveBeenCalled();
  });
});

describe('useMoveUnitToDateMutation', () => {
  it('appends the moved unit to the target day and re-dates it in the cache', async () => {
    queryClient.setQueryData(
      queryKey,
      rawResults(
        [createRawUnit({ id: 'unit-a', date: '2026-07-29' }), createRawUnit({ id: 'unit-moved', date: '2026-07-28' })],
        [
          { date: '2026-07-28', ids: ['unit-moved'] },
          { date: '2026-07-29', ids: ['unit-a'] },
        ],
      ),
    );
    changeUnitsOrderMock.mockResolvedValue(undefined);
    updateUnitDateMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useMoveUnitToDateMutation(dto), { wrapper });
    result.current.mutate({ unitId: 'unit-moved', newDate: new Date('2026-07-29T12:00:00') });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(changeUnitsOrderMock).toHaveBeenCalledWith('acme', '2026-07-29', ['unit-a', 'unit-moved']);
    expect(updateUnitDateMock).toHaveBeenCalledWith('acme', 'unit-moved', '2026-07-29');

    const cached = queryClient.getQueryData<RawUnitResults>(queryKey);
    expect(cached?.orders).toEqual([{ date: '2026-07-29', ids: ['unit-a', 'unit-moved'] }]);
    expect(cached?.workUnits.results.find((unit) => unit.id === 'unit-moved')?.date).toBe('2026-07-29');
  });

  it('restores the previous cache entry when the request fails', async () => {
    const previousData = seededData();
    queryClient.setQueryData(queryKey, previousData);
    changeUnitsOrderMock.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useMoveUnitToDateMutation(dto), { wrapper });
    result.current.mutate({ unitId: 'unit-c', newDate: new Date('2026-07-30T12:00:00') });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData<RawUnitResults>(queryKey)).toEqual(previousData);
  });
});

describe('useAppendNewUnitMutation', () => {
  it('persists the computed order and invalidates units without changing the new unit date', async () => {
    changeUnitsOrderMock.mockResolvedValue(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(useAppendNewUnitMutation, { wrapper });

    result.current.mutate({
      movedUnitId: 'unit-new',
      formattedDate: '2026-07-28',
      orderedUnitIds: ['unit-a', 'unit-new'],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(changeUnitsOrderMock).toHaveBeenCalledWith('acme', '2026-07-28', ['unit-a', 'unit-new']);
    expect(updateUnitDateMock).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['units'], exact: false });
  });
});
