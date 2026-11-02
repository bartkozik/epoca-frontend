import { expect, test } from '@playwright/test';
import type { LiveRunManifest, LiveWorkUnitIntent } from './metadata';
import { executePersistedCreate } from './mutationLifecycle';

const marker = 'E2E ct530-lifecycle';

const manifest = (): LiveRunManifest => ({
  schemaVersion: 2,
  runId: 'ct530-lifecycle',
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
  owned: { clientIds: [], projectIds: ['project-id'], workUnitIds: [] },
  ownership: [
    {
      kind: 'project',
      id: 'project-id',
      intentId: 'project-intent',
      marker,
      organizationId: 'organization-1',
      clientId: 'client-id',
      name: `${marker} project`,
      descriptionPrefix: `${marker} project description`,
    },
  ],
  intents: [],
  quarantined: [],
});

const intent: LiveWorkUnitIntent = {
  kind: 'workUnit',
  intentId: 'work-unit-intent',
  marker,
  organizationId: 'organization-1',
  projectId: 'project-id',
  actorUserId: 'user-id',
  descriptionPrefix: `${marker} retry`,
  idempotencyKey: 'ct530-lifecycle-work-unit-intent',
};

const candidate = {
  id: 'work-unit-id',
  userId: 'user-id',
  description: intent.descriptionPrefix,
  projectClient: { projectId: 'project-id' },
};

test('mutation intent and idempotency key persist before create and ownership persists after verification @mr @technical', async () => {
  const events: string[] = [];
  let persisted = manifest();
  persisted = await executePersistedCreate(persisted, intent, {
    persist: (next) => {
      persisted = next;
      events.push(
        next.owned.workUnitIds.length
          ? 'persist-owned'
          : next.quarantined.some(({ candidateId, reason }) => candidateId === candidate.id && reason === 'unknown')
          ? 'persist-candidate'
          : 'persist-intent'
      );
      return Promise.resolve();
    },
    create: (pending) => {
      if (pending.kind !== 'workUnit') throw new Error('Expected a work-unit intent');
      events.push(`create:${pending.idempotencyKey}`);
      expect(persisted.intents).toContainEqual(intent);
      return Promise.resolve({ id: candidate.id });
    },
    readById: () => Promise.resolve(candidate),
    findCandidates: () => Promise.resolve([]),
  });

  expect(events).toEqual(['persist-intent', `create:${intent.idempotencyKey}`, 'persist-candidate', 'persist-owned']);
  expect(persisted.owned.workUnitIds).toEqual(['work-unit-id']);
  expect(persisted.intents).toEqual([]);
});

test('a committed create with a lost or malformed response reconciles exactly once and fails on ambiguity @mr @technical', async () => {
  let persisted = manifest();
  persisted = await executePersistedCreate(persisted, intent, {
    persist: (next) => {
      persisted = next;
      return Promise.resolve();
    },
    create: () => Promise.resolve({ malformed: true }),
    readById: () => {
      throw new Error('readById must not run without a response ID');
    },
    findCandidates: (pending) => {
      if (pending.kind !== 'workUnit') throw new Error('Expected a work-unit intent');
      expect(pending.idempotencyKey).toBe(intent.idempotencyKey);
      return Promise.resolve([candidate]);
    },
  });
  expect(persisted.owned.workUnitIds).toEqual(['work-unit-id']);

  persisted = manifest();
  await expect(
    executePersistedCreate(persisted, intent, {
      persist: (next) => {
        persisted = next;
        return Promise.resolve();
      },
      create: () => {
        throw new DOMException('response lost', 'NetworkError');
      },
      readById: () => Promise.resolve(candidate),
      findCandidates: () => Promise.resolve([candidate, { ...candidate, id: 'other-work-unit-id' }]),
    })
  ).rejects.toThrow(/ambiguous/i);
  expect(persisted.owned.workUnitIds).toEqual([]);
  expect(persisted.quarantined.map(({ candidateId }) => candidateId)).toEqual(['work-unit-id', 'other-work-unit-id']);
});

const responseError = (status: number): Error & { status: number } =>
  Object.assign(new Error(`request failed with ${status}`), { status });

