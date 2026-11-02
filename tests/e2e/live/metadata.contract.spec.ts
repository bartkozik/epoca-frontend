import { expect, test } from '@playwright/test';
import {
  parseLiveRunManifest,
  parseLiveRunMetadata,
  parseLocalProxyMetadata,
  serializeLiveRunManifest,
  type LiveRunManifest,
  type LiveRunMetadata,
  type LocalProxyMetadata,
} from './metadata';

const liveManifest: LiveRunManifest = {
  schemaVersion: 2,
  runId: 'ct530-1234',
  organizationId: 'organization-1',
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
  userId: 'user-id',
  projectName: 'E2E ct530-1234 project',
  updatedDescription: 'E2E ct530-1234 updated description',
  owned: {
    clientIds: ['client-id'],
    projectIds: ['project-id'],
    workUnitIds: ['work-unit-id'],
  },
  ownership: [
    {
      kind: 'client',
      id: 'client-id',
      intentId: 'client-intent',
      marker: 'E2E ct530-1234',
      organizationId: 'organization-1',
      name: 'E2E ct530-1234 client',
    },
    {
      kind: 'project',
      id: 'project-id',
      intentId: 'project-intent',
      marker: 'E2E ct530-1234',
      organizationId: 'organization-1',
      clientId: 'client-id',
      name: 'E2E ct530-1234 project',
      descriptionPrefix: 'E2E ct530-1234 initial description',
    },
    {
      kind: 'workUnit',
      id: 'work-unit-id',
      intentId: 'work-unit-intent',
      marker: 'E2E ct530-1234',
      organizationId: 'organization-1',
      projectId: 'project-id',
      actorUserId: 'user-id',
      descriptionPrefix: 'E2E ct530-1234 precise hours',
      idempotencyKey: 'ct530-1234-precise-hours',
    },
  ],
  intents: [],
  quarantined: [],
};

test('private manifest round-trips its exact schema and rejects credential-like keys @mr @technical', () => {
  expect(parseLiveRunManifest(JSON.parse(serializeLiveRunManifest(liveManifest)))).toEqual(liveManifest);
  expect(() => parseLiveRunManifest({ ...liveManifest, password: 'must-not-persist' })).toThrow(/credential/i);
  expect(() => parseLiveRunManifest({ ...liveManifest, unexpected: true })).toThrow(/schema/i);
});

test('private manifest requires evidence for owned IDs and rejects archived fixture ownership @mr @technical', () => {
  const nextManifest = {
    ...liveManifest,
    schemaVersion: 2,
    owned: { clientIds: [], projectIds: [], workUnitIds: [] },
    ownership: [],
    intents: [],
    quarantined: [],
  };
  expect(parseLiveRunManifest(nextManifest)).toEqual(nextManifest);
  expect(() =>
    parseLiveRunManifest({
      ...nextManifest,
      owned: { ...nextManifest.owned, workUnitIds: [nextManifest.archivedWorkUnitId] },
      ownership: [
        {
          kind: 'workUnit',
          id: nextManifest.archivedWorkUnitId,
          intentId: 'unsafe-intent',
          marker: `E2E ${nextManifest.runId}`,
          organizationId: nextManifest.organizationId,
          projectId: 'project-id',
          actorUserId: nextManifest.userId,
          descriptionPrefix: `E2E ${nextManifest.runId}`,
          idempotencyKey: 'unsafe-key',
        },
      ],
    })
  ).toThrow(/archived fixture/i);
  expect(() =>
    parseLiveRunManifest({
      ...nextManifest,
      owned: { ...nextManifest.owned, clientIds: ['unverified-client'] },
    })
  ).toThrow(/evidence/i);
});

test('private manifest rejects duplicate mutation identities and orphan quarantine entries @mr @technical', () => {
  expect(() =>
    parseLiveRunManifest({
      ...liveManifest,
      ownership: liveManifest.ownership.map((entry, index) =>
        index === 1 ? { ...entry, intentId: liveManifest.ownership[0].intentId } : entry
      ),
    })
  ).toThrow(/intent|identity/i);
  expect(() =>
    parseLiveRunManifest({
      ...liveManifest,
      quarantined: [{ kind: 'client', intentId: 'orphan-intent', candidateId: null, reason: 'unknown' }],
    })
  ).toThrow(/quarantine|intent/i);
});

test('sanitized live metadata round-trips exactly and rejects secrets or empty SHAs @mr @technical', () => {
  const metadata: LiveRunMetadata = {
    schemaVersion: 2,
    runId: 'ct530-1234',
    frontendSha: 'frontend-sha',
    backendSha: 'backend-sha',
  };

  expect(parseLiveRunMetadata(JSON.parse(JSON.stringify(metadata)))).toEqual(metadata);
  expect(() => parseLiveRunMetadata({ ...metadata, accessToken: 'must-not-persist' })).toThrow(/credential/i);
  expect(() => parseLiveRunMetadata({ ...metadata, frontendSha: '' })).toThrow(/SHA/i);
});

test('sanitized local-proxy metadata round-trips exactly and rejects secrets or extra keys @mr @technical', () => {
  const metadata: LocalProxyMetadata = {
    schemaVersion: 2,
    proxyOrigin: 'https://api-staging.example.test',
    frontendSha: 'frontend-sha',
    backendSha: 'backend-sha',
    status: 'pending',
  };

  expect(parseLocalProxyMetadata(JSON.parse(JSON.stringify(metadata)))).toEqual(metadata);
  expect(() => parseLocalProxyMetadata({ ...metadata, email: 'must-not-persist@example.test' })).toThrow(/credential/i);
  expect(() => parseLocalProxyMetadata({ ...metadata, unexpected: true })).toThrow(/schema/i);
  expect(() => parseLocalProxyMetadata({ ...metadata, status: 'configured' })).toThrow(/status/i);
});
