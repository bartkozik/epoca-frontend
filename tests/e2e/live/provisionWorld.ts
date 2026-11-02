import { unlink } from 'node:fs/promises';
import { loadLiveActors } from './actors';
import { liveWorkUnitIdempotencyKey, withLiveDeviceHeader } from './device';
import {
  assertManifestOwnership,
  assertRequiredLiveEnvironment,
  assertSafeApiTarget,
  assertSafeLiveTarget,
  fetchAndValidateFrontendVersion,
  fetchAndValidateRuntimeApi,
  loadLiveTarget,
  type LiveTarget,
} from './guard';
import {
  LIVE_METADATA_PATH,
  LIVE_SCHEMA_VERSION,
  writeLiveRunMetadata,
  type LiveMutationIntent,
  type LiveRunManifest,
} from './metadata';
import { executePersistedCreate } from './mutationLifecycle';
import { boundedFetch } from './network';
import { finalizeVerifiedLiveData } from './ownership';
import { createPmTargetClientIntent, createPmTargetProjectIntent } from './pmCorrection';
import {
  acquireLiveRunLock,
  assertNoExistingLiveRunState,
  liveRunIdentity,
  readBoundLiveRunManifest,
  releaseLiveRunLock,
  writeBoundLiveRunManifest,
  writeLiveRunManifestExclusive,
  type LiveRunIdentity,
} from './runState';

interface JsonRecord {
  [key: string]: unknown;
}

class LiveApiResponseError extends Error {
  readonly status: number;

  constructor(method: string, pathname: string, status: number) {
    super(`Live API ${method} ${pathname} failed with ${status}`);
    this.name = 'LiveApiResponseError';
    this.status = status;
  }
}

interface SetupContext {
  identity: LiveRunIdentity;
  manifest: LiveRunManifest;
  target: LiveTarget;
}

export const createLiveProjectBody = (
  clientId: string,
  name: string,
  description: string,
  ownerId: string,
  memberId: string
): JsonRecord => ({
  clientId,
  name,
  description,
  ownerIds: [ownerId],
  memberIds: [memberId],
});

const requiredEnvironment = (): {
  archivedUserId: string;
  archivedWorkUnitId: string;
  backendSha: string;
  frontendSha: string;
  organizationSlug: string;
} => {
  const values = {
    archivedUserId: process.env.PLAYWRIGHT_LIVE_ARCHIVED_USER_ID ?? '',
    archivedWorkUnitId: process.env.PLAYWRIGHT_LIVE_ARCHIVED_WORK_UNIT_ID ?? '',
    frontendSha: process.env.PLAYWRIGHT_LIVE_FRONTEND_SHA ?? '',
    backendSha: process.env.PLAYWRIGHT_LIVE_BACKEND_SHA ?? '',
  };
  assertRequiredLiveEnvironment(values);
  const organizationSlug = process.env.PLAYWRIGHT_LIVE_ORG_SLUG ?? '';
  if (!organizationSlug.trim()) throw new Error('PLAYWRIGHT_LIVE_ORG_SLUG is required');
  return { ...values, organizationSlug };
};

