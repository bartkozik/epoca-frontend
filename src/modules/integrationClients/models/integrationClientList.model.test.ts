import { IntegrationClientPageSchema } from '@/modules/integrationClients/models/integrationClientList.model';
import { evictIntegrationClientFromLists } from '@/modules/integrationClients/queryCache';
import { integrationClientsQueryKey } from '@/modules/integrationClients/queryKeys';
import { QueryClient } from '@tanstack/react-query';

const actor = {
  userId: '33333333-3333-4333-8333-333333333333',
  displayName: 'Contract Actor',
};

const validClient = {
  clientId: 'epoca_oauth_client_v1_contract',
  name: 'Reporting warehouse',
  status: 'Active' as const,
  scopes: [
    'organization:read',
    'users:read',
    'clients:read',
    'projects:read',
    'work-units:read',
    'work-units:write',
    'reports:read',
    'reports:export',
  ],
  projectAccess: {
    mode: 'SelectedProjects' as const,
    projectIds: ['11111111-1111-4111-8111-111111111111'],
  },
  version: 4,
  policyVersion: 3,
  secretVersion: 2,
  serviceAccount: {
    userId: '22222222-2222-4222-8222-222222222222',
    displayName: 'Integration Reporting warehouse',
  },
  createdAt: '2026-08-01T08:12:30Z',
  createdBy: actor,
  modifiedAt: '2026-08-19T11:42:10.123456Z',
  modifiedBy: actor,
  secretRotatedAt: '2026-08-10T09:00:00Z',
  secretRotatedBy: actor,
  expiresAt: '2026-12-31T22:59:00Z',
  revokedAt: null,
  revokedBy: null,
  lastUsedAt: null,
};

const sensitiveKeys = ['clientSecret', 'secretHash', 'accessToken', 'authorization'] as const;

describe('IntegrationClientPageSchema', () => {
  it('parses pages and strips additive page fields', () => {
    const result = IntegrationClientPageSchema.parse({ count: 1, results: [validClient], nextCursor: 'ignored' });

    expect(result).toEqual({ count: 1, results: [validClient] });
  });

  it.each(['count', 'results'])('rejects a client page missing required field %s', (field) => {
    const input = { count: 1, results: [validClient] } as Record<string, unknown>;
    delete input[field];

    expect(() => IntegrationClientPageSchema.parse(input)).toThrow();
  });

  it.each(sensitiveKeys)('rejects every known sensitive key at the client page envelope', (key) => {
    expect(() =>
      IntegrationClientPageSchema.parse({ count: 1, results: [validClient], [key]: 'SECRET_SENTINEL' }),
    ).toThrow();
  });
});

describe('evictIntegrationClientFromLists', () => {
  it('removes the client from every cached page for the organization and decrements count', () => {
    const queryClient = new QueryClient();
    const key = integrationClientsQueryKey('acme', { pageNumber: 1, pageSize: 20 });
    queryClient.setQueryData(key, { count: 2, results: [validClient, { ...validClient, clientId: 'other' }] });

    evictIntegrationClientFromLists(queryClient, 'acme', validClient.clientId);

    expect(queryClient.getQueryData(key)).toEqual({
      count: 1,
      results: [{ ...validClient, clientId: 'other' }],
    });
  });

  it('leaves other organizations untouched', () => {
    const queryClient = new QueryClient();
    const otherOrgKey = integrationClientsQueryKey('other-org', { pageNumber: 1, pageSize: 20 });
    queryClient.setQueryData(otherOrgKey, { count: 1, results: [validClient] });

    evictIntegrationClientFromLists(queryClient, 'acme', validClient.clientId);

    expect(queryClient.getQueryData(otherOrgKey)).toEqual({ count: 1, results: [validClient] });
  });

  it('does not double-decrement count when called again for an already-evicted client', () => {
    const queryClient = new QueryClient();
    const key = integrationClientsQueryKey('acme', { pageNumber: 1, pageSize: 20 });
    queryClient.setQueryData(key, { count: 2, results: [validClient, { ...validClient, clientId: 'other' }] });

    evictIntegrationClientFromLists(queryClient, 'acme', validClient.clientId);
    evictIntegrationClientFromLists(queryClient, 'acme', validClient.clientId);

    expect(queryClient.getQueryData(key)).toEqual({
      count: 1,
      results: [{ ...validClient, clientId: 'other' }],
    });
  });
});
