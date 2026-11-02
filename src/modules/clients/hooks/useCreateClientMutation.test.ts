import { useCreateClientMutation } from '@/modules/clients/hooks/useCreateClientMutation';
import * as requests from '@/modules/clients/requests';
import { ClientType } from '@/modules/clients/types';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/clients/requests', () => ({ addNewClient: vi.fn() }));
const addNewClientMock = requests.addNewClient as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));

const rawClient = {
  archivedAt: '',
  color: '#000000',
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  id: 'client-1',
  logo: '',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  name: 'Acme',
  organizationId: 'org-1',
  projectCount: 0,
  texture: 'texture-1',
  type: ClientType.External,
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

describe('useCreateClientMutation', () => {
  it('creates a client and invalidates the clients list', async () => {
    addNewClientMock.mockResolvedValueOnce({ data: rawClient });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateClientMutation(), { wrapper });
    result.current.mutate({
      name: 'Acme',
      color: '#000000',
      texture: 'texture-1',
      logo: '',
      type: ClientType.External,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(addNewClientMock).toHaveBeenCalledWith('acme', 'Acme', '#000000', 'texture-1', '', ClientType.External);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients'], exact: false });
    expect(result.current.data).toEqual(rawClient);
  });
});
