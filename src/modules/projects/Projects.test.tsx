import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import Projects from './Projects';

const { state, fetchAllProjectsViewDataMock, openAddNewProjectModalMock } = vi.hoisted(() => ({
  state: { providerLoading: false, clientsLoading: true, projectModalOpen: false },
  fetchAllProjectsViewDataMock: vi.fn(),
  openAddNewProjectModalMock: vi.fn(),
}));

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ hasAccess: () => true }) }));
vi.mock('@/modules/clients/ClientsProvider', () => ({
  useClients: () => ({
    clientsOptions: state.clientsLoading ? [] : [{ value: 'client-1', label: 'Acme' }],
    isLoadingClients: state.clientsLoading,
  }),
}));
vi.mock('@/modules/projects/hooks/useProjectsQuery', () => ({
  useProjectsQuery: () => ({ data: { count: 0, results: [] }, error: null, isError: false, isLoading: false }),
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({
  useProjects: () => ({
    closeAddNewProjectModal: vi.fn(() => {
      state.projectModalOpen = false;
    }),
    fetchAllProjectsViewData: fetchAllProjectsViewDataMock,
    isAddNewProjectModalOpen: state.projectModalOpen,
    isLoading: { allProjectsViewData: state.providerLoading, projectDetails: false },
    modelProject: (project: unknown) => project,
    openAddNewProjectModal: () => {
      state.projectModalOpen = true;
      openAddNewProjectModalMock();
    },
  }),
}));
vi.mock('@/core/theme/dataTableLayout', () => ({
  default: ({ onBtnClick, btnLabel, loading }: { onBtnClick: () => void; btnLabel: string; loading: boolean }) =>
    loading ? null : (
      <button type="button" onClick={onBtnClick}>
        {btnLabel}
      </button>
    ),
}));
vi.mock('@/modules/projects/projectForm', () => ({ default: () => <div>project-form</div> }));
vi.mock('@/core/theme/modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('Projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.projectModalOpen = false;
  });

  it('keeps the add-project affordance hidden until all form dependencies have loaded', () => {
    state.clientsLoading = true;
    const view = render(
      <MemoryRouter initialEntries={['/projects']}>
        <Projects />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'common.add_new_project' })).not.toBeInTheDocument();

    state.clientsLoading = false;
    view.rerender(
      <MemoryRouter initialEntries={['/projects']}>
        <Projects />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'common.add_new_project' })).toBeVisible();
  });

  it('opens the project form after its client options have loaded', () => {
    state.clientsLoading = false;
    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Projects />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.add_new_project' }));

    expect(screen.getByText('project-form')).toBeVisible();
    expect(openAddNewProjectModalMock).toHaveBeenCalledOnce();
  });
});
