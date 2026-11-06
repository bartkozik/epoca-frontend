const demoMode = vi.hoisted(() => ({ enabled: false }));
vi.mock('@/core/config/demo', () => ({
  get isDemo() {
    return demoMode.enabled;
  },
}));
beforeEach(() => {
  demoMode.enabled = false;
});
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Members from './Members';

const mocks = vi.hoisted(() => ({ query: vi.fn(), slug: 'acme', fetch: vi.fn() }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    contextOrganizationSlug: mocks.slug,
    fetchContextOrganizationUsers: mocks.fetch,
    hasAccess: () => true,
  }),
}));
vi.mock('./invitations/hooks/useInvitationsQuery', () => ({ useInvitationsQuery: mocks.query }));
vi.mock('./membersTable', () => ({ default: () => <div>active members table</div> }));
vi.mock('@/core/providers/toastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
const result = {
  data: { count: 0, results: [], featureEnabled: true },
  isError: false,
  isLoading: false,
  refetch: vi.fn(),
};
type MembersRouteProps = { initialEntry?: string };
const MembersRoute = ({ initialEntry = '/team-settings/members/list' }: MembersRouteProps): JSX.Element => (
  <MemoryRouter initialEntries={[initialEntry]}>
    <Routes>
      <Route path="/team-settings/members/:memberTab" element={<Members />} />
    </Routes>
  </MemoryRouter>
);
function mount(): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MembersRoute />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.slug = 'acme';
  mocks.query.mockReturnValue(result);
});
it('offers Add even for an empty list and opens the self-contained form', async () => {
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'invitations.form.title' }));
  expect(screen.getByRole('dialog')).toBeVisible();
});
it.each([403, 404])('disables invitation navigation when capability is unavailable (%s)', async (status) => {
  mocks.query.mockReturnValue({ ...result, data: undefined, isError: true, error: { kind: 'not-found', status } });
  mount();
  expect(screen.queryByRole('button', { name: 'invitations.form.title' })).not.toBeInTheDocument();
  const invitationsTab = screen.getByRole('button', { name: 'invitations.tab' });
  expect(invitationsTab).toBeVisible();
  expect(invitationsTab).toBeDisabled();
  await userEvent.click(invitationsTab);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('active members table')).toBeVisible();
});
it.each([403, 404])('keeps both tabs through loading, access denial (%s), and recovery', (status) => {
  const client = new QueryClient();
  const ui = (): JSX.Element => (
    <QueryClientProvider client={client}>
      <MembersRoute />
    </QueryClientProvider>
  );
  mocks.query.mockReturnValue({ ...result, data: undefined, isLoading: true });
  const view = render(ui());
  const membersTab = screen.getByRole('button', { name: 'team_seatings.tab.members' });
  const invitationsTab = screen.getByRole('button', { name: 'invitations.tab' });
  expect(membersTab).toBeEnabled();
  expect(invitationsTab).toBeVisible();
  expect(invitationsTab).toBeDisabled();
  expect(invitationsTab).toHaveAttribute('aria-busy', 'true');
  expect(invitationsTab).toHaveTextContent('invitations.tab');

  mocks.query.mockReturnValue({ ...result, data: undefined, isError: true, error: { kind: 'not-found', status } });
  view.rerender(ui());
  expect(screen.getByRole('button', { name: 'invitations.tab' })).toBe(invitationsTab);
  expect(invitationsTab).toBeDisabled();
  expect(membersTab).toBeEnabled();
  expect(invitationsTab).not.toHaveAttribute('aria-busy');

  mocks.query.mockReturnValue(result);
  view.rerender(ui());
  expect(screen.getByRole('button', { name: 'invitations.tab' })).toBe(invitationsTab);
  expect(invitationsTab).toBeEnabled();
  expect(invitationsTab).not.toHaveAttribute('aria-busy');
});
it('keeps the invitations tab disabled until an organization is selected', () => {
  mocks.slug = '';
  mocks.query.mockReturnValue({ ...result, data: undefined });
  mount();
  expect(screen.getByRole('button', { name: 'team_seatings.tab.members' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'invitations.tab' })).toBeDisabled();
});
it.each([
  { kind: 'transport', status: null },
  { kind: 'unexpected', status: 500 },
])('keeps $kind invitation errors in their own tab while active members remain usable', async (error) => {
  mocks.query.mockReturnValue({
    ...result,
    data: undefined,
    isError: true,
    error,
  });
  mount();
  expect(screen.getByText('active members table')).toBeVisible();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'invitations.tab' }));
  expect(screen.getByRole('alert')).toHaveTextContent('invitations.error.list');
  await userEvent.click(screen.getByRole('button', { name: 'invitations.action.refresh' }));
  expect(result.refetch).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole('button', { name: 'team_seatings.tab.members' }));
  expect(screen.getByText('active members table')).toBeVisible();
});
it('keeps management navigation but hides Add when sending is disabled', () => {
  mocks.query.mockReturnValue({ ...result, data: { ...result.data, featureEnabled: false } });
  mount();
  expect(screen.getByRole('button', { name: 'invitations.tab' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'invitations.form.title' })).not.toBeInTheDocument();
});
it('closes the old modal when the organization changes', async () => {
  const view = mount();
  await userEvent.click(screen.getByRole('button', { name: 'invitations.form.title' }));
  mocks.slug = 'other';
  view.rerender(
    <QueryClientProvider client={new QueryClient()}>
      <MembersRoute />
    </QueryClientProvider>,
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it.each([
  { kind: 'transport', status: null },
  { kind: 'unexpected', status: 500 },
])('preserves the open form draft across a cached $kind list error and recovery', async (error) => {
  const client = new QueryClient();
  const ui = (
    <QueryClientProvider client={client}>
      <MembersRoute />
    </QueryClientProvider>
  );
  const view = render(ui);
  await userEvent.click(screen.getByRole('button', { name: 'invitations.form.title' }));
  await userEvent.type(screen.getByLabelText('invitations.form.firstName'), 'Ada');
  await userEvent.type(screen.getByLabelText('invitations.form.lastName'), 'Lovelace');
  await userEvent.type(screen.getByLabelText('invitations.form.email'), 'ada@example.com');
  mocks.query.mockReturnValue({ ...result, isError: true, error });
  view.rerender(
    <QueryClientProvider client={client}>
      <MembersRoute />
    </QueryClientProvider>,
  );
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveValue('Ada');
  expect(screen.getByLabelText('invitations.form.lastName')).toHaveValue('Lovelace');
  expect(screen.getByLabelText('invitations.form.email')).toHaveValue('ada@example.com');
  expect(screen.queryByRole('button', { name: 'invitations.form.title' })).not.toBeInTheDocument();
  mocks.query.mockReturnValue(result);
  view.rerender(
    <QueryClientProvider client={client}>
      <MembersRoute />
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText('invitations.form.firstName')).toHaveValue('Ada');
  expect(screen.getByLabelText('invitations.form.lastName')).toHaveValue('Lovelace');
  expect(screen.getByLabelText('invitations.form.email')).toHaveValue('ada@example.com');
});
it.each(['not-found', 'disabled'])(
  'closes on %s capability revocation without reopening the form when capability returns',
  async (kind) => {
    const client = new QueryClient();
    const view = render(
      <QueryClientProvider client={client}>
        <MembersRoute />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'invitations.form.title' }));
    await userEvent.type(screen.getByLabelText('invitations.form.firstName'), 'Draft');
    mocks.query.mockReturnValue(
      kind === 'not-found'
        ? { ...result, isError: true, error: { kind, status: 404 } }
        : { ...result, data: { ...result.data, featureEnabled: false } },
    );
    view.rerender(
      <QueryClientProvider client={client}>
        <MembersRoute />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    mocks.query.mockReturnValue(result);
    view.rerender(
      <QueryClientProvider client={client}>
        <MembersRoute />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'invitations.form.title' }));
    expect(screen.getByLabelText('invitations.form.firstName')).toHaveValue('');
  },
);

