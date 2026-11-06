import { useUpdateUserMutation } from '@/modules/users/hooks/useUpdateUserMutation';
import * as requests from '@/modules/users/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/users/requests', () => ({ updateUser: vi.fn() }));
const updateUserMock = requests.updateUser as unknown as ReturnType<typeof vi.fn>;

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});

describe('useUpdateUserMutation', () => {
  it('updates a user and invalidates both the list and the single-user cache entry', async () => {
    updateUserMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateUserMutation(), { wrapper });
    result.current.mutate({ userId: 'user-1', name: 'Ada Renamed' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(updateUserMock).toHaveBeenCalledWith('user-1', 'Ada Renamed');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user', 'user-1'], exact: false });
  });
});
