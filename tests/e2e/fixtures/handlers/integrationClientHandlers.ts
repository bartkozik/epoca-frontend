import type { WorldIntegrationActor, WorldIntegrationClient, WorldOAuthIntegration } from '../../worlds/types';
import type { WorldRuntime } from '../../worlds/runtime';
import { isOwnerActor } from '../auth';
import type { MockHandler, MockRequest, MockResponse } from './types';

const scopes = new Set([
  'organization:read',
  'users:read',
  'clients:read',
  'projects:read',
  'work-units:read',
  'work-units:write',
  'reports:read',
  'reports:export',
]);

const problem = (status: number, type: string, extension?: Record<string, unknown>): MockResponse => ({
  status,
  headers: { 'content-type': 'application/problem+json' },
  json: {
    type: `result:oauth-client:${type}`,
    status,
    title: 'OAuth integration client request rejected',
    ...(extension ? { extension } : {}),
  },
});

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].filter((key) => value[key] !== undefined).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const actor = (runtime: WorldRuntime): WorldIntegrationActor => {
  const selected = runtime.actor === 'anonymous' ? undefined : runtime.state.actors[runtime.actor];
  if (!selected) throw new Error('OAuth mutation actor is unavailable');
  return { userId: selected.userId, displayName: `${selected.firstName} ${selected.lastName}` };
};

const guarded = (runtime: WorldRuntime): MockResponse | null =>
  isOwnerActor(runtime) ? null : problem(403, 'operation-not-permitted');

const clone = <Value>(value: Value): Value => structuredClone(value);

const integration = (runtime: WorldRuntime): WorldOAuthIntegration => {
  if (!runtime.state.oauthIntegration) throw new Error(`OAuth integration data is unavailable in ${runtime.worldName}`);
  return runtime.state.oauthIntegration;
};

const pathClientId = (request: MockRequest, suffixSegments = 0): string => {
  const segments = request.path.split('/');
  return decodeURIComponent(segments.at(-(1 + suffixSegments)) ?? '');
};

const validScopes = (value: unknown): value is WorldIntegrationClient['scopes'] =>
  Array.isArray(value) && value.length > 0 && new Set(value).size === value.length && value.every((item) => typeof item === 'string' && scopes.has(item));

const validProjectAccess = (
  runtime: WorldRuntime,
  value: unknown
): value is WorldIntegrationClient['projectAccess'] => {
  const input = record(value);
  if (!input || typeof input.mode !== 'string') return false;
  if (input.mode === 'AllProjects') return exactKeys(input, ['mode']);
  if (input.mode !== 'SelectedProjects' || !exactKeys(input, ['mode', 'projectIds'])) return false;
  if (!Array.isArray(input.projectIds) || input.projectIds.length === 0) return false;
  if (new Set(input.projectIds).size !== input.projectIds.length) return false;
  const projectIds = new Set(runtime.state.projects.filter(({ archivedAt }) => archivedAt === null).map(({ id }) => id));
  return input.projectIds.every((id) => typeof id === 'string' && projectIds.has(id));
};

const validExpiry = (value: unknown): value is string | null =>
  value === null ||
  (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value));

const mutationFailure = (runtime: WorldRuntime, method: MockRequest['method']): MockResponse | null => {
  for (const key of [
    'oauth-bad-request',
    'oauth-conflict',
    'oauth-forbidden',
    'oauth-server-error',
    'oauth-timeout',
  ] as const) {
    const failure = runtime.consumeFailure(key);
    if (!failure || failure.method !== method) continue;
    if (key === 'oauth-timeout') return { status: 0, abort: 'timedout' };
    if (key === 'oauth-conflict') {
      return problem(409, 'stale-version', { currentVersion: integration(runtime).staleVersion.currentVersion });
    }
    return problem(failure.status, failure.errorType);
  }
  return null;
};

const clientById = (runtime: WorldRuntime, clientId: string): WorldIntegrationClient | undefined =>
  integration(runtime).clients.find((client) => client.clientId === clientId);

const replaceClient = (runtime: WorldRuntime, replacement: WorldIntegrationClient): void => {
  const state = integration(runtime);
  state.clients = state.clients.map((client) => (client.clientId === replacement.clientId ? replacement : client));
};

const nextClientId = (runtime: WorldRuntime): string =>
  `epoca_oauth_client_v1_runtime_${(integration(runtime).clients.length + 1).toString().padStart(2, '0')}`;

const nextServiceAccountId = (runtime: WorldRuntime): string =>
  `70000000-0000-4000-8000-${(integration(runtime).clients.length + 100).toString().padStart(12, '0')}`;

const now = (runtime: WorldRuntime): string => new Date(runtime.state.clock).toISOString();

const effectiveStatus = (runtime: WorldRuntime, expiresAt: string | null): WorldIntegrationClient['status'] =>
  expiresAt !== null && new Date(expiresAt).getTime() <= new Date(runtime.state.clock).getTime() ? 'Expired' : 'Active';

