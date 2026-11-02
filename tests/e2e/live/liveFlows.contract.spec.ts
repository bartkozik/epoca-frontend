import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { WorkUnitOverrideResponse } from '../../workUnitOverrides/fixtures/contract';
import {
  assertLiveWorkUnitSourceUnchanged,
  buildLongFilterRequest,
  constrainArchivedWorkUnitsGet,
  decodeBrowserApiResponse,
  guardedPlaywrightCall,
  live,
  parseLiveWorkUnitOverride,
  parseProjectSnapshot,
  recoverFirstWorkUnitResponse,
  registerWorkUnitResponseCandidate,
  resolveAllowedOrganizationChoice,
  restoreAcceptedLiveOverride,
  shouldBlockExternalFontRequest,
} from './liveFlows';
import { parseLiveRunManifest, type LiveRunManifest, type LiveWorkUnitIntent } from './metadata';
import { cleanupVerifiedLiveData, finalizeVerifiedLiveData, reconcilePendingIntents } from './ownership';
import { createLiveProjectBody } from './provisionWorld';

const workUnitId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourceProject = {
  projectId: '22222222-2222-4222-8222-222222222222',
  projectName: 'Source project',
  projectDescription: null,
  clientId: '33333333-3333-4333-8333-333333333333',
  clientName: 'Source client',
  clientColor: '',
  clientTexture: '',
};
const correctedProject = {
  ...sourceProject,
  projectId: '44444444-4444-4444-8444-444444444444',
  projectName: 'Corrected project',
  clientId: '55555555-5555-4555-8555-555555555555',
  clientName: 'Corrected client',
};
const overrideFixture = (patch: Partial<WorkUnitOverrideResponse> = {}): WorkUnitOverrideResponse => ({
  id: workUnitId,
  userId: workUnitId,
  userFullName: 'Source author',
  date: '2026-09-01',
  duration: 'PT1H',
  entryType: 'Worklog',
  description: 'Source description',
  taskId: 'SOURCE',
  state: 'Active',
  createdAt: '2026-09-01T08:00:00Z',
  modifiedAt: '2026-09-01T08:00:00Z',
  projectClient: sourceProject,
  effectiveProjectClient: correctedProject,
  effectiveTaskId: 'CORRECTED',
  revision: 8,
  override: {
    active: true,
    hasHistory: true,
    version: 3,
    projectId: correctedProject.projectId,
    taskId: { mode: 'Set', value: 'CORRECTED' },
    lastChangedAt: null,
    lastChangedBy: null,
    permissions: {
      canEdit: true,
      canDelete: true,
      canViewHistory: true,
      allowedProjectIds: [sourceProject.projectId, correctedProject.projectId],
    },
  },
  ...patch,
});

const successfulMutationResponse = (
  id: string
): { json: () => Promise<{ id: string }>; ok: () => boolean; status: () => number } => ({
  ok: () => true,
  status: () => 201,
  json: () => Promise.resolve({ id }),
});

const replayMarker = 'E2E ct530-replay';
const replayIntent: LiveWorkUnitIntent = {
  kind: 'workUnit',
  intentId: 'replay-work-unit-intent',
  marker: replayMarker,
  organizationId: 'organization-1',
  projectId: 'project-id',
  actorUserId: 'user-id',
  descriptionPrefix: `${replayMarker} idempotency retry`,
  idempotencyKey: 'stable-replay-key',
};

const replayManifest = (): LiveRunManifest => ({
  schemaVersion: 2,
  runId: 'ct530-replay',
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
  projectName: `${replayMarker} project`,
  updatedDescription: `${replayMarker} updated description`,
  owned: { clientIds: ['client-id'], projectIds: ['project-id'], workUnitIds: [] },
  ownership: [
    {
      kind: 'client',
      id: 'client-id',
      intentId: 'client-intent',
      marker: replayMarker,
      organizationId: 'organization-1',
      name: `${replayMarker} client`,
    },
    {
      kind: 'project',
      id: 'project-id',
      intentId: 'project-intent',
      marker: replayMarker,
      organizationId: 'organization-1',
      clientId: 'client-id',
      name: `${replayMarker} project`,
      descriptionPrefix: `${replayMarker} project description`,
    },
  ],
  intents: [replayIntent],
  quarantined: [],
});

