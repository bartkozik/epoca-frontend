import { userQueryKey } from '@/modules/users/queryKeys';
import * as requests from '@/modules/users/requests';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export function useDeleteUserMutation(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => requests.deleteUser(userId).then(() => undefined),
    onSuccess: (_data, userId) => {
      void queryClient.invalidateQueries({ queryKey: ['users'], exact: false });
      void queryClient.invalidateQueries({ queryKey: userQueryKey(userId), exact: false });
    },
  });
}
