import type {
  WorkUnitOverrideHistoryEntry,
  WorkUnitOverrideHistoryPage,
  WorkUnitOverrideResponse,
} from '@/modules/reports/models/workUnitOverride.model';
import type { AxiosResponse } from 'axios';
import { act, renderHook, waitFor, type RenderHookResult } from '@testing-library/react';
import type { Mock } from 'vitest';
import {
  apiResponse,
  createQueryWrapper,
  deferredResponse,
  historyEntryFixture,
  overrideFixture,
  workUnitId,
} from './overrideTestFixtures';
import * as requests from './requests';
import { useWorkUnitOverride } from './useWorkUnitOverride';

let contextOrganizationSlug = 'acme';
const workspaceContext = {
  get contextOrganizationSlug(): string {
    return contextOrganizationSlug;
  },
};
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => workspaceContext,
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => stores.projectsContext,
}));
vi.mock('@/core/providers/toastProvider', () => ({
  useToast: () => stores.toastContext,
}));
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

const candidate = historyEntryFixture();
const base = (patch: Partial<WorkUnitOverrideResponse> = {}): WorkUnitOverrideResponse => {
  const value = overrideFixture(patch);
  value.override.undo = { candidateEventId: candidate.id, canUndo: true, reason: null };
  return value;
};
const historyPage = (
  pageNumber: number,
  results: WorkUnitOverrideHistoryPage['results'],
  count = results.length,
  upToVersion = 4,
): WorkUnitOverrideHistoryPage => ({ count, pageNumber, pageSize: 25, upToVersion, results });
const problem = (type: string, status: number, field?: string): unknown => ({
  response: { status, data: { type: `result:work-unit-override:${type}`, extension: { field } } },
});
const get = vi.mocked(requests.getWorkUnitOverride);
const getHistory = vi.mocked(requests.getWorkUnitOverrideHistory);
const put = vi.mocked(requests.replaceWorkUnitOverride);
const remove = vi.mocked(requests.deleteWorkUnitOverride);
const undo = vi.mocked(requests.undoWorkUnitOverride);
let stores: {
  projectsContext: { reportedProjects: Array<Record<string, unknown>>; fetchProjects: Mock };
  toastContext: { addToast: Mock };
};
let refresh: Mock<() => Promise<void>>;
let onClose: Mock<() => void>;
let queryClient: ReturnType<typeof createQueryWrapper>['queryClient'];
let wrapper: ReturnType<typeof createQueryWrapper>['wrapper'];

