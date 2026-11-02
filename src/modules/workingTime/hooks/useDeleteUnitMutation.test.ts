import { useDeleteUnitMutation } from '@/modules/workingTime/hooks/useDeleteUnitMutation';
import * as requests from '@/modules/workingTime/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/organizations/WorkspaceProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/organizations/WorkspaceProvider')>()),
  useWorkspace: () => ({ contextOrganizationSlug: 'acme', contextOrganizationUsers: [] }),
}));

vi.mock('@/modules/workingTime/requests', () => ({ deleteUnit: vi.fn() }));
const deleteUnitMock = requests.deleteUnit as unknown as ReturnType<typeof vi.fn>;

const { getReportedUnitsMock } = vi.hoisted(() => ({ getReportedUnitsMock: vi.fn() }));
vi.mock('@/modules/reports/hooks/useReportedUnits', () => ({ getReportedUnits: getReportedUnitsMock }));

let queryClient: QueryClient;
// createElement instead of JSX: this file stays `.ts` (matching this repo's
// check-file/filename-naming-convention, which only exempts `use*.test.tsx` from PascalCase),
// so it can't use JSX syntax, which only parses in `.tsx`. queryClient is read from the outer
// variable (rather than created fresh inside wrapper) so the test can spy on the same instance.
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});

describe('useDeleteUnitMutation', () => {
  it('deletes a unit, invalidates calendar data, and refreshes reported data', async () => {
    deleteUnitMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteUnitMutation(), { wrapper });
    result.current.mutate({ workUnitId: 'unit-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteUnitMock).toHaveBeenCalledWith('acme', 'unit-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['units'], exact: false });
    expect(getReportedUnitsMock).toHaveBeenCalledOnce();
  });
});
