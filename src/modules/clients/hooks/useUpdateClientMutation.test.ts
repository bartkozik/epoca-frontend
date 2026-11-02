import { useUpdateClientMutation } from '@/modules/clients/hooks/useUpdateClientMutation';
import * as requests from '@/modules/clients/requests';
import { ClientType } from '@/modules/clients/types';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/clients/requests', () => ({ editClient: vi.fn() }));
const editClientMock = requests.editClient as unknown as ReturnType<typeof vi.fn>;

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

describe('useUpdateClientMutation', () => {
  it('edits a client and invalidates both the list and the single-client cache entry', async () => {
    editClientMock.mockResolvedValueOnce({ data: {} });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateClientMutation(), { wrapper });
    result.current.mutate({
      clientId: 'client-1',
      name: 'Acme Renamed',
      color: '#000000',
      texture: 'texture-1',
      logo: '',
      type: ClientType.External,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(editClientMock).toHaveBeenCalledWith('acme', {
      clientId: 'client-1',
      name: 'Acme Renamed',
      color: '#000000',
      texture: 'texture-1',
      logo: '',
      type: ClientType.External,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['client', 'acme', 'client-1'], exact: false });
  });
});
