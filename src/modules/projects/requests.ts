import api, { ApiResponse } from '@/core/api';
import { fetchPaginatedWithRetry, notifyIncompleteList } from '@/core/utils/helpers';
import {
  AssignUserToAllProjectsResultSchema,
  ProjectPatchResultSchema,
  RawProjectResultsSchema,
  RawProjectSchema,
} from './models/projectDto.model';
import {
  AddProjectArgs,
  AssignUserToAllProjectParams,
  AssignUserToAllProjectsReturn,
  EditProjectArgs,
  FetchProjectsDto,
  ProjectPatchReturn,
  ProjectReturn,
  ProjectsReturn,
  ProjectUserRole,
} from './types';

export function addUser(
  organizationSlug: string,
  userId: string,
  projectId: string,
  role: ProjectUserRole,
): ApiResponse {
  return api.post(`/organizations/${organizationSlug}/projects/${projectId}/users/${userId}`, { role });
}

export async function assignUserToAllProjects({
  organizationSlug,
  userId,
  clientType,
  clientId,
}: AssignUserToAllProjectParams): AssignUserToAllProjectsReturn {
  const response = await api.post<unknown>(`/organizations/${organizationSlug}/projects/all/users/${userId}`, {
    clientType,
    clientId,
  });
  return { ...response, data: AssignUserToAllProjectsResultSchema.parse(response.data) };
}

export async function unassignUserFromAllProjects({
  organizationSlug,
  userId,
  clientType,
  clientId,
}: AssignUserToAllProjectParams): AssignUserToAllProjectsReturn {
  const response = await api.patch<unknown>(`/organizations/${organizationSlug}/projects/all/users/${userId}`, {
    clientType,
    clientId,
  });
  return { ...response, data: AssignUserToAllProjectsResultSchema.parse(response.data) };
}

export async function addNewProject(args: AddProjectArgs): ProjectReturn {
  const { organizationSlug, ...rest } = args;

  const response = await api.post<unknown>(`/organizations/${organizationSlug}/projects`, rest);
  return { ...response, data: RawProjectSchema.parse(response.data) };
}

export function archiveProject(organizationSlug: string, projectId: string): Promise<void> {
  return api.delete(`/organizations/${organizationSlug}/projects/${projectId}`);
}

export function unarchiveProject(organizationSlug: string, projectId: string): Promise<void> {
  return api.post(`/organizations/${organizationSlug}/projects/${projectId}/unarchive`);
}

export async function editProject(args: EditProjectArgs): ProjectPatchReturn {
  const { organizationSlug, projectId, ...rest } = args;

  const response = await api.patch<unknown>(`organizations/${organizationSlug}/projects/${projectId}`, rest);
  return { ...response, data: ProjectPatchResultSchema.parse(response.data) };
}

export async function getProjects(projectsDto: FetchProjectsDto): ProjectsReturn {
  const { organizationSlug, ...queryParams } = projectsDto;

  const fetchAndParse = async (): Promise<Awaited<ProjectsReturn>> => {
    const response = await api.get<unknown>(`/organizations/${organizationSlug}/projects`, {
      params: queryParams,
    });
    return { ...response, data: RawProjectResultsSchema.parse(response.data) };
  };

  return fetchPaginatedWithRetry(
    fetchAndParse,
    (result) => result.data,
    () => notifyIncompleteList('toast_message.projects.incomplete_list'),
  );
}

export async function getProject(organizationSlug: string, projectId: string): ProjectReturn {
  const response = await api.get<unknown>(`organizations/${organizationSlug}/projects/${projectId}`);
  return { ...response, data: RawProjectSchema.parse(response.data) };
}

export function removeUser(organizationSlug: string, userId: string, projectId: string): Promise<void> {
  return api.delete(`/organizations/${organizationSlug}/projects/${projectId}/users/${userId}`);
}
