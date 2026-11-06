import {
  getDeviceId,
  getRefreshToken,
  readStoredSession,
  removeAPICredentials,
  removeRefreshToken,
  saveRefreshToken,
  saveSession,
} from '@/core/api';
import { queryClient } from '@/core/api/queryClient';
import { getRefreshedAccessToken, setRefreshAccessTokenHandler } from '@/core/api/tokenRefresh';
import { canInOrganization, knownRolesInOrganization } from '@/core/auth/permissions';
import type { LoggedInUser, Session } from '@/core/models/session';
import { getUserMailFromIdentity, showToastForError } from '@/core/utils/helpers';
import type { OrganizationUserRole } from '@/modules/organizations/types';
import {
  getContextOrganizationIdFromLS,
  removeContextOrganizationIdFromLS,
  removeContextOrganizationSlugFromLS,
  saveContextOrganizationSlugInLS,
} from '@/modules/organizations/utils';
import { useCallback, useInsertionEffect, useMemo, useRef, useState } from 'react';
import i18n from 'i18next';
import { AuthContext, type AuthContextValue } from './AuthContext';
import { useLoginMutation } from './hooks/useLoginMutation';
import * as requests from './requests';
import type { UserLanguage } from './types';
import { getUserLanguageFromLS, saveUserLanguageInLS } from './utils';

function readInitialSession(): Session | null {
  const result = readStoredSession();
  return result.status === 'valid' ? result.session : null;
}

export const AuthProvider = ({ children }: React.PropsWithChildren): JSX.Element => {
  const [session, setSession] = useState<Session | null>(readInitialSession);
  const [loading, setLoading] = useState(false);
  const [isLogoutInProgress, setLogoutInProgress] = useState(false);
  const [userLanguage, setUserLanguage] = useState<UserLanguage | null>(null);
  const sessionGeneration = useRef(0);
  const logoutPromise = useRef<Promise<void> | null>(null);

  const persistSession = useCallback((token: string, organizationSlug?: string): Session => {
    const previous = readStoredSession();
    const nextSession = saveSession(token);
    if (!nextSession) throw new Error('The server returned a session that could not be read.');
    if (previous.status === 'valid' && previous.session.user.id !== nextSession.user.id) {
      queryClient.clear();
      removeContextOrganizationSlugFromLS();
      removeContextOrganizationIdFromLS();
    }
    if (organizationSlug !== undefined) {
      saveContextOrganizationSlugInLS(organizationSlug);
      removeContextOrganizationIdFromLS();
    }
    sessionGeneration.current += 1;
    setSession(nextSession);
    return nextSession;
  }, []);

  const persistRefreshToken = useCallback((token: string): string => saveRefreshToken(token), []);

  const refreshSession = useCallback(
    async (refreshToken: string): Promise<string> => {
      const generation = sessionGeneration.current;
      try {
        const tokens = await requests.loginWithRefreshToken(refreshToken);
        if (generation !== sessionGeneration.current) throw new Error('Session ended during token refresh');
        persistRefreshToken(tokens.refreshToken);
        persistSession(tokens.accessToken);
        return tokens.accessToken;
      } catch (error) {
        if (generation === sessionGeneration.current) {
          sessionGeneration.current += 1;
          removeRefreshToken();
          removeAPICredentials();
          removeContextOrganizationSlugFromLS();
          removeContextOrganizationIdFromLS();
          setSession(null);
          queryClient.clear();
        }
        throw error instanceof Error ? error : new Error(String(error));
      }
    },
    [persistRefreshToken, persistSession],
  );

  useInsertionEffect(() => setRefreshAccessTokenHandler(refreshSession), [refreshSession]);

  const { mutateAsync: runLoginMutation } = useLoginMutation();

  const login = useCallback(
    async (username: string, password: string): Promise<Session> => {
      setLoading(true);
      try {
        let nextSession: Session | undefined;
        await runLoginMutation(async () => {
          const tokens = await requests.login(username, password);
          nextSession = persistSession(tokens.accessToken);
          persistRefreshToken(tokens.refreshToken);
        });
        if (!nextSession) throw new Error('Login completed without a session');
        return nextSession;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showToastForError({
          errorMessageMap: {
            401: i18n.t('toast_message.login.not_authorized'),
            default: `${i18n.t('toast_message.login.default')}${message}`,
          },
          error,
          withoutCorrelationId: true,
        });
        throw error instanceof Error ? error : new Error(String(error));
      } finally {
        setLoading(false);
      }
    },
    [persistRefreshToken, persistSession, runLoginMutation],
  );

  const clearLocalSession = useCallback((): void => {
    sessionGeneration.current += 1;
    removeRefreshToken();
    removeAPICredentials();
    removeContextOrganizationSlugFromLS();
    removeContextOrganizationIdFromLS();
    setSession(null);
    queryClient.clear();
  }, []);

  // Clear credentials and cached queries before best-effort remote invalidation can complete.
  const logout = useCallback((): Promise<void> => {
    if (logoutPromise.current) return logoutPromise.current;
    const accessToken = session?.token;
    const deviceId = getDeviceId();
    setLogoutInProgress(true);
    clearLocalSession();
    const request = (accessToken ? requests.invalidateRefreshToken(accessToken, deviceId) : Promise.resolve()).then(
      () => undefined,
      () => undefined,
    );
    const pendingLogout = request.finally(() => {
      setLogoutInProgress(false);
      logoutPromise.current = null;
    });
    logoutPromise.current = pendingLogout;
    return pendingLogout;
  }, [clearLocalSession, session?.token]);

  const refreshAfterPermissionGrant = useCallback(async (): Promise<void> => {
    const refreshToken = getRefreshToken();
    if (refreshToken) await getRefreshedAccessToken(refreshToken);
  }, []);

  const loggedInUser = useMemo<LoggedInUser | undefined>(() => {
    if (!session) return undefined;
    const { id, isSuperAdmin, identities } = session.user;
    return { id, isSuperAdmin, email: getUserMailFromIdentity(identities) };
  }, [session]);

  const changeUserLanguage = useCallback((lang: string): void => {
    saveUserLanguageInLS(lang);
    setUserLanguage({ lang });
  }, []);
  const hasAccess = useCallback(
    (roles: OrganizationUserRole[]): boolean =>
      !!session && canInOrganization(session.user, getContextOrganizationIdFromLS(), roles),
    [session],
  );
  const hasAccessInOrganization = useCallback(
    (organizationId: string, roles: OrganizationUserRole[]): boolean =>
      !!session && canInOrganization(session.user, organizationId, roles),
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      isLogoutInProgress,
      isAuthenticated: !!session,
      loggedInUser,
      get loggedInUserRoles(): OrganizationUserRole[] {
        return session ? [...knownRolesInOrganization(session.user, getContextOrganizationIdFromLS())] : [];
      },
      userChosenLanguage: userLanguage?.lang || getUserLanguageFromLS() || '',
      changeUserLanguage,
      hasAccess,
      hasAccessInOrganization,
      login,
      logout,
      persistSession,
      persistRefreshToken,
      refreshAfterPermissionGrant,
    }),
    [
      changeUserLanguage,
      hasAccess,
      hasAccessInOrganization,
      isLogoutInProgress,
      loading,
      loggedInUser,
      login,
      logout,
      persistRefreshToken,
      persistSession,
      refreshAfterPermissionGrant,
      session,
      userLanguage?.lang,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
