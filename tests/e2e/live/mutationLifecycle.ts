import type { LiveMutationIntent, LiveRunManifest } from './metadata';
import {
  persistResponseCandidate,
  reconcilePendingIntent,
  reconcilePendingIntents,
  verifyCandidateAndPersist,
  verifyOwnedCandidate,
} from './ownership';

type PersistManifest = (manifest: LiveRunManifest) => Promise<void>;

export interface PersistedCreateDependencies {
  persist: PersistManifest;
  create: (intent: LiveMutationIntent) => Promise<unknown>;
  readById: (id: string, intent: LiveMutationIntent) => Promise<unknown>;
  findCandidates: (intent: LiveMutationIntent) => Promise<unknown[]>;
}

const responseId = (value: unknown): string => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Live mutation response is malformed');
  }
  const id = (value as Record<string, unknown>).id;
  if (typeof id !== 'string' || !id.trim() || id.trim() !== id) {
    throw new Error('Live mutation response has no valid ID');
  }
  return id;
};

class CreateAttemptFailure extends Error {
  readonly manifest: LiveRunManifest;
  readonly retryable: boolean;
  readonly original: unknown;

  constructor(error: unknown, manifest: LiveRunManifest, retryable: boolean) {
    super(error instanceof Error ? error.message : 'Live mutation attempt failed', { cause: error });
    this.name = 'CreateAttemptFailure';
    this.manifest = manifest;
    this.retryable = retryable;
    this.original = error;
  }
}

const errorStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null || !('status' in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined;
};

const isAbortError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';

const isRetryableCreateError = (error: unknown): boolean => {
  if (isAbortError(error)) return false;
  const status = errorStatus(error);
  if (status === undefined) return true;
  return status === 408 || status === 429 || status >= 500;
};

const withPendingIntent = (manifest: LiveRunManifest, intent: LiveMutationIntent): LiveRunManifest => {
  if (intent.marker !== `E2E ${manifest.runId}` || intent.organizationId !== manifest.organizationId) {
    throw new Error('Live mutation intent does not belong to this run');
  }
  if (manifest.intents.some(({ intentId }) => intentId === intent.intentId)) {
    throw new Error(`Live mutation intent ${intent.intentId} already exists`);
  }
  return { ...manifest, intents: [...manifest.intents, intent] };
};

export const persistMutationIntent = async (
  manifest: LiveRunManifest,
  intent: LiveMutationIntent,
  persist: PersistManifest
): Promise<LiveRunManifest> => {
  const pending = withPendingIntent(manifest, intent);
  await persist(pending);
  return pending;
};

export const executePersistedCreate = async (
  manifest: LiveRunManifest,
  intent: LiveMutationIntent,
  dependencies: PersistedCreateDependencies,
  signal?: AbortSignal
): Promise<LiveRunManifest> => {
  signal?.throwIfAborted();
  const pending = await persistMutationIntent(manifest, intent, dependencies.persist);

  const attempt = async (current: LiveRunManifest): Promise<LiveRunManifest> => {
    signal?.throwIfAborted();
    let createdId: string;
    try {
      createdId = responseId(await dependencies.create(intent));
    } catch (error) {
      throw new CreateAttemptFailure(error, current, isRetryableCreateError(error));
    }

    let recovery: Awaited<ReturnType<typeof persistResponseCandidate>>;
    try {
      recovery = await persistResponseCandidate(current, intent, createdId, dependencies.persist);
    } catch (error) {
      throw new CreateAttemptFailure(error, current, false);
    }

    let candidate: unknown;
    try {
      candidate = await dependencies.readById(createdId, intent);
    } catch (error) {
      throw new CreateAttemptFailure(error, recovery.manifest, !isAbortError(error));
    }

    try {
      if (recovery.owned) {
        const evidence = recovery.manifest.ownership.find(({ id, kind }) => id === createdId && kind === intent.kind);
        if (!evidence) throw new Error(`Owned live mutation candidate ${createdId} has no evidence`);
        verifyOwnedCandidate(recovery.manifest, evidence, candidate);
        return recovery.manifest;
      }
      return await verifyCandidateAndPersist(recovery.manifest, recovery.intentId, candidate, dependencies.persist);
    } catch (error) {
      throw new CreateAttemptFailure(error, recovery.manifest, false);
    }
  };

  let firstFailure: CreateAttemptFailure;
  try {
    return await attempt(pending);
  } catch (error) {
    if (!(error instanceof CreateAttemptFailure)) throw error;
    firstFailure = error;
  }

  if (!firstFailure.retryable) throw firstFailure.original;
  if (intent.kind !== 'workUnit') {
    signal?.throwIfAborted();
    return reconcilePendingIntent(
      firstFailure.manifest,
      intent.intentId,
      dependencies.findCandidates,
      dependencies.persist
    );
  }
  signal?.throwIfAborted();

  let secondFailure: CreateAttemptFailure;
  try {
    return await attempt(firstFailure.manifest);
  } catch (error) {
    if (!(error instanceof CreateAttemptFailure)) throw error;
    secondFailure = error;
  }
  if (!secondFailure.retryable) throw secondFailure.original;
  signal?.throwIfAborted();
  const reconciliation = await reconcilePendingIntents(
    secondFailure.manifest,
    {
      persist: dependencies.persist,
      readById: (_kind, id, pendingIntent) => dependencies.readById(id, pendingIntent),
      findCandidates: dependencies.findCandidates,
    },
    signal
  );
  if (reconciliation.failures.length === 1) throw reconciliation.failures[0];
  if (reconciliation.failures.length > 1) {
    throw new AggregateError(reconciliation.failures, 'Persisted live mutation reconciliation failed');
  }
  return reconciliation.manifest;
};
