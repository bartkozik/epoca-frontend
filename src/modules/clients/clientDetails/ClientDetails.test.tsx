import * as requests from '@/modules/clients/requests';
import { ClientType } from '@/modules/clients/types';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import ClientDetails from './ClientDetails';

const { setClientMock } = vi.hoisted(() => ({ setClientMock: vi.fn() }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('@/modules/clients/ClientsProvider', () => ({ useClients: () => ({ setClient: setClientMock }) }));

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => vi.fn(),
  useParams: () => ({ clientId: 'client-1', tab: 'client-details' }),
}));

vi.mock('@/modules/clients/assignedProjects', () => ({ __esModule: true, default: () => null }));

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
  projectCount: 0,
  texture: 'texture-1',
  type: ClientType.External,
};

describe('ClientDetails', () => {
  it('renders the client name once the get-by-id query resolves and updates the clients context', async () => {
    getClientMock.mockResolvedValueOnce({ data: { count: 1, results: [rawClient] } });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ClientDetails />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Acme')).toBeVisible();
    expect(setClientMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'client-1', name: 'Acme' }));
  });

  // Regression guard: the GoBack link used to be gated behind `if (!client) return null`, so the
  // page was entirely blank (no link, no spinner) while the get-by-id query was still in flight.
  it('renders the GoBack link while the client query is still loading', () => {
    getClientMock.mockReturnValue(new Promise(() => {})); // never resolves -- asserts the pre-resolution render

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ClientDetails />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // A regex, not the exact key: GoBack's Button renders a mocked SVG icon whose filename text
    // concatenates into the link's accessible name alongside the label span's text.
    expect(screen.getByRole('link', { name: /go_back_back_to_clients_list/ })).toBeVisible();
  });
});
