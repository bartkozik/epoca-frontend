import { usersQueryKey } from '@/modules/users/queryKeys';
import * as requests from '@/modules/users/requests';
import { RawUser } from '@/modules/users/types';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

export function useUsersQuery(): UseQueryResult<RawUser[]> {
  return useQuery({
    queryKey: usersQueryKey(),
    queryFn: () => requests.getUsers().then((response) => response.data),
  });
}