test('uncertain work-unit creates retry exactly once with the persisted idempotency key @mr @technical', async () => {
  const cases: Array<{
    firstCreate?: () => Promise<unknown>;
    firstRead?: () => Promise<unknown>;
    label: string;
  }> = [
    { label: 'network', firstCreate: async () => Promise.reject(new DOMException('lost', 'NetworkError')) },
    { label: 'timeout', firstCreate: async () => Promise.reject(new DOMException('late', 'TimeoutError')) },
    { label: '408', firstCreate: async () => Promise.reject(responseError(408)) },
    { label: '429', firstCreate: async () => Promise.reject(responseError(429)) },
    { label: '503', firstCreate: async () => Promise.reject(responseError(503)) },
    { label: 'malformed', firstCreate: () => Promise.resolve({ malformed: true }) },
    {
      label: 'unreadable',
      firstCreate: () => Promise.resolve({ id: candidate.id }),
      firstRead: async () => Promise.reject(new DOMException('read lost', 'NetworkError')),
    },
  ];

  for (const retryCase of cases) {
    let persisted = manifest();
    const keys: string[] = [];
    let createAttempts = 0;
    let readAttempts = 0;
    let reconciliations = 0;
    await executePersistedCreate(persisted, intent, {
      persist: (next) => {
        persisted = next;
        return Promise.resolve();
      },
      create: async (pending) => {
        if (pending.kind !== 'workUnit') throw new Error('Expected work-unit intent');
        keys.push(pending.idempotencyKey);
        createAttempts += 1;
        if (createAttempts === 1 && retryCase.firstCreate) return retryCase.firstCreate();
        return { id: candidate.id };
      },
      readById: async () => {
        readAttempts += 1;
        if (readAttempts === 1 && retryCase.firstRead) return retryCase.firstRead();
        return candidate;
      },
      findCandidates: () => {
        reconciliations += 1;
        return Promise.resolve([candidate]);
      },
    });

    expect(keys).toEqual([intent.idempotencyKey, intent.idempotencyKey]);
    expect(reconciliations).toBe(0);
    expect(persisted.owned.workUnitIds).toEqual([candidate.id]);
  }
});

test('a semantic work-unit 4xx neither retries nor reconciles @mr @technical', async () => {
  let persisted = manifest();
  let createAttempts = 0;
  let reconciliations = 0;

  await expect(
    executePersistedCreate(persisted, intent, {
      persist: (next) => {
        persisted = next;
        return Promise.resolve();
      },
      create: () => {
        createAttempts += 1;
        throw responseError(422);
      },
      readById: () => Promise.resolve(candidate),
      findCandidates: () => {
        reconciliations += 1;
        return Promise.resolve([candidate]);
      },
    })
  ).rejects.toThrow(/422/);

  expect(createAttempts).toBe(1);
  expect(reconciliations).toBe(0);
  expect(persisted.intents).toEqual([intent]);
  expect(persisted.owned.workUnitIds).toEqual([]);
});

test('reconciliation starts only after both uncertain work-unit attempts fail @mr @technical', async () => {
  let persisted = manifest();
  const events: string[] = [];

  await executePersistedCreate(persisted, intent, {
    persist: (next) => {
      persisted = next;
      if (next.intents.length > 0 && events.length === 0) events.push('persist-intent');
      return Promise.resolve();
    },
    create: () => {
      const attempt = events.filter((event) => event.startsWith('create-')).length + 1;
      events.push(`create-${attempt}`);
      throw new DOMException('response lost', 'NetworkError');
    },
    readById: () => Promise.resolve(candidate),
    findCandidates: () => {
      events.push('reconcile');
      return Promise.resolve([candidate]);
    },
  });

  expect(events).toEqual(['persist-intent', 'create-1', 'create-2', 'reconcile']);
  expect(persisted.owned.workUnitIds).toEqual([candidate.id]);
});

