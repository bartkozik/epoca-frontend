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

// Key only, no hook here: kept schema-side (not requests-dependent) so requests.ts and every
// hook file that needs to read/invalidate a client's cache entry can import it without pulling
// in useQuery/requests -- see hooks/useIntegrationClientQuery.ts for the hook that uses it.
export const integrationClientQueryKey = (
  organizationSlug: string,
  clientId: string,
): readonly [string, string, string] => ['integrationClient', organizationSlug, clientId] as const;

// Shared query-key prefix so mutations elsewhere can invalidate/evict every cached page (any
// pageNumber/pageSize/status) for an organization without importing a full params object.
export const INTEGRATION_CLIENTS_LIST_KEY = 'integrationClients' as const;

export const integrationClientsQueryKey = (
  organizationSlug: string,
  params: IntegrationClientListParams,
): readonly [string, string, number, number, string | null] =>
  [INTEGRATION_CLIENTS_LIST_KEY, organizationSlug, params.pageNumber, params.pageSize, params.status ?? null] as const;
