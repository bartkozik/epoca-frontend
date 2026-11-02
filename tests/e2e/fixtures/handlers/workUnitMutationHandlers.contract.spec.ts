import { expect, test } from '@playwright/test';
import { buildWorld } from '../../worlds';
import { createWorldRuntime } from '../../worlds/runtime';
import type { WorldFailure } from '../../worlds/types';
import { createMockApiDispatcher, parseMockRequest } from '../mockApi';
import { createWorkUnitFingerprint, workUnitMutationHandlers } from './workUnitMutationHandlers';

const WORK_UNITS_URL = 'http://127.0.0.1:5173/__e2e_api/organizations/epoca-e2e/work-units';
const IDEMPOTENCY_KEY = 'work-unit-contract-key';

const createPayload = {
  date: '2026-07-14',
  description: 'Contract note',
  entryType: 'Note' as const,
  isDraft: false,
  projectId: '40000000-0000-4000-8000-000000000001',
  taskId: null,
};

const postRequest = (body: unknown = createPayload, key = IDEMPOTENCY_KEY): ReturnType<typeof parseMockRequest> =>
  parseMockRequest({
    body,
    headers: { 'Idempotency-Key': key },
    method: 'POST',
    url: WORK_UNITS_URL,
  });

const patchRequest = (workUnitId: string, body: unknown, key?: string): ReturnType<typeof parseMockRequest> =>
  parseMockRequest({
    body,
    headers: key ? { 'Idempotency-Key': key } : undefined,
    method: 'PATCH',
    url: `${WORK_UNITS_URL}/${workUnitId}`,
  });

const runtimeForUser = (): ReturnType<typeof createWorldRuntime> => {
  const runtime = createWorldRuntime(buildWorld('world-5'));
  runtime.setActor('user');
  return runtime;
};

test('create fingerprints include every semantic Note field and omit inapplicable duration @mr @technical', () => {
  const fingerprint = createWorkUnitFingerprint(createPayload);

  expect(JSON.parse(fingerprint)).toEqual({
    date: '2026-07-14',
    description: 'Contract note',
    entryType: 'Note',
    isDraft: false,
    projectId: '40000000-0000-4000-8000-000000000001',
    taskId: null,
  });
  expect(JSON.parse(createWorkUnitFingerprint({ ...createPayload, entryType: 'Worklog', duration: 'PT1H' }))).toEqual({
    date: '2026-07-14',
    description: 'Contract note',
    duration: 'PT1H',
    entryType: 'Worklog',
    isDraft: false,
    projectId: '40000000-0000-4000-8000-000000000001',
    taskId: null,
  });

  for (const changed of [
    { ...createPayload, date: '2026-07-15' },
    { ...createPayload, description: 'Changed' },
    { ...createPayload, isDraft: true },
    { ...createPayload, projectId: 'different-project' },
    { ...createPayload, taskId: 'CT-514' },
    { ...createPayload, entryType: 'Worklog' as const, duration: 'PT1H' },
  ]) {
    expect(createWorkUnitFingerprint(changed)).not.toBe(fingerprint);
  }
});

test('Note creation omits duration stores PT0S replays once and conflicts on changed payload @mr @technical', async () => {
  const runtime = runtimeForUser();
  const dispatcher = createMockApiDispatcher(runtime, workUnitMutationHandlers);
  const initialCount = runtime.state.workUnits.length;

  const created = await dispatcher.dispatch(postRequest());
  const replayed = await dispatcher.dispatch(postRequest());
  const conflict = await dispatcher.dispatch(postRequest({ ...createPayload, description: 'Changed payload' }));

  expect(created.status).toBe(201);
  expect(replayed).toEqual(created);
  expect(conflict).toEqual({
    status: 409,
    json: { type: 'result:work-unit:idempotency-key-conflict' },
  });
  expect(runtime.state.workUnits).toHaveLength(initialCount + 1);
  expect(runtime.state.workUnits.at(-1)).toMatchObject({
    description: 'Contract note',
    duration: 'PT0S',
    entryType: 'Note',
  });
  expect(runtime.journal.entries.map(({ responseStatus }) => responseStatus)).toEqual([201, 201, 409]);
});

test('create validation rejects Note duration and missing Worklog duration without mutation @mr @technical', async () => {
  const runtime = runtimeForUser();
  const dispatcher = createMockApiDispatcher(runtime, workUnitMutationHandlers);
  const stateBeforeRequests = structuredClone(runtime.state);

  const noteWithDuration = await dispatcher.dispatch(postRequest({ ...createPayload, duration: 'PT1H' }, 'note-key'));
  const worklogWithoutDuration = await dispatcher.dispatch(
    postRequest({ ...createPayload, entryType: 'Worklog' }, 'worklog-key')
  );

  expect(noteWithDuration.status).toBe(400);
  expect(worklogWithoutDuration.status).toBe(400);
  expect(runtime.state).toEqual(stateBeforeRequests);
});

test('network-drop journals an abort only after the created unit and replayable 201 exist @mr @technical', async () => {
  const runtime = runtimeForUser();
  runtime.activateFailure('network-drop');
  const dispatcher = createMockApiDispatcher(runtime, workUnitMutationHandlers);
  const initialCount = runtime.state.workUnits.length;

  const lostResponse = await dispatcher.dispatch(postRequest());

  expect(lostResponse).toEqual({ status: 201, abort: 'failed' });
  expect(runtime.state.workUnits).toHaveLength(initialCount + 1);
  expect(runtime.state.workUnits.at(-1)?.description).toBe('Contract note');
  expect(runtime.journal.entries).toHaveLength(1);
  expect(runtime.journal.entries[0]).toMatchObject({ abort: 'failed', responseStatus: 201, sequence: 1 });

  const replayed = await dispatcher.dispatch(postRequest());
  expect(replayed.status).toBe(201);
  expect(replayed.json).toMatchObject({ description: 'Contract note' });
  expect(runtime.state.workUnits).toHaveLength(initialCount + 1);
  expect(runtime.journal.entries.map(({ abort, responseStatus }) => ({ abort, responseStatus }))).toEqual([
    { abort: 'failed', responseStatus: 201 },
    { abort: undefined, responseStatus: 201 },
  ]);
});

