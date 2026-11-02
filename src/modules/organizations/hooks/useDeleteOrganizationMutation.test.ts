import { useDeleteOrganizationMutation } from '@/modules/organizations/hooks/useDeleteOrganizationMutation';
import * as requests from '@/modules/organizations/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/organizations/requests', () => ({ deleteOrganization: vi.fn() }));
const deleteOrganizationMock = requests.deleteOrganization as unknown as ReturnType<typeof vi.fn>;

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});

describe('useDeleteOrganizationMutation', () => {
  it('deletes the organization and invalidates both the list and the single entry', async () => {
    deleteOrganizationMock.mockResolvedValueOnce({ data: undefined });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteOrganizationMutation(), { wrapper });
    result.current.mutate({ slug: 'acme' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteOrganizationMock).toHaveBeenCalledWith('acme');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['organizations'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['organization', 'acme'], exact: false });
  });
});
