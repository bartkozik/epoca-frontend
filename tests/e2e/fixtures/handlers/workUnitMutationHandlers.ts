import { toRawWorkUnit as modelRawWorkUnit, type RawWorkUnitFixture as RawWorkUnit } from './workUnitReadHandlers';
import { IdempotencyConflictError, type IdempotencyClaim, type WorldRuntime } from '../../worlds/runtime';
import type { WorldFailure, WorldWorkUnit } from '../../worlds/types';
import type { MockHandler, MockResponse } from './types';

const WORK_UNITS_PATH = '/organizations/epoca-e2e/work-units';
const PROBLEM_PREFIX = 'result:work-unit:';

export interface CreateWorkUnitPayload {
  date: string;
  description: string;
  duration?: string;
  entryType: 'Worklog' | 'Note';
  isDraft: boolean;
  projectId: string;
  taskId?: string | null;
}

interface EditWorkUnitPayload {
  date: string;
  description: string;
  duration: string;
  projectId: string;
  shouldFinalize: boolean;
  taskId?: string | null;
}

type WorkUnitResponse = { status: 200 | 201; json: RawWorkUnit };

const problem = (status: number, type: string): MockResponse => ({
  status,
  json: { type: `${PROBLEM_PREFIX}${type}` },
});

const badRequest = (detail: string): MockResponse => ({
  status: 400,
  json: { detail, type: `${PROBLEM_PREFIX}invalid-request` },
});

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const isTaskId = (value: unknown): value is string | null | undefined =>
  value === undefined || value === null || typeof value === 'string';

const parseCreatePayload = (body: unknown): CreateWorkUnitPayload | MockResponse => {
  const payload = asRecord(body);
  if (!payload) return badRequest('Expected a JSON work-unit payload');

  if (payload.entryType !== 'Worklog' && payload.entryType !== 'Note') {
    return badRequest('entryType must be Worklog or Note');
  }
  if (
    typeof payload.projectId !== 'string' ||
    typeof payload.date !== 'string' ||
    typeof payload.description !== 'string' ||
    typeof payload.isDraft !== 'boolean' ||
    !isTaskId(payload.taskId)
  ) {
    return badRequest('Work-unit fields have invalid types');
  }
  if (payload.entryType === 'Note' && Object.prototype.hasOwnProperty.call(payload, 'duration')) {
    return badRequest('Note requests must omit duration');
  }
  if (payload.entryType === 'Worklog' && (typeof payload.duration !== 'string' || payload.duration.length === 0)) {
    return badRequest('Worklog requests require duration');
  }

  return {
    date: payload.date,
    description: payload.description,
    ...(payload.entryType === 'Worklog' ? { duration: payload.duration as string } : {}),
    entryType: payload.entryType,
    isDraft: payload.isDraft,
    projectId: payload.projectId,
    taskId: payload.taskId,
  };
};

const parseEditPayload = (body: unknown): EditWorkUnitPayload | MockResponse => {
  const payload = asRecord(body);
  if (
    !payload ||
    typeof payload.projectId !== 'string' ||
    typeof payload.date !== 'string' ||
    typeof payload.duration !== 'string' ||
    typeof payload.description !== 'string' ||
    typeof payload.shouldFinalize !== 'boolean' ||
    !isTaskId(payload.taskId)
  ) {
    return badRequest('Edit work-unit fields have invalid types');
  }

  return {
    date: payload.date,
    description: payload.description,
    duration: payload.duration,
    projectId: payload.projectId,
    shouldFinalize: payload.shouldFinalize,
    taskId: payload.taskId,
  };
};

const isMockResponse = (value: CreateWorkUnitPayload | EditWorkUnitPayload | MockResponse): value is MockResponse =>
  'status' in value;

export const createWorkUnitFingerprint = (payload: CreateWorkUnitPayload): string =>
  JSON.stringify({
    date: payload.date,
    description: payload.description,
    ...(payload.entryType === 'Worklog' ? { duration: payload.duration } : {}),
    entryType: payload.entryType,
    isDraft: payload.isDraft,
    projectId: payload.projectId,
    taskId: payload.taskId ?? null,
  });

