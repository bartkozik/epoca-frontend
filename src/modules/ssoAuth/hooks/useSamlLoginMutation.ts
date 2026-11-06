import { useMutation, type UseMutationResult } from '@tanstack/react-query';

export type SamlLoginOutcome = 'session' | 'invitation' | 'stale' | 'failed';

// Keep one-time codes and credentials inside the guarded action, outside the mutation cache.
export function useSamlLoginMutation(): UseMutationResult<SamlLoginOutcome, unknown, () => Promise<SamlLoginOutcome>> {
  return useMutation({
    mutationFn: (attempt: () => Promise<SamlLoginOutcome>) => attempt(),
    gcTime: 0,
  });
}
