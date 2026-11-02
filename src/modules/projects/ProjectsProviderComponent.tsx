import { queryClient } from '@/core/api';
import { checkClientType } from '@/core/models/checkClientType';
import { showModuleErrorToast } from '@/core/utils/helpers';
import { getProjectUserRoleOptions } from '@/core/utils/options';
import { useAuth } from '@/modules/auth/AuthProvider';
import { useClients } from '@/modules/clients/ClientsProvider';
import { organizationUserToUser } from '@/modules/organizations/modelOrganizationUser';
import { organizationUserProjectsQueryKey } from '@/modules/organizations/queryKeys';
import { getOrganizationUserProjects } from '@/modules/organizations/requests';
import { OrganizationUserRole } from '@/modules/organizations/types';
import { useWorkspace } from '@/modules/organizations/WorkspaceProvider';
import { projectQueryKey } from '@/modules/projects/queryKeys';
import type { User, UserAction } from '@/modules/users/types';
import { useCallback, useMemo, useState } from 'react';
import i18n from 'i18next';
import { useProjectsListQuery } from './hooks/useProjectsQuery';
import { toProject, toProjectUser } from './modelProject';
import { ProjectsContext, type ProjectsContextValue } from './ProjectsContext';
import * as requests from './requests';
import type { FetchProjectsDto, Project, ProjectUser } from './types';
import { ProjectUserRole } from './types';

