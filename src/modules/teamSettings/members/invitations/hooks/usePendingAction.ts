import useIsMounted from '@/core/utils/hooks/useIsMounted';
import { useRef, useState, type RefObject } from 'react';

type PendingAction = {
  active: RefObject<boolean>;
  pendingRef: RefObject<boolean>;
  pending: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
};

export const usePendingAction = (): PendingAction => {
  const active = useIsMounted();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  const run = async (action: () => Promise<void>): Promise<void> => {
    if (pendingRef.current || !active.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await action();
    } finally {
      pendingRef.current = false;
      if (active.current) setPending(false);
    }
  };

  return { active, pendingRef, pending, run };
};
