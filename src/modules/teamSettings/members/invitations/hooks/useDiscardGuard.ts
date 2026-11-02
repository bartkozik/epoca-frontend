import { useState, type RefObject } from 'react';

type DiscardGuard = {
  markDirty: () => void;
  confirmDiscard: boolean;
  cancelDiscard: () => void;
  close: () => void;
};

export const useDiscardGuard = (pendingRef: RefObject<boolean>, onClose: () => void): DiscardGuard => {
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  return {
    markDirty: () => setDirty(true),
    confirmDiscard,
    cancelDiscard: () => setConfirmDiscard(false),
    close: () => {
      if (pendingRef.current) return;
      if (dirty) setConfirmDiscard(true);
      else onClose();
    },
  };
};
