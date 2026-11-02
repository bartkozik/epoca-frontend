import type {
  LiveMutationIntent,
  LiveOwnershipEvidence,
  LiveQuarantineReason,
  LiveResourceKind,
  LiveRunManifest,
} from './metadata';

type PersistManifest = (manifest: LiveRunManifest) => Promise<void>;

export interface CleanupDependencies {
  persist: PersistManifest;
  read: (kind: LiveResourceKind, id: string) => Promise<unknown>;
  remove: (kind: LiveResourceKind, id: string) => Promise<void>;
}

export interface PendingIntentReconciliationDependencies {
  persist: PersistManifest;
  readById: (kind: LiveResourceKind, id: string, intent: LiveMutationIntent) => Promise<unknown>;
  findCandidates: (intent: LiveMutationIntent) => Promise<unknown[]>;
}

export interface PendingIntentReconciliationResult {
  failures: Error[];
  manifest: LiveRunManifest;
}

export interface FinalizationDependencies extends CleanupDependencies, PendingIntentReconciliationDependencies {}

const asRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Live object ownership response is malformed');
  }
  return value as Record<string, unknown>;
};

const requiredId = (candidate: unknown): string => {
  const id = asRecord(candidate).id;
  if (typeof id !== 'string' || !id.trim() || id.trim() !== id) {
    throw new Error('Live object ownership response has no valid ID');
  }
  return id;
};

const hasOwnedId = (manifest: LiveRunManifest, kind: LiveResourceKind, id: string): boolean => {
  if (kind === 'client') return manifest.owned.clientIds.includes(id);
  if (kind === 'project') return manifest.owned.projectIds.includes(id);
  return manifest.owned.workUnitIds.includes(id);
};

const verifyCandidate = (
  manifest: LiveRunManifest,
  intent: LiveMutationIntent,
  candidate: unknown
): LiveOwnershipEvidence => {
  const record = asRecord(candidate);
  const id = requiredId(record);
  if (intent.kind === 'workUnit' && id === manifest.archivedWorkUnitId) {
    throw new Error('Archived fixture cannot become owned');
  }
  if (record.organizationId !== undefined && record.organizationId !== intent.organizationId) {
    throw new Error('Live object ownership organization mismatch');
  }
  if (intent.kind === 'client') {
    if (
      record.organizationId !== intent.organizationId ||
      record.name !== intent.name ||
      !intent.name.startsWith(intent.marker)
    ) {
      throw new Error('Live client ownership evidence mismatch');
    }
  } else if (intent.kind === 'project') {
    const client = asRecord(record.client);
    if (
      record.organizationId !== intent.organizationId ||
      record.name !== intent.name ||
      typeof record.description !== 'string' ||
      !record.description.startsWith(intent.descriptionPrefix) ||
      client.id !== intent.clientId ||
      !hasOwnedId(manifest, 'client', intent.clientId) ||
      !intent.name.startsWith(intent.marker) ||
      !intent.descriptionPrefix.startsWith(intent.marker)
    ) {
      throw new Error('Live project ownership evidence mismatch');
    }
  } else {
    const projectClient = asRecord(record.projectClient);
    if (
      projectClient.projectId !== intent.projectId ||
      !hasOwnedId(manifest, 'project', intent.projectId) ||
      record.userId !== intent.actorUserId ||
      typeof record.description !== 'string' ||
      !record.description.startsWith(intent.descriptionPrefix) ||
      !intent.descriptionPrefix.startsWith(intent.marker)
    ) {
      throw new Error('Live work-unit ownership evidence mismatch');
    }
  }
  return { ...intent, id };
};

export const verifyOwnedCandidate = (
  manifest: LiveRunManifest,
  evidence: LiveOwnershipEvidence,
  candidate: unknown
): void => {
  const { id, ...intent } = evidence;
  const verified = verifyCandidate(manifest, intent, candidate);
  if (verified.id !== id) throw new Error('Live object ownership ID mismatch');
};

