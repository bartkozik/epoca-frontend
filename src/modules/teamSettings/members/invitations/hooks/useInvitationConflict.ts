import useIsMounted from '@/core/utils/hooks/useIsMounted';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { InvitationDto } from '../models/invitationDto.model';
import type { InvitationProblem } from '../problem';
import { invitationQueryKey, invitationsQueryKey } from '../queryKeys';
import { getInvitation } from '../requests';

type InvitationConflictOptions = { organizationSlug: string; invitationId: string };
type InvitationConflictState = {
  conflict: boolean;
  setConflict: (value: boolean) => void;
  latest: InvitationDto | null;
  refreshing: boolean;
  refreshLatest: () => Promise<void>;
  handleConflict: (problem: InvitationProblem) => Promise<void>;
};

// Callers own the reviewed revision. Reading fresh data must never adopt it or retry a write.
export function useInvitationConflict({
  organizationSlug,
  invitationId,
}: InvitationConflictOptions): InvitationConflictState {
  const client = useQueryClient();
  const active = useIsMounted();
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<InvitationDto | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refreshLatest = async (): Promise<void> => {
    setRefreshing(true);
    setLatest(null);

    try {
      const fresh = await client.fetchQuery({
        queryKey: invitationQueryKey(organizationSlug, invitationId),
        queryFn: ({ signal }) => getInvitation(organizationSlug, invitationId, signal),
        staleTime: 0,
      });
      if (active.current) setLatest(fresh);
      void client.invalidateQueries({ queryKey: invitationsQueryKey(organizationSlug), exact: true });
    } catch {
      // Preserve the conflict and draft; the user can retry this read separately.
    } finally {
      if (active.current) setRefreshing(false);
    }
  };

  const handleConflict = async (problem: InvitationProblem): Promise<void> => {
    if (problem.status !== 409 || !active.current) return;
    setConflict(true);
    await refreshLatest();
  };

  return { conflict, setConflict, latest, refreshing, refreshLatest, handleConflict };
}
