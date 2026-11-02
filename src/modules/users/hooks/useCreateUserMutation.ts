import * as requests from '@/modules/users/requests';
import { RawUser } from '@/modules/users/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
}

export function useCreateUserMutation(): UseMutationResult<RawUser, unknown, CreateUserInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ firstName, lastName, email }: CreateUserInput) =>
      requests.createUser(firstName, lastName, email).then((response) => response.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'], exact: false });
    },
  });
}