const asRecord = (value: unknown, label: string): JsonRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} is malformed`);
  return value as JsonRecord;
};

const apiEndpoint = (apiBaseURL: string, pathname: string): URL => {
  const base = new URL(apiBaseURL);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return new URL(pathname.replace(/^\//, ''), base);
};

const apiJson = async (
  apiBaseURL: string,
  pathname: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    method?: string;
    signal?: AbortSignal;
    token?: string;
  } = {}
): Promise<unknown> => {
  const headers = withLiveDeviceHeader({ Accept: 'application/json', ...options.headers });
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await boundedFetch(apiEndpoint(apiBaseURL, pathname), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: 'error',
    signal: options.signal,
  });
  const text = await response.text();
  if (!response.ok) throw new LiveApiResponseError(options.method ?? 'GET', pathname, response.status);
  return text ? (JSON.parse(text) as unknown) : null;
};

const apiDelete = async (apiBaseURL: string, pathname: string, token: string, signal?: AbortSignal): Promise<void> => {
  const response = await boundedFetch(apiEndpoint(apiBaseURL, pathname), {
    method: 'DELETE',
    redirect: 'error',
    headers: withLiveDeviceHeader({ Accept: 'application/json', Authorization: `Bearer ${token}` }),
    signal,
  });
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(`Guarded cleanup failed with ${response.status}`);
  }
};

const extractAccessToken = (value: unknown): string => {
  const token = asRecord(value, 'Owner login response').accessToken;
  if (typeof token !== 'string' || !token) throw new Error('Owner login response is malformed');
  return token;
};

const organizationUsers = (value: unknown): JsonRecord[] => {
  if (!Array.isArray(value)) throw new Error('Organization users response is malformed');
  return value.map((entry) => asRecord(entry, 'Organization user'));
};

const identityEmail = (user: JsonRecord): string | undefined => {
  if (!Array.isArray(user.identities)) return undefined;
  const identities: unknown[] = user.identities;
  const identity = identities.find(
    (entry) => typeof entry === 'object' && entry !== null && 'type' in entry && entry.type === 'MailAddress'
  );
  const value: unknown = identity && asRecord(identity, 'User identity').value;
  return typeof value === 'string' ? value : undefined;
};

const displayName = (user: JsonRecord): string => {
  const firstName = typeof user.firstName === 'string' ? user.firstName.trim() : '';
  const lastName = typeof user.lastName === 'string' ? user.lastName.trim() : '';
  const result = `${firstName} ${lastName}`.trim();
  if (!result) throw new Error('Archived fixture user has no display name');
  return result;
};

const extractWorkUnits = (value: unknown): JsonRecord[] => {
  const root = asRecord(value, 'Archived work-unit response');
  const nested = root.workUnits;
  const candidate = nested && typeof nested === 'object' ? (nested as JsonRecord).results : root.results;
  if (!Array.isArray(candidate)) throw new Error('Archived work-unit response is malformed');
  return candidate.map((entry) => asRecord(entry, 'Archived work unit'));
};

const extractResults = (value: unknown, label: string): JsonRecord[] => {
  const results = asRecord(value, label).results;
  if (!Array.isArray(results)) throw new Error(`${label} results are malformed`);
  return results.map((entry) => asRecord(entry, `${label} entry`));
};

interface LifecycleApiContext {
  apiBaseURL: string;
  organizationPath: string;
  signal?: AbortSignal;
  token: string;
}

const readLifecycleCandidate = async (
  api: LifecycleApiContext,
  kind: LiveMutationIntent['kind'],
  id: string
): Promise<JsonRecord> => {
  if (kind === 'client') {
    const query = new URLSearchParams({ id, includeArchived: 'true', includeArchivedConnections: 'true' });
    const candidates = extractResults(
      await apiJson(api.apiBaseURL, `${api.organizationPath}/clients?${query}`, {
        signal: api.signal,
        token: api.token,
      }),
      'Client read response'
    );
    const candidate = candidates.find((entry) => entry.id === id);
    if (!candidate) throw new Error(`Owned client ${id} is no longer readable`);
    return candidate;
  }
  if (kind === 'project') {
    const candidate = asRecord(
      await apiJson(api.apiBaseURL, `${api.organizationPath}/projects/${encodeURIComponent(id)}`, {
        signal: api.signal,
        token: api.token,
      }),
      'Project read response'
    );
    if (candidate.id !== id) throw new Error(`Owned project ${id} read returned another ID`);
    return candidate;
  }
  const query = new URLSearchParams({ id, dateFrom: '1970-01-01', dateTo: '2099-12-31' });
  const candidate = extractWorkUnits(
    await apiJson(api.apiBaseURL, `${api.organizationPath}/work-units?${query}`, {
      signal: api.signal,
      token: api.token,
    })
  ).find((entry) => entry.id === id);
  if (!candidate) throw new Error(`Owned work unit ${id} is no longer readable`);
  return candidate;
};

const findLifecycleCandidates = async (api: LifecycleApiContext, intent: LiveMutationIntent): Promise<JsonRecord[]> => {
  if (intent.kind === 'client') {
    const query = new URLSearchParams({ includeArchived: 'true', includeArchivedConnections: 'true' });
    return extractResults(
      await apiJson(api.apiBaseURL, `${api.organizationPath}/clients?${query}`, {
        signal: api.signal,
        token: api.token,
      }),
      'Client reconciliation response'
    ).filter(({ name }) => name === intent.name);
  }
  if (intent.kind === 'project') {
    const query = new URLSearchParams({ includeArchived: 'true', includeArchivedConnections: 'true' });
    return extractResults(
      await apiJson(api.apiBaseURL, `${api.organizationPath}/projects?${query}`, {
        signal: api.signal,
        token: api.token,
      }),
      'Project reconciliation response'
    ).filter((candidate) => {
      const client = candidate.client;
      return (
        candidate.name === intent.name &&
        typeof candidate.description === 'string' &&
        candidate.description.startsWith(intent.descriptionPrefix) &&
        typeof client === 'object' &&
        client !== null &&
        (client as JsonRecord).id === intent.clientId
      );
    });
  }
  const query = new URLSearchParams({
    dateFrom: '1970-01-01',
    dateTo: '2099-12-31',
    userId: intent.actorUserId,
    projectId: intent.projectId,
  });
  return extractWorkUnits(
    await apiJson(api.apiBaseURL, `${api.organizationPath}/work-units?${query}`, {
      signal: api.signal,
      token: api.token,
    })
  ).filter((candidate) => {
    const projectClient = candidate.projectClient;
    return (
      candidate.userId === intent.actorUserId &&
      typeof candidate.description === 'string' &&
      candidate.description.startsWith(intent.descriptionPrefix) &&
      typeof projectClient === 'object' &&
      projectClient !== null &&
      (projectClient as JsonRecord).projectId === intent.projectId
    );
  });
};

const persistSetupManifest = async (context: SetupContext, next: LiveRunManifest): Promise<void> => {
  await writeBoundLiveRunManifest(context.identity, context.target, next);
  context.manifest = next;
};

export const cleanupOwnedLiveData = async (
  manifest: LiveRunManifest,
  target: LiveTarget,
  ownerToken: string,
  signal?: AbortSignal
): Promise<void> => {
  signal?.throwIfAborted();
  assertManifestOwnership(manifest, target);
  const guardedApi = assertSafeApiTarget(target).href;
  const identity = liveRunIdentity(manifest);
  const owned = await readBoundLiveRunManifest(identity, target);
  const organizationPath = `/organizations/${encodeURIComponent(owned.organizationSlug)}`;
  const api = { apiBaseURL: guardedApi, organizationPath, signal, token: ownerToken };
  await finalizeVerifiedLiveData(
    owned,
    {
      persist: (next) => writeBoundLiveRunManifest(identity, target, next),
      readById: (kind, id) => readLifecycleCandidate(api, kind, id),
      findCandidates: (intent) => findLifecycleCandidates(api, intent),
      read: (kind, id) => readLifecycleCandidate(api, kind, id),
      remove: (kind, id) => {
        const collection = kind === 'workUnit' ? 'work-units' : kind === 'project' ? 'projects' : 'clients';
        return apiDelete(guardedApi, `${organizationPath}/${collection}/${encodeURIComponent(id)}`, ownerToken, signal);
      },
    },
    signal
  );
};

export const provisionLiveWorld = async (signal: AbortSignal, releaseRunId?: string): Promise<void> => {
  signal.throwIfAborted();
  await assertNoExistingLiveRunState();
  const target = loadLiveTarget();
  const frontend = assertSafeLiveTarget(target);
  assertSafeApiTarget(target);
  const runtimeApi = await fetchAndValidateRuntimeApi(target, fetch, signal);
  const environment = requiredEnvironment();
  await fetchAndValidateFrontendVersion(target, environment.frontendSha, fetch, signal);
  const actors = loadLiveActors();

  const login = await apiJson(runtimeApi.href, '/auth/login', {
    method: 'POST',
    body: actors.owner,
    signal,
  });
  const ownerToken = extractAccessToken(login);
  const organizationPath = `/organizations/${encodeURIComponent(environment.organizationSlug)}`;
  const organization = asRecord(
    await apiJson(runtimeApi.href, organizationPath, { signal, token: ownerToken }),
    'Organization'
  );
  const organizationId = typeof organization.id === 'string' ? organization.id : '';
  if (organizationId !== target.allowedOrganizationId) throw new Error('Live API returned a different organization');
  const verifiedTarget = { ...target, organizationId, apiBaseURL: runtimeApi.href };

  const users = organizationUsers(
    await apiJson(runtimeApi.href, `${organizationPath}/users?includeArchived=true`, { signal, token: ownerToken })
  );
  if (users.some(({ id }) => id === environment.archivedUserId)) {
    throw new Error('Dedicated historical user fixture is still assigned to the organization');
  }
  const archivedUser = asRecord(
    await apiJson(runtimeApi.href, `/users/${encodeURIComponent(environment.archivedUserId)}`, {
      signal,
      token: ownerToken,
    }),
    'Historical fixture user'
  );
  if (archivedUser.id !== environment.archivedUserId) {
    throw new Error('Historical fixture user lookup returned another user');
  }
  const archivedUserName = displayName(archivedUser);

  const regularUser = users.find(
    (candidate) => candidate.archived !== true && identityEmail(candidate) === actors.user.email
  );
  const ownerUser = users.find(
    (candidate) => candidate.archived !== true && identityEmail(candidate) === actors.owner.email
  );
  if (typeof regularUser?.id !== 'string' || typeof ownerUser?.id !== 'string') {
    throw new Error('Dedicated live actors are not members of the allowed organization');
  }

  const workUnitQuery = new URLSearchParams({
    id: environment.archivedWorkUnitId,
    dateFrom: '1970-01-01',
    dateTo: '2099-12-31',
  });
  const archivedUnits = extractWorkUnits(
    await apiJson(runtimeApi.href, `${organizationPath}/work-units?${workUnitQuery}`, { signal, token: ownerToken })
  );
  const archivedUnit = archivedUnits.find(({ id }) => id === environment.archivedWorkUnitId);
  if (!archivedUnit) throw new Error('Dedicated archived work-unit fixture is missing');
  if (archivedUnit.userId !== environment.archivedUserId) {
    throw new Error('Dedicated archived work-unit fixture belongs to a different user');
  }
  if (archivedUnit.organizationId !== undefined && archivedUnit.organizationId !== organizationId) {
    throw new Error('Dedicated archived work-unit fixture belongs to a different organization');
  }
  if (
    typeof archivedUnit.description !== 'string' ||
    !archivedUnit.description.startsWith('E2E CT-530 archived fixture')
  ) {
    throw new Error('Dedicated archived work-unit fixture has an unsafe description');
  }

  const runId = releaseRunId ?? `ct530-${process.env.CI_PIPELINE_ID || Date.now()}`;
  const projectName = `E2E ${runId} project`;
  const manifest: LiveRunManifest = {
    schemaVersion: LIVE_SCHEMA_VERSION,
    runId,
    organizationId,
    organizationSlug: environment.organizationSlug,
    frontendOrigin: frontend.origin,
    apiOrigin: runtimeApi.origin,
    apiBaseURL: runtimeApi.href,
    frontendSha: environment.frontendSha,
    backendSha: environment.backendSha,
    archivedUserId: environment.archivedUserId,
    archivedWorkUnitId: environment.archivedWorkUnitId,
    archivedUserName,
    historicalDescription: archivedUnit.description,
    userId: regularUser.id,
    projectName,
    updatedDescription: `E2E ${runId} updated description`,
    owned: { clientIds: [], projectIds: [], workUnitIds: [] },
    ownership: [],
    intents: [],
    quarantined: [],
  };
  assertManifestOwnership(manifest, verifiedTarget);
  signal.throwIfAborted();
  const identity = liveRunIdentity(manifest);
  await acquireLiveRunLock(identity);
  try {
    await writeLiveRunManifestExclusive(manifest);
  } catch (error) {
    try {
      await releaseLiveRunLock(identity);
    } catch (releaseError) {
      throw new AggregateError([error, releaseError], 'Manifest creation and live lock release both failed');
    }
    throw error;
  }
  const context: SetupContext = { identity, manifest, target: verifiedTarget };
  const lifecycleApi: LifecycleApiContext = {
    apiBaseURL: runtimeApi.href,
    organizationPath,
    signal,
    token: ownerToken,
  };
  const marker = `E2E ${runId}`;
  const dependencies = {
    persist: (next: LiveRunManifest) => persistSetupManifest(context, next),
    readById: (id: string, intent: LiveMutationIntent) => readLifecycleCandidate(lifecycleApi, intent.kind, id),
    findCandidates: (intent: LiveMutationIntent) => findLifecycleCandidates(lifecycleApi, intent),
  };
  let metadataPublished = false;

  try {
    signal.throwIfAborted();
    const clientIntent: LiveMutationIntent = {
      kind: 'client',
      intentId: `${runId}-client`,
      marker,
      organizationId,
      name: `${marker} client`,
    };
    context.manifest = await executePersistedCreate(
      context.manifest,
      clientIntent,
      {
        ...dependencies,
        create: (intent) =>
          apiJson(runtimeApi.href, `${organizationPath}/clients`, {
            method: 'POST',
            signal,
            token: ownerToken,
            body: {
              name: intent.kind === 'client' ? intent.name : '',
              color: '#5F3DC4',
              texture: '',
              logo: '',
              type: 'Internal',
            },
          }),
      },
      signal
    );
    const clientId = context.manifest.owned.clientIds[0];
    if (!clientId) throw new Error('Verified live client ID is missing');

    const projectIntent: LiveMutationIntent = {
      kind: 'project',
      intentId: `${runId}-project`,
      marker,
      organizationId,
      clientId,
      name: projectName,
      descriptionPrefix: marker,
    };
    context.manifest = await executePersistedCreate(
      context.manifest,
      projectIntent,
      {
        ...dependencies,
        create: (intent) =>
          apiJson(runtimeApi.href, `${organizationPath}/projects`, {
            method: 'POST',
            signal,
            token: ownerToken,
            body: createLiveProjectBody(
              clientId,
              intent.kind === 'project' ? intent.name : '',
              `${marker} initial description`,
              ownerUser.id as string,
              regularUser.id as string
            ),
          }),
      },
      signal
    );
    const projectId = context.manifest.owned.projectIds[0];
    if (!projectId) throw new Error('Verified live project ID is missing');

    const pmClientIntent = createPmTargetClientIntent(context.manifest);
    context.manifest = await executePersistedCreate(
      context.manifest,
      pmClientIntent,
      {
        ...dependencies,
        create: (intent) =>
          apiJson(runtimeApi.href, `${organizationPath}/clients`, {
            method: 'POST',
            signal,
            token: ownerToken,
            body: {
              name: intent.kind === 'client' ? intent.name : '',
              color: '#D97706',
              texture: '',
              logo: '',
              type: 'Internal',
            },
          }),
      },
      signal
    );
    const pmClientId = context.manifest.owned.clientIds[1];
    if (!pmClientId) throw new Error('Verified PM correction client ID is missing');

    const pmProjectIntent = createPmTargetProjectIntent(context.manifest, pmClientId);
    context.manifest = await executePersistedCreate(
      context.manifest,
      pmProjectIntent,
      {
        ...dependencies,
        create: (intent) =>
          apiJson(runtimeApi.href, `${organizationPath}/projects`, {
            method: 'POST',
            signal,
            token: ownerToken,
            body: {
              clientId: pmClientId,
              name: intent.kind === 'project' ? intent.name : '',
              description:
                intent.kind === 'project' ? `${intent.descriptionPrefix} description` : '',
              ownerIds: [ownerUser.id],
              memberIds: [],
            },
          }),
      },
      signal
    );
    if (!context.manifest.owned.projectIds[1]) {
      throw new Error('Verified PM correction project ID is missing');
    }

    const workUnitIntent: LiveMutationIntent = {
      kind: 'workUnit',
      intentId: `${runId}-precise-work-unit`,
      marker,
      organizationId,
      projectId,
      actorUserId: ownerUser.id,
      descriptionPrefix: `${marker} precise hours`,
      idempotencyKey: liveWorkUnitIdempotencyKey(`${runId}-precise-work-unit`),
    };
    context.manifest = await executePersistedCreate(
      context.manifest,
      workUnitIntent,
      {
        ...dependencies,
        create: (intent) =>
          apiJson(runtimeApi.href, `${organizationPath}/work-units`, {
            method: 'POST',
            signal,
            token: ownerToken,
            headers: {
              'Idempotency-Key': intent.kind === 'workUnit' ? intent.idempotencyKey : '',
            },
            body: {
              entryType: 'Worklog',
              projectId,
              date: new Date().toISOString().slice(0, 10),
              duration: 'PT7H59M36S',
              description: intent.kind === 'workUnit' ? intent.descriptionPrefix : '',
              taskId: 'CT-415',
              isDraft: false,
            },
          }),
      },
      signal
    );

    signal.throwIfAborted();
    await writeLiveRunMetadata({
      schemaVersion: LIVE_SCHEMA_VERSION,
      runId,
      frontendSha: environment.frontendSha,
      backendSha: environment.backendSha,
    });
    metadataPublished = true;
    signal.throwIfAborted();
  } catch (error) {
    const finalizationApi: LifecycleApiContext = { ...lifecycleApi, signal: new AbortController().signal };
    const finalizationErrors: unknown[] = [];
    try {
      await cleanupOwnedLiveData(context.manifest, verifiedTarget, ownerToken, finalizationApi.signal);
    } catch (cleanupError) {
      finalizationErrors.push(cleanupError);
    }
    if (metadataPublished) {
      try {
        await unlink(LIVE_METADATA_PATH);
      } catch (metadataError) {
        if ((metadataError as NodeJS.ErrnoException).code !== 'ENOENT') finalizationErrors.push(metadataError);
      }
    }
    if (finalizationErrors.length > 0) {
      throw new AggregateError([error, ...finalizationErrors], 'Live provisioning finalization failed');
    }
    throw error;
  }
};

export const authenticateOwnerForCleanup = async (
  manifest: LiveRunManifest,
  target = loadLiveTarget(),
  signal?: AbortSignal
): Promise<{ ownerToken: string; target: LiveTarget }> => {
  assertSafeLiveTarget(target);
  assertSafeApiTarget(target);
  assertManifestOwnership(manifest, target);
  const runtimeApi = await fetchAndValidateRuntimeApi(target, fetch, signal);
  if (runtimeApi.origin !== manifest.apiOrigin) throw new Error('Runtime API origin changed before teardown');
  const actors = loadLiveActors();
  const login = await apiJson(runtimeApi.href, '/auth/login', { method: 'POST', body: actors.owner, signal });
  return { ownerToken: extractAccessToken(login), target: { ...target, apiBaseURL: runtimeApi.href } };
};
