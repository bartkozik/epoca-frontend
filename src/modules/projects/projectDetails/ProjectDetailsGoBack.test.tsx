import { showModuleErrorToast } from '@/core/utils/helpers';
import { ClientType } from '@/modules/clients/types';
import * as requests from '@/modules/projects/requests';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectDetails from './ProjectDetails';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/modules/projects/projectDetailsView', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/projects/assignedMembers', () => ({ __esModule: true, default: () => null }));
vi.mock('@/modules/projects/projectForm', () => ({ __esModule: true, default: () => null }));

let testContexts: Record<string, unknown> = {};
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => testContexts.authContext }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => testContexts.workspaceContext,
}));
vi.mock('@/modules/clients/ClientsProvider', () => ({ useClients: () => testContexts.clientsContext }));
vi.mock('@/modules/projects/ProjectsProvider', () => ({ useProjects: () => testContexts.projectsContext }));
vi.mock('@/core/providers/toastProvider', () => ({
  addToast: vi.fn(),
  useToast: () => testContexts.toastContext ?? { addToast: vi.fn() },
}));
const setContexts = (value: Record<string, unknown>): void => {
  testContexts = value;
};

vi.mock('@/modules/projects/requests', () => ({ getProject: vi.fn() }));
const getProjectMock = requests.getProject as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/core/utils/helpers', async (importOriginal) => ({
  ...(await importOriginal()),
  showModuleErrorToast: vi.fn(),
}));
const showModuleErrorToastMock = showModuleErrorToast as unknown as ReturnType<typeof vi.fn>;

const setSelectedProjectMock = vi.fn();
const setLoadingStateMock = vi.fn();

const rawProject = {
  archivedAt: '',
  client: { color: '#000', id: 'client-1', name: 'Acme', texture: 'texture-1', type: ClientType.External },
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  description: '',
  id: 'project-1',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  name: 'Website Redesign',
  organizationId: 'org-1',
  projectUsers: [],
  userCount: 0,
  userIds: [],
};

const renderProjectDetails = (initialTab: string, state?: unknown): void => {
  setContexts({
    projectsContext: {
      closeEditProjectModal: vi.fn(),
      isEditProjectModalOpen: false,
      modelProject: (raw: typeof rawProject) => ({
        ...raw,
        archived: false,
        archivedDate: '',
        formattedCreatedAt: '',
        members: [],
        owners: [],
      }),
      setSelectedProject: setSelectedProjectMock,
      setLoadingState: setLoadingStateMock,
    },
    workspaceContext: { contextOrganizationSlug: 'acme' },
  });

  getProjectMock.mockResolvedValue({ data: rawProject });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: `/projects/project-1/${initialTab}`, state }]}>
        <Routes>
          <Route path="/projects/:projectId/:tab" element={<ProjectDetails />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const GO_BACK_LABEL = /go_back\.back_to_projects_list/;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProjectDetails GoBack link', () => {
  it('builds the href from fromListSearch in router state', async () => {
    renderProjectDetails('project-details', { fromListSearch: '?status=Archived' });

    const link = await screen.findByRole('link', { name: GO_BACK_LABEL });
    expect(link).toHaveAttribute('href', '/projects?status=Archived');
  });

  it('falls back to a bare /projects when there is no router state (e.g. a direct deep link)', async () => {
    renderProjectDetails('project-details');

    const link = await screen.findByRole('link', { name: GO_BACK_LABEL });
    expect(link).toHaveAttribute('href', '/projects');
  });

  it('keeps the href after switching tabs', async () => {
    const user = userEvent.setup();
    renderProjectDetails('project-details', { fromListSearch: '?status=Archived' });

    const assignedMembersTab = await screen.findByRole('tab', {
      name: 'projects.project_details.tabs.assign_members.label',
    });
    await user.click(assignedMembersTab);

    const link = await screen.findByRole('link', { name: GO_BACK_LABEL });
    expect(link).toHaveAttribute('href', '/projects?status=Archived');
  });
});

describe('ProjectDetails query wiring', () => {
  it('renders the project name once the query resolves and updates the projects context', async () => {
    renderProjectDetails('project-details');

    expect(await screen.findByText('Website Redesign')).toBeVisible();
    expect(setSelectedProjectMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'project-1', name: 'Website Redesign' }),
    );
  });

  it('renders the GoBack link while the project query is still loading', () => {
    setContexts({
      projectsContext: {
        closeEditProjectModal: vi.fn(),
        isEditProjectModalOpen: false,
        modelProject: (raw: typeof rawProject) => ({
          ...raw,
          archived: false,
          archivedDate: '',
          formattedCreatedAt: '',
          members: [],
          owners: [],
        }),
        setSelectedProject: setSelectedProjectMock,
        setLoadingState: setLoadingStateMock,
      },
      workspaceContext: { contextOrganizationSlug: 'acme' },
    });
    getProjectMock.mockReturnValue(new Promise(() => {}));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: '/projects/project-1/project-details' }]}>
          <Routes>
            <Route path="/projects/:projectId/:tab" element={<ProjectDetails />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole('link', { name: GO_BACK_LABEL })).toBeVisible();
  });

  it('shows a toast when the project query fails', async () => {
    getProjectMock.mockRejectedValueOnce(new Error('request failed'));
    renderProjectDetails('project-details');

    await waitFor(() =>
      expect(showModuleErrorToastMock).toHaveBeenCalledWith(expect.any(Error), {
        default: 'toast_message.projects.data_fetch_error',
      }),
    );
  });
});
