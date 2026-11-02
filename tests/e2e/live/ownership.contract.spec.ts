import { expect, test } from '@playwright/test';
import type { LiveRunManifest } from './metadata';
import {
  cleanupVerifiedLiveData,
  finalizeVerifiedLiveData,
  reconcilePendingIntent,
  verifyCandidateAndPersist,
  type CleanupDependencies,
} from './ownership';

const marker = 'E2E ct530-safe-run';

const manifest = (): LiveRunManifest =>
  ({
    schemaVersion: 2,
    runId: 'ct530-safe-run',
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
    projectName: `${marker} project`,
    updatedDescription: `${marker} updated description`,
    owned: { clientIds: [], projectIds: [], workUnitIds: [] },
    ownership: [],
    intents: [],
    quarantined: [],
  } as unknown as LiveRunManifest);

const clientIntent = {
  kind: 'client' as const,
  intentId: 'client-intent',
  marker,
  organizationId: 'organization-1',
  name: `${marker} client`,
};

const projectIntent = {
  kind: 'project' as const,
  intentId: 'project-intent',
  marker,
  organizationId: 'organization-1',
  clientId: 'client-id',
  name: `${marker} project`,
  descriptionPrefix: `${marker} initial description`,
};

const workUnitIntent = {
  kind: 'workUnit' as const,
  intentId: 'work-unit-intent',
  marker,
  organizationId: 'organization-1',
  projectId: 'project-id',
  actorUserId: 'user-id',
  descriptionPrefix: `${marker} precise hours`,
  idempotencyKey: 'ct530-safe-run-work-unit',
};

test('only verified run-marked objects become owned and archived or shared IDs are quarantined @mr @technical', async () => {
  let persisted = { ...manifest(), intents: [clientIntent] } as LiveRunManifest;
  persisted = await verifyCandidateAndPersist(
    persisted,
    clientIntent.intentId,
    { id: 'client-id', name: clientIntent.name, organizationId: 'organization-1' },
    (next) => {
      persisted = next;
      return Promise.resolve();
    }
  );
  expect(persisted.owned.clientIds).toEqual(['client-id']);
  expect(persisted.intents).toEqual([]);

  const unsafe = { ...persisted, intents: [workUnitIntent] } as LiveRunManifest;
  await expect(
    verifyCandidateAndPersist(
      unsafe,
      workUnitIntent.intentId,
      {
        id: 'archived-work-unit-id',
        description: workUnitIntent.descriptionPrefix,
        organizationId: 'organization-1',
        projectClient: { projectId: 'project-id' },
        userId: 'user-id',
      },
      (next) => {
        persisted = next;
        return Promise.resolve();
      }
    )
  ).rejects.toThrow(/archived fixture/i);
  expect(persisted.owned.workUnitIds).toEqual([]);
  expect(persisted.quarantined).toEqual([
    expect.objectContaining({ candidateId: 'archived-work-unit-id', reason: 'archived-fixture' }),
  ]);
});

test('ownership rejects wrong organization marker parent and actor before persistence @mr @technical', async () => {
  const cases = [
    {
      intent: clientIntent,
      candidate: { id: 'client-id', name: clientIntent.name, organizationId: 'other-organization' },
    },
    {
      intent: clientIntent,
      candidate: { id: 'client-id', name: 'Shared client', organizationId: 'organization-1' },
    },
    {
      intent: projectIntent,
      candidate: {
        id: 'project-id',
        name: projectIntent.name,
        description: projectIntent.descriptionPrefix,
        organizationId: 'organization-1',
        client: { id: 'shared-client-id' },
      },
    },
    {
      intent: workUnitIntent,
      candidate: {
        id: 'work-unit-id',
        description: workUnitIntent.descriptionPrefix,
        projectClient: { projectId: 'project-id' },
        userId: 'other-user-id',
      },
    },
  ];

  for (const { candidate, intent } of cases) {
    let persisted = { ...manifest(), intents: [intent] } as LiveRunManifest;
    await expect(
      verifyCandidateAndPersist(persisted, intent.intentId, candidate, (next) => {
        persisted = next;
        return Promise.resolve();
      })
    ).rejects.toThrow(/ownership/i);
    expect(persisted.owned).toEqual({ clientIds: [], projectIds: [], workUnitIds: [] });
    expect(persisted.quarantined).toHaveLength(1);
  }
});

