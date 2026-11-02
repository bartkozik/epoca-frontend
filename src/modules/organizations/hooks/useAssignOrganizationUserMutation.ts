import { useToast } from '@/core/providers/toastProvider';
import { showToastForError } from '@/core/utils/helpers';
import { useAuth } from '@/modules/auth/AuthProvider';
import { organizationUserProjectsQueryKey, organizationUsersQueryKey } from '@/modules/organizations/queryKeys';
import * as requests from '@/modules/organizations/requests';
import { OrganizationUserRole, type RawOrganizationUser } from '@/modules/organizations/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import i18n from 'i18next';

export interface AssignOrganizationUserInput {
  userId: string;
  roles: OrganizationUserRole[];
}

export interface DeassignOrganizationUserInput {
  userId: string;
}

export function useAssignOrganizationUserMutation(): UseMutationResult<void, unknown, AssignOrganizationUserInput> {
  const { addToast } = useToast();
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, roles }: AssignOrganizationUserInput) =>
      requests.assignUserToOrganization(organizationSlug, userId, roles),
    onSuccess: (_data, { userId }) => {
      addToast({ content: i18n.t('toast_message.users.user_assigned') });
      void queryClient.invalidateQueries({ queryKey: organizationUsersQueryKey(organizationSlug, true), exact: false });
      void queryClient.invalidateQueries({
        queryKey: organizationUserProjectsQueryKey(organizationSlug, userId),
        exact: false,
      });
      void workspace.fetchContextOrganizationUsers();
    },
    onError: (error) =>
      showToastForError({ errorMessageMap: { default: i18n.t('toast_message.users.default_add_error') }, error }),
  });
}

export function useChangeOrganizationUserRoleMutation(): UseMutationResult<void, unknown, AssignOrganizationUserInput> {
  const { addToast } = useToast();
  const auth = useAuth();
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, roles }: AssignOrganizationUserInput) =>
      requests.assignUserToOrganization(organizationSlug, userId, roles),
    onSuccess: async (_data, { userId }) => {
      if (userId === auth.loggedInUser?.id) await auth.refreshAfterPermissionGrant();
      addToast({ content: i18n.t('toast_message.users.user_role_change_success') });
      void queryClient.invalidateQueries({ queryKey: organizationUsersQueryKey(organizationSlug, true), exact: false });
      void queryClient.invalidateQueries({
        queryKey: organizationUserProjectsQueryKey(organizationSlug, userId),
        exact: false,
      });
      void workspace.fetchContextOrganizationUsers();
    },
    onError: (error) =>
      showToastForError({ errorMessageMap: { default: i18n.t('toast_message.users.user_role_change_error') }, error }),
  });
}

export function useDeassignOrganizationUserMutation(): UseMutationResult<void, unknown, DeassignOrganizationUserInput> {
  const { addToast } = useToast();
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId }: DeassignOrganizationUserInput) =>
      requests.deassignUserFromOrganization(organizationSlug, userId),
    onSuccess: (_data, { userId }) => {
      addToast({ content: i18n.t('toast_message.users.user_deassigned') });
      queryClient.setQueryData<RawOrganizationUser[]>(organizationUsersQueryKey(organizationSlug, true), (users) =>
        users?.filter((user) => user.id !== userId),
      );
      workspace.removeContextOrganizationUser(userId);
      void queryClient.invalidateQueries({ queryKey: organizationUsersQueryKey(organizationSlug, true), exact: false });
      void queryClient.invalidateQueries({
        queryKey: organizationUserProjectsQueryKey(organizationSlug, userId),
        exact: false,
      });
      void queryClient.invalidateQueries({ queryKey: ['projects'], exact: false });
      void workspace.fetchContextOrganizationUsers();
    },
    onError: (error) =>
      showToastForError({ errorMessageMap: { default: i18n.t('toast_message.users.default_remove_error') }, error }),
  });
}
