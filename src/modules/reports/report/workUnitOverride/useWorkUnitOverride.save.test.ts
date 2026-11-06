import { useToast } from '@/core/providers/toastProvider';
import type { WorkUnitOverrideResponse } from '@/modules/reports/models/workUnitOverride.model';
import type { AxiosResponse } from 'axios';
import { act, renderHook, waitFor, type RenderHookResult } from '@testing-library/react';
import type { Mock } from 'vitest';
import {
  apiResponse,
  createQueryWrapper,
  deferredResponse,
  overrideFixture,
  projectId,
  workUnitId,
} from './overrideTestFixtures';
import * as requests from './requests';
import { useWorkUnitOverride } from './useWorkUnitOverride';

vi.mock('i18next', () => ({ default: { t: (key: string) => key } }));

vi.mock('@/core/providers/toastProvider', () => ({ useToast: vi.fn() }));
let contextOrganizationSlug = 'acme';
const workspaceContext = {
  get contextOrganizationSlug(): string {
    return contextOrganizationSlug;
  },
};
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => workspaceContext,
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({ useProjects: () => stores.projectsContext }));
vi.mock('./requests', () => ({
  getWorkUnitOverride: vi.fn(),
  getWorkUnitOverrideHistory: vi.fn(),
  replaceWorkUnitOverride: vi.fn(),
  deleteWorkUnitOverride: vi.fn(),
  undoWorkUnitOverride: vi.fn(),
}));
vi.mock('@/modules/reports/hooks/useReportedUnits', () => ({
  refreshReportedUnits: (...args: unknown[]) => refresh(...(args as [])),
}));

const get = vi.mocked(requests.getWorkUnitOverride);
const put = vi.mocked(requests.replaceWorkUnitOverride);
const remove = vi.mocked(requests.deleteWorkUnitOverride);
const undo = vi.mocked(requests.undoWorkUnitOverride);
const problem = (type: string, status: number, field?: string): unknown => ({
  response: { status, data: { type: `result:work-unit-override:${type}`, extension: { field } } },
});
let stores: { projectsContext: { reportedProjects: Array<Record<string, unknown>>; fetchProjects: Mock } };
let refresh: Mock<() => Promise<void>>;
let addToastMock: Mock;
let onClose: Mock<() => void>;
let wrapper: ReturnType<typeof createQueryWrapper>['wrapper'];
let queryClient: ReturnType<typeof createQueryWrapper>['queryClient'];

beforeEach(() => {
  vi.resetAllMocks();
  contextOrganizationSlug = 'acme';
  ({ queryClient, wrapper } = createQueryWrapper());
  refresh = vi.fn().mockResolvedValue(undefined);
  onClose = vi.fn();
  addToastMock = vi.fn();
  vi.mocked(useToast).mockReturnValue({ addToast: addToastMock, removeToast: vi.fn(), toasts: [] });
  stores = {
    projectsContext: {
      reportedProjects: [
        {
          id: projectId,
          name: 'Source project',
          archived: false,
          client: { id: '33333333-3333-4333-8333-333333333333', name: 'Source client' },
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          name: 'Corrected project',
          archived: false,
          client: { id: '55555555-5555-4555-8555-555555555555', name: 'Corrected client' },
        },
      ],
      fetchProjects: vi.fn().mockResolvedValue(undefined),
    },
  };
  get.mockResolvedValue(apiResponse(overrideFixture()));
  put.mockResolvedValue(apiResponse(overrideFixture({ revision: 9 })));
});

const open = async (): Promise<RenderHookResult<ReturnType<typeof useWorkUnitOverride>, unknown>> => {
  const view = renderHook(() => useWorkUnitOverride({ isOpen: true, workUnitId, onClose }), { wrapper });
  await waitFor(() => expect(view.result.current.base?.revision).toBe(8));
  return view;
};