test('reconciliation owns one committed response and quarantines ambiguous identities @mr @technical', async () => {
  let persisted = { ...manifest(), intents: [clientIntent] } as LiveRunManifest;
  persisted = await reconcilePendingIntent(
    persisted,
    clientIntent.intentId,
    () => Promise.resolve([{ id: 'client-id', name: clientIntent.name, organizationId: 'organization-1' }]),
    (next) => {
      persisted = next;
      return Promise.resolve();
    }
  );
  expect(persisted.owned.clientIds).toEqual(['client-id']);

  persisted = { ...manifest(), intents: [clientIntent] };
  await expect(
    reconcilePendingIntent(
      persisted,
      clientIntent.intentId,
      () =>
        Promise.resolve([
          { id: 'client-a', name: clientIntent.name, organizationId: 'organization-1' },
          { id: 'client-b', name: clientIntent.name, organizationId: 'organization-1' },
        ]),
      (next) => {
        persisted = next;
        return Promise.resolve();
      }
    )
  ).rejects.toThrow(/ambiguous/i);
  expect(persisted.owned.clientIds).toEqual([]);
  expect(persisted.quarantined.map(({ candidateId }) => candidateId)).toEqual(['client-a', 'client-b']);
});

test('direct reconciliation rejects concrete quarantine without loading or promoting candidates @mr @technical', async () => {
  const input = { ...manifest(), intents: [clientIntent] } as LiveRunManifest;
  input.quarantined = [
    {
      candidateId: 'shared-client-id',
      intentId: clientIntent.intentId,
      kind: 'client',
      reason: 'ownership-mismatch',
    },
  ];
  let persisted = input;
  let candidateReads = 0;

  await expect(
    reconcilePendingIntent(
      input,
      clientIntent.intentId,
      () => {
        candidateReads += 1;
        return Promise.resolve([
          { id: 'client-id', name: clientIntent.name, organizationId: clientIntent.organizationId },
        ]);
      },
      (next) => {
        persisted = next;
        return Promise.resolve();
      }
    )
  ).rejects.toThrow(/quarantined/i);

  expect(candidateReads).toBe(0);
  expect(persisted).toEqual(input);
  expect(persisted.intents).toEqual([clientIntent]);
  expect(persisted.ownership).toEqual([]);
  expect(persisted.quarantined).toEqual(input.quarantined);
});

test('direct reconciliation keeps unknown recovery eligible for promotion @mr @technical', async () => {
  const input = { ...manifest(), intents: [clientIntent] } as LiveRunManifest;
  input.quarantined = [
    {
      candidateId: 'client-id',
      intentId: clientIntent.intentId,
      kind: 'client',
      reason: 'unknown',
    },
  ];
  let persisted = input;

  persisted = await reconcilePendingIntent(
    input,
    clientIntent.intentId,
    () => Promise.resolve([{ id: 'client-id', name: clientIntent.name, organizationId: clientIntent.organizationId }]),
    (next) => {
      persisted = next;
      return Promise.resolve();
    }
  );

  expect(persisted.owned.clientIds).toEqual(['client-id']);
  expect(persisted.intents).toEqual([]);
  expect(persisted.quarantined).toEqual([]);
});

