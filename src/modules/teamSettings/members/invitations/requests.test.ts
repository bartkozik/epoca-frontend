import api from '@/core/api/Api';
import { OrganizationUserRole } from '@/core/models/enums';
import * as requests from './requests';

vi.mock('@/core/api/Api', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
const id = '17d1bb14-4509-4030-932e-6cffcab68299';
const key = '6905f6e7-f3ca-4bbd-a303-7456ee1b5684';
const input = {
  firstName: ' Anna ',
  lastName: 'Kowalska',
  email: ' anna@example.com ',
  role: OrganizationUserRole.Employee,
  locale: 'pl' as const,
};
const dto = {
  id,
  email: 'anna@example.com',
  firstName: 'Anna',
  lastName: 'Kowalska',
  roles: ['Employee'],
  protocolVersion: 2,
  revision: '9007199254740993',
  status: 'Pending',
  expiresAt: null,
  delivery: { status: 'Failed', lastAttemptAt: null, retryAfterSeconds: 0 },
  createdAt: '2026-10-01T00:00:00Z',
  modifiedAt: '2026-10-01T00:00:00Z',
};
const page = { count: 1, results: [dto], featureEnabled: true };

beforeEach(() => vi.resetAllMocks());
describe('invitation transport boundary', () => {
  it('sends a strict parsed V2 create with its UUID key and preserves failed delivery as a DTO fact', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { ...dto, tokenHash: 'secret' } });
    expect(await requests.createInvitation('a/b', input, key)).toEqual(dto);
    expect(api.post).toHaveBeenCalledWith(
      '/organizations/a%2Fb/invitations',
      { ...input, firstName: 'Anna', email: 'anna@example.com' },
      expect.objectContaining({
        params: { version: 2 },
        headers: { 'Idempotency-Key': key },
        skipConnectionErrorToast: true,
      }),
    );
  });
  it('rejects invalid input before touching the API and exposes no raw validation error', async () => {
    await expect(requests.createInvitation('acme', { ...input, email: 'secret-invalid' }, key)).rejects.toEqual({
      kind: 'invalid-input',
      status: null,
    });
    await expect(requests.createInvitation('acme', input, 'bad-key')).rejects.toEqual({
      kind: 'invalid-input',
      status: null,
    });
    expect(api.post).not.toHaveBeenCalled();
  });
  it('uses encoded detail paths and preserves decimal revisions for patch, resend and cancel', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: dto });
    vi.mocked(api.patch).mockResolvedValue({ data: dto });
    vi.mocked(api.post).mockResolvedValue({ data: dto });
    vi.mocked(api.delete).mockResolvedValue({ data: undefined });
    const patch = { expectedRevision: dto.revision, firstName: 'Anna' };
    await requests.getInvitation('a/b', 'id/?');
    await requests.updateInvitation('a/b', 'id/?', patch);
    await requests.resendInvitation('a/b', 'id/?', patch, key);
    await requests.cancelInvitation('a/b', 'id/?', { expectedRevision: dto.revision });
    expect(api.get).toHaveBeenCalledWith(
      '/organizations/a%2Fb/invitations/id%2F%3F',
      expect.objectContaining({ params: { version: 2 } }),
    );
    expect(api.patch).toHaveBeenCalledWith(
      '/organizations/a%2Fb/invitations/id%2F%3F',
      patch,
      expect.objectContaining({ params: { version: 2 } }),
    );
    expect(api.post).toHaveBeenCalledWith(
      '/organizations/a%2Fb/invitations/id%2F%3F/resend',
      patch,
      expect.objectContaining({ headers: { 'Idempotency-Key': key } }),
    );
    expect(api.delete).toHaveBeenCalledWith(
      '/organizations/a%2Fb/invitations/id%2F%3F',
      expect.objectContaining({ params: { version: 2, expectedRevision: dto.revision } }),
    );
  });
  it('reads every page and preserves server count and capability', async () => {
    const signal = new AbortController().signal;
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { ...page, count: 401, results: Array.from({ length: 200 }, () => dto) } })
      .mockResolvedValueOnce({ data: { ...page, count: 401, results: Array.from({ length: 200 }, () => dto) } })
      .mockResolvedValueOnce({ data: { ...page, count: 401 } });
    const result = await requests.listAllInvitations('acme', signal);
    expect(result).toMatchObject({ count: 401, featureEnabled: true });
    expect(result.results).toHaveLength(401);
    expect(api.get).toHaveBeenNthCalledWith(
      3,
      '/organizations/acme/invitations',
      expect.objectContaining({ params: { version: 2, pageSize: 200, pageNumber: 3 }, signal }),
    );
  });
  it('bounds traversal even when empty pages disagree with server count', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...page, count: 401, results: [] } });
    expect(await requests.listAllInvitations('acme')).toEqual({ ...page, count: 401, results: [] });
    expect(api.get).toHaveBeenCalledTimes(3);
  });
  it('bounds traversal by the initial count even when server count grows', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: { ...page, count: 201 } })
      .mockResolvedValue({ data: { ...page, count: 10000 } });
    const result = await requests.listAllInvitations('acme');
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(result.count).toBe(10000);
  });
  it('honors cancellation before requesting another page', async () => {
    const controller = new AbortController();
    vi.mocked(api.get).mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve({ data: { ...page, count: 201 } });
    });
    await expect(requests.listAllInvitations('acme', controller.signal)).rejects.toMatchObject({ kind: 'cancelled' });
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['revision-conflict', 'revision-conflict', 409],
    ['idempotency-conflict', 'idempotency-conflict', 409],
    ['identity-conflict', 'identity-conflict', 409],
    ['already-member', 'already-member', 409],
    ['invitation-already-exists', 'already-exists', 409],
    ['invitation-not-pending', 'not-pending', 409],
    ['feature-disabled', 'disabled', 503],
    ['not-found', 'not-found', 404],
    ['rate-limited', 'rate-limited', 429],
    ['invalid-request', 'invalid-input', 400],
    ['unknown', 'forbidden', 403],
  ])('normalizes %s without leaking error bodies', async (type, kind, status) => {
    vi.mocked(api.get).mockRejectedValue({
      isAxiosError: true,
      response: { status, data: { type: `result:invitation:${type}`, detail: 'secret', token: 'secret' } },
    });
    await expect(requests.getInvitation('acme', id)).rejects.toEqual({ kind, status });
  });
  it('returns only a safe timeout outcome', async () => {
    vi.mocked(api.get).mockRejectedValue({ isAxiosError: true, code: 'ECONNABORTED', config: { data: 'secret' } });
    await expect(requests.getInvitation('acme', id)).rejects.toEqual({ kind: 'timeout', status: null });
  });
  it('returns only a safe transport outcome', async () => {
    vi.mocked(api.get).mockRejectedValue({ isAxiosError: true, config: { data: 'secret' } });
    await expect(requests.getInvitation('acme', id)).rejects.toEqual({ kind: 'transport', status: null });
  });
  it('returns no raw Zod error for malformed responses', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { secret: 'secret' } });
    await expect(requests.getInvitation('acme', id)).rejects.toEqual({ kind: 'unexpected', status: null });
  });
});

