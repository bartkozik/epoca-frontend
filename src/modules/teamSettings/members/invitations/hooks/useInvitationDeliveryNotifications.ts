import { useToast } from '@/core/providers/toastProvider';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { InvitationDto } from '../models/invitationDto.model';
import { invitationDeliveryToast } from '../utils/invitation-delivery-toast';

// PostgreSQL rounds nanoseconds to microseconds; the response and persisted read
// can straddle a millisecond boundary while still describing the same attempt.
const sameAttempt = (left: string | null | undefined, right: string | null | undefined): boolean =>
  left === right || (!!left && !!right && Math.abs(Date.parse(left) - Date.parse(right)) <= 1);

// This session observes only sends initiated here, never historical failures on page load.
export function useInvitationDeliveryNotifications(
  invitations: InvitationDto[] | undefined,
): (result: InvitationDto) => void {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const pending = useRef(new Map<string, string | null>());
  const latest = useRef(invitations);
  const active = useRef(true);
  latest.current = invitations;

  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;
      pending.current.clear();
    };
  }, []);

  useEffect(() => {
    for (const invitation of invitations ?? []) {
      if (!pending.current.has(invitation.id)) continue;
      const attempt = pending.current.get(invitation.id);
      if (!sameAttempt(invitation.delivery.lastAttemptAt, attempt)) {
        pending.current.delete(invitation.id);
      } else if (invitation.delivery.status !== 'Started') {
        pending.current.delete(invitation.id);
        addToast(invitationDeliveryToast(invitation.delivery.status, t));
      }
    }
  }, [invitations, addToast, t]);

  return useCallback(
    (result: InvitationDto) => {
      if (!active.current) return;
      // Mutation invalidation can finish after the mail provider has already answered.
      const refreshed = latest.current?.find(
        (item) => item.id === result.id && sameAttempt(item.delivery.lastAttemptAt, result.delivery.lastAttemptAt),
      );
      const current = result.delivery.status === 'Started' ? (refreshed ?? result) : result;
      if (current.delivery.status === 'Started') {
        pending.current.set(current.id, current.delivery.lastAttemptAt);
      } else {
        pending.current.delete(current.id);
      }
      addToast(invitationDeliveryToast(current.delivery.status, t));
    },
    [addToast, t],
  );
}