test('teardown finalization reconciles a persisted response candidate before child-first cleanup @mr @technical', async () => {
  const input = manifest();
  input.owned = { clientIds: ['client-id'], projectIds: ['project-id'], workUnitIds: [] };
  input.ownership = [
    { ...clientIntent, id: 'client-id' },
    { ...projectIntent, id: 'project-id' },
  ];
  input.intents = [workUnitIntent];
  input.quarantined = [
    {
      candidateId: 'recovered-work-id',
      intentId: workUnitIntent.intentId,
      kind: 'workUnit',
      reason: 'unknown',
    },
  ];
  let persisted = input;
  const events: string[] = [];
  const workCandidate = {
    id: 'recovered-work-id',
    description: workUnitIntent.descriptionPrefix,
    projectClient: { projectId: 'project-id' },
    userId: 'user-id',
  };

  await finalizeVerifiedLiveData(input, {
    persist: (next) => {
      persisted = next;
      return Promise.resolve();
    },
    readById: (_kind, id) => {
      events.push(`reconcile:${id}`);
      return Promise.resolve(workCandidate);
    },
    findCandidates: () => {
      throw new Error('a known response candidate must not use broad reconciliation');
    },
    read: (kind, id) => {
      events.push(`cleanup-read:${id}`);
      if (kind === 'workUnit') return Promise.resolve(workCandidate);
      if (kind === 'project') {
        return Promise.resolve({
          id,
          name: projectIntent.name,
          description: projectIntent.descriptionPrefix,
          organizationId: 'organization-1',
          client: { id: 'client-id' },
        });
      }
      return Promise.resolve({ id, name: clientIntent.name, organizationId: 'organization-1' });
    },
    remove: (_kind, id) => {
      events.push(`remove:${id}`);
      return Promise.resolve();
    },
  });

  expect(events).toEqual([
    'reconcile:recovered-work-id',
    'cleanup-read:recovered-work-id',
    'remove:recovered-work-id',
    'cleanup-read:project-id',
    'remove:project-id',
    'cleanup-read:client-id',
    'remove:client-id',
  ]);
  expect(persisted.ownership).toEqual([]);
  expect(persisted.intents).toEqual([]);
  expect(persisted.quarantined).toEqual([]);
});

test('failed mismatch and ambiguity reconciliation preserve quarantine through independent cleanup @mr @technical', async () => {
  const cases: Array<{
    expectedQuarantine: LiveRunManifest['quarantined'];
    failureMode: 'ambiguity' | 'mismatch';
    initialQuarantine: LiveRunManifest['quarantined'];
  }> = [
    {
      failureMode: 'mismatch',
      initialQuarantine: [
        {
          candidateId: 'shared-work-id',
          intentId: workUnitIntent.intentId,
          kind: 'workUnit',
          reason: 'unknown',
        },
      ],
      expectedQuarantine: [
        {
          candidateId: 'shared-work-id',
          intentId: workUnitIntent.intentId,
          kind: 'workUnit',
          reason: 'ownership-mismatch',
        },
      ],
    },
    {
      failureMode: 'ambiguity',
      initialQuarantine: [],
      expectedQuarantine: [
        {
          candidateId: 'ambiguous-a',
          intentId: workUnitIntent.intentId,
          kind: 'workUnit',
          reason: 'ambiguous',
        },
        {
          candidateId: 'ambiguous-b',
          intentId: workUnitIntent.intentId,
          kind: 'workUnit',
          reason: 'ambiguous',
        },
      ],
    },
  ];

  for (const { expectedQuarantine, failureMode, initialQuarantine } of cases) {
    const input = manifest();
    const clientB = {
      ...clientIntent,
      intentId: `${failureMode}-client-b-intent`,
      name: `${marker} client B`,
      id: 'client-b',
    };
    const projectB = {
      ...projectIntent,
      intentId: `${failureMode}-project-b-intent`,
      clientId: clientB.id,
      name: `${marker} project B`,
      id: 'project-b',
    };
    const workB = {
      ...workUnitIntent,
      intentId: `${failureMode}-work-b-intent`,
      idempotencyKey: `${failureMode}-work-b-key`,
      projectId: projectB.id,
      id: 'work-b',
    };
    input.owned = {
      clientIds: ['client-id', clientB.id],
      projectIds: ['project-id', projectB.id],
      workUnitIds: [workB.id],
    };
    input.ownership = [
      { ...clientIntent, id: 'client-id' },
      clientB,
      { ...projectIntent, id: 'project-id' },
      projectB,
      workB,
    ];
    input.intents = [workUnitIntent];
    input.quarantined = initialQuarantine;

    let persisted = input;
    const removed: string[] = [];
    const workCandidate = {
      id: workB.id,
      description: workB.descriptionPrefix,
      projectClient: { projectId: workB.projectId },
      userId: workB.actorUserId,
    };

    await expect(
      finalizeVerifiedLiveData(input, {
        persist: (next) => {
          persisted = next;
          return Promise.resolve();
        },
        readById: () =>
          Promise.resolve({
            id: 'shared-work-id',
            description: workUnitIntent.descriptionPrefix,
            projectClient: { projectId: workUnitIntent.projectId },
            userId: 'shared-user-id',
          }),
        findCandidates: () =>
          Promise.resolve([
            {
              id: 'ambiguous-a',
              description: workUnitIntent.descriptionPrefix,
              projectClient: { projectId: workUnitIntent.projectId },
              userId: workUnitIntent.actorUserId,
            },
            {
              id: 'ambiguous-b',
              description: workUnitIntent.descriptionPrefix,
              projectClient: { projectId: workUnitIntent.projectId },
              userId: workUnitIntent.actorUserId,
            },
          ]),
        read: (kind, id) => {
          if (kind === 'workUnit') return Promise.resolve(workCandidate);
          if (kind === 'project') {
            return Promise.resolve({
              id,
              name: projectB.name,
              description: projectB.descriptionPrefix,
              organizationId: projectB.organizationId,
              client: { id: projectB.clientId },
            });
          }
          return Promise.resolve({ id, name: clientB.name, organizationId: clientB.organizationId });
        },
        remove: (_kind, id) => {
          removed.push(id);
          return Promise.resolve();
        },
      })
    ).rejects.toThrow(/finalization/i);

    expect(removed).toEqual([workB.id, projectB.id, clientB.id]);
    expect(persisted.owned).toEqual({
      clientIds: ['client-id'],
      projectIds: ['project-id'],
      workUnitIds: [],
    });
    expect(persisted.intents).toEqual([workUnitIntent]);
    expect(persisted.quarantined).toEqual(expectedQuarantine);
  }
});

