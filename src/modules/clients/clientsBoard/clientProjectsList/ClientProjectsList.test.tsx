import * as requests from '@/modules/clients/requests';
import { Client, ClientType } from '@/modules/clients/types';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClientProjectsList from './ClientProjectsList';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ hasAccess: () => true }) }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));

vi.mock('@/modules/clients/requests', () => ({ getClientProjects: vi.fn() }));
const getClientProjectsMock = requests.getClientProjects as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/core/theme/spinner', () => ({
  __esModule: true,
  default: ({ loading }: { loading?: boolean }): JSX.Element | null => (loading ? <div role="status" /> : null),
}));

const client: Client = {
  archivedAt: '',
  color: '#000',
  createdAt: '',
  createdBy: '',
  id: 'client-1',
  logo: '',
  modifiedAt: '',
  modifiedBy: '',
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

const clientWithProjects: Client = { ...client, projectCount: 2 };

const toggleButtonName = 'clients.clients_board.client_project_list.button.project_count.label';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const renderList = (renderClient: Client = client): void => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ClientProjectsList client={renderClient} onProjectAdd={vi.fn()} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
};

describe('ClientProjectsList', () => {
  beforeEach(() => {
    getClientProjectsMock.mockReset();
  });

  it('shows the add-project button when there are no projects yet', () => {
    renderList();
    expect(screen.getByRole('button', { name: 'common.add_new_project' })).toBeVisible();
  });

  it('only fetches client projects once the dropdown is opened', async () => {
    getClientProjectsMock.mockResolvedValue({ data: { results: [] } });
    renderList(clientWithProjects);

    expect(getClientProjectsMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: toggleButtonName }));

    await waitFor(() => expect(getClientProjectsMock).toHaveBeenCalledWith('acme', 'client-1'));
  });

  it('renders the fetched projects as links once the dropdown opens and the query resolves', async () => {
    getClientProjectsMock.mockResolvedValue({
      data: {
        results: [
          { id: 'project-1', name: 'Website Revamp' },
          { id: 'project-2', name: 'Mobile App' },
        ],
      },
    });
    renderList(clientWithProjects);

    await userEvent.click(screen.getByRole('button', { name: toggleButtonName }));

    expect(await screen.findByRole('link', { name: /Website Revamp/ })).toBeVisible();
    expect(screen.getByRole('link', { name: /Mobile App/ })).toBeVisible();
  });

  it('shows the spinner only while the projects query is in flight', async () => {
    const pending = createDeferred<{ data: { results: never[] } }>();
    getClientProjectsMock.mockReturnValue(pending.promise);
    renderList(clientWithProjects);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: toggleButtonName }));

    expect(await screen.findByRole('status')).toBeVisible();

    pending.resolve({ data: { results: [] } });

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
