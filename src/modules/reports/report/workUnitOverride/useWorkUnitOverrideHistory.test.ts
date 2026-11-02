import {
  WorkUnitOverrideHistoryEntrySchema,
  type WorkUnitOverrideHistoryEntry,
  type WorkUnitOverrideHistoryPage,
} from '@/modules/reports/models/workUnitOverride.model';
import { createElement, type ReactElement, type ReactNode } from 'react';
import type { AxiosResponse } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createQueryWrapper } from './overrideTestFixtures';
import { getWorkUnitOverrideHistory } from './requests';
import { useWorkUnitOverrideHistory, type OverrideHistoryOptions } from './useWorkUnitOverrideHistory';

vi.mock('./requests', () => ({ getWorkUnitOverrideHistory: vi.fn() }));
const workspaceContext = { contextOrganizationSlug: 'acme' };
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => workspaceContext,
}));
const get = vi.mocked(getWorkUnitOverrideHistory);
let wrapper: ReturnType<typeof createQueryWrapper>['wrapper'];
const entry = (version: number): WorkUnitOverrideHistoryEntry =>
  WorkUnitOverrideHistoryEntrySchema.parse({
    id: `${String(version).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
    version,
    operation: 'FutureOperation',
    provenance: 'FutureProvenance',
    actor: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', displayName: 'Manager' },
    changedAt: '2026-09-17T08:00:00Z',
    before: null,
    after: null,
    legacyBefore: null,
    legacyAfter: null,
  });
const page = (
  versions: number[],
  pageNumber = 1,
  count = versions.length,
  upToVersion = 30,
): AxiosResponse<WorkUnitOverrideHistoryPage> =>
  ({
    data: { results: versions.map(entry), pageNumber, count, upToVersion, pageSize: 25 },
  }) as AxiosResponse<WorkUnitOverrideHistoryPage>;
const deferred = (): {
  promise: Promise<AxiosResponse<WorkUnitOverrideHistoryPage>>;
  resolve: (value: AxiosResponse<WorkUnitOverrideHistoryPage>) => void;
} => {
  let resolve!: (value: AxiosResponse<WorkUnitOverrideHistoryPage>) => void;
  const promise = new Promise<AxiosResponse<WorkUnitOverrideHistoryPage>>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
const props = (): OverrideHistoryOptions => ({
  isOpen: true,
  canViewHistory: true,
  hasHistory: true,
  currentVersion: 30,
  organizationSlug: 'acme',
  workUnitId: 'unit-1',
  resetKey: 0,
  handleError: vi.fn(() => false),
});
beforeEach(() => {
  vi.resetAllMocks();
  ({ wrapper } = createQueryWrapper());
  workspaceContext.contextOrganizationSlug = 'acme';
  get.mockResolvedValue(page([]));
});

it.each(['worklog', 'organization', 'reopen'] as const)(
  'does not let retained pagination/retry enter the new %s history session',
  async (change) => {
    get.mockResolvedValueOnce(page([30], 1, 26));
    const initial = props();
    const { result, rerender } = renderHook(useWorkUnitOverrideHistory, { initialProps: initial, wrapper });
    await waitFor(() => expect(result.current.entries.map((item) => item.version)).toEqual([30]));
    const old = result.current;
    get.mockResolvedValueOnce(page([20], 1, 26, 20));
    if (change === 'reopen') rerender({ ...initial, isOpen: false });
    if (change === 'organization') workspaceContext.contextOrganizationSlug = 'other';
    rerender({
      ...initial,
      currentVersion: 20,
      workUnitId: change === 'worklog' ? 'unit-2' : initial.workUnitId,
      organizationSlug: change === 'organization' ? 'other' : initial.organizationSlug,
    });
    await waitFor(() => expect(result.current.entries.map((item) => item.version)).toEqual([20]));
    get.mockResolvedValue(page([19], 2, 26, 20));
    await act(async () => {
      await old.loadMore();
      await old.retry();
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.current.entries.map((item) => item.version)).toEqual([20]);
    await act(async () => result.current.loadMore());
    expect(get).toHaveBeenLastCalledWith(
      change === 'organization' ? 'other' : 'acme',
      change === 'worklog' ? 'unit-2' : 'unit-1',
      20,
      2,
    );
    expect(result.current.entries.map((item) => item.version)).toEqual([20, 19]);
  },
);

it('blocks history pagination when the live organization changes before React rerenders', async () => {
  get.mockResolvedValueOnce(page([30], 1, 26));
  const { result } = renderHook(useWorkUnitOverrideHistory, { initialProps: props(), wrapper });
  await waitFor(() => expect(result.current.entries).toHaveLength(1));
  const old = result.current;
  workspaceContext.contextOrganizationSlug = 'other';
  await act(async () => {
    await old.loadMore();
    await old.retry();
  });
  expect(get).toHaveBeenCalledTimes(1);
  expect(result.current.entries.map((item) => item.version)).toEqual([30]);
});

it('ignores a pending history page when the live organization changes before React rerenders', async () => {
  get.mockResolvedValueOnce(page([30], 1, 26));
  const { result } = renderHook(useWorkUnitOverrideHistory, { initialProps: props(), wrapper });
  await waitFor(() => expect(result.current.entries).toHaveLength(1));
  const pending = deferred();
  get.mockReturnValueOnce(pending.promise);
  let loading!: Promise<void>;
  act(() => {
    loading = result.current.loadMore();
  });
  workspaceContext.contextOrganizationSlug = 'other';
  await act(async () => {
    pending.resolve(page([29], 2, 26));
    await loading;
  });
  expect(result.current.entries.map((item) => item.version)).toEqual([30]);
});

it('loads only when open and permitted, and uses hasHistory instead of positive version', async () => {
  const initial = props();
  initial.isOpen = false;
  const { result, rerender } = renderHook(useWorkUnitOverrideHistory, { initialProps: initial, wrapper });
  expect(get).not.toHaveBeenCalled();
  rerender({ ...initial, isOpen: true, canViewHistory: false });
  expect(get).not.toHaveBeenCalled();
  rerender({ ...initial, isOpen: true, hasHistory: false });
  expect(get).not.toHaveBeenCalled();
  expect(result.current.totalCount).toBe(0);
  rerender({ ...initial, isOpen: true });
  await waitFor(() => expect(get).toHaveBeenCalledExactlyOnceWith('acme', 'unit-1', 30, 1));
});

it('pins the entire pagination session, deduplicates, sorts newest first and retries failed page', async () => {
  get.mockResolvedValueOnce(page([28, 30], 1, 27));
  const initial = props();
  const { result, rerender } = renderHook(useWorkUnitOverrideHistory, { initialProps: initial, wrapper });
  await waitFor(() => expect(result.current.entries).toHaveLength(2));
  const retained = result.current;
  rerender({ ...initial, currentVersion: 35 });
  get.mockRejectedValueOnce(new Error('offline'));
  await act(async () => retained.loadMore());
  expect(result.current.error).toBe(true);
  get.mockResolvedValueOnce(page([28, 27], 2, 27));
  await act(async () => retained.retry());
  expect(get).toHaveBeenLastCalledWith('acme', 'unit-1', 30, 2);
  expect(result.current.entries.map((value) => value.version)).toEqual([30, 28, 27]);
  expect(result.current.hasMore).toBe(false);
});

it.each(['organizationSlug', 'workUnitId', 'isOpen', 'canViewHistory', 'unmount'] as const)(
  'ignores late history after %s changes',
  async (change) => {
    const pending = deferred();
    get.mockReturnValueOnce(pending.promise);
    const initial = props();
    const { result, rerender, unmount } = renderHook(useWorkUnitOverrideHistory, { initialProps: initial, wrapper });
    if (change === 'unmount') unmount();
    else
      rerender({
        ...initial,
        [change]: change === 'isOpen' || change === 'canViewHistory' ? false : 'other',
      });
    await act(async () => {
      pending.resolve(page([30]));
      await pending.promise;
    });
    expect(result.current.entries).toEqual([]);
  },
);

it('coalesces a resetKey session sharing organization/work unit/pinned version with the still-loading prior one', async () => {
  // Unlike the other "ignores late history" cases, a resetKey-only change keeps the query key
  // (org, workUnitId, upToVersion, page) identical to the still-loading prior session's, so the
  // cache shares the single in-flight request instead of firing a second one. The new session is
  // not stale here -- the shared response is its own legitimate page, so it must be adopted.
  const pending = deferred();
  get.mockReturnValueOnce(pending.promise);
  const initial = props();
  const { result, rerender } = renderHook(useWorkUnitOverrideHistory, { initialProps: initial, wrapper });
  rerender({ ...initial, resetKey: 1 });
  await act(async () => {
    pending.resolve(page([30]));
    await pending.promise;
  });
  expect(get).toHaveBeenCalledTimes(1);
  expect(result.current.entries.map((item) => item.version)).toEqual([30]);
});

it('clears cached history on 403 even if the owner still renders the same worklog', async () => {
  get.mockResolvedValueOnce(page([30], 1, 26));
  const initial = props();
  const { result } = renderHook(useWorkUnitOverrideHistory, { initialProps: initial, wrapper });
  await waitFor(() => expect(result.current.entries).toHaveLength(1));
  const forbidden = { response: { status: 403 } };
  get.mockRejectedValueOnce(forbidden);
  await act(async () => result.current.loadMore());
  expect(initial.handleError).toHaveBeenCalledWith(forbidden);
  expect(result.current.entries).toEqual([]);
  await act(async () => result.current.retry());
  expect(get).toHaveBeenCalledTimes(2);
});

it('does not silently retry a terminal 403 before session-end fires, even with retries enabled by default', async () => {
  // createQueryWrapper hardcodes retry: false on the whole client, which would mask a regression
  // in this hook's own retry: false override on fetchQuery. This test instead mirrors the shared
  // queryClient's real default (retry: 1), so a dropped override would surface as a second call.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
  const wrapperWithDefaultRetry = ({ children }: { children: ReactNode }): ReactElement =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  get.mockRejectedValueOnce({ response: { status: 403 } });
  const initial = props();
  renderHook(useWorkUnitOverrideHistory, { initialProps: initial, wrapper: wrapperWithDefaultRetry });
  await waitFor(() => expect(initial.handleError).toHaveBeenCalledTimes(1));
  expect(get).toHaveBeenCalledTimes(1);
});

it('guards synchronous duplicate page requests and rejects changed response bounds', async () => {
  const pending = deferred();
  get.mockReturnValueOnce(pending.promise);
  const { result } = renderHook(useWorkUnitOverrideHistory, { initialProps: props(), wrapper });
  act(() => {
    void result.current.loadMore();
    void result.current.retry();
  });
  expect(get).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve(page([31], 1, 1, 31));
    await pending.promise;
  });
  expect(result.current.entries).toEqual([]);
  expect(result.current.error).toBe(true);
});
