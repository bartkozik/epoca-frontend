import { useDeleteUserMutation } from '@/modules/users/hooks/useDeleteUserMutation';
import { useUserQuery } from '@/modules/users/hooks/useUserQuery';
import * as requests from '@/modules/users/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/users/requests', () => ({ deleteUser: vi.fn(), getUser: vi.fn() }));
const deleteUserMock = requests.deleteUser as unknown as ReturnType<typeof vi.fn>;
const getUserMock = requests.getUser as unknown as ReturnType<typeof vi.fn>;

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

describe('useDeleteUserMutation', () => {
  it('deletes a user and invalidates both the list and the single-user cache entry', async () => {
    deleteUserMock.mockResolvedValueOnce({ data: undefined });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteUserMutation(), { wrapper });
    result.current.mutate('user-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteUserMock).toHaveBeenCalledWith('user-1');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['user', 'user-1'], exact: false });
  });

  it('invalidates a single user query cached by useUserQuery after deleting that user', async () => {
    getUserMock.mockResolvedValueOnce({ data: { id: 'user-1' } });
    deleteUserMock.mockResolvedValueOnce({ data: undefined });

    const { result } = renderHook(
      () => ({
        userQuery: useUserQuery('user-1'),
        deleteMutation: useDeleteUserMutation(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.userQuery.isSuccess).toBe(true));
    expect(getUserMock).toHaveBeenCalledWith('user-1');
    expect(queryClient.getQueryState(['user', 'user-1'])?.isInvalidated).toBe(false);

    result.current.deleteMutation.mutate('user-1');

    await waitFor(() => expect(result.current.deleteMutation.isSuccess).toBe(true));
    expect(deleteUserMock).toHaveBeenCalledWith('user-1');
    expect(queryClient.getQueryState(['user', 'user-1'])?.isInvalidated).toBe(true);
  });
});
