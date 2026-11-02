import { organizationUserProjectsQueryKey } from '@/modules/organizations/queryKeys';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { toProject } from '@/modules/projects/modelProject';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { projectQueryKey } from '@/modules/projects/queryKeys';
import * as requests from '@/modules/projects/requests';
import { ProjectUserRole } from '@/modules/projects/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

export interface AssignUserInput {
  userId: string;
  projectId: string;
  role: ProjectUserRole;
}

export interface UnassignUserInput {
  userId: string;
  projectId: string;
}

export function useAssignUserMutation(): UseMutationResult<void, unknown, AssignUserInput> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, projectId, role }: AssignUserInput) =>
      requests.addUser(organizationSlug, userId, projectId, role).then(() => undefined),
    // ProjectDetails.tsx subscribes via useProjectQuery, so invalidation alone triggers a real
    // refetch (and re-mirrors onto selectedProject.owners/members) when it's the mounted page.
    onSuccess: (_data, { projectId, userId }) => {
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(organizationSlug, projectId), exact: false });
      void queryClient.invalidateQueries({ queryKey: organizationUserProjectsQueryKey(organizationSlug, userId) });
    },
  });
}

export function useUnassignUserMutation(): UseMutationResult<void, unknown, UnassignUserInput> {
  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, projectId }: UnassignUserInput) => requests.removeUser(organizationSlug, userId, projectId),
    onSuccess: (_data, { projectId, userId }) => {
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(organizationSlug, projectId), exact: false });
      void queryClient.invalidateQueries({ queryKey: organizationUserProjectsQueryKey(organizationSlug, userId) });
    },
  });
}

export function useUpdateUserRoleMutation(): UseMutationResult<void, unknown, AssignUserInput> {
  const projectsContext = useProjects();

  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, projectId, role }: AssignUserInput) =>
      requests.addUser(organizationSlug, userId, projectId, role).then(() => undefined),
    // Patches selectedProject's role in place for instant feedback -- a refetch round-trip would
    // visibly revert the Select before resolving. Also invalidates projectQueryKey: since
    // ProjectDetails.tsx subscribes via useProjectQuery, this triggers a real background refetch
    // that reconciles the cache shortly after, with no visible flicker (the patch already shows
    // the same value).
    onSuccess: (_data, { userId, role, projectId }) => {
      const selected = projectsContext.selectedProject;
      if (selected?.id === projectId) {
        const projectUsers = selected.projectUsers.map((user) => (user.id === userId ? { ...user, role } : user));
        projectsContext.setSelectedProject(toProject({ ...selected, projectUsers }));
      }
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(organizationSlug, projectId), exact: false });
      void queryClient.invalidateQueries({ queryKey: organizationUserProjectsQueryKey(organizationSlug, userId) });
    },
  });
}
