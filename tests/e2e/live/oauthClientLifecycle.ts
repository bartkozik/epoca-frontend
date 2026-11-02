import { loadLiveActors } from './actors';
import { assertOAuthClientDisposableReviewEnvironment } from './oauthClientTargetGuard';
import { assertSafeApiTarget, assertSafeLiveTarget, loadLiveTarget } from './guard';
import { LIVE_LIFECYCLE_TIMEOUT_MS, boundedFetch, withLifecycleDeadline } from './network';

type Environment = NodeJS.ProcessEnv | Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

interface PublicClient {
  clientId: string;
  name: string;
  organizationId?: string;
  organizationSlug?: string;
  status: 'Active' | 'Expired' | 'Revoked';
  version: number;
}

interface OneTimeClient extends PublicClient {
  clientSecret: string;
}

interface OwnedClient {
  clientId: string;
  name: string;
}

interface CreateIntent {
  name: string;
  organizationId: string;
  organizationSlug: string;
}

export interface OAuthClientLiveEvidence {
  initialTokenAccepted: true;
  oldSecretRejectedAfterRotation: true;
  issuedTokenAcceptedAfterRotation: true;
  revokedSecretAndTokenRejected: true;
  expiryRejectedSecretAndToken: true;
  renewedTokenAccepted: true;
  cleanupVerified: true;
}

interface RunOptions {
  cleanupTimeoutMs?: number;
  env?: Environment;
  fetcher?: typeof fetch;
  lifecycleTimeoutMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const RECONCILIATION_PAGE_SIZE = 100;
const RECONCILIATION_MAX_PAGES = 10;
const RECONCILIATION_MAX_REQUESTS = 128;
const RECONCILIATION_BACKOFF_MS = 250;

const asRecord = (value: unknown, label: string): JsonRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} is malformed`);
  return value as JsonRecord;
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is malformed`);
  return value;
};

const positiveVersion = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error('OAuth client version is malformed');
  return value as number;
};

const publicClient = (value: unknown, label: string): PublicClient => {
  const client = asRecord(value, label);
  const status = client.status;
  if (status !== 'Active' && status !== 'Expired' && status !== 'Revoked') {
    throw new Error(`${label} status is malformed`);
  }
  return {
    clientId: requiredString(client.clientId, `${label} identifier`),
    name: requiredString(client.name, `${label} name`),
    ...(client.organizationId === undefined
      ? {}
      : { organizationId: requiredString(client.organizationId, `${label} organization identifier`) }),
    ...(client.organizationSlug === undefined
      ? {}
      : { organizationSlug: requiredString(client.organizationSlug, `${label} organization slug`) }),
    status,
    version: positiveVersion(client.version),
  };
};

export const assertOAuthClientMutationBinding = (
  label: string,
  before: PublicClient,
  after: PublicClient,
  organizationId: string,
  organizationSlug: string
): void => {
  if (
    after.clientId !== before.clientId ||
    after.name !== before.name ||
    (after.organizationId !== undefined && after.organizationId !== organizationId) ||
    (after.organizationSlug !== undefined && after.organizationSlug !== organizationSlug)
  ) {
    throw new Error(`${label} response failed exact client identity binding`);
  }
  if (after.version !== before.version + 1) throw new Error(`${label} response version transition is invalid`);
};

const oneTimeClient = (value: unknown, label: string): OneTimeClient => {
  const envelope = asRecord(value, label);
  return {
    ...publicClient(envelope.client, `${label} public client`),
    clientSecret: requiredString(envelope.clientSecret, `${label} one-time credential`),
  };
};

