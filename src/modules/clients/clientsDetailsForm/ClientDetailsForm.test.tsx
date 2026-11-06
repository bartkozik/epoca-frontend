import { showModuleErrorToast } from '@/core/utils/helpers';
import * as requests from '@/modules/clients/requests';
import { ClientType } from '@/modules/clients/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClientDetailsForm from './ClientDetailsForm';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockNavigate = vi.fn();
let mockLocationState: unknown = null;

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ search: '', state: mockLocationState }),
}));

vi.mock('i18next', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

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

vi.mock('@/core/theme/icon', () => ({
  __esModule: true,
  default: ({ icon }: { icon: string }) => <span data-testid={`icon-${icon}`} />,
  icons: new Proxy({}, { get: (_target, prop: string) => prop }),
}));

vi.mock('@/modules/clients/backgroundPicker', () => ({
  __esModule: true,
  default: () => null,
  BackgroundType: { Color: 'Color', Texture: 'Texture' },
}));
vi.mock('@/core/theme/select', () => ({ __esModule: true, default: () => null }));
vi.mock('@/core/theme/button', () => ({
  __esModule: true,
  default: ({ label, onClick }: { label?: string; onClick?: () => void }) => <button onClick={onClick}>{label}</button>,
}));

vi.mock('@/modules/clients/requests', () => ({
  getClients: vi.fn(),
  archiveClient: vi.fn(),
  unarchiveClient: vi.fn(),
  editClient: vi.fn(),
}));
const getClientsMock = requests.getClients as unknown as ReturnType<typeof vi.fn>;
const unarchiveClientMock = requests.unarchiveClient as unknown as ReturnType<typeof vi.fn>;
const editClientMock = requests.editClient as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/core/utils/helpers', async (importOriginal) => ({
  ...(await importOriginal()),
  showModuleErrorToast: vi.fn(),
}));
const showModuleErrorToastMock = showModuleErrorToast as unknown as ReturnType<typeof vi.fn>;

const addToastMock = vi.fn();

const baseClient = {
  archivedAt: '',
  color: '#fff',
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
  archived: false,
  archivedDate: '',
  formattedCreatedAt: '',
  projects: [],
};

const mountForm = (hasAccess: boolean, client: typeof baseClient = baseClient): void => {
  setContexts({
    authContext: { hasAccess: () => hasAccess },
    workspaceContext: { contextOrganizationSlug: 'acme' },
    toastContext: { addToast: addToastMock },
  });
  getClientsMock.mockResolvedValue({ data: { count: 1, results: [client] } });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ClientDetailsForm client={client} />
    </QueryClientProvider>,
  );
};

describe('ClientDetailsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationState = null;
  });

  it('renders the client name as editable when the user has manager access', () => {
    mountForm(true);
    expect(screen.getByDisplayValue('Acme')).toBeEnabled();
  });

  it('renders the client name as read-only when the user lacks manager access', () => {
    mountForm(false);
    expect(screen.getByDisplayValue('Acme')).toHaveAttribute('readonly');
  });

  it('shows an edit-success toast once the update request resolves', async () => {
    editClientMock.mockResolvedValueOnce({ data: baseClient });
    const user = userEvent.setup();
    mountForm(true);

    await waitFor(() => expect(getClientsMock).toHaveBeenCalled());
    await user.type(screen.getByDisplayValue('Acme'), ' Updated');
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => expect(editClientMock).toHaveBeenCalled());
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith({ content: 'toast_message.clients.edit_success' }));
  });

  describe('archive/unarchive feedback', () => {
    const archivedClient = { ...baseClient, archived: true, archivedDate: '2024-02-01' };

    it('shows an unarchive-direction success toast and navigates back once the request resolves', async () => {
      unarchiveClientMock.mockResolvedValueOnce({});
      const user = userEvent.setup();
      mountForm(true, archivedClient);

      await user.click(screen.getByRole('button', { name: 'common.unarchive' }));
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'common.unarchive' }));

      await waitFor(() => expect(unarchiveClientMock).toHaveBeenCalledWith('acme', 'client-1'));
      await waitFor(() =>
        expect(addToastMock).toHaveBeenCalledWith({ content: 'toast_message.clients.unarchive_success' }),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/clients');
    });

    it('preserves the origin list search (fromListSearch) on the post-archive redirect', async () => {
      mockLocationState = { fromListSearch: '?status=Archived' };
      unarchiveClientMock.mockResolvedValueOnce({});
      const user = userEvent.setup();
      mountForm(true, archivedClient);

      await user.click(screen.getByRole('button', { name: 'common.unarchive' }));
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'common.unarchive' }));

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/clients?status=Archived'));
    });

    it('shows an unarchive-direction error toast and does not navigate when the request rejects', async () => {
      unarchiveClientMock.mockRejectedValueOnce(new Error('request failed'));
      const user = userEvent.setup();
      mountForm(true, archivedClient);

      await user.click(screen.getByRole('button', { name: 'common.unarchive' }));
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'common.unarchive' }));

      await waitFor(() => expect(unarchiveClientMock).toHaveBeenCalledWith('acme', 'client-1'));
      await waitFor(() =>
        expect(showModuleErrorToastMock).toHaveBeenCalledWith(expect.any(Error), {
          default: 'toast_message.clients.unarchive_failed',
        }),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});
