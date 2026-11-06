import { showModuleErrorToast } from '@/core/utils/helpers';
import { SortColumn, SortDirection } from '@/core/utils/sorting';
import * as requests from '@/modules/clients/requests';
import { ClientType } from '@/modules/clients/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClientsBoard from './ClientsBoard';

const { addToastMock, openAddClientProjectModalMock } = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  openAddClientProjectModalMock: vi.fn(),
}));
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ hasAccess: () => true }) }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('@/modules/clients/ClientsProvider', () => ({
  useClients: () => ({ openAddClientProjectModal: openAddClientProjectModalMock }),
}));
vi.mock('@/core/providers/toastProvider', () => ({ useToast: () => ({ addToast: addToastMock }) }));

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => vi.fn(),
  useLocation: () => ({ search: '' }),
}));

vi.mock('i18next', () => {
  const instance = {
    t: (key: string) => key,
    use: () => instance,
    init: () => instance,
  };
  return { __esModule: true, default: instance };
});

vi.mock('@/modules/clients/requests', () => ({ archiveClient: vi.fn(), unarchiveClient: vi.fn() }));
const archiveClientMock = requests.archiveClient as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/core/utils/helpers', async (importOriginal) => ({
  ...(await importOriginal()),
  showModuleErrorToast: vi.fn(),
}));
const showModuleErrorToastMock = showModuleErrorToast as unknown as ReturnType<typeof vi.fn>;

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

const renderBoard = (): void => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ClientsBoard
        clients={[rawClient]}
        isStatusArchived={false}
        sortColumn={SortColumn.Client}
        sortDirection={SortDirection.Desc}
        updateSort={vi.fn()}
      />
    </QueryClientProvider>,
  );
};

describe('ClientsBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders one row per client passed in', () => {
    renderBoard();
    expect(screen.getByText('Acme')).toBeVisible();
  });

  it('opens the add-project modal for the right client', async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(screen.getByRole('button', { name: 'common.add_new_project' }));

    expect(openAddClientProjectModalMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'client-1', name: 'Acme' }),
    );
  });

  it('shows an archive-direction success toast once the archive request resolves', async () => {
    archiveClientMock.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderBoard();

    await user.click(screen.getByRole('button', { name: /common\.archive/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /common\.archive/ }));

    await waitFor(() => expect(archiveClientMock).toHaveBeenCalledWith('acme', 'client-1'));
    await waitFor(() =>
      expect(addToastMock).toHaveBeenCalledWith({ content: 'toast_message.clients.archive_success' }),
    );
  });

  it('shows an archive-direction error toast when the archive request rejects', async () => {
    archiveClientMock.mockRejectedValueOnce(new Error('request failed'));
    const user = userEvent.setup();
    renderBoard();

    await user.click(screen.getByRole('button', { name: /common\.archive/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /common\.archive/ }));

    await waitFor(() => expect(archiveClientMock).toHaveBeenCalledWith('acme', 'client-1'));
    await waitFor(() =>
      expect(showModuleErrorToastMock).toHaveBeenCalledWith(expect.any(Error), {
        default: 'toast_message.clients.archive_failed',
      }),
    );
  });

  it('closes the confirmation modal as soon as the archive action fires, without waiting on the result', async () => {
    archiveClientMock.mockResolvedValueOnce({});
    const user = userEvent.setup();
    renderBoard();

    await user.click(screen.getByRole('button', { name: /common\.archive/ }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /common\.archive/ }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
