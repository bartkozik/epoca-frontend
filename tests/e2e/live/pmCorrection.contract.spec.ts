import { expect, test } from '@playwright/test';
import type { LiveRunManifest, LiveWorkUnitIntent } from './metadata';
import * as pmCorrection from './pmCorrection';

const marker = 'E2E ct530-pm-correction';
const sourceWorkUnit: LiveWorkUnitIntent & { id: string } = {
  kind: 'workUnit',
  id: 'source-work-unit-id',
  intentId: 'source-work-unit-intent',
  marker,
  organizationId: 'organization-1',
  projectId: 'source-project-id',
  actorUserId: 'user-id',
  descriptionPrefix: `${marker} precise hours`,
  idempotencyKey: 'source-work-unit-key',
};

const manifest = (): LiveRunManifest => {
  const targetClient = {
    kind: 'client' as const,
    id: 'pm-client-id',
    intentId: 'pm-client-intent',
    marker,
    organizationId: sourceWorkUnit.organizationId,
    name: `${marker} PM client`,
  };
  const targetProject = {
    kind: 'project' as const,
    id: 'pm-project-id',
    intentId: 'pm-project-intent',
    marker,
    organizationId: sourceWorkUnit.organizationId,
    clientId: targetClient.id,
    name: `${marker} PM project`,
    descriptionPrefix: `${marker} PM project description`,
  };
  return {
    schemaVersion: 2,
    runId: 'ct530-pm-correction',
    organizationId: sourceWorkUnit.organizationId,
    organizationSlug: 'ct530-staging',
    frontendOrigin: 'https://frontend-staging.example.test',
    apiOrigin: 'https://api-staging.example.test',
    apiBaseURL: 'https://api-staging.example.test/api/v1',
    frontendSha: 'frontend-sha',
    backendSha: 'backend-sha',
    archivedUserId: 'archived-user-id',
    archivedWorkUnitId: 'archived-work-unit-id',
    archivedUserName: 'Archived Fixture',
    historicalDescription: 'E2E CT-530 archived fixture historical hours',
    userId: sourceWorkUnit.actorUserId,
    projectName: `${marker} source project`,
    updatedDescription: `${marker} updated description`,
    owned: {
      clientIds: ['source-client-id', targetClient.id],
      projectIds: [sourceWorkUnit.projectId, targetProject.id],
      workUnitIds: [sourceWorkUnit.id],
    },
    ownership: [
      {
        kind: 'client',
        id: 'source-client-id',
        intentId: 'source-client-intent',
        marker,
        organizationId: sourceWorkUnit.organizationId,
        name: `${marker} source client`,
      },
      {
        kind: 'project',
        id: sourceWorkUnit.projectId,
        intentId: 'source-project-intent',
        marker,
        organizationId: sourceWorkUnit.organizationId,
        clientId: 'source-client-id',
        name: `${marker} source project`,
        descriptionPrefix: `${marker} source project description`,
      },
      targetClient,
      targetProject,
      sourceWorkUnit,
    ],
    intents: [],
    quarantined: [],
  };
};

test('PM correction fixture binds only the owned source work unit and second client/project @mr @technical', () => {
  const input = manifest();

  expect(pmCorrection.resolvePmCorrectionFixture(input)).toEqual({
    sourceWorkUnitId: sourceWorkUnit.id,
    sourceProjectId: sourceWorkUnit.projectId,
    targetClientId: 'pm-client-id',
    targetClientName: `${marker} PM client`,
    targetProjectId: 'pm-project-id',
    targetProjectName: `${marker} PM project`,
  });

  input.ownership = input.ownership.filter(({ id }) => id !== 'pm-project-id');
  expect(() => pmCorrection.resolvePmCorrectionFixture(input)).toThrow(/PM correction fixture/i);

  const sameClient = manifest();
  sameClient.owned.clientIds[1] = 'source-client-id';
  const targetProject = sameClient.ownership.find(({ id }) => id === 'pm-project-id');
  if (!targetProject || targetProject.kind !== 'project') throw new Error('Target project fixture is missing');
  targetProject.clientId = 'source-client-id';
  expect(() => pmCorrection.resolvePmCorrectionFixture(sameClient)).toThrow(/target client must differ/i);
});

test('PM correction target intents stay unique and bind the project to the created client @mr @technical', () => {
  expect(typeof pmCorrection.createPmTargetClientIntent).toBe('function');
  expect(typeof pmCorrection.createPmTargetProjectIntent).toBe('function');

  const input = manifest();
  const client = pmCorrection.createPmTargetClientIntent(input);
  const project = pmCorrection.createPmTargetProjectIntent(input, 'created-pm-client-id');

  expect(client).toEqual({
    kind: 'client',
    intentId: `${input.runId}-pm-client`,
    marker,
    organizationId: input.organizationId,
    name: `${marker} PM client`,
  });
  expect(project).toEqual({
    kind: 'project',
    intentId: `${input.runId}-pm-project`,
    marker,
    organizationId: input.organizationId,
    clientId: 'created-pm-client-id',
    name: `${marker} PM project`,
    descriptionPrefix: `${marker} PM project`,
  });
});
