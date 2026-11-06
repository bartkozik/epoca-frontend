import api from '@/core/api';
import { fetchPaginatedWithRetry, notifyIncompleteList } from '@/core/utils/helpers';
import { ProjectsReturn } from '@/modules/projects/types';
import { RawClientResultsSchema, RawClientSchema } from './models/clientDto.model';
import { ClientDeleteReturn, ClientReturn, ClientsReturn, EditClientDto, FetchClientsDto } from './types';

export async function addNewClient(
  organizationSlug: string,
  name: string,
  color: string,
  texture: string,
  logo: string,
  type: string,
): ClientReturn {
  const response = await api.post<unknown>(`/organizations/${organizationSlug}/clients`, {
    name,
    color,
    texture,
    logo,
    type,
  });
  return { ...response, data: RawClientSchema.parse(response.data) };
}

export function archiveClient(organizationSlug: string, clientId: string): ClientDeleteReturn {
  return api.delete(`/organizations/${organizationSlug}/clients/${clientId}`);
}

export function unarchiveClient(organizationSlug: string, clientId: string): Promise<void> {
  return api.post(`/organizations/${organizationSlug}/clients/${clientId}/unarchive`);
}

export async function editClient(organizationSlug: string, args: EditClientDto): Promise<void> {
  const { clientId, ...data } = args;

  const response = await api.patch<unknown>(`/organizations/${organizationSlug}/clients/${clientId}`, data);
  const parsed = RawClientSchema.safeParse(response.data);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error);
  }
}

export async function getClients(projectsDto: FetchClientsDto): ClientsReturn {
  const { organizationSlug, ...queryParams } = projectsDto;

  const fetchAndParse = async (): Promise<Awaited<ClientsReturn>> => {
    const response = await api.get<unknown>(`/organizations/${organizationSlug}/clients`, {
      params: queryParams,
    });
    return { ...response, data: RawClientResultsSchema.parse(response.data) };
  };

  return fetchPaginatedWithRetry(
    fetchAndParse,
    (result) => result.data,
    () => notifyIncompleteList('toast_message.clients.incomplete_list'),
  );
}

export async function getClient(organizationSlug: string, id: string): ClientsReturn {
  const response = await api.get<unknown>(`/organizations/${organizationSlug}/clients`, {
    params: { id, includeArchived: true },
  });
  return { ...response, data: RawClientResultsSchema.parse(response.data) };
}

export function getClientProjects(organizationSlug: string, clientId: string): ProjectsReturn {
  return api.get(`/organizations/${organizationSlug}/projects`, {
    params: { clientId, includeArchived: false },
  });
}
