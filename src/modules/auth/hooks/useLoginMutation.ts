import { useMutation, type UseMutationResult } from '@tanstack/react-query';

// Keep credentials and tokens out of mutation variables and result data.
// The provider retains each attempt's session locally inside the opaque action.
export function useLoginMutation(): UseMutationResult<void, unknown, () => Promise<void>> {
  return useMutation<void, unknown, () => Promise<void>>({
    mutationFn: (attempt) => attempt(),
    gcTime: 0,
  });
}