// Treat the upstream type as data, never as an inherited property of the lookup object.
it.each(['__proto__', 'constructor', 'toString'])('normalizes unrecognized problem type %s safely', async (type) => {
  vi.mocked(api.get).mockRejectedValue({
    isAxiosError: true,
    response: { status: 500, data: { type, detail: 'secret' } },
  });
  await expect(requests.getInvitation('acme', id)).rejects.toEqual({ kind: 'unexpected', status: 500 });
});

it.each(['0', '120', 30])('preserves a validated rate-limit delay %s', async (delay) => {
  vi.mocked(api.get).mockRejectedValue({
    isAxiosError: true,
    response: { status: 429, headers: { 'retry-after': delay }, data: { type: 'result:invitation:rate-limited' } },
  });
  await expect(requests.getInvitation('acme', id)).rejects.toEqual({
    kind: 'rate-limited',
    status: 429,
    retryAfterSeconds: Number(delay),
  });
});
it.each([undefined, '-1', 'NaN', 'Infinity', '1e3', '999999999999999999999999999', 'secret'])(
  'ignores an invalid rate-limit delay %s',
  async (delay) => {
    vi.mocked(api.get).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 429,
        headers: { 'retry-after': delay },
        data: { type: 'result:invitation:rate-limited', detail: 'secret' },
      },
    });
    await expect(requests.getInvitation('acme', id)).rejects.toEqual({ kind: 'rate-limited', status: 429 });
  },
);

it('continues beyond a malformed intermediate page to preserve later valid rows', async () => {
  vi.mocked(api.get)
    .mockResolvedValueOnce({ data: { ...page, count: 401 } })
    .mockResolvedValueOnce({ data: { ...page, count: 401, results: [{ secret: 'malformed' }] } })
    .mockResolvedValueOnce({ data: { ...page, count: 401 } });
  const result = await requests.listAllInvitations('acme');
  expect(result.results).toEqual([dto, dto]);
  expect(result.count).toBe(401);
  expect(api.get).toHaveBeenCalledTimes(3);
});