const validCreate = (
  runtime: WorldRuntime,
  body: unknown
): body is {
  name: string;
  scopes: WorldIntegrationClient['scopes'];
  projectAccess: WorldIntegrationClient['projectAccess'];
  expiresAt?: string | null;
} => {
  const input = record(body);
  return Boolean(
    input &&
      exactKeys(input, ['name', 'scopes', 'projectAccess', 'expiresAt']) &&
      typeof input.name === 'string' &&
      input.name.trim() &&
      validScopes(input.scopes) &&
      validProjectAccess(runtime, input.projectAccess) &&
      (input.expiresAt === undefined || validExpiry(input.expiresAt))
  );
};

const validUpdate = (runtime: WorldRuntime, body: unknown): Record<string, unknown> | null => {
  const input = record(body);
  if (!input || !exactKeys(input, ['expectedVersion', 'name', 'scopes', 'projectAccess', 'expiresAt'])) return null;
  if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 1) return null;
  const mutations = ['name', 'scopes', 'projectAccess', 'expiresAt'].filter((key) => input[key] !== undefined);
  if (mutations.length === 0) return null;
  if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim())) return null;
  if (input.scopes !== undefined && !validScopes(input.scopes)) return null;
  if (input.projectAccess !== undefined && !validProjectAccess(runtime, input.projectAccess)) return null;
  if (input.expiresAt !== undefined && !validExpiry(input.expiresAt)) return null;
  return input;
};

const exactVersion = (body: unknown): number | null => {
  const input = record(body);
  return input && exactKeys(input, ['expectedVersion']) && Number.isSafeInteger(input.expectedVersion) &&
    Number(input.expectedVersion) > 0
    ? Number(input.expectedVersion)
    : null;
};

const stale = (client: WorldIntegrationClient): MockResponse =>
  problem(409, 'stale-version', { currentVersion: client.version });

const validPagination = (request: MockRequest, allowStatus: boolean): { pageNumber: number; pageSize: number } | null => {
  const allowed = new Set(['pageNumber', 'pageSize', ...(allowStatus ? ['status'] : [])]);
  if (Object.keys(request.query).some((key) => !allowed.has(key))) return null;
  const pageNumber = Number(request.query.pageNumber?.[0]);
  const pageSize = Number(request.query.pageSize?.[0]);
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1) return null;
  if (request.query.pageNumber?.length !== 1 || request.query.pageSize?.length !== 1) return null;
  const status = request.query.status;
  if (status && (status.length !== 1 || !['Active', 'Expired', 'Revoked'].includes(status[0]))) return null;
  return { pageNumber, pageSize };
};

