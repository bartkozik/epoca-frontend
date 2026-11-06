const demoMode = vi.hoisted(() => ({ enabled: false }));
vi.mock('@/core/config/demo', () => ({
  get isDemo() {
    return demoMode.enabled;
  },
}));
beforeEach(() => {
  demoMode.enabled = false;
});
import * as requests from '@/modules/organizations/requests';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { teamSettingsPaths } from '../../routes';
import MembersTable from './MembersTable';

const mockNavigate = vi.fn();

const providerMocks = vi.hoisted(() => ({ auth: vi.fn(), toast: vi.fn(), workspace: vi.fn() }));
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: providerMocks.auth }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: providerMocks.workspace }));
vi.mock('@/core/providers/toastProvider/ToastProvider', () => ({ useToast: providerMocks.toast }));

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
}));

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/modules/organizations/requests', () => ({ getOrganizationUsers: vi.fn() }));
const getOrganizationUsersMock = requests.getOrganizationUsers as unknown as ReturnType<typeof vi.fn>;

const rawOrganizationUser = {
  firstName: 'Jane',
  id: 'user-1',
  identities: [],
  lastName: 'Doe',
  organizationRoles: [],
  archived: false,
};

const renderTable = (
  isLoadingContextOrganizationUsers: boolean,
  initialEntry = '/team-settings/members/list',
): ReturnType<typeof render> => {
  providerMocks.workspace.mockReturnValue({ contextOrganizationSlug: 'acme', isLoadingContextOrganizationUsers });
  providerMocks.toast.mockReturnValue({ addToast: vi.fn() });
  providerMocks.auth.mockReturnValue({ loggedInUser: { id: 'user-1' } });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <MembersTable />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => vi.clearAllMocks());

describe('MembersTable', () => {
  it('keeps showing the loader while workspace users are still loading', async () => {
    getOrganizationUsersMock.mockResolvedValueOnce({ data: [rawOrganizationUser] });
    renderTable(true);

    await waitFor(() => expect(getOrganizationUsersMock).toHaveBeenCalled());
    expect(screen.queryAllByText('Jane Doe')).toHaveLength(0);
  });

  it('renders the table once the users query and workspace users have loaded', async () => {
    getOrganizationUsersMock.mockResolvedValueOnce({ data: [rawOrganizationUser] });
    renderTable(false);

    await waitFor(() => expect(screen.queryAllByText('Jane Doe').length).toBeGreaterThan(0));
  });

  // Regression guard: navigating to a member's project page used to drop the list's own
  // search string, resetting MembersTable's URL-persisted sort on return (see MemberProjectsTable's
  // GoBack link test).
  it('passes the list search string as fromListSearch router state on row navigation', async () => {
    getOrganizationUsersMock.mockResolvedValueOnce({ data: [rawOrganizationUser] });
    const user = userEvent.setup();
    renderTable(false, '/team-settings/members/list?membersSortColumn=UserRole');

    // A regex, not the exact key: IconButton renders a mocked SVG icon whose filename text
    // concatenates into the button's accessible name alongside the label span's text.
    await user.click(await screen.findByRole('button', { name: /common\.projects/ }));

    expect(mockNavigate).toHaveBeenCalledWith(teamSettingsPaths.userDetails('user-1'), {
      state: { fromListSearch: '?membersSortColumn=UserRole' },
    });
  });
});

it('keeps the demo owner protected while allowing other team members to be managed', async () => {
  demoMode.enabled = true;
  getOrganizationUsersMock.mockResolvedValueOnce({
    data: [rawOrganizationUser, { ...rawOrganizationUser, id: 'user-2', firstName: 'Alex' }],
  });
  renderTable(false);
  const removeButtons = await screen.findAllByRole('button', { name: /remove_user/ });
  expect(removeButtons[0]).toBeDisabled();
  expect(removeButtons[1]).toBeEnabled();
});
