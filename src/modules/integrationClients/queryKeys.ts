import type {
  IntegrationClientListParams,
  IntegrationClientPagination,
} from '@/modules/integrationClients/models/integrationClientList.model';

export const integrationClientAuditEventsQueryKey = (
  organizationSlug: string,
  clientId: string,
  pagination: IntegrationClientPagination,
): readonly [string, string, string, number, number] =>
  ['integrationClientAuditEvents', organizationSlug, clientId, pagination.pageNumber, pagination.pageSize] as const;

export const integrationClientQueryKey = (
  organizationSlug: string,
  clientId: string,
): readonly [string, string, string] => ['integrationClient', organizationSlug, clientId] as const;

export const INTEGRATION_CLIENTS_LIST_KEY = 'integrationClients' as const;

export const integrationClientsQueryKey = (
  organizationSlug: string,
  params: IntegrationClientListParams,
): readonly [string, string, number, number, string | null] =>
  [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug, params.pageNumber, params.pageSize, params.status ?? null] as const;