describe('correction controller existing save/session behavior', () => {
  it('discards an ordinary draft only when explicitly requested', async () => {
    const { result } = await open();
    act(() => result.current.setTaskId({ mode: 'Set', value: 'proposal' }));
    expect(result.current.dirty).toBe(true);
    act(() => result.current.discardDraft());
    expect(result.current.draft.taskId).toEqual({ mode: 'Set', value: 'CORRECTED' });
    expect(put).not.toHaveBeenCalled();
  });

  it('uses one synchronous guard and adopts server normalization after save', async () => {
    const pending = deferredResponse<AxiosResponse<WorkUnitOverrideResponse>>();
    put.mockReturnValueOnce(pending.promise);
    const { result } = await open();
    act(() => result.current.setTaskId({ mode: 'Set', value: '  proposal  ' }));
    const retainedDiscard = result.current.discardDraft;
    let saving!: Promise<boolean>;
    act(() => {
      saving = result.current.save();
      void result.current.save();
      retainedDiscard();
      result.current.close();
    });
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(addToastMock).not.toHaveBeenCalled();
    expect(put).toHaveBeenCalledExactlyOnceWith('acme', workUnitId, {
      expectedRevision: 8,
      projectId: '44444444-4444-4444-8444-444444444444',
      taskId: { mode: 'Set', value: 'proposal' },
    });
    expect(onClose).not.toHaveBeenCalled();
    const normalized = overrideFixture({ revision: 9 });
    normalized.override.taskId = { mode: 'Set', value: 'NORMALIZED' };
    await act(async () => {
      pending.resolve(apiResponse(normalized));
      await pending.promise;
    });
    await saving;
    expect(result.current.draft.taskId).toEqual({ mode: 'Set', value: 'NORMALIZED' });
    expect(result.current.mutationAccepted).toBe(true);
    expect(addToastMock).toHaveBeenCalledExactlyOnceWith({
      content: 'reports.override.saveSuccess',
      type: 'success',
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ignores late GET and mutation results after close, reopen, worklog or organization changes', async () => {
    const pendingGet = deferredResponse<AxiosResponse<WorkUnitOverrideResponse>>();
    get.mockReturnValueOnce(pendingGet.promise);
    const view = renderHook(({ isOpen, id }) => useWorkUnitOverride({ isOpen, workUnitId: id, onClose }), {
      initialProps: { isOpen: true, id: workUnitId },
      wrapper,
    });
    act(() => view.result.current.close());
    await act(async () => {
      pendingGet.resolve(apiResponse(overrideFixture({ revision: 99 })));
      await pendingGet.promise;
    });
    expect(view.result.current.base).toBeNull();
    view.rerender({ isOpen: false, id: workUnitId });
    view.rerender({ isOpen: true, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    const old = view.result.current;
    contextOrganizationSlug = 'other';
    await act(async () => old.save());
    expect(put).not.toHaveBeenCalled();
  });

  it('loads fresh source/effective values and keeps explicit Clear separate from source Task ID', async () => {
    const value = overrideFixture();
    value.taskId = 'SOURCE';
    value.effectiveTaskId = null;
    value.override.taskId = { mode: 'Clear' };
    get.mockResolvedValueOnce(apiResponse(value));
    const { result } = await open();
    expect(result.current.base?.taskId).toBe('SOURCE');
    expect(result.current.draft.taskId).toEqual({ mode: 'Clear' });
  });

  it('intersects allowed projects with the active catalog and current client', async () => {
    const existing = stores.projectsContext.reportedProjects[0];
    stores.projectsContext.reportedProjects = [
      existing,
      { ...existing, id: 'not-allowed' },
      { ...existing, id: 'archived', archived: true },
    ];
    const value = overrideFixture();
    value.override.projectId = projectId;
    value.effectiveProjectClient = value.projectClient;
    value.override.permissions.allowedProjectIds.push('archived');
    get.mockResolvedValueOnce(apiResponse(value));
    const { result } = await open();
    expect(result.current.projectOptions.map((option) => option.value)).toEqual([projectId]);
  });

  it('validates trimmed nonempty Set and Unicode codepoint length', async () => {
    const { result } = await open();
    act(() => result.current.setTaskId({ mode: 'Set', value: '   ' }));
    expect(result.current.saveDisabled).toBe(true);
    act(() => result.current.setTaskId({ mode: 'Set', value: '😀'.repeat(255) }));
    expect(result.current.saveDisabled).toBe(false);
    act(() => result.current.setTaskId({ mode: 'Set', value: '😀'.repeat(256) }));
    expect(result.current.saveDisabled).toBe(true);
  });

  it('preserves a proposal across a save conflict and retries only after explicit review', async () => {
    put.mockRejectedValueOnce(problem('stale-revision', 409));
    const { result } = await open();
    get.mockResolvedValueOnce(apiResponse(overrideFixture({ revision: 12 })));
    act(() => result.current.setTaskId({ mode: 'Set', value: 'proposal' }));
    await act(async () => result.current.save());
    expect(result.current.draft.taskId).toEqual({ mode: 'Set', value: 'proposal' });
    await act(async () => result.current.save());
    expect(put).toHaveBeenCalledTimes(1);
    act(() => result.current.reviewAndReapply());
    await act(async () => result.current.save());
    expect(put.mock.calls[1][2].expectedRevision).toBe(12);
  });

  it('does not write the query cache on a failed save', async () => {
    const { result } = await open();
    act(() => result.current.setTaskId({ mode: 'Set', value: 'proposal' }));
    queryClient.clear();
    put.mockRejectedValueOnce(problem('invalid-request', 400, 'taskId'));
    await act(async () => result.current.save());
    expect(result.current.fieldErrors.taskId).toBeTruthy();
    expect(queryClient.getQueryData(['workUnitOverride', 'acme', workUnitId])).toBeUndefined();
  });

  it('keeps an ambiguous save proposal blocked until explicit reconciliation', async () => {
    put.mockRejectedValueOnce(new Error('offline'));
    const { result } = await open();
    get.mockResolvedValueOnce(apiResponse(overrideFixture({ revision: 10 })));
    act(() => result.current.setTaskId({ mode: 'Set', value: 'proposal' }));
    await act(async () => result.current.save());
    expect(result.current.conflict?.reason).toBe('uncertain');
    expect(result.current.draft.taskId).toEqual({ mode: 'Set', value: 'proposal' });
    expect(result.current.mutationAccepted).toBe(false);
    expect(addToastMock).not.toHaveBeenCalled();
  });

  it('separates an accepted save from report refresh failure and retries only the refresh', async () => {
    refresh.mockRejectedValueOnce(new Error('report unavailable'));
    const { result } = await open();
    act(() => result.current.setTaskId({ mode: 'Inherit' }));
    await act(async () => result.current.save());
    expect(result.current.refreshWarning).toBeTruthy();
    expect(addToastMock).toHaveBeenCalledTimes(1);
    await act(async () => result.current.retryReportRefresh());
    expect(result.current.refreshWarning).toBeNull();
    expect(addToastMock).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('clears privileged state when fresh access is revoked', async () => {
    put.mockRejectedValueOnce(problem('stale-revision', 409));
    const denied = overrideFixture();
    denied.override.permissions = { canEdit: false, canDelete: false, canViewHistory: false, allowedProjectIds: [] };
    const { result } = await open();
    get.mockResolvedValueOnce(apiResponse(denied));
    act(() => result.current.setTaskId({ mode: 'Set', value: 'secret' }));
    await act(async () => result.current.save());
    expect(result.current.base).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps project and validation failures local without invoking undo or DELETE', async () => {
    const { result } = await open();
    act(() => result.current.setTaskId({ mode: 'Set', value: 'proposal' }));
    put.mockRejectedValueOnce(problem('project-not-found', 404));
    await act(async () => result.current.save());
    expect(result.current.fieldErrors.projectId).toBeTruthy();
    act(() => result.current.setProjectId(null));
    put.mockRejectedValueOnce(problem('invalid-request', 400, 'taskId'));
    await act(async () => result.current.save());
    expect(result.current.fieldErrors.taskId).toBeTruthy();
    expect(remove).not.toHaveBeenCalled();
    expect(undo).not.toHaveBeenCalled();
  });

  it('keeps retained save and field actions valid across ordinary rerenders', async () => {
    const { result } = await open();
    act(() => result.current.setTaskId({ mode: 'Set', value: 'first' }));
    const retained = result.current;
    act(() => result.current.setTaskId({ mode: 'Set', value: 'second' }));
    act(() => retained.setTaskId({ mode: 'Set', value: 'retained' }));
    await act(async () => retained.save());
    expect(put).toHaveBeenCalledExactlyOnceWith('acme', workUnitId, {
      expectedRevision: 8,
      projectId: '44444444-4444-4444-8444-444444444444',
      taskId: { mode: 'Set', value: 'first' },
    });
  });

  it('rejects retained save, setters, close and retries after their session ends', async () => {
    const { result, rerender } = renderHook(
      ({ id, isOpen }) => useWorkUnitOverride({ isOpen, workUnitId: id, onClose }),
      { initialProps: { id: workUnitId, isOpen: true }, wrapper },
    );
    await waitFor(() => expect(result.current.base).not.toBeNull());
    act(() => result.current.setTaskId({ mode: 'Set', value: 'old' }));
    const old = result.current;
    const nextId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    get.mockResolvedValueOnce(apiResponse(overrideFixture({ id: nextId })));
    rerender({ id: nextId, isOpen: true });
    await waitFor(() => expect(result.current.base?.id).toBe(nextId));
    const before = result.current.draft;
    await act(async () => {
      old.setTaskId({ mode: 'Set', value: 'stale' });
      old.setProjectId(projectId);
      old.setClientId('stale');
      old.discardDraft();
      old.close();
      await old.save();
      await old.retryFreshLoad();
      await old.retryReportRefresh();
    });
    expect(result.current.draft).toEqual(before);
    expect(get).toHaveBeenCalledTimes(2);
    expect(put).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores a pending accepted save after close/reopen or an organization switch', async () => {
    const pending = deferredResponse<AxiosResponse<WorkUnitOverrideResponse>>();
    put.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ isOpen }) => useWorkUnitOverride({ isOpen, workUnitId, onClose }), {
      initialProps: { isOpen: true },
      wrapper,
    });
    await waitFor(() => expect(result.current.base).not.toBeNull());
    act(() => result.current.setTaskId({ mode: 'Inherit' }));
    act(() => void result.current.save());
    rerender({ isOpen: false });
    rerender({ isOpen: true });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    contextOrganizationSlug = 'other';
    await act(async () => {
      pending.resolve(apiResponse(overrideFixture({ revision: 99 })));
      await pending.promise;
    });
    expect(result.current.base?.revision).toBe(8);
    expect(result.current.mutationAccepted).toBe(false);
    expect(addToastMock).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(addToastMock).not.toHaveBeenCalled();
  });

  it.each([null, 'Forbidden', { extension: 'invalid', type: 123 }])(
    'treats HTTP 403 as terminal regardless of response body: %s',
    async (body) => {
      const { result } = await open();
      act(() => {
        result.current.handleHistoryError({ response: { status: 403, data: body } });
      });
      expect(result.current.base).toBeNull();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(refresh).toHaveBeenCalledTimes(1);
    },
  );

  it('finishes catalog resolution only once per session while fresh data changes', async () => {
    stores.projectsContext.reportedProjects = [];
    const catalog = deferredResponse<void>();
    vi.mocked(stores.projectsContext.fetchProjects).mockReturnValue(catalog.promise);
    const { result } = await open();
    expect(result.current.projectResolution).toBe('resolving');
    get.mockResolvedValueOnce(apiResponse(overrideFixture({ revision: 10 })));
    await act(async () => result.current.refreshAfterSourceSave());
    await act(async () => {
      catalog.resolve(undefined);
      await catalog.promise;
    });
    expect(result.current.projectResolution).toBe('unavailable');
    expect(stores.projectsContext.fetchProjects).toHaveBeenCalledTimes(1);
  });

  it('does not let a load retry discard an existing conflict', async () => {
    put.mockRejectedValueOnce(problem('stale-revision', 409));
    const { result } = await open();
    get.mockResolvedValueOnce(apiResponse(overrideFixture({ revision: 12 })));
    act(() => result.current.setTaskId({ mode: 'Set', value: 'proposal' }));
    await act(async () => result.current.save());
    await act(async () => result.current.retryFreshLoad());
    expect(result.current.conflict).not.toBeNull();
    expect(result.current.draft.taskId).toEqual({ mode: 'Set', value: 'proposal' });
  });

  it.each(['organization', 'worklog', 'close', 'unmount'] as const)(
    'ignores a late initial GET after %s',
    async (change) => {
      const pending = deferredResponse<AxiosResponse<WorkUnitOverrideResponse>>();
      get.mockReturnValueOnce(pending.promise);
      const { result, rerender, unmount } = renderHook(
        ({ isOpen, id }) => useWorkUnitOverride({ isOpen, workUnitId: id, onClose }),
        { initialProps: { isOpen: true, id: workUnitId }, wrapper },
      );
      if (change === 'organization') contextOrganizationSlug = 'other';
      if (change === 'unmount') unmount();
      else rerender({ isOpen: change !== 'close', id: change === 'worklog' ? 'other' : workUnitId });
      await act(async () => {
        pending.resolve(apiResponse(overrideFixture({ revision: 100 })));
        await pending.promise;
      });
      expect(result.current.base?.revision).not.toBe(100);
    },
  );

  it.each([{ mode: 'Inherit' }, { mode: 'Clear' }, { mode: 'Set', value: '  TASK-17  ' }] as const)(
    'round-trips task mode $mode and keeps a client switch unselected',
    async (taskId) => {
      const { result } = await open();
      act(() => result.current.setTaskId(taskId));
      await act(async () => result.current.save());
      expect(put.mock.calls[0][2].taskId).toEqual(taskId.mode === 'Set' ? { mode: 'Set', value: 'TASK-17' } : taskId);
      act(() => result.current.setClientId('other-client'));
      expect(result.current.draft.projectId).toBeUndefined();
      expect(result.current.saveDisabled).toBe(true);
    },
  );
});
