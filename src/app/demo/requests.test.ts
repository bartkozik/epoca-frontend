import { requestDemoSession } from './requests';

const fixture = { accessToken: 'test-token', organizationSlug: 'demo-test', expiresAt: '2026-11-06T10:00:00.000Z' };

afterEach(() => vi.unstubAllGlobals());

it('resumes an existing session without creating a workspace', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
  vi.stubGlobal('fetch', fetchMock);
  await expect(requestDemoSession('resume')).resolves.toEqual(fixture);
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/demo/session',
    expect.objectContaining({ method: 'GET', credentials: 'same-origin', cache: 'no-store' }),
  );
});

it('treats an expired session as an invitation to start again', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  await expect(requestDemoSession('resume')).resolves.toBeNull();
});

it('does not accept malformed credentials from the gateway', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ accessToken: '' }))));
  await expect(requestDemoSession('start')).rejects.toThrow();
});

it('resets with an explicit same-origin mutation', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));
  vi.stubGlobal('fetch', fetchMock);
  await requestDemoSession('reset');
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/demo/reset',
    expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
  );
});

it('explains capacity limits without exposing internal errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private diagnostic', { status: 429 })));
  await expect(requestDemoSession('start')).rejects.toThrow('The demo is busy');
});