const addQuarantine = (
  manifest: LiveRunManifest,
  intent: LiveMutationIntent,
  candidateIds: Array<string | null>,
  reason: LiveQuarantineReason
): LiveRunManifest => {
  const additions = candidateIds.map((candidateId) => ({
    candidateId,
    intentId: intent.intentId,
    kind: intent.kind,
    reason,
  }));
  const quarantined = manifest.quarantined.filter(
    (current) =>
      !(
        current.intentId === intent.intentId &&
        ((reason !== 'unknown' && current.reason === 'unknown' && candidateIds.includes(current.candidateId)) ||
          (reason === 'unknown' &&
            candidateIds.some((candidateId) => candidateId !== null) &&
            current.candidateId === null))
      )
  );
  for (const entry of additions) {
    if (
      !quarantined.some(
        (current) =>
          current.intentId === entry.intentId &&
          current.candidateId === entry.candidateId &&
          current.reason === entry.reason
      )
    ) {
      quarantined.push(entry);
    }
  }
  return { ...manifest, quarantined };
};

const addEvidence = (
  manifest: LiveRunManifest,
  intent: LiveMutationIntent,
  evidence: LiveOwnershipEvidence
): LiveRunManifest => {
  const existing = manifest.ownership.find(({ kind, id }) => kind === evidence.kind && id === evidence.id);
  const ownership = existing ? manifest.ownership : [...manifest.ownership, evidence];
  const owned = {
    clientIds:
      evidence.kind === 'client' && !manifest.owned.clientIds.includes(evidence.id)
        ? [...manifest.owned.clientIds, evidence.id]
        : manifest.owned.clientIds,
    projectIds:
      evidence.kind === 'project' && !manifest.owned.projectIds.includes(evidence.id)
        ? [...manifest.owned.projectIds, evidence.id]
        : manifest.owned.projectIds,
    workUnitIds:
      evidence.kind === 'workUnit' && !manifest.owned.workUnitIds.includes(evidence.id)
        ? [...manifest.owned.workUnitIds, evidence.id]
        : manifest.owned.workUnitIds,
  };
  return {
    ...manifest,
    owned,
    ownership,
    intents: manifest.intents.filter(({ intentId }) => intentId !== intent.intentId),
    quarantined: manifest.quarantined.filter(
      ({ intentId, reason }) => intentId !== intent.intentId || reason !== 'unknown'
    ),
  };
};

const intentById = (manifest: LiveRunManifest, intentId: string): LiveMutationIntent => {
  const intent = manifest.intents.find((candidate) => candidate.intentId === intentId);
  if (!intent) throw new Error(`Pending live mutation intent ${intentId} is missing`);
  return intent;
};

