import { IdentityType } from '@/core/models/auth';
import { useCreateUserMutation } from '@/modules/users/hooks/useCreateUserMutation';
import * as requests from '@/modules/users/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/users/requests', () => ({ createUser: vi.fn() }));
const createUserMock = requests.createUser as unknown as ReturnType<typeof vi.fn>;

const rawUser = {
  archivedAt: '',
  avatar: '',
  color: '#000000',
  createdAt: '2024-01-01T00:00:00.000Z',
  firstName: 'Ada',
  id: 'user-1',
  identities: [
    {
      confirmationCode: null,
      confirmed: true,
      createdAt: '2024-01-01T00:00:00.000Z',
      id: 'identity-1',
      main: true,
      type: IdentityType.MailAddress,
      userId: 'user-1',
      value: 'ada@example.com',
    },
  ],
  isSuperAdmin: false,
  lastName: 'Lovelace',
  modifiedAt: '2024-01-01T00:00:00.000Z',
};

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});

describe('useCreateUserMutation', () => {
  it('creates a user and invalidates the users list', async () => {
    createUserMock.mockResolvedValueOnce({ data: rawUser });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateUserMutation(), { wrapper });
    result.current.mutate({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createUserMock).toHaveBeenCalledWith('Ada', 'Lovelace', 'ada@example.com');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'], exact: false });
    expect(result.current.data).toEqual(rawUser);
  });
});
