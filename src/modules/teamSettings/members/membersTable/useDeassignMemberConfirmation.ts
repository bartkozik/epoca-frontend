import { useDeassignOrganizationUserMutation } from '@/modules/organizations/hooks/useAssignOrganizationUserMutation';
import { useState } from 'react';

export interface UseDeassignMemberConfirmationReturn {
  isOpen: boolean;
  isDeassigning: boolean;
  openConfirmation: (userId: string) => void;
  closeConfirmation: () => void;
  confirmDeassign: () => void;
}

export const useDeassignMemberConfirmation = (): UseDeassignMemberConfirmationReturn => {
  const [userIdToRemove, setUserIdToRemove] = useState<string | null>(null);
  const mutation = useDeassignOrganizationUserMutation();

  const openConfirmation = (userId: string): void => setUserIdToRemove(userId);
  const closeConfirmation = (): void => setUserIdToRemove(null);

  // Only clears the target (closing the dialog) on success, matching the original
  // deassignUserFromContextOrganization -- a failed removal leaves the confirmation open so the
  // user can retry or cancel.
  const confirmDeassign = (): void => {
    if (!userIdToRemove) return;
    mutation.mutate({ userId: userIdToRemove }, { onSuccess: () => setUserIdToRemove(null) });
  };

  return {
    isOpen: userIdToRemove !== null,
    isDeassigning: mutation.isPending,
    openConfirmation,
    closeConfirmation,
    confirmDeassign,
  };
};