export const integrationClientHandlers: MockHandler[] = [
  {
    id: 'oauth-clients-list',
    method: 'GET',
    path: /^\/organizations\/epoca-e2e\/oauth-clients$/,
    handle: (request, runtime) => {
      const denied = guarded(runtime);
      if (denied) return denied;
      const pagination = validPagination(request, true);
      if (!pagination) return problem(400, 'invalid-policy');
      const status = request.query.status?.[0];
      const matches = integration(runtime).clients.filter((client) => !status || client.status === status);
      const start = (pagination.pageNumber - 1) * pagination.pageSize;
      return { status: 200, json: { count: matches.length, results: clone(matches.slice(start, start + pagination.pageSize)) } };
    },
  },
  {
    id: 'oauth-client-create',
    method: 'POST',
    path: /^\/organizations\/epoca-e2e\/oauth-clients$/,
    handle: (request, runtime) => {
      const denied = guarded(runtime);
      if (denied) return denied;
      const failed = mutationFailure(runtime, request.method);
      if (failed) return failed;
      if (!validCreate(runtime, request.body)) return problem(400, 'invalid-policy');
      const createdBy = actor(runtime);
      const timestamp = now(runtime);
      const expiresAt = request.body.expiresAt ?? null;
      const created: WorldIntegrationClient = {
        clientId: nextClientId(runtime),
        name: request.body.name.trim(),
        status: effectiveStatus(runtime, expiresAt),
        scopes: [...request.body.scopes],
        projectAccess: clone(request.body.projectAccess),
        version: 1,
        policyVersion: 1,
        secretVersion: 1,
        serviceAccount: { userId: nextServiceAccountId(runtime), displayName: `Integration ${request.body.name.trim()}` },
        createdAt: timestamp,
        createdBy,
        modifiedAt: timestamp,
        modifiedBy: createdBy,
        secretRotatedAt: timestamp,
        secretRotatedBy: createdBy,
        expiresAt,
        revokedAt: null,
        revokedBy: null,
        lastUsedAt: null,
      };
      const state = integration(runtime);
      state.clients = [...state.clients, created];
      runtime.state.allIds = [...runtime.state.allIds, created.clientId, created.serviceAccount.userId];
      return { status: 201, json: { client: clone(created), clientSecret: runtime.issueOneTimeOAuthSecret() } };
    },
  },
  {
    id: 'oauth-client-detail',
    method: 'GET',
    path: /^\/organizations\/epoca-e2e\/oauth-clients\/[^/]+$/,
    handle: (request, runtime) => {
      const denied = guarded(runtime);
      if (denied) return denied;
      const client = clientById(runtime, pathClientId(request));
      return client ? { status: 200, json: clone(client) } : problem(404, 'client-not-found');
    },
  },
  {
    id: 'oauth-client-update',
    method: 'PATCH',
    path: /^\/organizations\/epoca-e2e\/oauth-clients\/[^/]+$/,
    handle: (request, runtime) => {
      const denied = guarded(runtime);
      if (denied) return denied;
      const failed = mutationFailure(runtime, request.method);
      if (failed) return failed;
      const client = clientById(runtime, pathClientId(request));
      if (!client) return problem(404, 'client-not-found');
      if (client.status === 'Revoked') return problem(409, 'not-active');
      const input = validUpdate(runtime, request.body);
      if (!input) return problem(400, 'invalid-policy');
      if (input.expectedVersion !== client.version) return stale(client);
      const timestamp = now(runtime);
      const expiresAt = input.expiresAt === undefined ? client.expiresAt : (input.expiresAt as string | null);
      const updated: WorldIntegrationClient = {
        ...client,
        ...(typeof input.name === 'string' ? { name: input.name.trim() } : {}),
        ...(input.scopes === undefined ? {} : { scopes: [...(input.scopes as WorldIntegrationClient['scopes'])] }),
        ...(input.projectAccess === undefined
          ? {}
          : { projectAccess: clone(input.projectAccess as WorldIntegrationClient['projectAccess']) }),
        expiresAt,
        status: effectiveStatus(runtime, expiresAt),
        version: client.version + 1,
        policyVersion: client.policyVersion + 1,
        modifiedAt: timestamp,
        modifiedBy: actor(runtime),
      };
      replaceClient(runtime, updated);
      return { status: 200, json: clone(updated) };
    },
  },
  {
    id: 'oauth-client-rotate',
    method: 'POST',
    path: /^\/organizations\/epoca-e2e\/oauth-clients\/[^/]+\/rotate-secret$/,
    handle: (request, runtime) => {
      const denied = guarded(runtime);
      if (denied) return denied;
      const failed = mutationFailure(runtime, request.method);
      if (failed) return failed;
      const client = clientById(runtime, pathClientId(request, 1));
      if (!client) return problem(404, 'client-not-found');
      if (client.status !== 'Active') return problem(409, 'not-active');
      const expectedVersion = exactVersion(request.body);
      if (expectedVersion === null) return problem(400, 'invalid-policy');
      if (expectedVersion !== client.version) return stale(client);
      const timestamp = now(runtime);
      const updated: WorldIntegrationClient = {
        ...client,
        version: client.version + 1,
        secretVersion: client.secretVersion + 1,
        secretRotatedAt: timestamp,
        secretRotatedBy: actor(runtime),
        modifiedAt: timestamp,
        modifiedBy: actor(runtime),
      };
      replaceClient(runtime, updated);
      return { status: 200, json: { client: clone(updated), clientSecret: runtime.issueOneTimeOAuthSecret() } };
    },
  },
  {
    id: 'oauth-client-revoke',
    method: 'POST',
    path: /^\/organizations\/epoca-e2e\/oauth-clients\/[^/]+\/revoke$/,
    handle: (request, runtime) => {
      const denied = guarded(runtime);
      if (denied) return denied;
      const failed = mutationFailure(runtime, request.method);
      if (failed) return failed;
      const client = clientById(runtime, pathClientId(request, 1));
      if (!client) return problem(404, 'client-not-found');
      if (client.status === 'Revoked') return problem(409, 'not-active');
      const expectedVersion = exactVersion(request.body);
      if (expectedVersion === null) return problem(400, 'invalid-policy');
      if (expectedVersion !== client.version) return stale(client);
      const timestamp = now(runtime);
      const revokedBy = actor(runtime);
      const updated: WorldIntegrationClient = {
        ...client,
        status: 'Revoked',
        version: client.version + 1,
        modifiedAt: timestamp,
        modifiedBy: revokedBy,
        revokedAt: timestamp,
        revokedBy,
      };
      replaceClient(runtime, updated);
      return { status: 200, json: clone(updated) };
    },
  },
  {
    id: 'oauth-client-audit',
    method: 'GET',
    path: /^\/organizations\/epoca-e2e\/oauth-clients\/[^/]+\/audit-events$/,
    handle: (request, runtime) => {
      const denied = guarded(runtime);
      if (denied) return denied;
      const pagination = validPagination(request, false);
      if (!pagination) return problem(400, 'invalid-policy');
      const client = clientById(runtime, pathClientId(request, 1));
      if (!client) return problem(404, 'client-not-found');
      const events = integration(runtime).auditEvents
        .filter((event) => event.clientId === client.clientId)
        .map(({ clientId: _privateAssociation, ...publicEvent }) => publicEvent);
      const start = (pagination.pageNumber - 1) * pagination.pageSize;
      return { status: 200, json: { count: events.length, results: clone(events.slice(start, start + pagination.pageSize)) } };
    },
  },
];