test('cleanup re-verifies child-first and continues after a timeout or ownership failure @mr @technical', async () => {
  const input = manifest();
  input.owned = { clientIds: ['client-id'], projectIds: ['project-id'], workUnitIds: ['work-a', 'work-b'] };
  input.ownership = [
    { ...clientIntent, id: 'client-id' },
    { ...projectIntent, id: 'project-id' },
    { ...workUnitIntent, id: 'work-a' },
    { ...workUnitIntent, id: 'work-b' },
  ];
  const removed: string[] = [];
  let persisted = input;
  const candidates: Record<string, unknown> = {
    'work-a': {
      id: 'work-a',
      description: workUnitIntent.descriptionPrefix,
      projectClient: { projectId: 'project-id' },
      userId: 'user-id',
    },
    'work-b': {
      id: 'work-b',
      description: workUnitIntent.descriptionPrefix,
      projectClient: { projectId: 'project-id' },
      userId: 'other-user-id',
    },
    'project-id': {
      id: 'project-id',
      name: projectIntent.name,
      description: projectIntent.descriptionPrefix,
      organizationId: 'organization-1',
      client: { id: 'client-id' },
    },
    'client-id': { id: 'client-id', name: clientIntent.name, organizationId: 'organization-1' },
  };
  const dependencies: CleanupDependencies = {
    read: (_kind, id) => Promise.resolve(candidates[id]),
    remove: (_kind, id) => {
      removed.push(id);
      if (id === 'work-a') throw new DOMException('timed out', 'TimeoutError');
      return Promise.resolve();
    },
    persist: (next) => {
      persisted = next;
      return Promise.resolve();
    },
  };

  await expect(cleanupVerifiedLiveData(input, dependencies)).rejects.toThrow(/cleanup/i);
  expect(removed).toEqual(['work-a']);
  expect(persisted.owned.projectIds).toEqual(['project-id']);
  expect(persisted.owned.clientIds).toEqual(['client-id']);
  expect(persisted.quarantined).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ candidateId: 'work-a', reason: 'cleanup-failed' }),
      expect.objectContaining({ candidateId: 'work-b', reason: 'ownership-mismatch' }),
    ])
  );
});

