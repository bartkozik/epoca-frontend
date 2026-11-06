import { useEditUnitMutation } from '@/modules/workingTime/hooks/useEditUnitMutation';
import * as requests from '@/modules/workingTime/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/organizations/WorkspaceProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/organizations/WorkspaceProvider')>()),
  useWorkspace: () => ({ contextOrganizationSlug: 'acme', contextOrganizationUsers: [] }),
}));

vi.mock('@/modules/workingTime/requests', () => ({ editUnit: vi.fn() }));
const editUnitMock = requests.editUnit as unknown as ReturnType<typeof vi.fn>;

const { getReportedUnitsMock } = vi.hoisted(() => ({ getReportedUnitsMock: vi.fn() }));
vi.mock('@/modules/reports/hooks/useReportedUnits', () => ({ getReportedUnits: getReportedUnitsMock }));

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});

describe('useEditUnitMutation', () => {
  it('edits a unit, invalidates calendar data, and refreshes reported data', async () => {
    editUnitMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useEditUnitMutation(), { wrapper });
    result.current.mutate({
      workUnitId: 'unit-1',
      dto: { projectId: 'project-1', duration: 'PT8H', description: 'Implement CT-514' },
      shouldFinalize: true,
      idempotencyKey: 'key-1',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(editUnitMock).toHaveBeenCalledWith(
      'acme',
      'unit-1',
      { projectId: 'project-1', duration: 'PT8H', description: 'Implement CT-514' },
      true,
      'key-1',
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['units'], exact: false });
    expect(getReportedUnitsMock).toHaveBeenCalledOnce();
  });
});
