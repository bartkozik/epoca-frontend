import { AVATAR_SYNC_MAX_POLL_ATTEMPTS, AVATAR_SYNC_POLL_INTERVAL_MS } from '@/modules/users/hooks/avatarSyncPolling';
import { userQueryKey } from '@/modules/users/queryKeys';
import * as requests from '@/modules/users/requests';
import { RawUser } from '@/modules/users/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export { AVATAR_SYNC_MAX_POLL_ATTEMPTS, AVATAR_SYNC_POLL_INTERVAL_MS };

// Avatar synchronization runs asynchronously after login, including replacement of an existing
// photo. Only the navbar opts into this short refresh window. Query-owned counters survive
// remounts and are reset with the session cache on logout; failures consume the same budget.
export function useUserQuery(
  userId: string | undefined,
  { refreshAvatar = false }: { refreshAvatar?: boolean } = {},
): UseQueryResult<RawUser> {
  return useQuery({
    queryKey: userQueryKey(userId ?? ''),
    queryFn: () => requests.getUser(userId as string).then((response) => response.data),
    enabled: Boolean(userId),
    ...(refreshAvatar ? { retry: false } : {}),
    refetchInterval: (query) => {
      const attempts = query.state.dataUpdateCount + query.state.errorUpdateCount;
      return refreshAvatar && attempts < AVATAR_SYNC_MAX_POLL_ATTEMPTS ? AVATAR_SYNC_POLL_INTERVAL_MS : false;
    },
  });
}