test('a failed work unit blocks only its project and client branch during cleanup @mr @technical', async () => {
  const input = manifest();
  const clientB = { ...clientIntent, intentId: 'client-b-intent', name: `${marker} client B`, id: 'client-b' };
  const projectB = {
    ...projectIntent,
    intentId: 'project-b-intent',
    clientId: 'client-b',
    name: `${marker} project B`,
    id: 'project-b',
  };
  const workB = {
    ...workUnitIntent,
    intentId: 'work-b-intent',
    idempotencyKey: 'work-b-key',
    projectId: 'project-b',
    id: 'work-b',
  };
  input.owned = {
    clientIds: ['client-id', 'client-b'],
    projectIds: ['project-id', 'project-b'],
    workUnitIds: ['work-a', 'work-b'],
  };
  input.ownership = [
    { ...clientIntent, id: 'client-id' },
    clientB,
    { ...projectIntent, id: 'project-id' },
    projectB,
    { ...workUnitIntent, id: 'work-a' },
    workB,
  ];
  const candidates: Record<string, unknown> = {
    'client-id': { id: 'client-id', name: clientIntent.name, organizationId: 'organization-1' },
    'client-b': { id: 'client-b', name: clientB.name, organizationId: 'organization-1' },
    'project-id': {
      id: 'project-id',
      name: projectIntent.name,
      description: projectIntent.descriptionPrefix,
      organizationId: 'organization-1',
      client: { id: 'client-id' },
    },
    'project-b': {
      id: 'project-b',
      name: projectB.name,
      description: projectB.descriptionPrefix,
      organizationId: 'organization-1',
      client: { id: 'client-b' },
    },
    'work-a': {
      id: 'work-a',
      description: workUnitIntent.descriptionPrefix,
      projectClient: { projectId: 'project-id' },
      userId: 'user-id',
    },
    'work-b': {
      id: 'work-b',
      description: workB.descriptionPrefix,
      projectClient: { projectId: 'project-b' },
      userId: 'user-id',
    },
  };
  const removed: string[] = [];
  let persisted = input;

  await expect(
    cleanupVerifiedLiveData(input, {
      read: (_kind, id) => Promise.resolve(candidates[id]),
      remove: (_kind, id) => {
        removed.push(id);
        if (id === 'work-a') throw new Error('work-a cleanup failed');
        return Promise.resolve();
      },
      persist: (next) => {
        persisted = next;
        return Promise.resolve();
      },
    })
  ).rejects.toThrow(/cleanup/i);

  expect(removed).toEqual(['work-b', 'work-a', 'project-b', 'client-b']);
  expect(persisted.owned).toEqual({ clientIds: ['client-id'], projectIds: ['project-id'], workUnitIds: ['work-a'] });
  expect(persisted.quarantined).toContainEqual(
    expect.objectContaining({ candidateId: 'work-a', reason: 'cleanup-failed' })
  );
});

test('a failed project blocks its client and preserves both recovery records @mr @technical', async () => {
  const input = manifest();
  input.owned = { clientIds: ['client-id'], projectIds: ['project-id'], workUnitIds: [] };
  input.ownership = [
    { ...clientIntent, id: 'client-id' },
    { ...projectIntent, id: 'project-id' },
  ];
  const removed: string[] = [];
  let persisted = input;

  await expect(
    cleanupVerifiedLiveData(input, {
      read: (kind, id) =>
        Promise.resolve(
          kind === 'project'
            ? {
                id,
                name: projectIntent.name,
                description: projectIntent.descriptionPrefix,
                organizationId: 'organization-1',
                client: { id: 'client-id' },
              }
            : { id, name: clientIntent.name, organizationId: 'organization-1' }
        ),
      remove: (_kind, id) => {
        removed.push(id);
        throw new Error('project cleanup failed');
      },
      persist: (next) => {
        persisted = next;
        return Promise.resolve();
      },
    })
  ).rejects.toThrow(/cleanup/i);

  expect(removed).toEqual(['project-id']);
  expect(persisted.owned).toEqual({ clientIds: ['client-id'], projectIds: ['project-id'], workUnitIds: [] });
  expect(persisted.quarantined).toContainEqual(
    expect.objectContaining({ candidateId: 'project-id', reason: 'cleanup-failed' })
  );
});

