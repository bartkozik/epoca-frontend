import * as requests from '@/modules/projects/requests';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssignedProjectsTable from './AssignedProjectsTable';

interface ProjectRow {
  id: string;
  name: string;
  archived: boolean;
  archivedDate: string;
}

const { context, addToastMock } = vi.hoisted(() => ({
  context: {
    client: null as null | { id: string; archived: boolean; projects: ProjectRow[] },
    openAddClientProjectModal: vi.fn(),
    openEditProjectModal: vi.fn(),
  },
  addToastMock: vi.fn(),
}));

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ hasAccess: () => true }) }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('@/modules/clients/ClientsProvider', () => ({
  useClients: () => ({
    client: context.client,
    fetchClientProjects: vi.fn(),
    openAddClientProjectModal: context.openAddClientProjectModal,
  }),
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => ({ openEditProjectModal: context.openEditProjectModal }),
}));
vi.mock('@/core/providers/toastProvider', () => ({
  addToast: addToastMock,
  useToast: () => ({ addToast: addToastMock }),
}));
vi.mock('@/modules/projects/requests', () => ({ archiveProject: vi.fn(), unarchiveProject: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('i18next', () => ({ default: { t: (key: string) => key } }));

const archiveProjectMock = requests.archiveProject as unknown as ReturnType<typeof vi.fn>;
const makeClient = (projects: ProjectRow[]): { id: string; archived: boolean; projects: ProjectRow[] } => ({
  id: 'client-1',
  archived: false,
  projects,
});

const renderTable = (client: ReturnType<typeof makeClient>): RenderResult => {
  context.client = client;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/clients/client-1/assigned-projects']}>
        <AssignedProjectsTable />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('AssignedProjectsTable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('archives a project using the row data', async () => {
    const user = userEvent.setup();
    archiveProjectMock.mockResolvedValueOnce(undefined);
    renderTable(makeClient([{ id: 'just-added', name: 'Fresh Project', archived: false, archivedDate: '' }]));

    await user.click(screen.getByRole('button', { name: /common\.archive/ }));
    await user.click(screen.getByRole('button', { name: /common\.remove/ }));

    await waitFor(() => expect(archiveProjectMock).toHaveBeenCalledWith('acme', 'just-added'));
  });

  it('reflects a project added to the clients context after rerender', () => {
    const client = makeClient([{ id: 'p1', name: 'Alpha', archived: false, archivedDate: '' }]);
    const view = renderTable(client);
    expect(screen.getByText('Alpha')).toBeVisible();

    context.client = makeClient([...client.projects, { id: 'p2', name: 'Beta', archived: false, archivedDate: '' }]);
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <AssignedProjectsTable />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Beta')).toBeVisible();
  });
});
