import api from '@/core/api/Api';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { invitationQueryKey, invitationsQueryKey } from '../queryKeys';
import { useInvitationQuery } from './useInvitationQuery';
import { useInvitationsQuery } from './useInvitationsQuery';

vi.mock('@/core/api/Api', () => ({ default: { get: vi.fn() } }));
const dto = {
  id: '17d1bb14-4509-4030-932e-6cffcab68299',
  email: 'anna@example.com',
  firstName: 'Anna',
  lastName: 'Kowalska',
  roles: ['Employee'],
  protocolVersion: 2,
  revision: '1',
  status: 'Pending',
  expiresAt: null,
  delivery: { status: 'NotSent', lastAttemptAt: null, retryAfterSeconds: 0 },
  createdAt: '2026-10-01T00:00:00Z',
  modifiedAt: '2026-10-01T00:00:00Z',
};
const page = { count: 1, results: [dto], featureEnabled: false };
const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client }, children);
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => client.clear());

describe('invitation queries', () => {
  it('reads list capabilities and fresh details into distinct scoped keys', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: page }).mockResolvedValueOnce({ data: dto });
    const { result } = renderHook(
      () => ({ list: useInvitationsQuery('acme'), detail: useInvitationQuery('acme', dto.id) }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    expect(result.current.list.data).toEqual(page);
    expect(client.getQueryData(invitationsQueryKey('acme'))).toEqual(page);
    expect(client.getQueryData(invitationQueryKey('acme', dto.id))).toEqual(dto);
    expect(client.getQueryData(invitationQueryKey('other', dto.id))).toBeUndefined();
  });
  it('refreshes a delivery in progress and stops once its final outcome is known', async () => {
    vi.useFakeTimers();
    const sending = { ...page, results: [{ ...dto, delivery: { ...dto.delivery, status: 'Started' } }] };
    const failed = { ...page, results: [{ ...dto, delivery: { ...dto.delivery, status: 'Failed' } }] };
    vi.mocked(api.get).mockResolvedValueOnce({ data: sending }).mockResolvedValue({ data: failed });
    const { result, unmount } = renderHook(() => useInvitationsQuery('acme'), { wrapper });
    try {
      await act(() => vi.advanceTimersByTimeAsync(10));
      expect(result.current.data?.results[0].delivery.status).toBe('Started');
      focusManager.setFocused(false);
      await act(() => vi.advanceTimersByTimeAsync(6_000));
      expect(api.get).toHaveBeenCalledTimes(1);
      focusManager.setFocused(true);
      await act(() => vi.advanceTimersByTimeAsync(2_000));
      expect(result.current.data?.results[0].delivery.status).toBe('Failed');
      await act(() => vi.advanceTimersByTimeAsync(6_000));
      expect(api.get).toHaveBeenCalledTimes(2);
    } finally {
      unmount();
      focusManager.setFocused(undefined);
      vi.useRealTimers();
    }
  });
  it('does not fetch missing scope or selection', () => {
    renderHook(() => ({ list: useInvitationsQuery(''), detail: useInvitationQuery('acme', '') }), { wrapper });
    expect(api.get).not.toHaveBeenCalled();
  });
  it('cancels the previous organization read and never displays it after switching', async () => {
    const old = deferred<{ data: typeof page }>();
    vi.mocked(api.get)
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce({ data: { ...page, count: 0, results: [] } });
    const { result, rerender } = renderHook(({ slug }) => useInvitationsQuery(slug), {
      wrapper,
      initialProps: { slug: 'acme' },
    });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(api).get.mock.calls[0][1]?.signal;
    rerender({ slug: 'other' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      old.resolve({ data: page });
      await old.promise;
    });
    expect(result.current.data?.count).toBe(0);
    expect(client.getQueryData(invitationsQueryKey('acme'))).toBeUndefined();
  });
  it('does not restore a cleared logout cache when a pending read resolves', async () => {
    const pending = deferred<{ data: typeof dto }>();
    vi.mocked(api.get).mockImplementationOnce(() => pending.promise);
    const { unmount } = renderHook(() => useInvitationQuery('acme', dto.id), { wrapper });
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    unmount();
    client.clear();
    await act(async () => {
      pending.resolve({ data: dto });
      await pending.promise;
    });
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