const editWorkUnitFingerprint = (workUnitId: string, payload: EditWorkUnitPayload): string =>
  JSON.stringify({
    date: payload.date,
    description: payload.description,
    duration: payload.duration,
    method: 'PATCH',
    projectId: payload.projectId,
    shouldFinalize: payload.shouldFinalize,
    target: `${WORK_UNITS_PATH}/${workUnitId}`,
    taskId: payload.taskId ?? null,
  });

const workUnitIdFromPath = (path: string): string => path.slice(`${WORK_UNITS_PATH}/`.length);

const nextSequenceByRuntime = new WeakMap<WorldRuntime, number>();

const nextWorkUnitId = (runtime: WorldRuntime): string => {
  let sequence = nextSequenceByRuntime.get(runtime) ?? runtime.state.workUnits.length + 1;
  let id = `70000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
  while (runtime.state.allIds.includes(id)) {
    sequence += 1;
    id = `70000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
  }
  nextSequenceByRuntime.set(runtime, sequence + 1);
  return id;
};

const actorUserId = (runtime: WorldRuntime): string | null => {
  if (runtime.actor === 'anonymous') return null;
  return runtime.state.actors[runtime.actor]?.userId ?? null;
};

const toRawWorkUnit = (runtime: WorldRuntime, workUnit: WorldWorkUnit): RawWorkUnit =>
  modelRawWorkUnit(runtime.state, workUnit);

const failureResponse = (
  runtime: WorldRuntime,
  key: Exclude<WorldFailure['key'], 'network-drop'>,
  type: string
): MockResponse | null => {
  const failure = runtime.consumeFailure(key);
  return failure ? problem(failure.status, type) : null;
};

const idempotencyConflict = (): MockResponse => problem(409, 'idempotency-key-conflict');

const createHandler: MockHandler = {
  id: 'work-unit-create',
  method: 'POST',
  path: /^\/organizations\/epoca-e2e\/work-units$/,
  handle: (request, runtime) => {
    const idempotencyKey = request.headers['idempotency-key'];
    if (!idempotencyKey) return badRequest('Idempotency-Key header is required');

    const parsed = parseCreatePayload(request.body);
    if (isMockResponse(parsed)) return parsed;
    const userId = actorUserId(runtime);
    if (!userId) return { status: 401, json: { type: `${PROBLEM_PREFIX}unauthorized` } };
    if (!runtime.state.projects.some(({ id }) => id === parsed.projectId)) {
      return { status: 404, json: { type: `${PROBLEM_PREFIX}project-not-found` } };
    }

    const unsupported = failureResponse(runtime, 'unsupported-fingerprint', 'idempotency-version-unsupported');
    if (unsupported) return unsupported;

    const timestamp = new Date(runtime.state.clock).toISOString();
    const workUnit: WorldWorkUnit = {
      id: nextWorkUnitId(runtime),
      userId,
      projectId: parsed.projectId,
      entryType: parsed.entryType,
      date: parsed.date,
      duration: parsed.entryType === 'Note' ? 'PT0S' : (parsed.duration as string),
      description: parsed.description,
      taskId: parsed.taskId || null,
      state: parsed.isDraft ? 'Draft' : 'Active',
      createdAt: timestamp,
      modifiedAt: timestamp,
    };
    const candidate: WorkUnitResponse = { status: 201, json: toRawWorkUnit(runtime, workUnit) };
    let claim: IdempotencyClaim<WorkUnitResponse>;
    try {
      claim = runtime.claimIdempotency(
        { key: idempotencyKey, fingerprint: createWorkUnitFingerprint(parsed) },
        candidate
      );
    } catch (error) {
      if (error instanceof IdempotencyConflictError) return idempotencyConflict();
      throw error;
    }

    if (!claim.replayed) {
      runtime.state.workUnits = [...runtime.state.workUnits, workUnit];
      runtime.state.allIds = [...runtime.state.allIds, workUnit.id];
    }

    const networkDrop = runtime.consumeFailure('network-drop');
    if (networkDrop) {
      if (claim.replayed) throw new Error('network-drop must occur on the first idempotent mutation');
      return { status: claim.result.status, abort: 'failed' };
    }

    return claim.result;
  },
};

