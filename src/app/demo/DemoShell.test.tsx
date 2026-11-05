import { LOCAL_STORAGE_AUTH_NAME } from '@/core/config/localStorageKeys';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoShell } from './DemoShell';
import { requestDemoSession } from './requests';

const { persistSession, clearCache, cancelQueries, changeUserLanguage } = vi.hoisted(() => ({
  persistSession: vi.fn(),
  changeUserLanguage: vi.fn(),
  clearCache: vi.fn(),
  cancelQueries: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./requests', () => ({ requestDemoSession: vi.fn() }));
vi.mock('@/modules/auth/AuthProvider', () => ({
  useAuth: () => ({
    persistSession,
    changeUserLanguage,
    loggedInUser: { id: 'guest' },
  }),
}));
vi.mock('@/core/api', () => ({
  default: { interceptors: { response: { use: vi.fn(), eject: vi.fn() } } },
  queryClient: { clear: clearCache, cancelQueries },
  removeRefreshToken: vi.fn(),
}));
const session = () => ({
  accessToken: 'token',
  organizationSlug: 'demo-guest',
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
});

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

it('keeps the application unmounted until a visitor opens a guest workspace', async () => {
  vi.mocked(requestDemoSession).mockResolvedValueOnce(null).mockResolvedValueOnce(session());
  const user = userEvent.setup();
  render(
    <DemoShell>
      <p>Real EPOCA application</p>
    </DemoShell>,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open demo' })).toBeEnabled());
  expect(screen.queryByText('Real EPOCA application')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Open demo' }));
  expect(await screen.findByText('Real EPOCA application')).toBeInTheDocument();
  expect(persistSession).toHaveBeenCalledWith('token', 'demo-guest');
  expect(changeUserLanguage).not.toHaveBeenCalled();
});

it.each(['/projects/old-id/project-details?clientId=old-client', '/clients/old-id/client-details'])(
  'reset clears cached data and obsolete detail URL %s',
  async (path) => {
    window.history.replaceState({ stale: true }, '', path);
    vi.mocked(requestDemoSession)
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce({ ...session(), accessToken: 'new-token', organizationSlug: 'new-space' });
    const user = userEvent.setup();
    render(
      <DemoShell>
        <p>Real EPOCA application</p>
      </DemoShell>,
    );
    await user.click(await screen.findByRole('button', { name: 'Reset demo' }));
    expect(vi.mocked(requestDemoSession).mock.calls.filter(([action]) => action === 'reset')).toHaveLength(0);
    await user.click(screen.getAllByRole('button', { name: 'Reset demo' })[1]);
    await waitFor(() => expect(persistSession).toHaveBeenCalledWith('new-token', 'new-space'));
    expect(cancelQueries).toHaveBeenCalled();
    expect(clearCache).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/working-time');
    expect(window.location.search).toBe('');
    expect(window.history.state).toBeNull();
    expect(changeUserLanguage).not.toHaveBeenCalled();
  },
);

it('keeps a failed entry retryable without rendering the normal login screen', async () => {
  vi.mocked(requestDemoSession).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('The demo is busy.'));
  const user = userEvent.setup();
  render(
    <DemoShell>
      <p>Real EPOCA application</p>
    </DemoShell>,
  );
  await user.click(await screen.findByRole('button', { name: 'Open demo' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('The demo is busy.');
  expect(screen.getByRole('button', { name: 'Open demo' })).toBeEnabled();
  expect(screen.queryByText('Real EPOCA application')).not.toBeInTheDocument();
});

it('unmounts the old workspace when another tab rotates its credentials', async () => {
  vi.mocked(requestDemoSession)
    .mockResolvedValueOnce(session())
    .mockResolvedValueOnce({ ...session(), accessToken: 'other-tab-token', organizationSlug: 'other-tab-space' });
  const user = userEvent.setup();
  render(
    <DemoShell>
      <p>Real EPOCA application</p>
    </DemoShell>,
  );
  await screen.findByText('Real EPOCA application');
  await act(() =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: LOCAL_STORAGE_AUTH_NAME.ACCESS_TOKEN, newValue: 'changed' }),
    ),
  );
  expect(screen.queryByText('Real EPOCA application')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('changed in another tab');
  await user.click(screen.getByRole('button', { name: 'Open demo' }));
  await waitFor(() => expect(persistSession).toHaveBeenCalledWith('other-tab-token', 'other-tab-space'));
  expect(screen.getByText('Real EPOCA application')).toBeInTheDocument();
});
