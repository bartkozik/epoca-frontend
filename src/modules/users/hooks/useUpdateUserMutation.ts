import { userQueryKey } from '@/modules/users/queryKeys';
import * as requests from '@/modules/users/requests';
import { EditUserDto } from '@/modules/users/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export function useUpdateUserMutation(): UseMutationResult<void, unknown, EditUserDto> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, name }: EditUserDto) => requests.updateUser(userId, name),
    onSuccess: (_data, { userId }) => {
      void queryClient.invalidateQueries({ queryKey: ['users'], exact: false });
      void queryClient.invalidateQueries({ queryKey: userQueryKey(userId), exact: false });
    },
  });
}
