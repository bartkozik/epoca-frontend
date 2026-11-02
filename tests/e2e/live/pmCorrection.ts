import type {
  LiveClientIntent,
  LiveOwnershipEvidence,
  LiveProjectIntent,
  LiveRunManifest,
} from './metadata';

export interface PmCorrectionFixture {
  sourceWorkUnitId: string;
  sourceProjectId: string;
  targetClientId: string;
  targetClientName: string;
  targetProjectId: string;
  targetProjectName: string;
}

const runMarker = (manifest: LiveRunManifest): string => `E2E ${manifest.runId}`;

export const createPmTargetClientIntent = (manifest: LiveRunManifest): LiveClientIntent => {
  const marker = runMarker(manifest);
  return {
    kind: 'client',
    intentId: `${manifest.runId}-pm-client`,
    marker,
    organizationId: manifest.organizationId,
    name: `${marker} PM client`,
  };
};

export const createPmTargetProjectIntent = (
  manifest: LiveRunManifest,
  clientId: string
): LiveProjectIntent => {
  if (!clientId.trim()) throw new Error('PM correction target client ID is required');
  const marker = runMarker(manifest);
  return {
    kind: 'project',
    intentId: `${manifest.runId}-pm-project`,
    marker,
    organizationId: manifest.organizationId,
    clientId,
    name: `${marker} PM project`,
    descriptionPrefix: `${marker} PM project`,
  };
};

const ownedEvidence = <TKind extends LiveOwnershipEvidence['kind']>(
  manifest: LiveRunManifest,
  kind: TKind,
  id: string | undefined
): Extract<LiveOwnershipEvidence, { kind: TKind }> => {
  const evidence = manifest.ownership.find(
    (entry): entry is Extract<LiveOwnershipEvidence, { kind: TKind }> => entry.kind === kind && entry.id === id
  );
  if (!id || !evidence || evidence.organizationId !== manifest.organizationId) {
    throw new Error(`PM correction fixture has no verified owned ${kind}`);
  }
  return evidence;
};

export const resolvePmCorrectionFixture = (manifest: LiveRunManifest): PmCorrectionFixture => {
  const sourceWorkUnit = ownedEvidence(
    manifest,
    'workUnit',
    manifest.owned.workUnitIds[0]
  );
  const sourceProject = ownedEvidence(manifest, 'project', sourceWorkUnit.projectId);
  const targetClient = ownedEvidence(
    manifest,
    'client',
    manifest.owned.clientIds[1]
  );
  const targetProject = ownedEvidence(
    manifest,
    'project',
    manifest.owned.projectIds[1]
  );

  if (targetProject.clientId !== targetClient.id) {
    throw new Error('PM correction fixture target project does not belong to the target client');
  }
  if (sourceProject.clientId === targetClient.id) {
    throw new Error('PM correction fixture target client must differ from the source client');
  }
  if (sourceWorkUnit.projectId === targetProject.id) {
    throw new Error('PM correction fixture target project must differ from the source project');
  }

  return {
    sourceWorkUnitId: sourceWorkUnit.id,
    sourceProjectId: sourceWorkUnit.projectId,
    targetClientId: targetClient.id,
    targetClientName: targetClient.name,
    targetProjectId: targetProject.id,
    targetProjectName: targetProject.name,
  };
};
