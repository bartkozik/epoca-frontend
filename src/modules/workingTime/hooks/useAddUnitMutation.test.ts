import { useAddUnitMutation } from '@/modules/workingTime/hooks/useAddUnitMutation';
import * as requests from '@/modules/workingTime/requests';
import { RawUnit, UnitState, WorkUnitEntryType } from '@/modules/workingTime/types';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/organizations/WorkspaceProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/organizations/WorkspaceProvider')>()),
  useWorkspace: () => ({ contextOrganizationSlug: 'acme', contextOrganizationUsers: [] }),
}));

vi.mock('@/modules/workingTime/requests', () => ({ addUnit: vi.fn() }));
const addUnitMock = requests.addUnit as unknown as ReturnType<typeof vi.fn>;

const rawUnit: RawUnit = {
  entryType: WorkUnitEntryType.Worklog,
  modifiedAt: '2026-07-28T08:00:00.000Z',
  duration: 'PT8H',
  projectClient: {
    projectName: 'Epoca',
    clientId: 'client-1',
    projectId: 'project-1',
    clientName: 'Iterators',
    clientColor: '#123456',
    clientTexture: '',
    projectDescription: 'Time reporting',
  },
  description: 'Implement CT-514',
  taskId: 'CT-514',
  id: 'unit-1',
  date: '2026-07-28',
  createdAt: '2026-07-28T08:00:00.000Z',
  userId: 'user-1',
  state: UnitState.Active,
};

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

describe('useAddUnitMutation', () => {
  it('adds a unit and invalidates the units cache', async () => {
    addUnitMock.mockResolvedValueOnce({ data: rawUnit });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useAddUnitMutation(), { wrapper });
    result.current.mutate({
      dto: { entryType: WorkUnitEntryType.Worklog, projectId: 'project-1', duration: 'PT8H' },
      isDraft: false,
      idempotencyKey: 'key-1',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(addUnitMock).toHaveBeenCalledWith(
      'acme',
      { entryType: WorkUnitEntryType.Worklog, projectId: 'project-1', duration: 'PT8H' },
      false,
      'key-1',
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['units'], exact: false });
    expect(result.current.data).toEqual(rawUnit);
  });
});
