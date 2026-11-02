import { IdentityType } from '@/core/models/auth';
import {
  AVATAR_SYNC_MAX_POLL_ATTEMPTS,
  AVATAR_SYNC_POLL_INTERVAL_MS,
  useUserQuery,
} from '@/modules/users/hooks/useUserQuery';
import { userQueryKey } from '@/modules/users/queryKeys';
import * as requests from '@/modules/users/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/users/requests', () => ({ getUser: vi.fn() }));
const getUserMock = requests.getUser as unknown as ReturnType<typeof vi.fn>;

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

describe('userQueryKey', () => {
  it('is a flat key of the entity prefix and the user id', () => {
    expect(userQueryKey('user-1')).toEqual(['user', 'user-1']);
  });
});

describe('useUserQuery', () => {
  it('returns the single user parsed from the get-by-id response', async () => {
    getUserMock.mockResolvedValueOnce({ data: rawUser });

    const { result } = renderHook(() => useUserQuery('user-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getUserMock).toHaveBeenCalledWith('user-1');
    expect(result.current.data).toEqual(rawUser);
  });

  it('is disabled (does not fetch) when userId is undefined', () => {
    const { result } = renderHook(() => useUserQuery(undefined), { wrapper });

    expect(getUserMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('is disabled (does not fetch) when userId is an empty string', () => {
    const { result } = renderHook(() => useUserQuery(''), { wrapper });

    expect(getUserMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useUserQuery avatar sync polling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const advancePolls = async (count: number): Promise<void> => {
    for (let i = 0; i < count; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(AVATAR_SYNC_POLL_INTERVAL_MS);
      });
    }
  };

  it.each(['', 'https://cdn.example.com/old.png'])('refreshes a delayed avatar starting from %s', async (avatar) => {
    vi.useFakeTimers();
    getUserMock
      .mockResolvedValueOnce({ data: { ...rawUser, avatar } })
      .mockResolvedValue({ data: { ...rawUser, avatar: 'https://cdn.example.com/new.png' } });
    const { result } = renderHook(() => useUserQuery('user-1', { refreshAvatar: true }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.avatar).toBe(avatar);
    await advancePolls(1);
    expect(result.current.data?.avatar).toBe('https://cdn.example.com/new.png');
    await advancePolls(AVATAR_SYNC_MAX_POLL_ATTEMPTS + 2);
    expect(getUserMock).toHaveBeenCalledTimes(AVATAR_SYNC_MAX_POLL_ATTEMPTS);
  });

  it('bounds failed refreshes even when the query defaults enable retries', async () => {
    vi.useFakeTimers();
    getUserMock.mockRejectedValue(new Error('Temporary failure'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: 3 } } });
    const { result } = renderHook(() => useUserQuery('user-1', { refreshAvatar: true }), {
      wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    await advancePolls(AVATAR_SYNC_MAX_POLL_ATTEMPTS + 2);
    expect(getUserMock).toHaveBeenCalledTimes(AVATAR_SYNC_MAX_POLL_ATTEMPTS);
  });

  it('does not poll other user-profile consumers', async () => {
    vi.useFakeTimers();
    getUserMock.mockResolvedValue({ data: rawUser });
    const { result } = renderHook(() => useUserQuery('user-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await advancePolls(2);
    expect(getUserMock).toHaveBeenCalledTimes(1);
  });

  it('preserves the budget across remounts and restarts it after the session cache is cleared', async () => {
    vi.useFakeTimers();
    getUserMock.mockResolvedValue({ data: rawUser });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const sessionWrapper = ({ children }: { children: ReactNode }): ReactElement =>
      createElement(QueryClientProvider, { client }, children);
    const { result: firstResult, unmount: unmountFirst } = renderHook(
      () => useUserQuery('user-1', { refreshAvatar: true }),
      { wrapper: sessionWrapper },
    );
    await waitFor(() => expect(firstResult.current.isSuccess).toBe(true));
    await advancePolls(AVATAR_SYNC_MAX_POLL_ATTEMPTS);
    unmountFirst();
    const { unmount: unmountSecond } = renderHook(() => useUserQuery('user-1', { refreshAvatar: true }), {
      wrapper: sessionWrapper,
    });
    await advancePolls(2);
    expect(getUserMock).toHaveBeenCalledTimes(AVATAR_SYNC_MAX_POLL_ATTEMPTS);
    unmountSecond();
    client.clear();
    const { result: thirdResult } = renderHook(() => useUserQuery('user-1', { refreshAvatar: true }), {
      wrapper: sessionWrapper,
    });
    await waitFor(() => expect(thirdResult.current.isSuccess).toBe(true));
    await advancePolls(1);
    expect(getUserMock).toHaveBeenCalledTimes(AVATAR_SYNC_MAX_POLL_ATTEMPTS + 2);
  });
});