it('switches between members and the invitation empty state', async () => {
  mount();
  expect(screen.getByText('active members table')).toBeVisible();
  expect(screen.queryByText('invitations.empty')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'invitations.tab' }));
  expect(screen.queryByText('active members table')).not.toBeInTheDocument();
  expect(screen.getByText('invitations.empty')).toBeVisible();
  expect(screen.getByRole('button', { name: 'invitations.tab' })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(screen.getByRole('button', { name: 'team_seatings.tab.members' }));
  expect(screen.getByText('active members table')).toBeVisible();
});

it('opens the invitations tab directly and explains unavailable capability', () => {
  mocks.query.mockReturnValue({ ...result, data: undefined, isError: true, error: { kind: 'not-found', status: 404 } });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MembersRoute initialEntry="/team-settings/members/invitations" />
    </QueryClientProvider>,
  );
  expect(screen.queryByText('active members table')).not.toBeInTheDocument();
  expect(screen.getByText('invitations.unavailable')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'invitations.form.title' })).not.toBeInTheDocument();
});

it('opens invitation previews in demo but does not offer an active send action', async () => {
  demoMode.enabled = true;
  mount();
  expect(screen.getByRole('button', { name: 'invitations.form.title' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'invitations.tab' }));
  expect(screen.getByText('invitations.empty')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
