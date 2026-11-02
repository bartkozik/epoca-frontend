import * as requests from '@/modules/projects/requests';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MemberProjectsTable from './MemberProjectsTable';

const { addToastMock, clientsContext, mockNavigate, projectsContext } = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  clientsContext: {
    resetSelectedFilterType: vi.fn(),
    selectedFilterTypeOptionMembersProjects: undefined,
    handleFilterTypeSelectMemberProjects: vi.fn(),
    selectedFilterTypeMemberProject: 'All',
  },
  mockNavigate: vi.fn(),
  projectsContext: {},
}));

vi.mock('@/core/providers/toastProvider/ToastProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/providers/toastProvider/ToastProvider')>()),
  useToast: () => ({ addToast: addToastMock }),
}));
vi.mock('@/modules/clients/ClientsProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/clients/ClientsProvider')>()),
  useClients: () => clientsContext,
}));
vi.mock('@/modules/organizations/WorkspaceProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/organizations/WorkspaceProvider')>()),
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('@/modules/projects/ProjectsProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/projects/ProjectsProvider')>()),
  useProjects: () => projectsContext,
}));

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
}));

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/modules/projects/requests', () => ({
  assignUserToAllProjects: vi.fn(),
  unassignUserFromAllProjects: vi.fn(),
}));
const assignAllMock = requests.assignUserToAllProjects as unknown as ReturnType<typeof vi.fn>;
const unassignAllMock = requests.unassignUserFromAllProjects as unknown as ReturnType<typeof vi.fn>;

const selectedProjectUser = { id: 'user-1', fullName: 'Jan Kowalski', projects: [] as { projectId: string }[] };

// filteredOrganizationProjects is empty on purpose -- MemberProjectsTableRow's own mutation/toggle
// behavior is covered by its own test file, this one only exercises the bulk assign-all flow.
const renderTable = (
  isAssigned: boolean,
  {
    getUserProjects = vi.fn().mockResolvedValue(undefined),
    state,
  }: { getUserProjects?: () => Promise<void>; state?: unknown } = {},
): ReturnType<typeof render> => {
  Object.assign(projectsContext, {
    setSelectedProjectUser: vi.fn(),
    closeAssignmentToAllProjectsConfirmation: vi.fn(),
    fetchProjectsAndOrganizationUsers: vi.fn(),
    filteredOrganizationProjects: [],
    getUserProjects,
    isAssignmentToAllProjectsConfirmationOpen: true,
    isLoading: { allProjectsViewData: false },
    isSubmitting: { userProjects: false },
    isUserAssignedToAllProjects: isAssigned,
    openAssignmentToAllProjectsConfirmation: vi.fn(),
    resetSelectedProjectUser: vi.fn(),
    selectedProjectUser,
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: '/team-settings/members/user-1', state }]}>
        <Routes>
          <Route path="/team-settings/members/:userId" element={<MemberProjectsTable />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

// A regex, not the exact key: GoBack's Button renders a mocked SVG icon whose filename text
// concatenates into the link's accessible name alongside the label span's text.
const GO_BACK_LABEL = /go_back\.back_to_members_list/;

beforeEach(() => vi.clearAllMocks());

describe('MemberProjectsTable', () => {
  it('keeps the project assignment page focused on projects', () => {
    renderTable(false);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
  it('assigns the user to all projects when confirmed while unassigned', async () => {
    assignAllMock.mockResolvedValueOnce({ data: { changedProjectIds: [] } });
    const user = userEvent.setup();
    renderTable(false);

    await user.click(screen.getByRole('button', { name: 'team_seatings.common.assign_all' }));

    await waitFor(() =>
      expect(assignAllMock).toHaveBeenCalledWith({ organizationSlug: 'acme', userId: 'user-1', clientType: undefined }),
    );
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith({ content: 'toast_message.projects.user_add_all' }));
  });

  it('unassigns the user from all projects when confirmed while assigned', async () => {
    unassignAllMock.mockResolvedValueOnce({ data: { changedProjectIds: [] } });
    const user = userEvent.setup();
    renderTable(true);

    await user.click(screen.getByRole('button', { name: 'team_seatings.common.unassign_all' }));

    await waitFor(() =>
      expect(unassignAllMock).toHaveBeenCalledWith({
        organizationSlug: 'acme',
        userId: 'user-1',
        clientType: undefined,
      }),
    );
    await waitFor(() =>
      expect(addToastMock).toHaveBeenCalledWith({ content: 'toast_message.projects.user_deleted_all' }),
    );
  });
});

// Regression guard for the reported bug: GoBack used a bare teamSettingsPaths.teamSettings(
// 'members', 'list') href, so returning from a member's projects page reset MembersTable's
// URL-persisted sort. MembersTable now threads the list's search string in through router state as
// fromListSearch (see from-list-search.ts's readFromListSearch) -- these exercise that it survives
// both places this page's own navigation could otherwise drop it.
describe('MemberProjectsTable GoBack link', () => {
  it('builds the href from fromListSearch in router state', async () => {
    renderTable(false, { state: { fromListSearch: '?membersSortColumn=UserRole' } });

    const link = await screen.findByRole('link', { name: GO_BACK_LABEL });
    expect(link).toHaveAttribute('href', '/team-settings/members/list?membersSortColumn=UserRole');
  });

  it('falls back to a bare members list href when there is no router state (e.g. a direct deep link)', async () => {
    renderTable(false);

    const link = await screen.findByRole('link', { name: GO_BACK_LABEL });
    expect(link).toHaveAttribute('href', '/team-settings/members/list');
  });

  it('carries fromListSearch on the navigate back to the list when getUserProjects fails', async () => {
    renderTable(false, {
      getUserProjects: vi.fn().mockRejectedValue(new Error('not authorized')),
      state: { fromListSearch: '?membersSortColumn=UserRole' },
    });

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/team-settings/members/list?membersSortColumn=UserRole'),
    );
  });
});
