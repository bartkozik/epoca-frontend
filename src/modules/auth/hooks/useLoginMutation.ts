import { useMutation, type UseMutationResult } from '@tanstack/react-query';

// Keep credentials and tokens inside the opaque action, outside mutation variables and cached results.
export function useLoginMutation(): UseMutationResult<void, unknown, () => Promise<void>> {
  return useMutation<void, unknown, () => Promise<void>>({
    mutationFn: (attempt) => attempt(),
    gcTime: 0,
  });
}
