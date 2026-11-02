import { workUnitOverrideQueryKey } from '@/modules/reports/queryKeys';
import { overrideFixture } from '@/modules/reports/report/workUnitOverride/overrideTestFixtures';
import * as requests from '@/modules/reports/report/workUnitOverride/requests';
import { fetchWorkUnitOverride } from '@/modules/reports/workUnitOverrideQueries';
import type { MockedFunction } from 'vitest';

vi.mock('@/modules/reports/report/workUnitOverride/requests', () => ({ getWorkUnitOverride: vi.fn() }));

const getWorkUnitOverrideMock = requests.getWorkUnitOverride as MockedFunction<typeof requests.getWorkUnitOverride>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('workUnitOverrideQueryKey', () => {
  it('is a flat key of the entity prefix, org slug, and work unit id', () => {
    expect(workUnitOverrideQueryKey('acme', 'wu-1')).toEqual(['workUnitOverride', 'acme', 'wu-1']);
  });
});

describe('fetchWorkUnitOverride', () => {
  it('unwraps the response data', async () => {
    const data = overrideFixture();
    getWorkUnitOverrideMock.mockResolvedValueOnce({ data } as Awaited<ReturnType<typeof requests.getWorkUnitOverride>>);

    const result = await fetchWorkUnitOverride('acme', 'wu-1');

    expect(getWorkUnitOverrideMock).toHaveBeenCalledWith('acme', 'wu-1');
    expect(result).toEqual(data);
  });
});