beforeEach(() => {
  vi.resetAllMocks();
  contextOrganizationSlug = 'acme';
  ({ queryClient, wrapper } = createQueryWrapper());
  refresh = vi.fn().mockResolvedValue(undefined);
  onClose = vi.fn();
  stores = {
    projectsContext: {
      reportedProjects: [
        {
          id: '22222222-2222-4222-8222-222222222222',
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
    toastContext: { addToast: vi.fn() },
  };
  get.mockResolvedValue(apiResponse(base()));
  put.mockResolvedValue(apiResponse(base({ revision: 9 })));
  undo.mockResolvedValue(apiResponse(base({ revision: 9 })));
});

const open = async (): Promise<RenderHookResult<ReturnType<typeof useWorkUnitOverride>, unknown>> => {
  const view = renderHook(() => useWorkUnitOverride({ isOpen: true, onClose, workUnitId }), { wrapper });
  await waitFor(() => expect(view.result.current.base?.revision).toBe(8));
  return view;
};

describe('correction controller stepwise undo', () => {
  it('populates the TanStack Query cache with the loaded override so a future reader shares one fetch', async () => {
    const loaded = base();
    get.mockResolvedValueOnce(apiResponse(loaded));

    await open();

    expect(queryClient.getQueryData(['workUnitOverride', 'acme', workUnitId])).toEqual(loaded);
  });

  it('evicts a zero-access response from the query cache instead of letting it linger for gcTime', async () => {
    const noAccess = base();
    noAccess.override.permissions = {
      ...noAccess.override.permissions,
      canEdit: false,
      canDelete: false,
      canViewHistory: false,
    };
    get.mockResolvedValueOnce(apiResponse(noAccess));

    const view = renderHook(() => useWorkUnitOverride({ isOpen: true, onClose, workUnitId }), { wrapper });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    expect(queryClient.getQueryData(['workUnitOverride', 'acme', workUnitId])).toBeUndefined();
    expect(view.result.current.base).toBeNull();
  });

  it('captures an immutable exact target/revision/history version and POSTs it once', async () => {
    const pending = deferredResponse<AxiosResponse<WorkUnitOverrideResponse>>();
    undo.mockReturnValueOnce(pending.promise);
    const { result } = await open();

    act(() => result.current.openUndoConfirmation(candidate));
    expect(result.current.undoTarget).toMatchObject({
      request: { expectedRevision: 8, targetEventId: candidate.id },
      historyVersion: 3,
      before: candidate.before,
    });
    const original = result.current.undoTarget;
    act(() => {
      result.current.openUndoConfirmation({ ...candidate, version: 99 });
      void result.current.confirmUndo();
      void result.current.confirmUndo();
      void result.current.save();
    });
    expect(result.current.undoTarget).toEqual(original);
    await waitFor(() => expect(undo).toHaveBeenCalled());
    expect(undo).toHaveBeenCalledExactlyOnceWith('acme', workUnitId, {
      expectedRevision: 8,
      targetEventId: candidate.id,
    });
    expect(put).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(apiResponse(base({ revision: 9 })));
      await pending.promise;
    });
    expect(result.current.mutationAccepted).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not open or confirm when dirty or metadata is null', async () => {
    const { result } = await open();
    act(() => result.current.setTaskId({ mode: 'Set', value: 'unsaved' }));
    act(() => result.current.openUndoConfirmation(candidate));
    expect(result.current.undoTarget).toBeNull();

    const noMetadata = base();
    noMetadata.override.undo = null;
    get.mockResolvedValueOnce(apiResponse(noMetadata));
    const view = renderHook(() => useWorkUnitOverride({ isOpen: true, onClose, workUnitId: 'other' }), { wrapper });
    await waitFor(() => expect(view.result.current.base).not.toBeNull());
    act(() => view.result.current.openUndoConfirmation(candidate));
    await act(async () => view.result.current.confirmUndo());
    expect(view.result.current.undoTarget).toBeNull();
    expect(undo).not.toHaveBeenCalled();
  });

  it('rejects a mismatched, reverted, future-operation or permission-denied history card', async () => {
    const { result } = await open();
    const attempts: WorkUnitOverrideHistoryEntry[] = [
      { ...candidate, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
      {
        ...candidate,
        revertedBy: {
          eventId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          actor: candidate.actor,
          changedAt: candidate.changedAt,
        },
      },
      { ...candidate, operation: 'FutureMerge' },
    ];
    for (const entry of attempts) {
      act(() => result.current.openUndoConfirmation(entry));
      expect(result.current.undoTarget).toBeNull();
    }
    const current = result.current.base;
    if (!current) throw new Error('Expected the fresh override DTO');
    current.override.permissions.canEdit = false;
    act(() => result.current.openUndoConfirmation(candidate));
    await act(async () => result.current.confirmUndo());
    expect(undo).not.toHaveBeenCalled();
  });

  it('records a lost-response undo when target evidence is found on page two', async () => {
    undo.mockRejectedValueOnce(new Error('response lost'));
    const fresh = base({ revision: 9 });
    fresh.override.version = 4;
    fresh.override.undo = { candidateEventId: null, canUndo: false, reason: 'NoCorrection' };
    const pageOne = Array.from({ length: 25 }, (_, index) => ({
      ...candidate,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      version: 29 - index,
    }));
    const reversal = {
      ...candidate,
      id: '99999999-9999-4999-8999-999999999999',
      version: 4,
      operation: 'Undo' as const,
      revertsEventId: candidate.id,
    };
    getHistory
      .mockResolvedValueOnce(apiResponse(historyPage(1, pageOne, 26)))
      .mockResolvedValueOnce(apiResponse(historyPage(2, [reversal], 26)));
    const { result } = await open();
    get.mockResolvedValueOnce(apiResponse(fresh));

    act(() => result.current.openUndoConfirmation(candidate));
    await act(async () => result.current.confirmUndo());

    expect(getHistory).toHaveBeenNthCalledWith(1, 'acme', workUnitId, 4, 1);
    expect(getHistory).toHaveBeenNthCalledWith(2, 'acme', workUnitId, 4, 2);
    expect(result.current.base?.revision).toBe(9);
    expect(result.current.mutationAccepted).toBe(true);
    expect(result.current.conflict).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the exact original intent for notObserved and never retries the mutation automatically', async () => {
    undo.mockRejectedValueOnce(new Error('timeout'));
    const fresh = base({ revision: 9 });
    fresh.override.version = 4;
    const { result } = await open();
    get.mockResolvedValueOnce(apiResponse(fresh));
    getHistory.mockResolvedValueOnce(apiResponse(historyPage(1, [{ ...candidate, version: 3 }])));

    act(() => result.current.openUndoConfirmation(candidate));
    await act(async () => result.current.confirmUndo());

    expect(result.current.conflict?.intent).toEqual({
      kind: 'undo',
      request: { expectedRevision: 8, targetEventId: candidate.id },
      historyVersion: 3,
    });
    expect(result.current.conflict?.reason).toBe('uncertain');
    expect(undo).toHaveBeenCalledTimes(1);
    expect(result.current.undoTarget).toBeNull();
  });

  it('keeps unresolved uncertainty behind a read-only retry and does not issue another POST', async () => {
    undo.mockRejectedValueOnce(new Error('timeout'));
    getHistory.mockRejectedValueOnce(new Error('history offline'));
    const { result } = await open();

    act(() => result.current.openUndoConfirmation(candidate));
    await act(async () => result.current.confirmUndo());
    expect(result.current.conflict).toBeNull();
    expect(result.current.submitError).toBe('reports.override.error.uncertain');

    getHistory.mockResolvedValueOnce(apiResponse(historyPage(1, [{ ...candidate, version: 3 }], 1, 3)));
    await act(async () => result.current.retryFreshLoad());
    expect(undo).toHaveBeenCalledTimes(1);
    expect(result.current.conflict?.reason).toBe('uncertain');
  });

  it('refreshes a stale 409 for review without replaying or opening a new-head confirmation', async () => {
    undo.mockRejectedValueOnce(problem('stale-undo-target', 409));
    const current = base({ revision: 12 });
    current.override.undo = {
      candidateEventId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      canUndo: true,
      reason: null,
    };
    const { result } = await open();
    get.mockResolvedValueOnce(apiResponse(current));

    act(() => result.current.openUndoConfirmation(candidate));
    await act(async () => result.current.confirmUndo());

    expect(result.current.conflict?.reason).toBe('conflict');
    expect(result.current.conflict?.intent.kind).toBe('undo');
    expect(result.current.undoTarget).toBeNull();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(getHistory).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid-request', 400, false],
    ['forbidden', 403, true],
    ['work-unit-not-found', 404, true],
  ] as const)('handles definitive %s (%s) without reconciliation', async (kind, status, closes) => {
    undo.mockRejectedValueOnce(problem(kind, status));
    const { result } = await open();
    act(() => result.current.openUndoConfirmation(candidate));
    await act(async () => result.current.confirmUndo());

    expect(getHistory).not.toHaveBeenCalled();
    expect(undo).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(closes ? 1 : 0);
    expect(closes || Boolean(result.current.submitError ?? result.current.fieldErrors.form)).toBe(true);
  });

  it('blocks undo while a source refresh is required and keeps it blocked after refresh failure', async () => {
    const { result } = await open();
    get.mockRejectedValueOnce(new Error('source refresh failed'));
    await act(async () => result.current.refreshAfterSourceSave());
    expect(result.current.undoDisabled).toBe(true);
    act(() => result.current.openUndoConfirmation(candidate));
    await act(async () => result.current.confirmUndo());
    expect(undo).not.toHaveBeenCalled();
  });

  it('invalidates retained undo callbacks across worklog and organization changes', async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useWorkUnitOverride({ isOpen: true, workUnitId: id, onClose }),
      { initialProps: { id: workUnitId }, wrapper },
    );
    await waitFor(() => expect(result.current.base).not.toBeNull());
    act(() => result.current.openUndoConfirmation(candidate));
    const old = result.current;
    rerender({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    contextOrganizationSlug = 'other';
    await act(async () => {
      await old.confirmUndo();
      old.cancelUndo();
      old.openUndoConfirmation(candidate);
    });
    expect(undo).not.toHaveBeenCalled();
  });

  it('does not adopt a stale in-flight response from an abandoned session on fast close+reopen', async () => {
    const stale = deferredResponse<AxiosResponse<WorkUnitOverrideResponse>>();
    const fresh = base({ revision: 9 });
    get.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(apiResponse(fresh));
    const { result, rerender } = renderHook(({ isOpen }) => useWorkUnitOverride({ isOpen, workUnitId, onClose }), {
      initialProps: { isOpen: true },
      wrapper,
    });

    rerender({ isOpen: false });
    rerender({ isOpen: true });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.base?.revision).toBe(9));

    await act(async () => {
      stale.resolve(apiResponse(base({ revision: 8 })));
      await stale.promise;
    });
    expect(result.current.base?.revision).toBe(9);
  });

  it('invalidates retained undo callbacks after close and reopening the same worklog', async () => {
    const { result, rerender } = renderHook(({ isOpen }) => useWorkUnitOverride({ isOpen, workUnitId, onClose }), {
      initialProps: { isOpen: true },
      wrapper,
    });
    await waitFor(() => expect(result.current.base).not.toBeNull());
    act(() => result.current.openUndoConfirmation(candidate));
    const old = result.current;
    act(() => old.close());
    rerender({ isOpen: false });
    rerender({ isOpen: true });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await act(async () => old.confirmUndo());
    expect(undo).not.toHaveBeenCalled();
  });

  it('preserves the save conflict proposal lifecycle separately from undo', async () => {
    put.mockRejectedValueOnce(problem('stale-revision', 409));
    const { result } = await open();
    get.mockResolvedValueOnce(apiResponse(base({ revision: 12 })));
    act(() => result.current.setTaskId({ mode: 'Set', value: 'proposal' }));
    await act(async () => result.current.save());

    expect(result.current.conflict?.intent.kind).toBe('save');
    expect(result.current.draft.taskId).toEqual({ mode: 'Set', value: 'proposal' });
    act(() => result.current.reviewAndReapply());
    await act(async () => result.current.save());
    expect(put.mock.calls[1]?.[2].expectedRevision).toBe(12);
  });
});
