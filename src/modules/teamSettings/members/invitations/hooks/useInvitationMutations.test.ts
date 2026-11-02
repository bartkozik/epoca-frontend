import api from '@/core/api/Api';
import { OrganizationUserRole } from '@/core/models/enums';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { invitationQueryKey, invitationsQueryKey } from '../queryKeys';
import { useCancelInvitationMutation } from './useCancelInvitationMutation';
import { useCreateInvitationMutation } from './useCreateInvitationMutation';
import { useResendInvitationMutation } from './useResendInvitationMutation';
import { useUpdateInvitationMutation } from './useUpdateInvitationMutation';

vi.mock('@/core/api/Api', () => ({ default: { post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
const input = {
  firstName: 'Anna',
  lastName: 'Kowalska',
  email: 'anna@example.com',
  role: OrganizationUserRole.Employee,
  locale: 'pl' as const,
};
const dto = {
  id: '17d1bb14-4509-4030-932e-6cffcab68299',
  email: input.email,
  firstName: input.firstName,
  lastName: input.lastName,
  roles: ['Employee'],
  protocolVersion: 2,
  revision: '2',
  status: 'Pending',
  expiresAt: null,
  delivery: { status: 'Unknown', lastAttemptAt: null, retryAfterSeconds: 0 },
  createdAt: '2026-10-01T00:00:00Z',
  modifiedAt: '2026-10-01T00:00:00Z',
};
const timeout = { isAxiosError: true, code: 'ECONNABORTED' };
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
const postKey = (index: number): unknown => vi.mocked(api).post.mock.calls[index][2]?.headers?.['Idempotency-Key'];
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { mutations: { retry: 2, retryDelay: 0 } } });
});
afterEach(() => client.clear());

describe('invitation mutations', () => {
  it('reuses a UUID for manual timeout retry of the same parsed create payload', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(timeout).mockResolvedValueOnce({ data: dto });
    const { result } = renderHook(() => useCreateInvitationMutation(), { wrapper });
    await expect(result.current.mutateAsync({ organizationSlug: 'acme', input })).rejects.toMatchObject({
      kind: 'timeout',
    });
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.mutateAsync({ organizationSlug: 'acme', input: { ...input, firstName: ' Anna ' } });
    });
    expect(postKey(0)).toMatch(/^[0-9a-f-]{36}$/);
    expect(postKey(1)).toBe(postKey(0));
    await waitFor(() => expect(result.current.data?.delivery.status).toBe('Unknown'));
  });
  it('uses a new key when payload, scope, or explicit logical attempt changes', async () => {
    vi.mocked(api.post).mockRejectedValue(timeout);
    const { result } = renderHook(() => useCreateInvitationMutation(), { wrapper });
    const attempts = [
      { organizationSlug: 'acme', input },
      { organizationSlug: 'acme', input: { ...input, lastName: 'Changed' } },
      { organizationSlug: 'other', input },
      { organizationSlug: 'other', input, attemptId: 'new-dialog' },
    ];
    for (const variables of attempts)
      await expect(result.current.mutateAsync(variables)).rejects.toMatchObject({ kind: 'timeout' });
    expect(new Set(attempts.map((_, index) => postKey(index))).size).toBe(4);
  });
  it('starts a new logical create after a confirmed success', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: dto });
    const { result } = renderHook(() => useCreateInvitationMutation(), { wrapper });
    await result.current.mutateAsync({ organizationSlug: 'acme', input });
    await result.current.mutateAsync({ organizationSlug: 'acme', input });
    expect(postKey(1)).not.toBe(postKey(0));
  });
  it('reuses a resend key after transport uncertainty while retaining expectedRevision', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ isAxiosError: true }).mockResolvedValueOnce({ data: dto });
    const { result } = renderHook(() => useResendInvitationMutation(), { wrapper });
    const variables = {
      organizationSlug: 'acme',
      invitationId: dto.id,
      input: { expectedRevision: '9007199254740993', firstName: 'Anna' },
    };
    await expect(result.current.mutateAsync(variables)).rejects.toMatchObject({ kind: 'transport' });
    await result.current.mutateAsync(variables);
    expect(postKey(1)).toBe(postKey(0));
    expect(vi.mocked(api.post).mock.calls[1][1]).toEqual(variables.input);
  });
  it('retains the full conflicting draft and never automatically retries a revision conflict', async () => {
    vi.mocked(api.patch).mockRejectedValue({
      isAxiosError: true,
      response: { status: 409, data: { type: 'result:invitation:revision-conflict', detail: 'secret' } },
    });
    const { result } = renderHook(() => useUpdateInvitationMutation(), { wrapper });
    const variables = {
      organizationSlug: 'acme',
      invitationId: dto.id,
      input: { expectedRevision: '1', firstName: 'Draft', role: OrganizationUserRole.Manager },
    };
    await expect(result.current.mutateAsync(variables)).rejects.toEqual({ kind: 'revision-conflict', status: 409 });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.variables).toEqual(variables);
    expect(api.patch).toHaveBeenCalledTimes(1);
  });
  it('invalidates only the submitted organization and detail, without inserting response data', async () => {
    const old = { ...dto, revision: '1' };
    client.setQueryData(invitationsQueryKey('acme'), [old]);
    client.setQueryData(invitationQueryKey('acme', dto.id), old);
    client.setQueryData(invitationsQueryKey('other'), []);
    vi.mocked(api.patch).mockResolvedValue({ data: dto });
    const { result } = renderHook(() => useUpdateInvitationMutation(), { wrapper });
    await result.current.mutateAsync({
      organizationSlug: 'acme',
      invitationId: dto.id,
      input: { expectedRevision: '1' },
    });
    expect(client.getQueryState(invitationsQueryKey('acme'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(invitationQueryKey('acme', dto.id))?.isInvalidated).toBe(true);
    expect(client.getQueryState(invitationsQueryKey('other'))?.isInvalidated).toBe(false);
    expect(client.getQueryData(invitationQueryKey('acme', dto.id))).toEqual(old);
  });
  it('cancels with CAS and invalidates scoped existing queries', async () => {
    client.setQueryData(invitationsQueryKey('acme'), [dto]);
    vi.mocked(api.delete).mockResolvedValue({ data: undefined });
    const { result } = renderHook(() => useCancelInvitationMutation(), { wrapper });
    await result.current.mutateAsync({
      organizationSlug: 'acme',
      invitationId: dto.id,
      input: { expectedRevision: '2' },
    });
    expect(client.getQueryState(invitationsQueryKey('acme'))?.isInvalidated).toBe(true);
    expect(api.delete).toHaveBeenCalledTimes(1);
  });
  it('cannot insert old data after organization switch, unmount and logout cache clear', async () => {
    const pending = deferred<{ data: typeof dto }>();
    vi.mocked(api.post).mockImplementationOnce(() => pending.promise);
    const { result, unmount } = renderHook(() => useCreateInvitationMutation(), { wrapper });
    const promise = result.current.mutateAsync({ organizationSlug: 'acme', input });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    unmount();
    client.clear();
    client.setQueryData(invitationsQueryKey('other'), []);
    pending.resolve({ data: dto });
    await promise;
    expect(client.getQueryData(invitationQueryKey('acme', dto.id))).toBeUndefined();
    expect(client.getQueryData(invitationsQueryKey('acme'))).toBeUndefined();
    expect(client.getQueryState(invitationsQueryKey('other'))?.isInvalidated).toBe(false);
  });
});
