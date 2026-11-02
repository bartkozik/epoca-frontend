import { formatDate } from '@/core/utils/helpers';
import { Project, ProjectUser, ProjectUserRole, RawProject, RawProjectUser } from './types';

export const toProjectUser = (user: RawProjectUser): ProjectUser => {
  return {
    ...user,
    fullName: `${user.firstName} ${user.lastName}`,
  };
};

export const toProject = (project: RawProject): Project => {
  const { archivedAt, createdAt, projectUsers, userCount } = project;
  const mappedProjectUsers = projectUsers ? projectUsers.map(toProjectUser) : [];

  return {
    ...project,
    archived: !!archivedAt,
    archivedDate: formatDate(archivedAt),
    formattedCreatedAt: formatDate(createdAt) || '',
    members: mappedProjectUsers.length > 0 ? filterProjectUsersByRole(mappedProjectUsers, ProjectUserRole.Member) : [],
    owners: mappedProjectUsers.length > 0 ? filterProjectUsersByRole(mappedProjectUsers, ProjectUserRole.Owner) : [],
    projectUsers: mappedProjectUsers,
    userCount: projectUsers?.length || userCount,
  };
};

const filterProjectUsersByRole = (users: ProjectUser[], role: ProjectUserRole): ProjectUser[] => {
  return users.filter((user) => user.role === role);
};
