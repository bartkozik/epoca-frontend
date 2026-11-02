import { useToggleClientArchiveMutation } from '@/modules/clients/hooks/useToggleClientArchiveMutation';
import * as requests from '@/modules/clients/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/clients/requests', () => ({ archiveClient: vi.fn(), unarchiveClient: vi.fn() }));
const archiveClientMock = requests.archiveClient as unknown as ReturnType<typeof vi.fn>;
const unarchiveClientMock = requests.unarchiveClient as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));

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

describe('useToggleClientArchiveMutation', () => {
  it('archives when not currently archived, then invalidates', async () => {
    archiveClientMock.mockResolvedValueOnce({});
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useToggleClientArchiveMutation(), { wrapper });
    result.current.mutate({ clientId: 'client-1', isCurrentlyArchived: false });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(archiveClientMock).toHaveBeenCalledWith('acme', 'client-1');
    expect(unarchiveClientMock).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['client', 'acme', 'client-1'], exact: false });
  });

  it('unarchives when currently archived', async () => {
    unarchiveClientMock.mockResolvedValueOnce({});

    const { result } = renderHook(() => useToggleClientArchiveMutation(), { wrapper });
    result.current.mutate({ clientId: 'client-1', isCurrentlyArchived: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(unarchiveClientMock).toHaveBeenCalledWith('acme', 'client-1');
    expect(archiveClientMock).not.toHaveBeenCalled();
  });
});
