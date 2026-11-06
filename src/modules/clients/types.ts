import { ApiResponse } from '@/core/api';
import { ClientFilterType, ClientStatus, ClientType } from '@/core/models/enums';
import { Project } from '@/modules/projects/types';
import { z } from 'zod';
import { RawClientResultsSchema, RawClientSchema } from './models/clientDto.model';
import { ClientFormSchema } from './models/clientForm.model';

export { ClientStatus, ClientType, ClientFilterType };

export interface EditClientDto {
  clientId: string;
  color: string;
  logo: string;
  name: string;
  texture: string;
  type: ClientType;
}

export interface FetchClientsDto {
  organizationSlug: string;
  includeArchived?: boolean;
  includeArchivedConnections?: boolean;
}

export interface ProjectClient {
  color: string;
  id: string;
  name: string;
  texture: string;
  type: ClientType;
}

export type RawClient = z.infer<typeof RawClientSchema>;

export interface Client extends RawClient {
  archived: boolean;
  archivedDate: string;
  formattedCreatedAt: string;
  projects: Project[];
}

export type RawClientResults = z.infer<typeof RawClientResultsSchema>;

export type ClientFormError = {
  message?: string;
};
export type ClientFormErrors = {
  [key in keyof ValidClientFormData]?: ClientFormError;
};

export type ClientReturn = ApiResponse<RawClient>;
export type ClientsReturn = ApiResponse<RawClientResults>;
export type ClientDeleteReturn = ApiResponse<void>;
export type ValidClientFormData = z.infer<ReturnType<typeof ClientFormSchema>>;
