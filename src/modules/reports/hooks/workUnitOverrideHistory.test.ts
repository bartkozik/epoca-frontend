import { workUnitOverrideHistoryQueryKey } from '@/modules/reports/queryKeys';
import * as requests from '@/modules/reports/report/workUnitOverride/requests';
import { fetchWorkUnitOverrideHistoryPage } from '@/modules/reports/workUnitOverrideHistoryQueries';
import type { MockedFunction } from 'vitest';

vi.mock('@/modules/reports/report/workUnitOverride/requests', () => ({ getWorkUnitOverrideHistory: vi.fn() }));

const getHistoryMock = requests.getWorkUnitOverrideHistory as MockedFunction<
  typeof requests.getWorkUnitOverrideHistory
>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('workUnitOverrideHistoryQueryKey', () => {
  it('is a flat key of the entity prefix, org slug, work unit id, pinned version, and page number', () => {
    expect(workUnitOverrideHistoryQueryKey('acme', 'wu-1', 4, 1)).toEqual([
      'workUnitOverrideHistory',
      'acme',
      'wu-1',
      4,
      1,
    ]);
  });
});

describe('fetchWorkUnitOverrideHistoryPage', () => {
  it('unwraps the response data', async () => {
    const page = { count: 1, pageNumber: 1, pageSize: 25, upToVersion: 4, results: [] };
    getHistoryMock.mockResolvedValueOnce({ data: page } as unknown as Awaited<
      ReturnType<typeof requests.getWorkUnitOverrideHistory>
    >);

    const result = await fetchWorkUnitOverrideHistoryPage('acme', 'wu-1', 4, 1);

    expect(getHistoryMock).toHaveBeenCalledWith('acme', 'wu-1', 4, 1);
    expect(result).toEqual(page);
  });
});
