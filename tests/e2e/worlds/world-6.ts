import { IDS } from './ids';
import type { WorldDefinition, WorldIntegrationActor, WorldIntegrationClient } from './types';

const owner: WorldIntegrationActor = {
  userId: IDS.owner,
  displayName: 'Owner User',
};

const client = (
  clientId: string,
  name: string,
  status: WorldIntegrationClient['status'],
  serviceAccountId: string,
  overrides: Partial<WorldIntegrationClient> = {}
): WorldIntegrationClient => ({
  clientId,
  name,
  status,
  scopes: ['organization:read', 'projects:read'],
  projectAccess: { mode: 'SelectedProjects', projectIds: [IDS.projectAlpha] },
  version: 5,
  policyVersion: 3,
  secretVersion: 2,
  serviceAccount: { userId: serviceAccountId, displayName: `Integration ${name}` },
  createdAt: '2026-08-01T08:00:00Z',
  createdBy: owner,
  modifiedAt: '2026-08-20T09:00:00Z',
  modifiedBy: owner,
  secretRotatedAt: '2026-08-15T10:00:00Z',
  secretRotatedBy: owner,
  expiresAt: null,
  revokedAt: null,
  revokedBy: null,
  lastUsedAt: '2026-08-26T12:00:00Z',
  ...overrides,
});

const active = client('epoca_oauth_client_v1_active', 'Active reporting client', 'Active', IDS.oauthServiceActive);
const expired = client('epoca_oauth_client_v1_expired', 'Expired reporting client', 'Expired', IDS.oauthServiceExpired, {
  expiresAt: '2026-08-20T08:00:00Z',
  lastUsedAt: '2026-08-19T12:00:00Z',
});
const revoked = client('epoca_oauth_client_v1_revoked', 'Revoked reporting client', 'Revoked', IDS.oauthServiceRevoked, {
  revokedAt: '2026-08-21T08:00:00Z',
  revokedBy: owner,
  lastUsedAt: null,
});

export const world6: WorldDefinition = {
  name: 'world-6',
  parent: 'world-5',
  clock: '2026-08-27T10:00:00.000+02:00',
  locale: 'pl-PL',
  timeZone: 'Europe/Warsaw',
  organization: null,
  actors: {},
  users: [],
  clients: [],
  projects: [],
  workUnits: [],
  oauthIntegration: {
    clients: [active, expired, revoked],
    auditEvents: [
      {
        clientId: active.clientId,
        id: IDS.oauthAuditActive,
        occurredAt: active.createdAt,
        actorType: 'Human',
        actorUserId: owner.userId,
        actor: owner,
        eventType: 'Create',
        outcome: 'Success',
        metadata: { version: 1, scopes: active.scopes },
      },
      {
        clientId: expired.clientId,
        id: IDS.oauthAuditExpired,
        occurredAt: expired.modifiedAt,
        actorType: 'System',
        actorUserId: null,
        actor: null,
        eventType: 'Update',
        outcome: 'Success',
        metadata: { expiresAt: expired.expiresAt, version: expired.version },
      },
      {
        clientId: revoked.clientId,
        id: IDS.oauthAuditRevoked,
        occurredAt: revoked.revokedAt ?? revoked.modifiedAt,
        actorType: 'Human',
        actorUserId: owner.userId,
        actor: owner,
        eventType: 'Revoke',
        outcome: 'Success',
        metadata: { version: revoked.version },
      },
    ],
    staleVersion: {
      clientId: active.clientId,
      attemptedVersion: 4,
      currentVersion: active.version,
    },
  },
  failures: [
    { key: 'oauth-bad-request', method: 'POST', status: 400, errorType: 'invalid-policy' },
    { key: 'oauth-conflict', method: 'PATCH', status: 409, errorType: 'stale-version' },
    { key: 'oauth-forbidden', method: 'POST', status: 403, errorType: 'operation-not-permitted' },
    { key: 'oauth-server-error', method: 'POST', status: 500, errorType: 'service-unavailable' },
    { key: 'oauth-timeout', method: 'POST', status: 0, errorType: 'timeout' },
  ],
  capabilities: ['oauth-clients:public-metadata', 'oauth-clients:runtime-secret', 'oauth-clients:stale-version'],
};