const patchHandler: MockHandler = {
  id: 'work-unit-patch',
  method: 'PATCH',
  path: /^\/organizations\/epoca-e2e\/work-units\/[^/]+$/,
  handle: (request, runtime) => {
    const workUnitId = workUnitIdFromPath(request.path);
    const index = runtime.state.workUnits.findIndex(({ id }) => id === workUnitId);
    if (index < 0) return { status: 404, json: { type: `${PROBLEM_PREFIX}not-found` } };
    const current = runtime.state.workUnits[index];
    const idempotencyKey = request.headers['idempotency-key'];

    if (!idempotencyKey) {
      const payload = asRecord(request.body);
      if (!payload || typeof payload.date !== 'string' || payload.shouldFinalize !== false) {
        return badRequest('A non-idempotent PATCH only supports date movement');
      }
      const updated = { ...current, date: payload.date, modifiedAt: new Date(runtime.state.clock).toISOString() };
      runtime.state.workUnits = runtime.state.workUnits.map((workUnit, candidateIndex) =>
        candidateIndex === index ? updated : workUnit
      );
      return { status: 200, json: toRawWorkUnit(runtime, updated) };
    }

    const parsed = parseEditPayload(request.body);
    if (isMockResponse(parsed)) return parsed;
    if (!runtime.state.projects.some(({ id }) => id === parsed.projectId)) {
      return { status: 404, json: { type: `${PROBLEM_PREFIX}project-not-found` } };
    }

    const conflict = failureResponse(runtime, 'conflict', 'revision-conflict');
    if (conflict) return conflict;
    const expired = failureResponse(runtime, 'expired-result', 'idempotency-result-expired');
    if (expired) return expired;

    const updated: WorldWorkUnit = {
      ...current,
      date: parsed.date,
      description: parsed.description,
      duration: parsed.duration,
      projectId: parsed.projectId,
      state: parsed.shouldFinalize ? 'Active' : current.state,
      taskId: parsed.taskId || null,
      modifiedAt: new Date(runtime.state.clock).toISOString(),
    };
    const candidate: WorkUnitResponse = { status: 200, json: toRawWorkUnit(runtime, updated) };
    let claim: IdempotencyClaim<WorkUnitResponse>;
    try {
      claim = runtime.claimIdempotency(
        { key: idempotencyKey, fingerprint: editWorkUnitFingerprint(workUnitId, parsed) },
        candidate
      );
    } catch (error) {
      if (error instanceof IdempotencyConflictError) return idempotencyConflict();
      throw error;
    }

    if (!claim.replayed) {
      runtime.state.workUnits = runtime.state.workUnits.map((workUnit, candidateIndex) =>
        candidateIndex === index ? updated : workUnit
      );
    }
    return claim.result;
  },
};

const deleteHandler: MockHandler = {
  id: 'work-unit-delete',
  method: 'DELETE',
  path: /^\/organizations\/epoca-e2e\/work-units\/[^/]+$/,
  handle: (request, runtime) => {
    const workUnitId = workUnitIdFromPath(request.path);
    if (!runtime.state.workUnits.some(({ id }) => id === workUnitId)) {
      return { status: 404, json: { type: `${PROBLEM_PREFIX}not-found` } };
    }
    runtime.state.workUnits = runtime.state.workUnits.filter(({ id }) => id !== workUnitId);
    runtime.state.allIds = runtime.state.allIds.filter((id) => id !== workUnitId);
    return { status: 204 };
  },
};

const orderHandler: MockHandler = {
  id: 'work-unit-order',
  method: 'PUT',
  path: /^\/organizations\/epoca-e2e\/work-units\/order$/,
  handle: (request, runtime) => {
    const payload = asRecord(request.body);
    if (
      !payload ||
      typeof payload.date !== 'string' ||
      !Array.isArray(payload.workUnitIds) ||
      !payload.workUnitIds.every((id): id is string => typeof id === 'string') ||
      new Set(payload.workUnitIds).size !== payload.workUnitIds.length ||
      !payload.workUnitIds.every((id) =>
        runtime.state.workUnits.some((workUnit) => workUnit.id === id && workUnit.date === payload.date)
      )
    ) {
      return badRequest('Invalid work-unit order payload');
    }
    return { status: 204 };
  },
};

export const workUnitMutationHandlers: MockHandler[] = [createHandler, patchHandler, deleteHandler, orderHandler];
