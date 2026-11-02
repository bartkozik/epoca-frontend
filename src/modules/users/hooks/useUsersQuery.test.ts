import { IdentityType } from '@/core/models/auth';
import { useUsersQuery } from '@/modules/users/hooks/useUsersQuery';
import { usersQueryKey } from '@/modules/users/queryKeys';
import * as requests from '@/modules/users/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/users/requests', () => ({ getUsers: vi.fn() }));
const getUsersMock = requests.getUsers as unknown as ReturnType<typeof vi.fn>;

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

// createElement instead of JSX: this file stays `.ts` (matching this repo's
// check-file/filename-naming-convention, which only exempts `use*.test.tsx` from PascalCase),
// so it can't use JSX syntax, which only parses in `.tsx`.
const wrapper = ({ children }: { children: ReactNode }): ReactElement => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usersQueryKey', () => {
  it('is a flat, unparameterized key', () => {
    expect(usersQueryKey()).toEqual(['users']);
  });
});

describe('useUsersQuery', () => {
  it('fetches and returns the parsed user list', async () => {
    getUsersMock.mockResolvedValueOnce({ data: [rawUser] });

    const { result } = renderHook(() => useUsersQuery(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getUsersMock).toHaveBeenCalled();
    expect(result.current.data).toEqual([rawUser]);
  });
});
