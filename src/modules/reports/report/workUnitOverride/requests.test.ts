import api from '@/core/api/Api';
import type { ReplaceWorkUnitOverrideRequest } from '@/modules/reports/models/workUnitOverride.model';
import type { AxiosResponse } from 'axios';
import type { MockedFunction } from 'vitest';
import {
  deleteWorkUnitOverride,
  getWorkUnitOverride,
  getWorkUnitOverrideHistory,
  replaceWorkUnitOverride,
  undoWorkUnitOverride,
} from './requests';

vi.mock('@/core/api/Api', () => ({
  __esModule: true,
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

// api mock, see src/modules/integrationClients/requests.test.ts for the full rationale.
// eslint-disable-next-line vitest/unbound-method
const deleteMock = api.delete as MockedFunction<typeof api.delete>;
// eslint-disable-next-line vitest/unbound-method -- see deleteMock above.
const getMock = api.get as MockedFunction<typeof api.get>;
// eslint-disable-next-line vitest/unbound-method -- see deleteMock above.
const postMock = api.post as MockedFunction<typeof api.post>;
// eslint-disable-next-line vitest/unbound-method -- see deleteMock above.
const putMock = api.put as MockedFunction<typeof api.put>;

const freshWorkUnit = (): Record<string, unknown> => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  userFullName: 'Employee Example',
  date: '2026-09-17',
  duration: 'PT1H',
  entryType: 'Worklog',
  description: 'Original employee description',
  taskId: 'SOURCE-17',
  state: 'Active',
  createdAt: '2026-09-17T08:00:00Z',
  modifiedAt: '2026-09-17T08:00:00Z',
  projectClient: {
    projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    projectName: 'Source project',
    projectDescription: null,
    clientId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    clientName: 'Source client',
    clientColor: '',
    clientTexture: '',
  },
  effectiveProjectClient: {
    projectId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    projectName: 'Source project',
    projectDescription: null,
    clientId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    clientName: 'Source client',
    clientColor: '',
    clientTexture: '',
  },
  effectiveTaskId: null,
  revision: 8,
  override: {
    active: false,
    hasHistory: true,
    version: 3,
    projectId: null,
    taskId: { mode: 'Inherit' },
    lastChangedBy: null,
    lastChangedAt: null,
    permissions: {
      canEdit: false,
      canDelete: true,
      canViewHistory: false,
      allowedProjectIds: [],
    },
    undo: {
      candidateEventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      canUndo: true,
      reason: null,
    },
  },
  additiveBackendField: 'stripped',
});

const response = (data: unknown): AxiosResponse<unknown> =>
  ({
    data,
    status: 200,
    statusText: 'OK',
    headers: { 'x-correlation-id': 'cid-1' },
    config: { headers: {} },
  }) as unknown as AxiosResponse<unknown>;

describe('work-unit override requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GETs and parses the full fresh override DTO while preserving Axios metadata', async () => {
    getMock.mockResolvedValue(response(freshWorkUnit()));

    const result = await getWorkUnitOverride('acme', 'unit-1');

    expect(getMock).toHaveBeenCalledWith('/organizations/acme/work-units/unit-1/override');
    expect(result.data.effectiveTaskId).toBeNull();
    expect(result.data).not.toHaveProperty('additiveBackendField');
    expect(result.status).toBe(200);
    expect(result.headers).toEqual({ 'x-correlation-id': 'cid-1' });
  });

  it('PUTs the exact complete desired state and returns the parsed fresh DTO', async () => {
    putMock.mockResolvedValue(response(freshWorkUnit()));

    const result = await replaceWorkUnitOverride('acme', 'unit-1', {
      expectedRevision: 7,
      projectId: '22222222-2222-4222-8222-222222222222',
      taskId: { mode: 'Set', value: '  TASK-17  ' },
    });

    expect(putMock).toHaveBeenCalledWith('/organizations/acme/work-units/unit-1/override', {
      expectedRevision: 7,
      projectId: '22222222-2222-4222-8222-222222222222',
      taskId: { mode: 'Set', value: 'TASK-17' },
    });
    expect(result.data.revision).toBe(8);
  });

  it('POSTs an exact undo intent and preserves Axios metadata on the parsed response', async () => {
    postMock.mockResolvedValue(response(freshWorkUnit()));

    const result = await undoWorkUnitOverride('acme', 'unit-1', {
      expectedRevision: 8,
      targetEventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });

    expect(postMock).toHaveBeenCalledWith('/organizations/acme/work-units/unit-1/override/undo', {
      expectedRevision: 8,
      targetEventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    });
    expect(result.data.override.undo?.canUndo).toBe(true);
    expect(result.headers).toEqual({ 'x-correlation-id': 'cid-1' });
  });

  it('rejects an invalid undo body before making a request', async () => {
    await expect(
      undoWorkUnitOverride('acme', 'unit-1', {
        expectedRevision: -1,
        targetEventId: 'NOT-CANONICAL',
      }),
    ).rejects.toThrow();

    expect(postMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid PUT body before making a request', async () => {
    await expect(
      replaceWorkUnitOverride('acme', 'unit-1', {
        expectedRevision: 7,
        projectId: null,
        taskId: { mode: 'Clear', value: null },
      } as unknown as ReplaceWorkUnitOverrideRequest),
    ).rejects.toThrow();

    expect(putMock).not.toHaveBeenCalled();
  });

  it('DELETEs with required expectedRevision in the query and no request body', async () => {
    deleteMock.mockResolvedValue(response(freshWorkUnit()));

    const result = await deleteWorkUnitOverride('acme', 'unit-1', 8);

    expect(deleteMock).toHaveBeenCalledWith('/organizations/acme/work-units/unit-1/override', {
      params: { expectedRevision: 8 },
    });
    expect(result.data.override.active).toBe(false);
  });

  it('rejects an invalid DELETE revision before making a request', async () => {
    await expect(deleteWorkUnitOverride('acme', 'unit-1', -1)).rejects.toThrow();

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('GETs and validates a stable history page with fixed page size 25', async () => {
    getMock.mockResolvedValue(
      response({ count: 0, pageNumber: 2, pageSize: 25, upToVersion: 7, results: [], futureField: true }),
    );

    const result = await getWorkUnitOverrideHistory('acme', 'unit-1', 7, 2);

    expect(getMock).toHaveBeenCalledWith('/organizations/acme/work-units/unit-1/override-history', {
      params: { upToVersion: 7, pageSize: 25, pageNumber: 2 },
    });
    expect(result.data).toEqual({ count: 0, pageNumber: 2, pageSize: 25, upToVersion: 7, results: [] });
  });

  it('defaults history to page one and rejects unsafe pagination before HTTP', async () => {
    getMock.mockResolvedValue(response({ count: 0, pageNumber: 1, pageSize: 25, upToVersion: 7, results: [] }));

    await getWorkUnitOverrideHistory('acme', 'unit-1', 7);
    await expect(getWorkUnitOverrideHistory('acme', 'unit-1', 7, Number.MAX_SAFE_INTEGER)).rejects.toThrow();

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith('/organizations/acme/work-units/unit-1/override-history', {
      params: { upToVersion: 7, pageSize: 25, pageNumber: 1 },
    });
  });

  it('rejects a malformed success response instead of silently returning it', async () => {
    const malformed = freshWorkUnit();
    delete malformed.effectiveTaskId;
    getMock.mockResolvedValue(response(malformed));

    await expect(getWorkUnitOverride('acme', 'unit-1')).rejects.toThrow();
  });

  it('does not catch or replace Axios errors, preserving response and correlation metadata', async () => {
    const error = Object.assign(new Error('stale'), {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          type: 'result:work-unit-override:stale-revision',
          extension: { currentRevision: 8 },
        },
        headers: { 'x-correlation-id': 'cid-stale' },
      },
    });
    putMock.mockRejectedValue(error);

    await expect(
      replaceWorkUnitOverride('acme', 'unit-1', {
        expectedRevision: 7,
        projectId: null,
        taskId: { mode: 'Inherit' },
      }),
    ).rejects.toBe(error);
  });
});
