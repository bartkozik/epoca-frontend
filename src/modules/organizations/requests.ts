import api from '@/core/api';
import { fetchPaginatedWithRetry, notifyIncompleteList } from '@/core/utils/helpers';
import {
  OrganizationUserProjectsSchema,
  RawOrganizationResultsSchema,
  RawOrganizationSchema,
  RawOrganizationUsersSchema,
} from './models/organizationDto.model';
import {
  OrganizationDeleteReturn,
  OrganizationReturn,
  OrganizationsReturn,
  OrganizationUserProjectsReturn,
  OrganizationUserRole,
  OrganizationUsersReturn,
} from './types';

export async function getOrganizations(): OrganizationsReturn {
  const fetchAndParse = async (): Promise<Awaited<OrganizationsReturn>> => {
    const response = await api.get<unknown>('/organizations');
    return { ...response, data: RawOrganizationResultsSchema.parse(response.data) };
  };

  return fetchPaginatedWithRetry(
    fetchAndParse,
    (result) => result.data,
    () => notifyIncompleteList('toast_message.organizations.incomplete_list'),
  );
}

export async function getOrganizationBySlug(organizationSlug: string): OrganizationReturn {
  const response = await api.get<unknown>(`/organizations/${organizationSlug}`);
  return { ...response, data: RawOrganizationSchema.parse(response.data) };
}

export async function addNewOrganization(name: string, slug: string): OrganizationReturn {
  const response = await api.post<unknown>('/organizations', { name, slug });
  return { ...response, data: RawOrganizationSchema.parse(response.data) };
}

export async function editOrganization(organizationSlug: string, name: string): Promise<void> {
  const response = await api.patch<unknown>(`/organizations/${organizationSlug}`, { name });
  const parsed = RawOrganizationSchema.safeParse(response.data);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error);
  }
}

export function deleteOrganization(organizationSlug: string): OrganizationDeleteReturn {
  return api.delete(`/organizations/${organizationSlug}`);
}

export async function getOrganizationUsers(
  slug: string,
  includeArchived = false,
  includeArchivedMembers = false,
): OrganizationUsersReturn {
  const response = await api.get<unknown>(`/organizations/${slug}/users`, {
    params: includeArchivedMembers ? { includeArchived, includeArchivedMembers } : { includeArchived },
  });
  return { ...response, data: RawOrganizationUsersSchema.parse(response.data) };
}

export async function getOrganizationUserProjects(
  organizationSlug: string,
  userId: string,
): OrganizationUserProjectsReturn {
  const response = await api.get<unknown>(`/organizations/${organizationSlug}/users/${userId}/details`);
  return { ...response, data: OrganizationUserProjectsSchema.parse(response.data) };
}

export function assignUserToOrganization(
  organizationSlug: string,
  userId: string,
  roles: OrganizationUserRole[],
): Promise<void> {
  return api.post(`/organizations/${organizationSlug}/users/assign`, { userId, roles });
}

export function deassignUserFromOrganization(organizationSlug: string, userId: string): Promise<void> {
  return api.post(`/organizations/${organizationSlug}/users/deassign`, { userId });
}
