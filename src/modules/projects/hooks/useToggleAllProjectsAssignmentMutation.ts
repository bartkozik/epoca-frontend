import { ClientFilterType } from '@/core/models/enums';
import { useClients } from '@/modules/clients/ClientsProvider';
import { organizationUserProjectsQueryKey } from '@/modules/organizations/queryKeys';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import type { ToggleAllProjectsAssignmentResult } from '@/modules/projects/models/projectBulkAssignment.model';
import { useProjects } from '@/modules/projects/ProjectsProvider';
import { projectQueryKey } from '@/modules/projects/queryKeys';
import * as requests from '@/modules/projects/requests';
import { AssignUserToAllProjectParams, Project, ProjectUserRole } from '@/modules/projects/types';
import { UserProject } from '@/modules/users/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';

const toUserProject = ({ client, id, name }: Project): UserProject => ({
  clientId: client.id,
  clientName: client.name,
  projectId: id,
  projectName: name,
});

export interface ToggleAllProjectsAssignmentInput {
  isAssigned: boolean;
}

// Keep the selected user responsive, then invalidate its canonical projects list so reopening the
// assignment view never restores the pre-mutation list from the minute-long query cache.
export function useToggleAllProjectsAssignmentMutation(): UseMutationResult<
  ToggleAllProjectsAssignmentResult,
  unknown,
  ToggleAllProjectsAssignmentInput
> {
  const { selectedFilterTypeMemberProject } = useClients();
  const projectsContext = useProjects();

  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ isAssigned }: ToggleAllProjectsAssignmentInput) => {
      const { selectedProjectUser } = projectsContext;
      if (!selectedProjectUser) return Promise.reject(new Error('No user selected to assign to all projects'));

      const clientType =
        selectedFilterTypeMemberProject === ClientFilterType.All ? undefined : selectedFilterTypeMemberProject;
      const params: AssignUserToAllProjectParams = { organizationSlug, userId: selectedProjectUser.id, clientType };

      return (
        isAssigned ? requests.unassignUserFromAllProjects(params) : requests.assignUserToAllProjects(params)
      ).then((response) => response.data);
    },
    onSuccess: ({ changedProjectIds }, { isAssigned }) => {
      const { selectedProjectUser } = projectsContext;
      if (selectedProjectUser) {
        const projects = isAssigned
          ? selectedProjectUser.projects.filter((p) => !changedProjectIds.includes(p.projectId))
          : [
              ...selectedProjectUser.projects,
              ...projectsContext.filteredOrganizationProjects
                .filter(({ id }) => changedProjectIds.includes(id))
                .map(toUserProject),
            ];
        projectsContext.setSelectedProjectUser({ ...selectedProjectUser, projects });
        void queryClient.invalidateQueries({
          queryKey: organizationUserProjectsQueryKey(organizationSlug, selectedProjectUser.id),
        });
      }

      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Per-project cache uses a separate 'project' (singular) prefix, not covered above.
      void queryClient.invalidateQueries({ queryKey: ['project'] });
    },
  });
}

export interface ToggleProjectAssignmentInput {
  project: Project;
  isAssigned: boolean;
}

export function useToggleProjectAssignmentMutation(): UseMutationResult<void, unknown, ToggleProjectAssignmentInput> {
  const projectsContext = useProjects();

  const workspace = useWorkspace();
  const organizationSlug = workspace.contextOrganizationSlug;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ project, isAssigned }: ToggleProjectAssignmentInput) => {
      const { selectedProjectUser } = projectsContext;
      if (!selectedProjectUser) return Promise.reject(new Error('No user selected to assign to this project'));

      return isAssigned
        ? requests.removeUser(organizationSlug, selectedProjectUser.id, project.id)
        : requests
            .addUser(organizationSlug, selectedProjectUser.id, project.id, ProjectUserRole.Member)
            .then(() => undefined);
    },
    onSuccess: (_data, { project, isAssigned }) => {
      const { selectedProjectUser } = projectsContext;
      if (selectedProjectUser) {
        const projects = isAssigned
          ? selectedProjectUser.projects.filter((p) => p.projectId !== project.id)
          : [...selectedProjectUser.projects, toUserProject(project)];
        projectsContext.setSelectedProjectUser({ ...selectedProjectUser, projects });
        void queryClient.invalidateQueries({
          queryKey: organizationUserProjectsQueryKey(organizationSlug, selectedProjectUser.id),
        });
      }

      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(organizationSlug, project.id) });
    },
  });
}
