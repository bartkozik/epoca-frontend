import * as requests from '@/modules/clients/requests';
import { ClientType } from '@/modules/clients/types';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClientDetails from './ClientDetails';

const { setClientMock, fetchClientProjectsMock } = vi.hoisted(() => ({
  setClientMock: vi.fn(),
  fetchClientProjectsMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ hasAccess: () => true }) }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

// ClientDetailsForm pulls in mutation hooks/auth access checks that are irrelevant to this
// regression test (it only exercises the "assigned-projects" tab and the tab-switch itself),
// same reasoning ClientDetails.test.tsx already uses for this mock.
vi.mock('@/modules/clients/clientsDetailsForm', () => ({ __esModule: true, default: () => null }));

vi.mock('@/modules/clients/requests', () => ({ getClient: vi.fn() }));
const getClientMock = requests.getClient as unknown as ReturnType<typeof vi.fn>;

const rawClient = {
  archivedAt: '',
  color: '#000',
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  id: 'client-1',
  logo: '',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  name: 'Acme',
  organizationId: 'org-1',
  projectCount: 2,
  texture: 'texture-1',
  type: ClientType.External,
};

const activeClient = {
  id: 'client-1',
  archived: false,
  projectCount: 2,
  projects: [
    { id: 'p1', name: 'Zeta Project', archived: false, archivedDate: '' },
    { id: 'p2', name: 'Alpha Project', archived: false, archivedDate: '' },
  ],
};
vi.mock('@/modules/clients/ClientsProvider', () => ({
  useClients: () => ({
    client: activeClient,
    setClient: setClientMock,
    fetchClientProjects: fetchClientProjectsMock,
    isAddClientProjectModalOpen: false,
    isLoadingClientDetails: false,
    closeAddClientProjectModal: vi.fn(),
    openAddClientProjectModal: vi.fn(),
  }),
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => ({
    openEditProjectModal: vi.fn(),
    closeEditProjectModal: vi.fn(),
    isEditProjectModalOpen: false,
    selectedProject: null,
  }),
}));
vi.mock('@/core/providers/toastProvider', () => ({
  addToast: vi.fn(),
  useToast: () => ({ addToast: vi.fn() }),
}));

const renderClientDetails = (initialTab: string, state?: unknown): void => {
  getClientMock.mockResolvedValue({ data: { count: 1, results: [rawClient] } });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: `/clients/client-1/${initialTab}`, state }]}>
        <Routes>
          <Route path="/clients/:clientId/:tab" element={<ClientDetails />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

// A regex, not the exact key: GoBack's Button renders a mocked SVG icon whose filename text
// concatenates into the link's accessible name alongside the label span's text.
const GO_BACK_LABEL = /go_back_back_to_clients_list/;

// The rows' visual order is what actually matters here (not the sort comparator's semantics,
// which this task doesn't change) -- read project names off the DOM in document order.
const projectNamesInOrder = (): string[] =>
  screen.getAllByRole('cell', { name: /Project$/ }).map((cell) => cell.textContent ?? '');

describe('ClientDetails tab switch', () => {
  // Regression guard for the reported bug: AssignedProjectsTable used to hold sortColumn/
  // sortDirection in local useState, and core/theme/tabs' Tabs component fully unmounts inactive
  // tab content (`isActive ? element : null`), so switching from "Assigned Projects" to "Client
  // Details" and back reset the sort. This exercises the real Tabs component and ClientDetails'
  // real onTabClick (which now has to preserve location.search across the :tab route segment).
  it('keeps the assigned-projects sort after switching tabs away and back', async () => {
    const user = userEvent.setup();
    renderClientDetails('assigned-projects');

    await screen.findByText('Zeta Project');
    const defaultOrder = projectNamesInOrder();

    await user.click(screen.getByText('common.project'));

    const toggledOrder = projectNamesInOrder();
    expect(toggledOrder).not.toEqual(defaultOrder);
    expect(toggledOrder.slice().reverse()).toEqual(defaultOrder);

    // Switch away to the other tab -- unmounts AssignedProjectsTable entirely.
    await user.click(screen.getByRole('tab', { name: 'clients.common.client_details' }));
    expect(screen.queryByText('Alpha Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Zeta Project')).not.toBeInTheDocument();

    // Switch back -- AssignedProjectsTable remounts.
    await user.click(screen.getByRole('tab', { name: 'clients.client_details.tabs.assigned_projects' }));

    expect(await screen.findByText('Alpha Project')).toBeVisible();
    expect(projectNamesInOrder()).toEqual(toggledOrder);
  });
});

// Regression guard for the reported bug: GoBack used a bare `clientsPaths.main` href, so returning
// from client details reset whatever filters/sort were active on /clients. ClientRow now threads
// the list's search string in through router state as fromListSearch (see from-list-search.ts's
// readFromListSearch) -- these exercise that it survives both places ClientDetails' own navigate()
// calls could otherwise drop it.
describe('ClientDetails GoBack link', () => {
  it('builds the href from fromListSearch in router state', async () => {
    renderClientDetails('client-details', { fromListSearch: '?status=Archived' });

    const link = await screen.findByRole('link', { name: GO_BACK_LABEL });
    expect(link).toHaveAttribute('href', '/clients?status=Archived');
  });

  it('falls back to a bare /clients when there is no router state (e.g. a direct deep link)', async () => {
    renderClientDetails('client-details');

    const link = await screen.findByRole('link', { name: GO_BACK_LABEL });
    expect(link).toHaveAttribute('href', '/clients');
  });

  it('keeps the href after switching tabs', async () => {
    const user = userEvent.setup();
    renderClientDetails('client-details', { fromListSearch: '?status=Archived' });
    // GoBack itself renders immediately (even while the client query is loading, see ClientDetails'
    // own M4 fix) -- wait for the tab, which only mounts once the client has actually resolved.
    const assignedProjectsTab = await screen.findByRole('tab', {
      name: 'clients.client_details.tabs.assigned_projects',
    });

    await user.click(assignedProjectsTab);

    const link = await screen.findByRole('link', { name: GO_BACK_LABEL });
    expect(link).toHaveAttribute('href', '/clients?status=Archived');
  });

  it('keeps the href after sorting the assigned-projects table', async () => {
    const user = userEvent.setup();
    renderClientDetails('assigned-projects', { fromListSearch: '?status=Archived' });
    await screen.findByText('Zeta Project');

    await user.click(screen.getByText('common.project'));

    const link = await screen.findByRole('link', { name: GO_BACK_LABEL });
    expect(link).toHaveAttribute('href', '/clients?status=Archived');
  });
});