const apiUrl = (base: URL, path: string): URL => new URL(path.replace(/^\//, ''), `${base.href.replace(/\/?$/, '/')}`);

const readJson = async (response: Response, label: string): Promise<unknown> => {
  const body = await response.text();
  if (!body) throw new Error(`${label} returned an empty response`);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(`${label} returned malformed JSON`);
  }
};

const expectStatus = (response: Response, expected: number, label: string): void => {
  if (response.status !== expected) throw new Error(`${label} returned unexpected status ${response.status}`);
};

export const runLiveOAuthClientLifecycle = async ({
  cleanupTimeoutMs = 30_000,
  env = process.env,
  fetcher = fetch,
  lifecycleTimeoutMs = LIVE_LIFECYCLE_TIMEOUT_MS,
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: RunOptions = {}): Promise<OAuthClientLiveEvidence> => {
  const boundary = assertOAuthClientDisposableReviewEnvironment(env);
  const target = loadLiveTarget(env);
  assertSafeLiveTarget(target);
  const apiBase = assertSafeApiTarget(target);
  const owner = loadLiveActors(env).owner;
  const ownedClients: OwnedClient[] = [];
  const createIntents: CreateIntent[] = [];

  return withLifecycleDeadline(async (signal) => {
    const request = (path: string, init: RequestInit, requestSignal: AbortSignal = signal): Promise<Response> =>
      boundedFetch(apiUrl(apiBase, path), { ...init, redirect: 'error', signal: requestSignal }, fetcher);
    const jsonRequest = async (
      path: string,
      method: 'GET' | 'POST' | 'PATCH',
      token: string | undefined,
      body: unknown,
      expectedStatus: number,
      label: string,
      requestSignal: AbortSignal = signal
    ): Promise<unknown> => {
      const response = await request(path, {
        method,
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }, requestSignal);
      expectStatus(response, expectedStatus, label);
      return expectedStatus === 204 ? null : readJson(response, label);
    };
    const login = asRecord(await jsonRequest('/auth/login', 'POST', undefined, owner, 200, 'Owner login'), 'Owner login');
    const ownerToken = requiredString(login.accessToken, 'Owner access token');
    const organizationPath = `/organizations/${encodeURIComponent(boundary.organizationSlug)}`;
    const organization = asRecord(
      await jsonRequest(organizationPath, 'GET', ownerToken, undefined, 200, 'Review organization'),
      'Review organization'
    );
    if (organization.id !== target.allowedOrganizationId) throw new Error('Live API returned a different review organization');
    const collectionPath = `${organizationPath}/oauth-clients`;

    const createClient = async (suffix: string, expiresAt: string | null): Promise<OneTimeClient> => {
      const name = `${boundary.reviewId}-${suffix}`;
      const intent: CreateIntent = {
        name,
        organizationId: target.allowedOrganizationId,
        organizationSlug: boundary.organizationSlug,
      };
      createIntents.push(intent);
      const result = oneTimeClient(
        await jsonRequest(
          collectionPath,
          'POST',
          ownerToken,
          {
            name,
            scopes: ['organization:read'],
            projectAccess: { mode: 'AllProjects' },
            expiresAt,
          },
          201,
          'OAuth client creation'
        ),
        'OAuth client creation'
      );
      if (result.name !== name) throw new Error('Created OAuth client ownership marker differs');
      ownedClients.push({ clientId: result.clientId, name });
      createIntents.splice(createIntents.indexOf(intent), 1);
      return result;
    };
    const clientPath = (clientId: string): string => `${collectionPath}/${encodeURIComponent(clientId)}`;
    const tokenRequest = async (clientId: string, clientSecret: string, expectedStatus: 200 | 401): Promise<string | null> => {
      const response = await request('/oauth/token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'organization:read' }).toString(),
      });
      expectStatus(response, expectedStatus, 'OAuth token issuance');
      if (expectedStatus === 401) return null;
      if (response.headers.get('cache-control')?.toLowerCase() !== 'no-store') {
        throw new Error('OAuth token response is missing Cache-Control no-store');
      }
      if (response.headers.get('pragma')?.toLowerCase() !== 'no-cache') {
        throw new Error('OAuth token response is missing Pragma no-cache');
      }
      const token = asRecord(await readJson(response, 'OAuth token issuance'), 'OAuth token issuance');
      if (token.token_type !== 'Bearer' || token.expires_in !== 300 || token.scope !== 'organization:read') {
        throw new Error('OAuth token response contract differs');
      }
      return requiredString(token.access_token, 'OAuth access token');
    };
    const protectedRead = async (token: string, expectedStatus: 200 | 401): Promise<void> => {
      const response = await request(organizationPath, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      expectStatus(response, expectedStatus, 'OAuth protected organization read');
    };
    const revokeOwned = async (owned: OwnedClient, cleanupSignal: AbortSignal): Promise<void> => {
      const details = publicClient(
        await jsonRequest(
          clientPath(owned.clientId),
          'GET',
          ownerToken,
          undefined,
          200,
          'OAuth cleanup ownership read',
          cleanupSignal
        ),
        'OAuth cleanup ownership read'
      );
      if (details.clientId !== owned.clientId || details.name !== owned.name) {
        throw new Error('OAuth cleanup candidate failed exact ownership verification');
      }
      if (details.status !== 'Revoked') {
        const revoked = publicClient(
          await jsonRequest(
            `${clientPath(owned.clientId)}/revoke`,
            'POST',
            ownerToken,
            { expectedVersion: details.version },
            200,
            'OAuth cleanup revoke',
            cleanupSignal
          ),
          'OAuth cleanup revoke'
        );
        if (revoked.clientId !== owned.clientId || revoked.status !== 'Revoked') {
          throw new Error('OAuth cleanup revoke did not close the owned client');
        }
      }
    };

    const reconcileCreateIntent = async (intent: CreateIntent, cleanupSignal: AbortSignal): Promise<OwnedClient> => {
      if (
        intent.organizationId !== target.allowedOrganizationId ||
        intent.organizationSlug !== boundary.organizationSlug
      ) {
        throw new Error('OAuth create intent escaped the exact review boundary');
      }
      let requests = 0;
      const waitForVisibility = async (): Promise<void> => {
        cleanupSignal.throwIfAborted();
        let removeAbortListener = (): void => undefined;
        const aborted = new Promise<never>((_resolve, reject) => {
          const onAbort = (): void => {
            const reason = cleanupSignal.reason;
            reject(reason instanceof Error ? reason : new Error(String(reason)));
          };
          cleanupSignal.addEventListener('abort', onAbort, { once: true });
          removeAbortListener = () => cleanupSignal.removeEventListener('abort', onAbort);
        });
        try {
          await Promise.race([sleep(RECONCILIATION_BACKOFF_MS), aborted]);
          cleanupSignal.throwIfAborted();
        } finally {
          removeAbortListener();
        }
      };

      for (;;) {
        cleanupSignal.throwIfAborted();
        const matches: PublicClient[] = [];
        let expectedCount: number | undefined;
        let pageCount = 1;
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
          requests += 1;
          if (requests > RECONCILIATION_MAX_REQUESTS) {
            throw new Error('OAuth ambiguous create reconciliation exceeded its bounded request budget');
          }
          const page = asRecord(
            await jsonRequest(
              `${collectionPath}?pageNumber=${pageNumber}&pageSize=${RECONCILIATION_PAGE_SIZE}`,
              'GET',
              ownerToken,
              undefined,
              200,
              'OAuth ambiguous create reconciliation',
              cleanupSignal
            ),
            'OAuth ambiguous create reconciliation'
          );
          if (!Array.isArray(page.results) || !Number.isSafeInteger(page.count) || Number(page.count) < 0) {
            throw new Error('OAuth ambiguous create reconciliation is not bounded');
          }
          if (page.results.length > RECONCILIATION_PAGE_SIZE) {
            throw new Error('OAuth ambiguous create reconciliation page exceeded its bounded size');
          }
          if (expectedCount === undefined) {
            expectedCount = Number(page.count);
            pageCount = Math.max(1, Math.ceil(expectedCount / RECONCILIATION_PAGE_SIZE));
            if (pageCount > RECONCILIATION_MAX_PAGES) {
              throw new Error('OAuth ambiguous create reconciliation exceeded its bounded page limit');
            }
          } else if (Number(page.count) !== expectedCount) {
            throw new Error('OAuth ambiguous create reconciliation count changed during pagination');
          }
          for (const candidateValue of page.results) {
            const candidate = publicClient(candidateValue, 'OAuth ambiguous create candidate');
            if (candidate.name !== intent.name) continue;
            if (
              (candidate.organizationId !== undefined && candidate.organizationId !== intent.organizationId) ||
              (candidate.organizationSlug !== undefined && candidate.organizationSlug !== intent.organizationSlug)
            ) {
              throw new Error('OAuth ambiguous create candidate escaped the exact review boundary');
            }
            matches.push(candidate);
          }
        }
        if (matches.length > 1) throw new Error('OAuth ambiguous create reconciliation found multiple exact matches');
        if (matches[0]) return { clientId: matches[0].clientId, name: matches[0].name };
        await waitForVisibility();
      }
    };

    let evidence: OAuthClientLiveEvidence | undefined;
    let lifecycleFailure: unknown;
    const cleanupFailures: unknown[] = [];
    try {
      const active = await createClient('rotation', null);
      const issuedBeforeRotation = await tokenRequest(active.clientId, active.clientSecret, 200);
      await protectedRead(issuedBeforeRotation as string, 200);

      const rotated = oneTimeClient(
        await jsonRequest(
          `${clientPath(active.clientId)}/rotate-secret`,
          'POST',
          ownerToken,
          { expectedVersion: active.version },
          200,
          'OAuth secret rotation'
        ),
        'OAuth secret rotation'
      );
      assertOAuthClientMutationBinding(
        'OAuth secret rotation',
        active,
        rotated,
        target.allowedOrganizationId,
        boundary.organizationSlug
      );
      await tokenRequest(active.clientId, active.clientSecret, 401);
      await protectedRead(issuedBeforeRotation as string, 200);
      const issuedAfterRotation = await tokenRequest(rotated.clientId, rotated.clientSecret, 200);

      const revoked = publicClient(
        await jsonRequest(
          `${clientPath(rotated.clientId)}/revoke`,
          'POST',
          ownerToken,
          { expectedVersion: rotated.version },
          200,
          'OAuth client revoke'
        ),
        'OAuth client revoke'
      );
      if (revoked.status !== 'Revoked') throw new Error('OAuth client revoke did not return Revoked');
      await tokenRequest(rotated.clientId, rotated.clientSecret, 401);
      await protectedRead(issuedAfterRotation as string, 401);

      const expiryAt = now() + 5_000;
      const expiring = await createClient('expiry', new Date(expiryAt).toISOString());
      const issuedBeforeExpiry = await tokenRequest(expiring.clientId, expiring.clientSecret, 200);
      await protectedRead(issuedBeforeExpiry as string, 200);
      await sleep(Math.max(0, expiryAt - now() + 250));
      await tokenRequest(expiring.clientId, expiring.clientSecret, 401);
      await protectedRead(issuedBeforeExpiry as string, 401);

      const renewed = publicClient(
        await jsonRequest(
          clientPath(expiring.clientId),
          'PATCH',
          ownerToken,
          { expectedVersion: expiring.version, expiresAt: null },
          200,
          'OAuth client renewal'
        ),
        'OAuth client renewal'
      );
      assertOAuthClientMutationBinding(
        'OAuth client renewal',
        expiring,
        renewed,
        target.allowedOrganizationId,
        boundary.organizationSlug
      );
      if (renewed.status !== 'Active') throw new Error('OAuth client renewal did not reactivate the client');
      await protectedRead(issuedBeforeExpiry as string, 401);
      const renewedToken = await tokenRequest(expiring.clientId, expiring.clientSecret, 200);
      await protectedRead(renewedToken as string, 200);

      evidence = {
        initialTokenAccepted: true,
        oldSecretRejectedAfterRotation: true,
        issuedTokenAcceptedAfterRotation: true,
        revokedSecretAndTokenRejected: true,
        expiryRejectedSecretAndToken: true,
        renewedTokenAccepted: true,
        cleanupVerified: true,
      };
    } catch (error) {
      lifecycleFailure = error;
    } finally {
      const cleanupController = new AbortController();
      const cleanupTimer = setTimeout(
        () => cleanupController.abort(new Error('OAuth client cleanup exceeded its independent deadline')),
        cleanupTimeoutMs
      );
      try {
        for (const intent of createIntents) {
          try {
            ownedClients.push(await reconcileCreateIntent(intent, cleanupController.signal));
          } catch (error) {
            cleanupFailures.push(error);
          }
        }
        for (const owned of [...ownedClients].reverse()) {
          try {
            await revokeOwned(owned, cleanupController.signal);
          } catch (error) {
            cleanupFailures.push(error);
          }
        }
      } finally {
        clearTimeout(cleanupTimer);
      }
    }
    if (lifecycleFailure !== undefined && cleanupFailures.length > 0) {
      throw new AggregateError(
        [lifecycleFailure, ...cleanupFailures],
        'OAuth client lifecycle and ownership-verified cleanup both failed closed'
      );
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(cleanupFailures, 'OAuth client ownership-verified cleanup failed closed');
    }
    if (lifecycleFailure !== undefined) {
      throw lifecycleFailure instanceof Error
        ? lifecycleFailure
        : new Error('OAuth client live OAuth lifecycle failed with a non-Error value', { cause: lifecycleFailure });
    }
    return evidence as OAuthClientLiveEvidence;
  }, 'OAuth client live OAuth lifecycle', lifecycleTimeoutMs);
};
