import { paths } from '@/app/routing/paths';
import { readStoredSession } from '@/core/api';
import { getCorrelationIdFromError } from '@/core/utils/helpers';
import { sessionIdentityKey } from '@/core/utils/helpers/session-identity';
import { useAuth } from '@/modules/auth/AuthProvider';
import { authPaths } from '@/modules/auth/routes';
import { getContextOrganizationSlugFromLS } from '@/modules/organizations/utils';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useSamlLoginMutation, type SamlLoginOutcome } from '@/modules/ssoAuth/hooks/useSamlLoginMutation';
import { consumeSsoInvitationReturn } from '@/modules/ssoAuth/invitationReturn';
import { samlLogin } from '@/modules/ssoAuth/requests';
import { useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export const useSamlLoginCallback = (): { isPending: boolean } => {
  const navigate = useNavigate();
  const auth = useAuth();
  const workspace = useWorkspace();
  const mutation = useSamlLoginMutation();
  const { mutateAsync } = mutation;
  const exchange = useRef<Promise<SamlLoginOutcome>>();
  const callbackToken = useRef<string | null>(null);
  const mounted = useRef(false);
  const identity = sessionIdentityKey(auth.loggedInUser?.id, workspace.contextOrganizationSlug);
  const currentIdentity = useRef(identity);

  const initial = useRef({ auth, workspace, navigate, mutateAsync, identity });

  useLayoutEffect(() => {
    currentIdentity.current = identity;
  }, [identity]);

  useLayoutEffect(() => {
    const { auth, workspace, navigate, mutateAsync, identity } = initial.current;
    mounted.current = true;
    if (!exchange.current) {
      const parameters = new URLSearchParams(window.location.hash.slice(1));
      callbackToken.current = parameters.get('token');
      const slug = parameters.get('slug');
      if (window.location.hash)
        window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      const invitationReturn = consumeSsoInvitationReturn();
      const stored = readStoredSession();
      const storedUserId = stored.status === 'valid' ? stored.session.user.id : undefined;
      const storedSlug = getContextOrganizationSlugFromLS();

      const isCurrent = (): boolean => {
        const latest = readStoredSession();

        return (
          mounted.current &&
          currentIdentity.current === identity &&
          (latest.status === 'valid' ? latest.session.user.id : undefined) === storedUserId &&
          getContextOrganizationSlugFromLS() === storedSlug
        );
      };

      const failure = (errorCode: string, reason: string): void => {
        if (!isCurrent()) return;
        const params = new URLSearchParams({ errorCode, reason });
        if (auth.loggedInUser && !invitationReturn) params.set('sessionRecovery', '1');
        const loginPath = invitationReturn || auth.loggedInUser ? authPaths.invitationSignIn : authPaths.login;
        navigate(`${loginPath}?${params.toString()}`, { replace: true });
      };

      if (!callbackToken.current || !slug) {
        failure('404', 'missing_token_or_slug');
        exchange.current = Promise.resolve('failed');
      } else {
        exchange.current = mutateAsync(async () => {
          try {
            if (!isCurrent() || !callbackToken.current) return 'stale';
            const responsePromise = samlLogin(slug, callbackToken.current);
            callbackToken.current = null;
            const response = await responsePromise;
            if (!isCurrent()) return 'stale';
            if ('kind' in response) {
              navigate(authPaths.invitationAccept, { replace: true });

              return 'invitation';
            }

            try {
              auth.persistSession(response.accessToken, slug);
              auth.persistRefreshToken(response.refreshToken);
              workspace.checkIfContextOrganizationSlugIsInLocalStorage();
            } catch {
              const params = new URLSearchParams({ errorCode: 'unknown', reason: 'unknown' });
              if (!invitationReturn) params.set('sessionRecovery', '1');
              navigate(`${authPaths.invitationSignIn}?${params.toString()}`, { replace: true });

              return 'failed';
            }
            navigate(invitationReturn ? authPaths.invitationAccept : paths.index, { replace: true });

            return 'session';
          } catch (error) {
            callbackToken.current = null;
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            failure(status ? String(status) : 'unknown', getCorrelationIdFromError(error));

            // Axios errors include the callback token; never store them in mutation data.
            return 'failed';
          }
        });
      }
    }

    return () => {
      mounted.current = false;
    };
  }, []);

  return { isPending: mutation.isPending };
};
