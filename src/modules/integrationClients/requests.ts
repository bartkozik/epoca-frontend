import api from '@/core/api/Api';
import { IntegrationClientAuditPageSchema } from './models/integrationClientAudit.model';
import { CreateIntegrationClientInputSchema } from './models/integrationClientCreate.model';
import { IntegrationClientSchema, OneTimeIntegrationClientSecretSchema } from './models/integrationClientDto.model';
import {
  IntegrationClientListParamsSchema,
  IntegrationClientPageSchema,
  IntegrationClientPaginationSchema,
} from './models/integrationClientList.model';
import { UpdateIntegrationClientInputSchema } from './models/integrationClientUpdate.model';
import { IntegrationClientVersionInputSchema } from './models/integrationClientVersion.model';
import type {
  CreateIntegrationClientInput,
  IntegrationClient,
  IntegrationClientAuditPage,
  IntegrationClientListParams,
  IntegrationClientPage,
  IntegrationClientPagination,
  OneTimeIntegrationClientSecret,
  UpdateIntegrationClientInput,
} from './types';

const pathSegment = (value: string): string => encodeURIComponent(value);

const collectionPath = (organizationSlug: string): string =>
  `/organizations/${pathSegment(organizationSlug)}/oauth-clients`;

const clientPath = (organizationSlug: string, clientId: string): string =>
  `${collectionPath(organizationSlug)}/${pathSegment(clientId)}`;

export async function listIntegrationClients(
  organizationSlug: string,
  input: IntegrationClientListParams,
): Promise<IntegrationClientPage> {
  const { pageSize, pageNumber, status } = IntegrationClientListParamsSchema.parse(input);
  const response = await api.get<unknown>(collectionPath(organizationSlug), {
    params: {
      pageSize,
      pageNumber,
      ...(status === undefined ? {} : { status }),
    },
  });

  return IntegrationClientPageSchema.parse(response.data);
}

export async function createIntegrationClient(
  organizationSlug: string,
  input: CreateIntegrationClientInput,
): Promise<OneTimeIntegrationClientSecret> {
  const body = CreateIntegrationClientInputSchema.parse(input);
  const response = await api.post<unknown>(collectionPath(organizationSlug), body);

  return OneTimeIntegrationClientSecretSchema.parse(response.data);
}

export async function getIntegrationClient(organizationSlug: string, clientId: string): Promise<IntegrationClient> {
  const response = await api.get<unknown>(clientPath(organizationSlug, clientId));

  return IntegrationClientSchema.parse(response.data);
}

export async function updateIntegrationClient(
  organizationSlug: string,
  clientId: string,
  input: UpdateIntegrationClientInput,
): Promise<IntegrationClient> {
  const body = UpdateIntegrationClientInputSchema.parse(input);
  const response = await api.patch<unknown>(clientPath(organizationSlug, clientId), body);

  return IntegrationClientSchema.parse(response.data);
}

export async function rotateIntegrationClientSecret(
  organizationSlug: string,
  clientId: string,
  expectedVersion: number,
): Promise<OneTimeIntegrationClientSecret> {
  const body = IntegrationClientVersionInputSchema.parse({ expectedVersion });
  const response = await api.post<unknown>(`${clientPath(organizationSlug, clientId)}/rotate-secret`, body);

  return OneTimeIntegrationClientSecretSchema.parse(response.data);
}

export async function revokeIntegrationClient(
  organizationSlug: string,
  clientId: string,
  expectedVersion: number,
): Promise<IntegrationClient> {
  const body = IntegrationClientVersionInputSchema.parse({ expectedVersion });
  const response = await api.post<unknown>(`${clientPath(organizationSlug, clientId)}/revoke`, body);

  return IntegrationClientSchema.parse(response.data);
}

export async function listIntegrationClientAuditEvents(
  organizationSlug: string,
  clientId: string,
  input: IntegrationClientPagination,
): Promise<IntegrationClientAuditPage> {
  const { pageSize, pageNumber } = IntegrationClientPaginationSchema.parse(input);
  const response = await api.get<unknown>(`${clientPath(organizationSlug, clientId)}/audit-events`, {
    params: { pageSize, pageNumber },
  });

  return IntegrationClientAuditPageSchema.parse(response.data);
}
