import { queryClient } from '@/core/api';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { useAuth } from '@/modules/auth/AuthProvider';
import {
  organizationQueryKey,
  organizationUserProjectsQueryKey,
  organizationUsersQueryKey,
} from '@/modules/organizations/queryKeys';
import { useCallback, useEffect, useMemo, useState } from 'react';
import i18n from 'i18next';
import { useWorkspaceQueries } from './hooks/useWorkspaceQueries';
import { toOrganization } from './modelOrganization';
import { toOrganizationUser } from './modelOrganizationUser';
import { classifyOrganizationLoadFailure } from './organizationLoadFailure';
import * as requests from './requests';
import type { Organization, OrganizationUser, OrganizationUserProject, RawOrganizationUser } from './types';
import {
  getContextOrganizationIdFromLS,
  getContextOrganizationSlugFromLS,
  removeContextOrganizationIdFromLS,
  removeContextOrganizationSlugFromLS,
  saveContextOrganizationIdInLS,
  saveContextOrganizationSlugInLS,
} from './utils';
import { WorkspaceContext, type WorkspaceContextValue } from './WorkspaceContext';

function modelContextUsers(
  users: RawOrganizationUser[],
  loggedInUserId: string | undefined,
  projects: OrganizationUserProject[],
): OrganizationUser[] {
  return users.map((raw) => {
    const user = toOrganizationUser(raw);
    return user.id === loggedInUserId ? { ...user, projects } : user;
  });
}

export function WorkspaceProvider({ children }: React.PropsWithChildren): JSX.Element {
  const { loggedInUser } = useAuth();
  const loggedInUserId = loggedInUser?.id;
  const [slug, setSlug] = useState(() => (loggedInUser ? (getContextOrganizationSlugFromLS() ?? '') : ''));
  const { organizationQuery, usersQuery, userProjectsQuery } = useWorkspaceQueries(
    slug,
    loggedInUser?.id ?? '',
    slug !== '' && Boolean(loggedInUser),
  );

  useEffect(() => {
    const organization = organizationQuery.data;
    if (!organization || !loggedInUser) return;
    saveContextOrganizationSlugInLS(organization.slug);
    saveContextOrganizationIdInLS(organization.id);
  }, [loggedInUser, organizationQuery.data]);

  useEffect(() => {
    if (organizationQuery.error)
      showModuleErrorToast(organizationQuery.error, {
        default: i18n.t('toast_message.organizations.data_fetch_error'),
      });
  }, [organizationQuery.error]);

  useEffect(() => {
    if (usersQuery.error)
      showModuleErrorToast(usersQuery.error, { default: i18n.t('toast_message.users.data_fetch_error') });
  }, [usersQuery.error]);

  useEffect(() => {
    if (userProjectsQuery.error)
      showModuleErrorToast(userProjectsQuery.error, { default: i18n.t('toast_message.users.data_fetch_error') });
  }, [userProjectsQuery.error]);

  const getContextOrganizationBySlug = useCallback(async (nextSlug: string): Promise<Organization> => {
    const organization = await queryClient.fetchQuery({
      queryKey: organizationQueryKey(nextSlug),
      queryFn: () => requests.getOrganizationBySlug(nextSlug).then((response) => toOrganization(response.data)),
    });
    saveContextOrganizationSlugInLS(organization.slug);
    saveContextOrganizationIdInLS(organization.id);
    setSlug(organization.slug);
    return organization;
  }, []);

  const fetchContextOrganizationUsers = useCallback(async (): Promise<OrganizationUser[]> => {
    if (!slug || !loggedInUserId) throw new Error('No active organization or logged-in user');
    try {
      const users = await queryClient.fetchQuery({
        queryKey: organizationUsersQueryKey(slug, true),
        queryFn: () => requests.getOrganizationUsers(slug, true).then((response) => response.data),
      });
      const projects = await queryClient.fetchQuery({
        queryKey: organizationUserProjectsQueryKey(slug, loggedInUserId),
        queryFn: () => requests.getOrganizationUserProjects(slug, loggedInUserId).then((response) => response.data),
      });
      return modelContextUsers(users, loggedInUserId, projects);
    } catch {
      // The subscribed queries report the failure through the workspace toast effects. Keep this
      // imperative bridge resolved so forms and fire-and-forget mutation callbacks don't leak a
      // rejected promise after the error has already been handled.
      return [];
    }
  }, [loggedInUserId, slug]);

  const resetContextOrganizationId = useCallback((): void => {
    removeContextOrganizationSlugFromLS();
    removeContextOrganizationIdFromLS();
    setSlug('');
    queryClient.removeQueries({ queryKey: ['organization'] });
    queryClient.removeQueries({ queryKey: ['organizationUsers'] });
  }, []);

  const removeContextOrganizationUser = useCallback(
    (userId: string): void => {
      queryClient.setQueryData<RawOrganizationUser[]>(organizationUsersQueryKey(slug, true), (users) =>
        users?.filter((user) => user.id !== userId),
      );
    },
    [slug],
  );

  const checkIfContextOrganizationSlugIsInLocalStorage = useCallback((): void => {
    setSlug(loggedInUser ? (getContextOrganizationSlugFromLS() ?? '') : '');
  }, [loggedInUser]);

  const contextOrganizationUsers = useMemo(
    () => modelContextUsers(usersQuery.data ?? [], loggedInUser?.id, userProjectsQuery.data ?? []),
    [loggedInUser?.id, userProjectsQuery.data, usersQuery.data],
  );
  const activeContextOrganizationUsers = contextOrganizationUsers.filter((user) => !user.archived);
  const value = useMemo<WorkspaceContextValue>(
    () => ({
      contextOrganization: organizationQuery.data ?? null,
      contextOrganizationId: organizationQuery.data?.id ?? getContextOrganizationIdFromLS(),
      contextOrganizationSlug: slug,
      contextOrganizationUsers,
      contextOrganizationLoadFailure: organizationQuery.error
        ? classifyOrganizationLoadFailure(organizationQuery.error)
        : null,
      activeContextOrganizationUsers,
      availableToAddContextOrganizationUsers: activeContextOrganizationUsers,
      availableUsersOptions: activeContextOrganizationUsers.map(({ id, displayedName, email }) => ({
        value: id,
        label: displayedName,
        email,
      })),
      contextOrganizationLoggedInUser: contextOrganizationUsers.find((user) => user.id === loggedInUser?.id),
      isContextOrganizationSlugInLocalStorage: slug !== '',
      isLoadingContextOrganizationUsers: usersQuery.isFetching || userProjectsQuery.isFetching,
      isInitialLoadingContextOrganizationUsers: usersQuery.isLoading || userProjectsQuery.isLoading,
      getContextOrganizationBySlug,
      fetchContextOrganizationUsers,
      resetContextOrganizationId,
      removeContextOrganizationUser,
      checkIfContextOrganizationSlugIsInLocalStorage,
    }),
    [
      activeContextOrganizationUsers,
      checkIfContextOrganizationSlugIsInLocalStorage,
      contextOrganizationUsers,
      fetchContextOrganizationUsers,
      getContextOrganizationBySlug,
      loggedInUser?.id,
      organizationQuery.data,
      removeContextOrganizationUser,
      resetContextOrganizationId,
      slug,
      usersQuery.isFetching,
      usersQuery.isLoading,
      userProjectsQuery.isFetching,
      userProjectsQuery.isLoading,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