test('deleted work-unit IDs are never reissued or confused with an idempotent replay @mr @technical', async () => {
  const runtime = runtimeForUser();
  const dispatcher = createMockApiDispatcher(runtime, workUnitMutationHandlers);
  const initialCount = runtime.state.workUnits.length;
  const firstPayload = { ...createPayload, description: 'First issued work unit' };
  const secondPayload = { ...createPayload, description: 'Second issued work unit' };

  const createdFirst = await dispatcher.dispatch(postRequest(firstPayload, 'first-issued-key'));
  const firstId = (createdFirst.json as { id: string }).id;
  const deletedFirst = await dispatcher.dispatch(
    parseMockRequest({ method: 'DELETE', url: `${WORK_UNITS_URL}/${firstId}` })
  );
  const createdSecond = await dispatcher.dispatch(postRequest(secondPayload, 'second-issued-key'));
  const secondId = (createdSecond.json as { id: string }).id;
  const replayedFirst = await dispatcher.dispatch(postRequest(firstPayload, 'first-issued-key'));

  expect(deletedFirst.status).toBe(204);
  expect(secondId).not.toBe(firstId);
  expect(replayedFirst).toEqual(createdFirst);
  expect(runtime.state.workUnits).toHaveLength(initialCount + 1);
  expect(runtime.state.workUnits.filter(({ id }) => id === firstId)).toHaveLength(0);
  expect(runtime.state.workUnits.filter(({ id }) => id === secondId)).toEqual([
    expect.objectContaining({ description: 'Second issued work unit' }),
  ]);
});

const failureCases: ReadonlyArray<{
  key: WorldFailure['key'];
  method: 'POST' | 'PATCH';
  status: number;
  type: string;
}> = [
  {
    key: 'unsupported-fingerprint',
    method: 'POST',
    status: 409,
    type: 'result:work-unit:idempotency-version-unsupported',
  },
  { key: 'conflict', method: 'PATCH', status: 409, type: 'result:work-unit:revision-conflict' },
  { key: 'expired-result', method: 'PATCH', status: 410, type: 'result:work-unit:idempotency-result-expired' },
];

for (const failureCase of failureCases) {
  test(`${failureCase.key} fires once with the production problem type @mr @technical`, async () => {
    const runtime = runtimeForUser();
    runtime.activateFailure(failureCase.key);
    const dispatcher = createMockApiDispatcher(runtime, workUnitMutationHandlers);
    const target = runtime.state.workUnits.find(({ entryType }) => entryType === 'Worklog');
    if (!target) throw new Error('world-5 must contain a Worklog for mutation failure contracts');
    const patchBody = {
      date: target.date,
      description: 'Updated after failure',
      duration: target.duration,
      projectId: target.projectId,
      shouldFinalize: true,
      taskId: target.taskId,
    };
    const request =
      failureCase.method === 'POST' ? postRequest() : patchRequest(target.id, patchBody, `${failureCase.key}-key`);
    const stateBeforeFailure = structuredClone(runtime.state);

    const failed = await dispatcher.dispatch(request);

    expect(failed).toEqual({ status: failureCase.status, json: { type: failureCase.type } });
    expect(runtime.state).toEqual(stateBeforeFailure);
    expect(runtime.consumeFailure(failureCase.key)).toBeNull();

    const succeeded = await dispatcher.dispatch(request);
    expect(succeeded.status).toBe(failureCase.method === 'POST' ? 201 : 200);
  });
}

test('PATCH with or without a key DELETE and order PUT are explicit isolated mutations @mr @technical', async () => {
  const runtime = runtimeForUser();
  const dispatcher = createMockApiDispatcher(runtime, workUnitMutationHandlers);
  const target = runtime.state.workUnits.find(({ entryType }) => entryType === 'Worklog');
  if (!target) throw new Error('world-5 must contain a Worklog for explicit mutation contracts');

  const edited = await dispatcher.dispatch(
    patchRequest(
      target.id,
      {
        date: '2026-07-14',
        description: 'Edited contract worklog',
        duration: 'PT2H',
        projectId: target.projectId,
        shouldFinalize: true,
        taskId: 'CT-530',
      },
      'edit-contract-key'
    )
  );
  expect(edited.status).toBe(200);
  expect(runtime.state.workUnits.find(({ id }) => id === target.id)).toMatchObject({
    date: '2026-07-14',
    description: 'Edited contract worklog',
    duration: 'PT2H',
    taskId: 'CT-530',
  });

  const moved = await dispatcher.dispatch(patchRequest(target.id, { date: '2026-07-15', shouldFinalize: false }));
  expect(moved.status).toBe(200);
  expect(runtime.state.workUnits.find(({ id }) => id === target.id)?.date).toBe('2026-07-15');

  const ordered = await dispatcher.dispatch(
    parseMockRequest({
      body: { date: '2026-07-15', workUnitIds: [target.id] },
      method: 'PUT',
      url: `${WORK_UNITS_URL}/order`,
    })
  );
  expect(ordered.status).toBe(204);

  const deleted = await dispatcher.dispatch(
    parseMockRequest({ method: 'DELETE', url: `${WORK_UNITS_URL}/${target.id}` })
  );
  expect(deleted.status).toBe(204);
  expect(runtime.state.workUnits.some(({ id }) => id === target.id)).toBe(false);
});