test('live guard blocks only passive Google Fonts reads without trusting their origins @mr @technical', () => {
  expect(
    shouldBlockExternalFontRequest({
      method: 'GET',
      requestUrl: 'https://fonts.googleapis.com/css2?family=Open+Sans',
      resourceType: 'stylesheet',
    })
  ).toBe(true);
  expect(
    shouldBlockExternalFontRequest({
      method: 'GET',
      requestUrl: 'https://fonts.gstatic.com/s/open-sans/font.woff2',
      resourceType: 'font',
    })
  ).toBe(true);

  for (const request of [
    { method: 'POST', requestUrl: 'https://fonts.googleapis.com/css2', resourceType: 'stylesheet' },
    { method: 'GET', requestUrl: 'https://fonts.googleapis.com/css2', resourceType: 'fetch' },
    { method: 'GET', requestUrl: 'https://evil.example.test/font.woff2', resourceType: 'font' },
  ]) {
    expect(shouldBlockExternalFontRequest(request)).toBe(false);
  }
});

test('live login selects only the one exact active organization returned by the API @mr @technical', () => {
  const organizations = {
    results: [
      { id: 'other-id', name: 'Other', slug: 'other' },
      { id: 'allowed-id', name: 'Iterators Testing', slug: 'iteratorstesting' },
    ],
  };
  expect(resolveAllowedOrganizationChoice(organizations, 'allowed-id', 'iteratorstesting')).toBe('Iterators Testing');
  expect(() => resolveAllowedOrganizationChoice(organizations, 'allowed-id', 'other')).toThrow(/organization/i);
  expect(() =>
    resolveAllowedOrganizationChoice(
      { results: [...organizations.results, { id: 'allowed-id', name: 'Duplicate', slug: 'iteratorstesting' }] },
      'allowed-id',
      'iteratorstesting'
    )
  ).toThrow(/organization/i);
  expect(() =>
    resolveAllowedOrganizationChoice(
      { results: [{ id: 'allowed-id', archivedAt: '2026-08-26', slug: 'iteratorstesting' }] },
      'allowed-id',
      'iteratorstesting'
    )
  ).toThrow(/organization/i);
});

test('long-filter request exceeds 2048 bytes without crossing the bounded proxy-safe ceiling @mr @technical', () => {
  const request = buildLongFilterRequest(
    'https://frontend-staging.example.test/api/v1',
    'iteratorstesting',
    'project-id'
  );
  expect(request.absoluteURL.length).toBeGreaterThan(2048);
  expect(request.absoluteURL.length).toBeLessThanOrEqual(4096);
  expect(new URL(request.absoluteURL).searchParams.getAll('projectId').length).toBeGreaterThan(1);
});

test('browser API decoding preserves non-JSON error status without trusting its body @mr @technical', () => {
  expect(decodeBrowserApiResponse(200, 'application/json; charset=utf-8', '{"ok":true}')).toEqual({
    body: { ok: true },
    status: 200,
  });
  expect(decodeBrowserApiResponse(404, 'text/plain; charset=UTF-8', 'Not found')).toEqual({
    body: null,
    status: 404,
  });
  expect(() => decodeBrowserApiResponse(200, 'text/html', '<html>unexpected success</html>')).toThrow(
    /200.*text\/html/i
  );
});

test('project detail adapter derives membership from the real projectUsers DTO @mr @technical', () => {
  expect(
    parseProjectSnapshot({
      name: 'Owned project',
      description: 'Owned description',
      projectUsers: [
        { id: 'owner-id', role: 'Owner' },
        { id: 'member-id', role: 'Member' },
      ],
    })
  ).toEqual({
    name: 'Owned project',
    description: 'Owned description',
    ownerIds: ['owner-id'],
    memberIds: ['member-id'],
    userIds: ['owner-id', 'member-id'],
  });
});