test('a persistence failure is not misclassified as an ownership mismatch @mr @technical', async () => {
  const input = { ...manifest(), intents: [clientIntent] } as LiveRunManifest;
  const attempts: LiveRunManifest[] = [];
  await expect(
    verifyCandidateAndPersist(
      input,
      clientIntent.intentId,
      { id: 'client-id', name: clientIntent.name, organizationId: 'organization-1' },
      (next) => {
        attempts.push(next);
        throw new Error('manifest storage unavailable');
      }
    )
  ).rejects.toThrow(/storage unavailable/i);
  expect(attempts).toHaveLength(1);
  expect(attempts[0].quarantined).toEqual([]);
  expect(attempts[0].owned.clientIds).toEqual(['client-id']);
});

test('cleanup never deletes evidence ID A when the reader returns matching project ID B @mr @technical', async () => {
  const input = manifest();
  input.owned = { clientIds: ['client-id'], projectIds: ['project-a'], workUnitIds: [] };
  input.ownership = [
    { ...clientIntent, id: 'client-id' },
    { ...projectIntent, id: 'project-a' },
  ];
  const removed: string[] = [];
  let persisted = input;

  await expect(
    cleanupVerifiedLiveData(input, {
      read: (kind) =>
        Promise.resolve(
          kind === 'project'
            ? {
                id: 'project-b',
                name: projectIntent.name,
                description: projectIntent.descriptionPrefix,
                organizationId: projectIntent.organizationId,
                client: { id: projectIntent.clientId },
              }
            : {
                id: 'client-id',
                name: clientIntent.name,
                organizationId: clientIntent.organizationId,
              }
        ),
      remove: (_kind, id) => {
        removed.push(id);
        return Promise.resolve();
      },
      persist: (next) => {
        persisted = next;
        return Promise.resolve();
      },
    })
  ).rejects.toThrow(/cleanup/i);

  expect(removed).not.toContain('project-a');
  expect(persisted.quarantined).toContainEqual(
    expect.objectContaining({ candidateId: 'project-a', reason: 'ownership-mismatch' })
  );
});

test('aborted cleanup records the current failure and starts no later remote operation @mr @technical', async () => {
  const input = manifest();
  input.owned = { clientIds: ['client-id'], projectIds: ['project-id'], workUnitIds: ['work-a', 'work-b'] };
  input.ownership = [
    { ...clientIntent, id: 'client-id' },
    { ...projectIntent, id: 'project-id' },
    { ...workUnitIntent, intentId: 'work-a-intent', idempotencyKey: 'work-a-key', id: 'work-a' },
    { ...workUnitIntent, intentId: 'work-b-intent', idempotencyKey: 'work-b-key', id: 'work-b' },
  ];
  const controller = new AbortController();
  const reads: string[] = [];
  let persisted = input;

  await expect(
    cleanupVerifiedLiveData(
      input,
      {
        read: (_kind, id) => {
          reads.push(id);
          controller.abort(new DOMException('lifecycle deadline', 'AbortError'));
          throw controller.signal.reason;
        },
        remove: () => {
          throw new Error('remove must not run after an aborted read');
        },
        persist: (next) => {
          persisted = next;
          return Promise.resolve();
        },
      },
      controller.signal
    )
  ).rejects.toThrow(/cleanup/i);

  expect(reads).toEqual(['work-b']);
  expect(persisted.quarantined).toContainEqual(
    expect.objectContaining({ candidateId: 'work-b', reason: 'ownership-mismatch' })
  );
});
