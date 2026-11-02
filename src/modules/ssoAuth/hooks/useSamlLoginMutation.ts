import { useMutation, type UseMutationResult } from '@tanstack/react-query';

export type SamlLoginOutcome = 'session' | 'invitation' | 'stale' | 'failed';

// Like useLoginMutation, keep the one-time code and returned credentials inside the
// caller's guarded action. The mutation cache contains only an opaque action and outcome.
export function useSamlLoginMutation(): UseMutationResult<SamlLoginOutcome, unknown, () => Promise<SamlLoginOutcome>> {
  return useMutation({
    mutationFn: (attempt: () => Promise<SamlLoginOutcome>) => attempt(),
    gcTime: 0,
  });
}