test('two unreadable responses reconcile the persisted response ID with an exact read @mr @technical', async () => {
  let persisted = manifest();
  let createAttempts = 0;
  let exactReads = 0;

  await executePersistedCreate(persisted, intent, {
    persist: (next) => {
      persisted = next;
      return Promise.resolve();
    },
    create: () => {
      createAttempts += 1;
      return Promise.resolve({ id: candidate.id });
    },
    readById: (id) => {
      exactReads += 1;
      expect(id).toBe(candidate.id);
      if (exactReads < 3) throw new DOMException('read response lost', 'NetworkError');
      return Promise.resolve(candidate);
    },
    findCandidates: () => {
      throw new Error('a persisted response ID must not use broad reconciliation');
    },
  });

  expect(createAttempts).toBe(2);
  expect(exactReads).toBe(3);
  expect(persisted.owned.workUnitIds).toEqual([candidate.id]);
  expect(persisted.intents).toEqual([]);
  expect(persisted.quarantined).toEqual([]);
});

test('an explicit create AbortError with a live parent signal starts no retry read or reconciliation @mr @technical', async () => {
  let persisted = manifest();
  const controller = new AbortController();
  let createAttempts = 0;
  let exactReads = 0;
  let reconciliations = 0;

  await expect(
    executePersistedCreate(
      persisted,
      intent,
      {
        persist: (next) => {
          persisted = next;
          return Promise.resolve();
        },
        create: () => {
          createAttempts += 1;
          throw new DOMException('request explicitly cancelled', 'AbortError');
        },
        readById: () => {
          exactReads += 1;
          return Promise.resolve(candidate);
        },
        findCandidates: () => {
          reconciliations += 1;
          return Promise.resolve([candidate]);
        },
      },
      controller.signal
    )
  ).rejects.toThrow(/explicitly cancelled/i);

  expect(controller.signal.aborted).toBe(false);
  expect(createAttempts).toBe(1);
  expect(exactReads).toBe(0);
  expect(reconciliations).toBe(0);
  expect(persisted.intents).toEqual([intent]);
});

test('an explicit read AbortError with a live parent signal retains recovery and starts no retry or reconciliation @mr @technical', async () => {
  let persisted = manifest();
  const controller = new AbortController();
  let createAttempts = 0;
  let exactReads = 0;
  let reconciliations = 0;

  await expect(
    executePersistedCreate(
      persisted,
      intent,
      {
        persist: (next) => {
          persisted = next;
          return Promise.resolve();
        },
        create: () => {
          createAttempts += 1;
          return Promise.resolve({ id: candidate.id });
        },
        readById: () => {
          exactReads += 1;
          throw new DOMException('candidate read explicitly cancelled', 'AbortError');
        },
        findCandidates: () => {
          reconciliations += 1;
          return Promise.resolve([candidate]);
        },
      },
      controller.signal
    )
  ).rejects.toThrow(/explicitly cancelled/i);

  expect(controller.signal.aborted).toBe(false);
  expect(createAttempts).toBe(1);
  expect(exactReads).toBe(1);
  expect(reconciliations).toBe(0);
  expect(persisted.intents).toEqual([intent]);
  expect(persisted.quarantined).toContainEqual(
    expect.objectContaining({ candidateId: candidate.id, intentId: intent.intentId, reason: 'unknown' })
  );
});

test('an aborted lifecycle starts neither retry nor reconciliation @mr @technical', async () => {
  let persisted = manifest();
  const controller = new AbortController();
  let createAttempts = 0;
  let reconciliations = 0;

  await expect(
    executePersistedCreate(
      persisted,
      intent,
      {
        persist: (next) => {
          persisted = next;
          return Promise.resolve();
        },
        create: () => {
          createAttempts += 1;
          controller.abort(new DOMException('lifecycle deadline', 'AbortError'));
          throw new DOMException('response lost', 'NetworkError');
        },
        readById: () => Promise.resolve(candidate),
        findCandidates: () => {
          reconciliations += 1;
          return Promise.resolve([candidate]);
        },
      },
      controller.signal
    )
  ).rejects.toThrow(/deadline|aborted/i);

  expect(createAttempts).toBe(1);
  expect(reconciliations).toBe(0);
  expect(persisted.intents).toEqual([intent]);
});
