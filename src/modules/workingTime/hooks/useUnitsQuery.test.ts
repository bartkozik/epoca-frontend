import { selectModeledUnits, useUnitsQuery } from '@/modules/workingTime/hooks/useUnitsQuery';
import { unitsQueryKey } from '@/modules/workingTime/queryKeys';
import * as requests from '@/modules/workingTime/requests';
import { RawUnit, RawUnitResults, UnitState, WorkUnitEntryType } from '@/modules/workingTime/types';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/organizations/WorkspaceProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/organizations/WorkspaceProvider')>()),
  useWorkspace: () => ({ contextOrganizationSlug: 'acme', contextOrganizationUsers: [] }),
}));

vi.mock('@/modules/workingTime/requests', () => ({ getUnits: vi.fn() }));
const getUnitsMock = requests.getUnits as unknown as ReturnType<typeof vi.fn>;

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

const rawResults = (
  results: RawUnit[] = [],
  orders: RawUnitResults['orders'] = [],
  draftIds: string[] = [],
): RawUnitResults => ({
  workUnits: { count: results.length, results },
  orders,
  draftIds,
});

const wrapper = ({ children }: { children: ReactNode }): ReactElement => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('unitsQueryKey', () => {
  it('is a flat, entity-prefixed key that serializes organizationSlug + dto', () => {
    expect(unitsQueryKey('acme', { dateFrom: '2026-07-28' })).toEqual([
      'units',
      JSON.stringify({ organizationSlug: 'acme', dateFrom: '2026-07-28' }),
    ]);
  });
});

describe('useUnitsQuery', () => {
  it('fetches with the org slug and dto and returns the raw results', async () => {
    const data = rawResults([createRawUnit()]);
    getUnitsMock.mockResolvedValueOnce({ data });

    const dto = { dateFrom: '2026-07-28', dateTo: '2026-08-03' };
    const { result } = renderHook(() => useUnitsQuery(dto), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getUnitsMock).toHaveBeenCalledWith('acme', dto);
    expect(result.current.data).toEqual(data);
  });
});

describe('selectModeledUnits', () => {
  it('returns [] for undefined input', () => {
    expect(selectModeledUnits(undefined, [])).toEqual([]);
  });

  it('filters out units with a null/malformed projectClient, matching filterNonNullItems exclusion', () => {
    const validUnit = createRawUnit({ id: 'unit-1' });
    const malformedUnit = { ...createRawUnit({ id: 'unit-2' }), projectClient: null } as unknown as RawUnit;
    const data = rawResults([validUnit, malformedUnit]);

    const result = selectModeledUnits(data, []);

    expect(result.map((unit) => unit.id)).toEqual(['unit-1']);
  });

  it('assigns sequenceIndex as array index when there are no orders', () => {
    const unitA = createRawUnit({ id: 'unit-a' });
    const unitB = createRawUnit({ id: 'unit-b' });
    const data = rawResults([unitA, unitB], []);

    const result = selectModeledUnits(data, []);

    expect(result.map((unit) => ({ id: unit.id, sequenceIndex: unit.sequenceIndex }))).toEqual([
      { id: 'unit-a', sequenceIndex: 0 },
      { id: 'unit-b', sequenceIndex: 1 },
    ]);
  });

  it('applies orders-based sequencing: overwrites date/sequenceIndex per id, then sorts by date then sequenceIndex', () => {
    const unitA = createRawUnit({ id: 'unit-a', date: '2026-07-28' });
    const unitB = createRawUnit({ id: 'unit-b', date: '2026-07-28' });
    const unitC = createRawUnit({ id: 'unit-c', date: '2026-07-29' });
    const data = rawResults(
      [unitA, unitB, unitC],
      [
        { date: '2026-07-29', ids: ['unit-c'] },
        { date: '2026-07-28', ids: ['unit-b', 'unit-a'] },
      ],
    );

    const result = selectModeledUnits(data, []);

    expect(result.map((unit) => ({ id: unit.id, date: unit.date, sequenceIndex: unit.sequenceIndex }))).toEqual([
      { id: 'unit-b', date: '2026-07-28', sequenceIndex: 0 },
      { id: 'unit-a', date: '2026-07-28', sequenceIndex: 1 },
      { id: 'unit-c', date: '2026-07-29', sequenceIndex: 0 },
    ]);
  });
});
