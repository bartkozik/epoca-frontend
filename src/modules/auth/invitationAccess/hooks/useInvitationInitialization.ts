import { useLayoutEffect, useRef, type MutableRefObject } from 'react';
import type { InvitationSummary } from '../../models/invitationAccess.model';
import { InvitationAccessError, normalizeInvitationAccessError } from '../problem';
import { exchangeInvitation, getInvitationSummary } from '../requests';

type Options = {
  bearer?: string;
  mounted: MutableRefObject<boolean>;
  exchangeToken: MutableRefObject<string | null>;
  isCurrent: () => boolean;
  onSummary: (summary: InvitationSummary) => void;
  onError: (error: InvitationAccessError) => void;
  onSettled: () => void;
};

export const useInvitationInitialization = (options: Options): void => {
  // Token refresh must not rotate CSRF; account/workspace changes remount the caller.
  const initial = useRef(options);
  const initialRequest = useRef<Promise<InvitationSummary>>();

  useLayoutEffect(() => {
    const { bearer, mounted, exchangeToken, isCurrent, onSummary, onError, onSettled } = initial.current;
    mounted.current = true;
    if (!initialRequest.current) {
      exchangeToken.current ??= new URLSearchParams(window.location.hash.slice(1)).get('token');
      const token = exchangeToken.current;
      if (window.location.hash)
        window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      if (!isCurrent()) {
        onError(new InvitationAccessError('session-changed'));
        onSettled();

        return () => {
          mounted.current = false;
        };
      }
      initialRequest.current = token ? exchangeInvitation(token, bearer) : getInvitationSummary(bearer);
    }
    // StrictMode replay cancels these callbacks, not the shared request.
    const controller = new AbortController();
    void initialRequest.current
      .then(
        (result) => {
          if (!controller.signal.aborted && isCurrent()) {
            exchangeToken.current = null;
            onSummary(result);
          }
        },
        (failure: unknown) => {
          if (!controller.signal.aborted && isCurrent()) {
            const safe = normalizeInvitationAccessError(failure);
            if (!['rate-limited', 'unavailable'].includes(safe.code)) exchangeToken.current = null;
            onError(safe);
          }
        },
      )
      .finally(() => {
        if (!controller.signal.aborted && isCurrent()) onSettled();
      });

    return () => {
      controller.abort();
      mounted.current = false;
    };
  }, []);
};