export function ProjectsProvider({ children }: React.PropsWithChildren): JSX.Element {
  const { selectedFilterTypeMemberProject, setSelectedClient } = useClients();
  const auth = useAuth();
  const workspace = useWorkspace();
  const { loggedInUser, loggedInUserRoles } = auth;
  const { contextOrganizationUsers, fetchContextOrganizationUsers } = workspace;
  const organizationSlug = workspace.contextOrganizationSlug;
  const dto = useMemo<FetchProjectsDto>(() => ({ organizationSlug, includeArchived: true }), [organizationSlug]);
  const reportDto = useMemo<FetchProjectsDto>(
    () => ({ organizationSlug, includeArchived: true, includeArchivedConnections: true }),
    [organizationSlug],
  );
  const projectsQuery = useProjectsListQuery(dto, organizationSlug !== '');
  const reportedProjectsQuery = useProjectsListQuery(reportDto, organizationSlug !== '');
  const projects = useMemo(() => (projectsQuery.data?.results ?? []).map(toProject), [projectsQuery.data]);
  const reportedProjects = useMemo(
    () => (reportedProjectsQuery.data?.results ?? []).map(toProject),
    [reportedProjectsQuery.data],
  );
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedProjectMembers, setSelectedProjectMembers] = useState<(User | ProjectUser)[]>([]);
  const [selectedProjectOwners, setSelectedProjectOwners] = useState<(User | ProjectUser)[]>([]);
  const [selectedProjectUser, setSelectedProjectUser] = useState<User | null>(null);
  const [selectedUserRole, setSelectedUserRole] = useState<ProjectUserRole | null>(ProjectUserRole.Member);
  const [isAddNewProjectModalOpen, setAddNewProjectModalOpen] = useState(false);
  const [isAssignProjectUserModalOpen, setAssignProjectUserModalOpen] = useState(false);
  const [isAssignmentToAllProjectsConfirmationOpen, setAssignmentConfirmationOpen] = useState(false);
  const [isEditProjectModalOpen, setEditProjectModalOpen] = useState(false);
  const [isLoading, setLoading] = useState({ allProjectsViewData: false, projectDetails: false });
  const [isSubmitting, setSubmitting] = useState({ userProjects: false });

  const filteredOrganizationProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => (a.client && b.client ? a.client.name.localeCompare(b.client.name) : a.client ? -1 : 1))
      .filter((project) => checkClientType(project.client, selectedFilterTypeMemberProject) && !project.archived);
  }, [projects, selectedFilterTypeMemberProject]);
  const selectedProjectUsers = selectedProject ? [...selectedProject.owners, ...selectedProject.members] : [];
  const selectedProjectUserProjects = (selectedProjectUser?.projects ?? []).filter((item) => {
    const project = projects.find(({ id }) => id === item.projectId);
    return project && checkClientType(project.client, selectedFilterTypeMemberProject) && !project.archived;
  });

  const canUserEditProject = useCallback(
    (users: ProjectUser[]): boolean => {
      if (!loggedInUser) return false;
      if (loggedInUser.isSuperAdmin) return true;
      if ([OrganizationUserRole.Owner, OrganizationUserRole.Manager].some((role) => loggedInUserRoles.includes(role)))
        return true;
      return users.some(
        (user) =>
          user.id === loggedInUser.id &&
          loggedInUserRoles.includes(OrganizationUserRole.Employee) &&
          user.role === ProjectUserRole.Owner,
      );
    },
    [loggedInUser, loggedInUserRoles],
  );

  const clearAllProjectUsers = useCallback(() => {
    setSelectedProjectMembers([]);
    setSelectedProjectOwners([]);
  }, []);
  const setLoadingState = useCallback((key: string, loading: boolean) => {
    setLoading((current) => ({ ...current, [key]: loading }));
  }, []);
  const refetchProjects = projectsQuery.refetch;
  const refetchReportedProjects = reportedProjectsQuery.refetch;
  const fetchProjects = useCallback(
    async (includeArchivedConnections = false): Promise<Project[]> => {
      const result = await (includeArchivedConnections ? refetchReportedProjects() : refetchProjects());
      if (result.error) throw result.error;
      return (result.data?.results ?? []).map(toProject);
    },
    [refetchProjects, refetchReportedProjects],
  );
  const fetchAllProjectsViewData = useCallback(() => {
    setLoadingState('allProjectsViewData', true);
    void Promise.all([refetchProjects(), fetchContextOrganizationUsers()]).finally(() =>
      setLoadingState('allProjectsViewData', false),
    );
  }, [fetchContextOrganizationUsers, refetchProjects, setLoadingState]);
  const fetchProjectsAndOrganizationUsers = fetchAllProjectsViewData;
  const getUserProjects = useCallback(
    async (userId: string): Promise<void> => {
      setSubmitting({ userProjects: true });
      try {
        const data = await queryClient.fetchQuery({
          queryKey: organizationUserProjectsQueryKey(organizationSlug, userId),
          queryFn: () => getOrganizationUserProjects(organizationSlug, userId).then((response) => response.data),
        });
        const user = contextOrganizationUsers.find(({ id }) => id === userId);
        if (user) setSelectedProjectUser({ ...organizationUserToUser(user), projects: data });
      } finally {
        setSubmitting({ userProjects: false });
      }
    },
    [contextOrganizationUsers, organizationSlug],
  );
  const openEditProjectModal = useCallback(
    (projectId?: string): void => {
      setEditProjectModalOpen(true);
      if (!projectId) return;
      setLoadingState('projectDetails', true);
      void queryClient
        .fetchQuery({
          queryKey: projectQueryKey(organizationSlug, projectId),
          queryFn: () => requests.getProject(organizationSlug, projectId).then((response) => response.data),
        })
        .then((project) => setSelectedProject(toProject(project)))
        .catch((error) => showModuleErrorToast(error, { default: i18n.t('toast_message.projects.data_fetch_error') }))
        .finally(() => setLoadingState('projectDetails', false));
    },
    [organizationSlug, setLoadingState],
  );
  const initializeProjectData = useCallback((project: Project): void => {
    setSelectedProjectMembers(
      project.projectUsers.filter(({ role }) => role === ProjectUserRole.Member).map(toProjectUser),
    );
    setSelectedProjectOwners(
      project.projectUsers.filter(({ role }) => role === ProjectUserRole.Owner).map(toProjectUser),
    );
  }, []);
  const handleUserAction = useCallback((role: ProjectUserRole, action: UserAction, user: User | ProjectUser): void => {
    const update = (current: (User | ProjectUser)[]): (User | ProjectUser)[] =>
      action === 'add'
        ? current.some(({ id }) => id === user.id)
          ? current
          : [...current, user]
        : current.filter(({ id }) => id !== user.id);
    if (role === ProjectUserRole.Owner) setSelectedProjectOwners(update);
    else setSelectedProjectMembers(update);
  }, []);
  const removeAllProjects = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['projects'] });
    setSelectedProject(null);
  }, []);

  const value: ProjectsContextValue = {
    projects,
    reportedProjects,
    reportedProjectsLoadError: reportedProjectsQuery.error,
    isLoadingReportedProjects: reportedProjectsQuery.isLoading,
    filteredOrganizationProjects,
    selectedProject,
    selectedProjectMembers,
    selectedProjectOwners,
    selectedProjectUsers,
    selectedProjectUser,
    selectedUserRole,
    selectedProjectUserRoleOption: getProjectUserRoleOptions().find(({ value }) => value === selectedUserRole),
    noProjectMembers: !selectedProject || selectedProject.projectUsers.length === 0,
    isUserAssignedToAllProjects: selectedProjectUserProjects.length === filteredOrganizationProjects.length,
    isAddNewProjectModalOpen,
    isAssignProjectUserModalOpen,
    isAssignmentToAllProjectsConfirmationOpen,
    isEditProjectModalOpen,
    isLoading,
    isSubmitting,
    organizationProjectsCatalogState: projectsQuery.isError
      ? 'error'
      : projectsQuery.isLoading
        ? 'loading'
        : projectsQuery.data
          ? 'ready'
          : 'idle',
    isOrganizationProjectsCatalogReady: Boolean(projectsQuery.data),
    modelProject: toProject,
    canUserEditProject,
    isUserAssignedToProject: (projectId) =>
      selectedProjectUser?.projects.some((item) => item.projectId === projectId) ?? false,
    isProjectUserProjectOwner: (id, userId) => id === userId,
    getSelectedUserRoleOption: (userId) =>
      getProjectUserRoleOptions().find(
        ({ value }) => value === selectedProjectUsers.find(({ id }) => id === userId)?.role,
      ),
    setSelectedProject,
    setSelectedProjectMembers,
    setSelectedProjectOwners,
    setSelectedProjectUser,
    resetSelectedProjectUser: () => setSelectedProjectUser(null),
    setSelectedUserRole,
    initializeProjectData,
    clearAllProjectUsers,
    handleUserAction,
    fetchProjects,
    fetchAllProjectsViewData,
    fetchProjectsAndOrganizationUsers,
    getUserProjects,
    openAddNewProjectModal: () => setAddNewProjectModalOpen(true),
    closeAddNewProjectModal: () => {
      setAddNewProjectModalOpen(false);
      setSelectedClient(null);
      clearAllProjectUsers();
    },
    openAssignProjectUserModal: () => setAssignProjectUserModalOpen(true),
    closeAssignProjectUserModal: () => {
      setAssignProjectUserModalOpen(false);
      setSelectedProjectUser(null);
      setSelectedUserRole(ProjectUserRole.Member);
    },
    openAssignmentToAllProjectsConfirmation: () => setAssignmentConfirmationOpen(true),
    closeAssignmentToAllProjectsConfirmation: () => setAssignmentConfirmationOpen(false),
    openEditProjectModal,
    closeEditProjectModal: () => {
      setEditProjectModalOpen(false);
      setSelectedClient(null);
      clearAllProjectUsers();
    },
    setLoadingState,
    removeAllProjects,
  };

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}