export const verifyCandidateAndPersist = async (
  manifest: LiveRunManifest,
  intentId: string,
  candidate: unknown,
  persist: PersistManifest
): Promise<LiveRunManifest> => {
  const intent = intentById(manifest, intentId);
  let evidence: LiveOwnershipEvidence;
  try {
    evidence = verifyCandidate(manifest, intent, candidate);
    if (manifest.ownership.some(({ kind, id }) => kind === evidence.kind && id === evidence.id)) {
      throw new Error('Live object ID is already owned by another mutation intent');
    }
  } catch (error) {
    let candidateId: string | null = null;
    try {
      candidateId = requiredId(candidate);
    } catch {
      candidateId = null;
    }
    const reason =
      intent.kind === 'workUnit' && candidateId === manifest.archivedWorkUnitId
        ? 'archived-fixture'
        : 'ownership-mismatch';
    const quarantined = addQuarantine(manifest, intent, [candidateId], reason);
    await persist(quarantined);
    throw new Error(`Live ownership verification failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
  const next = addEvidence(manifest, intent, evidence);
  await persist(next);
  return next;
};

export const reconcilePendingIntent = async (
  manifest: LiveRunManifest,
  intentId: string,
  loadCandidates: (intent: LiveMutationIntent) => Promise<unknown[]>,
  persist: PersistManifest
): Promise<LiveRunManifest> => {
  const intent = intentById(manifest, intentId);
  const concreteQuarantine = manifest.quarantined.find(
    ({ intentId: quarantinedIntentId, reason }) => quarantinedIntentId === intent.intentId && reason !== 'unknown'
  );
  if (concreteQuarantine) {
    throw new Error(`Pending live mutation ${intent.intentId} has a quarantined candidate`);
  }
  const candidates = await loadCandidates(intent);
  if (candidates.length !== 1) {
    const candidateIds =
      candidates.length === 0
        ? [null]
        : candidates.map((candidate) => {
            try {
              return requiredId(candidate);
            } catch {
              return null;
            }
          });
    const reason = candidates.length === 0 ? 'unknown' : 'ambiguous';
    const quarantined = addQuarantine(manifest, intent, candidateIds, reason);
    await persist(quarantined);
    throw new Error(
      candidates.length === 0 ? 'Live mutation result is unknown' : 'Live mutation identity is ambiguous'
    );
  }
  return verifyCandidateAndPersist(manifest, intentId, candidates[0], persist);
};

const nextCandidateIntentId = (manifest: LiveRunManifest, sourceIntentId: string): string => {
  const used = new Set([...manifest.ownership, ...manifest.intents].map(({ intentId }) => intentId));
  let suffix = 1;
  while (used.has(`${sourceIntentId}-candidate-${suffix}`)) suffix += 1;
  return `${sourceIntentId}-candidate-${suffix}`;
};

export const persistResponseCandidate = async (
  manifest: LiveRunManifest,
  sourceIntent: LiveMutationIntent,
  candidateId: string,
  persist: PersistManifest
): Promise<{ intentId: string; manifest: LiveRunManifest; owned: boolean }> => {
  if (!candidateId.trim() || candidateId.trim() !== candidateId) {
    throw new Error('Live response candidate has no valid ID');
  }
  const owned = manifest.ownership.find(({ kind, id }) => kind === sourceIntent.kind && id === candidateId);
  if (owned) return { intentId: owned.intentId, manifest, owned: true };

  const quarantined = manifest.quarantined.find(
    (entry) => entry.kind === sourceIntent.kind && entry.candidateId === candidateId
  );
  if (quarantined?.reason !== undefined && quarantined.reason !== 'unknown') {
    throw new Error(`Live response candidate ${candidateId} is already quarantined`);
  }
  if (quarantined) {
    intentById(manifest, quarantined.intentId);
    return { intentId: quarantined.intentId, manifest, owned: false };
  }

  const sourcePending = manifest.intents.find(({ intentId }) => intentId === sourceIntent.intentId);
  const sourceOwned = manifest.ownership.find(({ intentId }) => intentId === sourceIntent.intentId);
  if (!sourcePending && !sourceOwned) {
    throw new Error(`Live response source intent ${sourceIntent.intentId} is missing`);
  }
  const sourceHasCandidate = manifest.quarantined.some(
    ({ candidateId: currentId, intentId }) => intentId === sourceIntent.intentId && currentId !== null
  );
  const intent =
    sourcePending && !sourceHasCandidate
      ? sourcePending
      : { ...sourceIntent, intentId: nextCandidateIntentId(manifest, sourceIntent.intentId) };
  const pending =
    sourcePending && intent.intentId === sourcePending.intentId
      ? manifest
      : { ...manifest, intents: [...manifest.intents, intent] };
  const next = addQuarantine(pending, intent, [candidateId], 'unknown');
  await persist(next);
  return { intentId: intent.intentId, manifest: next, owned: false };
};

export const reconcilePendingIntents = async (
  initial: LiveRunManifest,
  dependencies: PendingIntentReconciliationDependencies,
  signal?: AbortSignal
): Promise<PendingIntentReconciliationResult> => {
  signal?.throwIfAborted();
  let manifest = initial;
  const failures: Error[] = [];
  const persistAndTrack = async (next: LiveRunManifest): Promise<void> => {
    await dependencies.persist(next);
    manifest = next;
  };

  for (const snapshot of [...initial.intents]) {
    if (signal?.aborted) break;
    const intent = manifest.intents.find(({ intentId }) => intentId === snapshot.intentId);
    if (!intent) continue;
    const concreteQuarantine = manifest.quarantined.find(
      ({ intentId, reason }) => intentId === intent.intentId && reason !== 'unknown'
    );
    if (concreteQuarantine) {
      failures.push(new Error(`Pending live mutation ${intent.intentId} has a quarantined candidate`));
      continue;
    }
    const candidateIds = manifest.quarantined
      .filter(({ intentId, reason }) => intentId === intent.intentId && reason === 'unknown')
      .map(({ candidateId }) => candidateId)
      .filter((candidateId): candidateId is string => candidateId !== null);
    try {
      if (candidateIds.length > 1) {
        throw new Error(`Pending live mutation ${intent.intentId} has ambiguous response candidates`);
      }
      if (candidateIds.length === 1) {
        const candidate = await dependencies.readById(intent.kind, candidateIds[0], intent);
        manifest = await verifyCandidateAndPersist(manifest, intent.intentId, candidate, persistAndTrack);
      } else {
        manifest = await reconcilePendingIntent(
          manifest,
          intent.intentId,
          dependencies.findCandidates,
          persistAndTrack
        );
      }
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error('Pending live mutation reconciliation failed'));
    }
  }
  return { failures, manifest };
};

const withoutEvidence = (manifest: LiveRunManifest, evidence: LiveOwnershipEvidence): LiveRunManifest => ({
  ...manifest,
  owned: {
    clientIds: manifest.owned.clientIds.filter((id) => evidence.kind !== 'client' || id !== evidence.id),
    projectIds: manifest.owned.projectIds.filter((id) => evidence.kind !== 'project' || id !== evidence.id),
    workUnitIds: manifest.owned.workUnitIds.filter((id) => evidence.kind !== 'workUnit' || id !== evidence.id),
  },
  ownership: manifest.ownership.filter(({ kind, id }) => kind !== evidence.kind || id !== evidence.id),
});

const hasUnresolvedChild = (manifest: LiveRunManifest, evidence: LiveOwnershipEvidence): boolean => {
  const lifecycle = [...manifest.ownership, ...manifest.intents];
  if (evidence.kind === 'project') {
    return lifecycle.some((candidate) => candidate.kind === 'workUnit' && candidate.projectId === evidence.id);
  }
  if (evidence.kind === 'client') {
    return lifecycle.some((candidate) => candidate.kind === 'project' && candidate.clientId === evidence.id);
  }
  return false;
};

export const cleanupVerifiedLiveData = async (
  initial: LiveRunManifest,
  dependencies: CleanupDependencies,
  signal?: AbortSignal
): Promise<LiveRunManifest> => {
  signal?.throwIfAborted();
  let manifest = initial;
  const failures: Error[] = [];
  const ordered = [
    ...initial.ownership.filter(({ kind }) => kind === 'workUnit').reverse(),
    ...initial.ownership.filter(({ kind }) => kind === 'project').reverse(),
    ...initial.ownership.filter(({ kind }) => kind === 'client').reverse(),
  ];

  for (const evidence of ordered) {
    if (signal?.aborted) break;
    if (hasUnresolvedChild(manifest, evidence)) {
      failures.push(new Error(`Guarded live cleanup blocked ${evidence.kind} ${evidence.id} by unresolved children`));
      continue;
    }
    const { id: _ownedId, ...intentValue } = evidence;
    const intent = intentValue;
    let verified = false;
    try {
      if (evidence.kind === 'workUnit' && evidence.id === manifest.archivedWorkUnitId) {
        throw new Error('Archived fixture cannot be cleaned up');
      }
      const candidate = await dependencies.read(evidence.kind, evidence.id);
      verifyOwnedCandidate(manifest, evidence, candidate);
      verified = true;
      await dependencies.remove(evidence.kind, evidence.id);
      manifest = withoutEvidence(manifest, evidence);
      await dependencies.persist(manifest);
    } catch (error) {
      const reason: LiveQuarantineReason =
        evidence.kind === 'workUnit' && evidence.id === manifest.archivedWorkUnitId
          ? 'archived-fixture'
          : verified
          ? 'cleanup-failed'
          : 'ownership-mismatch';
      manifest = addQuarantine(manifest, intent, [evidence.id], reason);
      await dependencies.persist(manifest);
      failures.push(error instanceof Error ? error : new Error('Guarded live cleanup failed'));
      if (signal?.aborted) break;
    }
  }
  if (failures.length > 0) throw new AggregateError(failures, 'One or more guarded live cleanup operations failed');
  return manifest;
};

export const finalizeVerifiedLiveData = async (
  initial: LiveRunManifest,
  dependencies: FinalizationDependencies,
  signal?: AbortSignal
): Promise<LiveRunManifest> => {
  const reconciliation = await reconcilePendingIntents(initial, dependencies, signal);
  const failures = [...reconciliation.failures];
  let manifest = reconciliation.manifest;
  try {
    manifest = await cleanupVerifiedLiveData(manifest, dependencies, signal);
  } catch (error) {
    if (error instanceof AggregateError) {
      failures.push(
        ...error.errors.map((entry) =>
          entry instanceof Error ? entry : new Error('Guarded live cleanup operation failed')
        )
      );
    } else {
      failures.push(error instanceof Error ? error : new Error('Guarded live cleanup failed'));
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Guarded live finalization left unresolved lifecycle evidence');
  }
  return manifest;
};
