import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import AssignedProjects from './AssignedProjects';

const { fetchClientProjectsMock } = vi.hoisted(() => ({ fetchClientProjectsMock: vi.fn() }));

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ hasAccess: () => true }) }));
vi.mock('@/modules/clients/ClientsProvider', () => ({
  useClients: () => ({
    client: { id: 'client-1', archived: false, projectCount: 1, projects: [] },
    isAddClientProjectModalOpen: false,
    isLoadingClientDetails: false,
    closeAddClientProjectModal: vi.fn(),
    fetchClientProjects: fetchClientProjectsMock,
    openAddClientProjectModal: vi.fn(),
  }),
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => ({ closeEditProjectModal: vi.fn(), isEditProjectModalOpen: false, selectedProject: null }),
}));
vi.mock('./assignedProjectsTable/AssignedProjectsTable', () => ({ default: () => <div>projects table</div> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('AssignedProjects', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches the client projects once while the tab remains mounted', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AssignedProjects />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(fetchClientProjectsMock).toHaveBeenCalledWith('client-1'));
    expect(fetchClientProjectsMock).toHaveBeenCalledTimes(1);
  });
});
