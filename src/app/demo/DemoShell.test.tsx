import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DemoShell } from './DemoShell';
import { requestDemoSession } from './requests';

const { persistSession, clearCache, cancelQueries } = vi.hoisted(() => ({
  persistSession: vi.fn(),
  clearCache: vi.fn(),
  cancelQueries: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./requests', () => ({ requestDemoSession: vi.fn() }));
vi.mock('@/modules/auth/AuthProvider', () => ({
  useAuth: () => ({
    persistSession,
    changeUserLanguage: vi.fn(),
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

beforeEach(() => vi.clearAllMocks());

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
});

it('requires confirmation before resetting and clears cached workspace data', async () => {
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
});

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