test('provisioned project starts with the ordinary user as a member for independent UI mutations @mr @technical', () => {
  expect(createLiveProjectBody('client-id', 'Project', 'Description', 'owner-id', 'user-id')).toEqual({
    clientId: 'client-id',
    name: 'Project',
    description: 'Description',
    ownerIds: ['owner-id'],
    memberIds: ['user-id'],
  });
});

const replayCandidate = (
  id: string,
  userId = 'user-id'
): { description: string; id: string; projectClient: { projectId: string }; userId: string } => ({
  id,
  userId,
  description: replayIntent.descriptionPrefix,
  projectClient: { projectId: replayIntent.projectId },
});

test('live worklog override flow replaces the retired PM API helper @mr @technical', () => {
  expect(typeof live.applyWorkUnitOverride).toBe('function');
  expect(live).not.toHaveProperty('applyPmCorrection');
});

test('live override adapter validates the full source effective revision contract @mr @technical', () => {
  const fixture = overrideFixture();
  expect(() =>
    assertLiveWorkUnitSourceUnchanged({ ...fixture, modifiedAt: '2026-09-01T09:00:00Z' }, fixture)
  ).not.toThrow();
  for (const patch of [
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    { userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    { date: '2026-09-02' },
    { duration: 'PT2H' },
    { entryType: 'Note' as const },
    { description: 'SOURCE-CHANGED-BY-PUT' },
    { state: 'Draft' as const },
    { createdAt: '2026-09-01T09:00:00Z' },
    { projectClient: correctedProject },
    { taskId: 'SOURCE-CHANGED-BY-PUT' },
  ]) {
    expect(() => assertLiveWorkUnitSourceUnchanged({ ...fixture, ...patch }, fixture)).toThrow();
  }
  const parsed = parseLiveWorkUnitOverride(fixture, workUnitId);
  expect(parsed.projectClient?.projectName).toBe('Source project');
  expect(parsed.effectiveProjectClient?.projectName).toBe('Corrected project');
  expect(parsed.taskId).toBe('SOURCE');
  expect(parsed.effectiveTaskId).toBe('CORRECTED');
  expect(parsed.revision).toBe(8);
  expect(parsed.override.version).toBe(3);
  expect(() => parseLiveWorkUnitOverride({ ...fixture, revision: undefined }, workUnitId)).toThrow();
  expect(() => parseLiveWorkUnitOverride(fixture, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).toThrow(/ID/i);
  expect(() => parseLiveWorkUnitOverride({ active: true, projectClient: fixture.projectClient }, workUnitId)).toThrow();
});

test('live override adapter preserves explicit Clear without falling back to source @mr @technical', () => {
  const fixture = overrideFixture();
  const cleared = {
    ...fixture,
    effectiveTaskId: null,
    override: { ...fixture.override, taskId: { mode: 'Clear' } },
  };
  expect(parseLiveWorkUnitOverride(cleared, workUnitId).effectiveTaskId).toBeNull();
  expect(() =>
    parseLiveWorkUnitOverride(
      { ...cleared, override: { ...cleared.override, taskId: { mode: 'Clear', value: null } } },
      workUnitId
    )
  ).toThrow();
});

test('live override cleanup uses only its accepted revision and never retries a conflict @mr @technical', async () => {
  const accepted = overrideFixture();
  const revisions: number[] = [];
  await expect(
    restoreAcceptedLiveOverride(accepted, (expectedRevision) => {
      revisions.push(expectedRevision);
      return Promise.resolve({ status: 409, body: { extension: { currentRevision: 100 } } });
    })
  ).rejects.toThrow(/409/);
  expect(revisions).toEqual([accepted.revision]);

  const restored = overrideFixture({
    revision: accepted.revision + 1,
    effectiveProjectClient: accepted.projectClient,
    effectiveTaskId: accepted.taskId,
    override: {
      ...accepted.override,
      active: false,
      projectId: null,
      taskId: { mode: 'Inherit' },
      version: accepted.override.version + 1,
    },
  });
  await expect(
    restoreAcceptedLiveOverride(accepted, (expectedRevision) => {
      expect(expectedRevision).toBe(accepted.revision);
      return Promise.resolve({ status: 200, body: restored });
    })
  ).resolves.toEqual(restored);
});

test('live override cleanup rejects invalid restoration evidence without another mutation @mr @technical', async () => {
  const accepted = overrideFixture();
  const restored = overrideFixture({
    revision: accepted.revision + 1,
    effectiveProjectClient: accepted.projectClient,
    effectiveTaskId: accepted.taskId,
    override: {
      ...accepted.override,
      active: false,
      projectId: null,
      taskId: { mode: 'Inherit' },
      version: accepted.override.version + 1,
    },
  });
  const invalidResults = [
    { ...restored, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    { ...restored, revision: accepted.revision },
    { ...restored, effectiveTaskId: 'STILL-CORRECTED' },
    { ...restored, effectiveProjectClient: accepted.effectiveProjectClient },
    { ...restored, taskId: 'SOURCE-CHANGED-BY-RESET' },
    { ...restored, projectClient: accepted.effectiveProjectClient },
    { ...restored, userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    { ...restored, date: '2026-09-02' },
    { ...restored, duration: 'PT2H' },
    { ...restored, entryType: 'Note' },
    { ...restored, description: 'SOURCE-CHANGED-BY-RESET' },
    { ...restored, state: 'Draft' },
    { ...restored, createdAt: '2026-09-01T09:00:00Z' },
    { ...restored, override: { ...restored.override, active: true } },
    { ...restored, override: { ...restored.override, hasHistory: false } },
    { ...restored, override: { ...restored.override, version: accepted.override.version } },
  ];
  for (const body of invalidResults) {
    let attempts = 0;
    await expect(
      restoreAcceptedLiveOverride(accepted, () => {
        attempts += 1;
        return Promise.resolve({ status: 200, body });
      })
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  }
});

test('a second different valid replay ID is durably recorded, verified, and cleanup-owned @mr @technical', async () => {
  let persisted = replayManifest();
  const recoveryObservedBeforeRead: string[] = [];
  const dependencies = {
    persist: (next: LiveRunManifest) => {
      persisted = next;
      return Promise.resolve();
    },
    readById: (id: string) => {
      if (persisted.quarantined.some(({ candidateId, reason }) => candidateId === id && reason === 'unknown')) {
        recoveryObservedBeforeRead.push(id);
      }
      return Promise.resolve(replayCandidate(id));
    },
  };

  await registerWorkUnitResponseCandidate(
    persisted,
    replayIntent,
    successfulMutationResponse('first-id'),
    dependencies
  );
  await registerWorkUnitResponseCandidate(
    persisted,
    replayIntent,
    successfulMutationResponse('second-valid-id'),
    dependencies
  );

  expect(recoveryObservedBeforeRead).toEqual(['first-id', 'second-valid-id']);
  expect(persisted.owned.workUnitIds).toEqual(['first-id', 'second-valid-id']);
  expect(persisted.intents).toEqual([]);
  expect(persisted.quarantined).toEqual([]);

  const removed: string[] = [];
  await cleanupVerifiedLiveData(persisted, {
    persist: (next) => {
      persisted = next;
      return Promise.resolve();
    },
    read: (kind, id) => {
      if (kind === 'workUnit') return Promise.resolve(replayCandidate(id));
      if (kind === 'project') {
        return Promise.resolve({
          id,
          name: `${replayMarker} project`,
          description: `${replayMarker} project description`,
          organizationId: 'organization-1',
          client: { id: 'client-id' },
        });
      }
      return Promise.resolve({ id, name: `${replayMarker} client`, organizationId: 'organization-1' });
    },
    remove: (_kind, id) => {
      removed.push(id);
      return Promise.resolve();
    },
  });
  expect(removed).toEqual(['second-valid-id', 'first-id', 'project-id', 'client-id']);
});

test('a mismatched replay candidate stays quarantined and is never cleanup-owned @mr @technical', async () => {
  let persisted = replayManifest();
  const dependencies = {
    persist: (next: LiveRunManifest) => {
      persisted = next;
      return Promise.resolve();
    },
    readById: (id: string) => Promise.resolve(replayCandidate(id, id === 'shared-id' ? 'other-user-id' : 'user-id')),
  };
  await registerWorkUnitResponseCandidate(
    persisted,
    replayIntent,
    successfulMutationResponse('first-id'),
    dependencies
  );

  await expect(
    registerWorkUnitResponseCandidate(persisted, replayIntent, successfulMutationResponse('shared-id'), dependencies)
  ).rejects.toThrow(/ownership/i);

  expect(persisted.owned.workUnitIds).toEqual(['first-id']);
  expect(persisted.quarantined).toContainEqual(
    expect.objectContaining({ candidateId: 'shared-id', reason: 'ownership-mismatch' })
  );
  expect(persisted.quarantined).not.toContainEqual(
    expect.objectContaining({ candidateId: 'shared-id', reason: 'unknown' })
  );
  const removed: string[] = [];
  await expect(
    cleanupVerifiedLiveData(persisted, {
      persist: (next) => {
        persisted = next;
        return Promise.resolve();
      },
      read: (_kind, id) => Promise.resolve(replayCandidate(id)),
      remove: (_kind, id) => {
        removed.push(id);
        return Promise.resolve();
      },
    })
  ).rejects.toThrow(/cleanup/i);
  expect(removed).toEqual(['first-id']);
  expect(removed).not.toContain('shared-id');
});

test('the first-response catch keeps concrete quarantine terminal while independent cleanup proceeds @mr @technical', async () => {
  let persisted = replayManifest();
  const independentClient = {
    kind: 'client' as const,
    id: 'independent-client-id',
    intentId: 'independent-client-intent',
    marker: replayMarker,
    name: `${replayMarker} independent client`,
    organizationId: replayIntent.organizationId,
  };
  const independentProject = {
    clientId: independentClient.id,
    descriptionPrefix: `${replayMarker} independent project description`,
    id: 'independent-project-id',
    intentId: 'independent-project-intent',
    kind: 'project' as const,
    marker: replayMarker,
    name: `${replayMarker} independent project`,
    organizationId: replayIntent.organizationId,
  };
  const independentWorkUnit = {
    ...replayIntent,
    id: 'independent-work-unit-id',
    idempotencyKey: 'independent-work-unit-key',
    intentId: 'independent-work-unit-intent',
    projectId: independentProject.id,
  };
  persisted = {
    ...persisted,
    owned: {
      clientIds: [...persisted.owned.clientIds, independentClient.id],
      projectIds: [...persisted.owned.projectIds, independentProject.id],
      workUnitIds: [independentWorkUnit.id],
    },
    ownership: [...persisted.ownership, independentClient, independentProject, independentWorkUnit],
  };
  const persist = (next: LiveRunManifest): Promise<void> => {
    persisted = next;
    return Promise.resolve();
  };
  let broadReads = 0;

  await expect(
    recoverFirstWorkUnitResponse(
      () => persisted,
      replayIntent,
      async () => {
        const registration = await registerWorkUnitResponseCandidate(
          persisted,
          replayIntent,
          successfulMutationResponse('shared-id'),
          {
            persist,
            readById: (id) => Promise.resolve(replayCandidate(id, 'other-user-id')),
          }
        );
        return registration.id;
      },
      () => {
        broadReads += 1;
        return Promise.resolve([replayCandidate('shared-id')]);
      },
      persist
    )
  ).rejects.toThrow(/ownership/i);

  expect(broadReads).toBe(0);
  expect(persisted.intents).toContainEqual(replayIntent);
  expect(persisted.ownership).not.toContainEqual(expect.objectContaining({ intentId: replayIntent.intentId }));
  expect(persisted.quarantined).toContainEqual({
    candidateId: 'shared-id',
    intentId: replayIntent.intentId,
    kind: 'workUnit',
    reason: 'ownership-mismatch',
  });
  expect(() => parseLiveRunManifest(persisted)).not.toThrow();

  const removed: string[] = [];
  await expect(
    finalizeVerifiedLiveData(persisted, {
      persist,
      readById: () => {
        throw new Error('concrete quarantine must not be read for reconciliation');
      },
      findCandidates: () => {
        broadReads += 1;
        return Promise.resolve([replayCandidate('shared-id')]);
      },
      read: (kind, id) => {
        if (kind === 'workUnit') {
          return Promise.resolve({
            id,
            description: independentWorkUnit.descriptionPrefix,
            projectClient: { projectId: independentProject.id },
            userId: independentWorkUnit.actorUserId,
          });
        }
        if (kind === 'project') {
          return Promise.resolve({
            id,
            name: independentProject.name,
            description: independentProject.descriptionPrefix,
            organizationId: independentProject.organizationId,
            client: { id: independentClient.id },
          });
        }
        return Promise.resolve({
          id,
          name: independentClient.name,
          organizationId: independentClient.organizationId,
        });
      },
      remove: (_kind, id) => {
        removed.push(id);
        return Promise.resolve();
      },
    })
  ).rejects.toThrow(/finalization/i);

  expect(broadReads).toBe(0);
  expect(removed).toEqual([independentWorkUnit.id, independentProject.id, independentClient.id]);
  expect(removed).not.toContain('shared-id');
  expect(() => parseLiveRunManifest(persisted)).not.toThrow();
});

test('a transient exact read leaves pending candidate recovery for teardown reconciliation @mr @technical', async () => {
  let persisted = replayManifest();
  const persist = (next: LiveRunManifest): Promise<void> => {
    persisted = next;
    return Promise.resolve();
  };
  await registerWorkUnitResponseCandidate(persisted, replayIntent, successfulMutationResponse('first-id'), {
    persist,
    readById: (id) => Promise.resolve(replayCandidate(id)),
  });

  await expect(
    registerWorkUnitResponseCandidate(persisted, replayIntent, successfulMutationResponse('transient-id'), {
      persist,
      readById: () => {
        throw new DOMException('read timed out', 'TimeoutError');
      },
    })
  ).rejects.toThrow(/timed out/i);
  expect(persisted.intents).toHaveLength(1);
  expect(persisted.quarantined).toContainEqual(
    expect.objectContaining({ candidateId: 'transient-id', reason: 'unknown' })
  );

  const reconciled = await reconcilePendingIntents(persisted, {
    persist,
    readById: (_kind, id) => Promise.resolve(replayCandidate(id)),
    findCandidates: () => {
      throw new Error('known response candidates must use an exact read');
    },
  });
  expect(reconciled.failures).toEqual([]);
  expect(persisted.owned.workUnitIds).toEqual(['first-id', 'transient-id']);
  expect(persisted.intents).toEqual([]);
  expect(persisted.quarantined).toEqual([]);
});

test('credentialed Playwright calls disable redirects and reject every redirect response @mr @technical', async () => {
  const expectedURL = 'https://api-staging.example.test/api/v1/organizations/approved/work-units?id=work-id';
  const calls: Array<{ authorization?: string; url: string }> = [];
  let capturedMaxRedirects: number | undefined;

  await expect(
    guardedPlaywrightCall(expectedURL, { headers: { Authorization: 'Bearer test-token' } }, (options) => {
      capturedMaxRedirects = options.maxRedirects;
      calls.push({ authorization: options.headers.Authorization, url: expectedURL });
      if (options.maxRedirects !== 0) {
        calls.push({ authorization: options.headers.Authorization, url: 'https://unapproved.example.test/steal' });
      }
      return Promise.resolve({ status: () => 302, url: () => expectedURL });
    })
  ).rejects.toThrow(/redirect/i);

  expect(capturedMaxRedirects).toBe(0);
  expect(calls).toEqual([{ authorization: 'Bearer test-token', url: expectedURL }]);
  expect(calls.some(({ url, authorization }) => url.includes('unapproved') && Boolean(authorization))).toBe(false);
});

test('credentialed Playwright calls reject unexpected final API origins and paths before body trust @mr @technical', async () => {
  const expectedURL = 'https://api-staging.example.test/api/v1/organizations/approved/work-units?id=work-id';
  let bodyReads = 0;
  const callReturning = (
    responseURL: string
  ): Promise<{ json: () => Promise<{ id: string }>; status: () => number; url: () => string }> =>
    guardedPlaywrightCall(expectedURL, {}, () =>
      Promise.resolve({
        status: () => 200,
        url: () => responseURL,
        json: () => {
          bodyReads += 1;
          return Promise.resolve({ id: 'untrusted' });
        },
      })
    );

  for (const responseURL of [
    'https://unapproved.example.test/api/v1/organizations/approved/work-units?id=work-id',
    'https://api-staging.example.test/api/v1/organizations/approved/clients?id=work-id',
  ]) {
    await expect(callReturning(responseURL)).rejects.toThrow(/URL|origin|path/i);
  }

  expect(bodyReads).toBe(0);
});

test('archived report constrains only the exact backend work-units GET to the fixture ID @mr @technical', () => {
  const input = {
    apiBaseURL: 'https://api-staging.example.test/api/v1',
    organizationSlug: 'approved-org',
    archivedWorkUnitId: 'archived-fixture-id',
  };
  const requestURL =
    'https://api-staging.example.test/api/v1/organizations/approved-org/work-units?dateFrom=2026-01-01&id=wrong&id=also-wrong&projectId=project-id';

  const constrained = constrainArchivedWorkUnitsGet({ ...input, method: 'GET', requestURL });
  expect(constrained).not.toBeNull();
  if (!constrained) throw new Error('Expected an exact archived work-unit URL');
  const url = new URL(constrained);
  expect(url.searchParams.getAll('id')).toEqual(['archived-fixture-id']);
  expect(url.searchParams.get('dateFrom')).toBe('2026-01-01');
  expect(url.searchParams.get('projectId')).toBe('project-id');

  expect(constrainArchivedWorkUnitsGet({ ...input, method: 'POST', requestURL })).toBeNull();
  expect(
    constrainArchivedWorkUnitsGet({
      ...input,
      method: 'GET',
      requestURL: requestURL.replace('/work-units?', '/work-units/export?'),
    })
  ).toBeNull();
  expect(
    constrainArchivedWorkUnitsGet({
      ...input,
      method: 'GET',
      requestURL: requestURL.replace('api-staging.example.test', 'unapproved.example.test'),
    })
  ).toBeNull();
});

test('project member flow opens the plus control before searching @mr @technical', () => {
  const source = readFileSync(path.resolve(__dirname, 'liveFlows.ts'), 'utf8');
  const plusClick = source.indexOf("memberSection.getByRole('button', { name: '+' }).click()");
  const memberSearch = source.indexOf('const memberSearch = form.getByPlaceholder');
  expect(plusClick).toBeGreaterThan(-1);
  expect(memberSearch).toBeGreaterThan(plusClick);
});

test('project member flow closes the picker through the exact description label and restores membership after a UI failure @mr @technical', () => {
  const source = readFileSync(path.resolve(__dirname, 'liveFlows.ts'), 'utf8');
  const memberSelection = source.indexOf('await form.getByText(userName, { exact: true }).click()');
  const descriptionUpdate = source.indexOf('.fill(manifest.updatedDescription)');
  expect(source).toContain('getByText(/^(Opis projektu|Project description)$/)');
  expect(source).toContain('await restoreProjectMember();');
  expect(descriptionUpdate).toBeGreaterThan(memberSelection);
});
