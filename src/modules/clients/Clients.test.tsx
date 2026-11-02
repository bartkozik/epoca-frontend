import { ClientsProvider } from '@/modules/clients/ClientsProvider';
import * as requests from '@/modules/clients/requests';
import { ClientType } from '@/modules/clients/types';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Clients from './Clients';

const { projectsContext } = vi.hoisted(() => ({
  projectsContext: {
    addNewProject: vi.fn(),
    clearAllProjectUsers: vi.fn(),
    editProject: vi.fn(),
    handleUserAction: vi.fn(),
    initializeProjectData: vi.fn(),
    projectDescription: '',
    projectName: '',
    projects: [],
    selectedProjectMembers: [],
    selectedProjectOwners: [],
    setClientName: vi.fn(),
    setProjectDescription: vi.fn(),
    setProjectName: vi.fn(),
    setSelectedProject: vi.fn(),
  },
}));
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ hasAccess: () => true }) }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    contextOrganizationSlug: 'acme',
    availableToAddContextOrganizationUsers: [],
    fetchContextOrganizationUsers: vi.fn().mockResolvedValue(undefined),
    isLoadingContextOrganizationUsers: false,
  }),
}));
vi.mock('@/modules/projects/ProjectsProvider', () => ({ useProjects: () => projectsContext }));
vi.mock('@/core/providers/toastProvider', () => ({
  addToast: vi.fn(),
  useToast: () => ({ addToast: vi.fn() }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/modules/clients/requests', () => ({ getClients: vi.fn(), addNewClient: vi.fn() }));
vi.mock('@/core/theme/dataTableLayout', () => ({
  default: ({ onBtnClick, btnLabel, children }: React.PropsWithChildren<{ onBtnClick: () => void; btnLabel: string }>) => (
    <div><button type="button" onClick={onBtnClick}>{btnLabel}</button>{children}</div>
  ),
}));
vi.mock('@/core/theme/scrolledContainer', () => ({ default: ({ children }: React.PropsWithChildren) => children }));
vi.mock('@/core/theme/modal', () => ({
  default: ({ children, isOpen }: React.PropsWithChildren<{ isOpen: boolean }>) => (isOpen ? <div>{children}</div> : null),
}));
vi.mock('@/core/theme/confirmation', () => ({
  default: ({ isOpen, confirmActions, title }: { isOpen: boolean; confirmActions: Array<{ text: string; action: () => void }>; title: string }) =>
    isOpen ? <div role="dialog" aria-label={title}>{confirmActions.map(({ text, action }) => <button key={text} onClick={action}>{text}</button>)}</div> : null,
}));
vi.mock('./clientForm', () => ({
  default: ({ onCreated }: { onCreated: (client: typeof rawClient) => void }) => (
    <button type="button" onClick={() => onCreated({ ...rawClient, id: 'created-client', name: 'New Co' })}>create-client</button>
  ),
}));
vi.mock('@/modules/projects/projectForm', () => ({
  default: ({ onCancel }: { onCancel: () => void }) => (
    <button type="button" onClick={onCancel}>save-project-success</button>
  ),
}));

const getClientsMock = requests.getClients as unknown as ReturnType<typeof vi.fn>;
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
  projectCount: 0,
  texture: 'texture-1',
  type: ClientType.External,
};

const renderClients = (): void => {
  getClientsMock.mockResolvedValue({ data: { count: 1, results: [rawClient] } });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={['/clients']}>
      <QueryClientProvider client={queryClient}>
        <ClientsProvider>
          <Clients />
        </ClientsProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
};

describe('Clients', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the fetched client', async () => {
    renderClients();
    expect(await screen.findByText('Acme')).toBeVisible();
  });

  it('closes the client project form when a successful project submission calls its cancel callback', async () => {
    renderClients();
    await screen.findByText('Acme');

    fireEvent.click(screen.getByRole('button', { name: 'clients.button.add_new_client.label' }));
    fireEvent.click(screen.getByRole('button', { name: 'create-client' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'common.add_new_project' }));

    expect(screen.getByRole('button', { name: 'save-project-success' })).toBeVisible();
    expect(projectsContext.setSelectedProject).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'save-project-success' }));

    expect(screen.queryByRole('button', { name: 'save-project-success' })).not.toBeInTheDocument();
  });
});
