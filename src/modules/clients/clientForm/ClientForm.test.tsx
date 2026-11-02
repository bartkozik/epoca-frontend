import * as requests from '@/modules/clients/requests';
import { ClientType } from '@/modules/clients/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClientForm from './ClientForm';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

// handle-validation-errors.ts and ClientForm's own error-toast path call the `i18next` singleton
// directly (not via `useTranslation`), so it needs its own mock too -- matching the established
// pattern in AssignUserForm.test.tsx -- otherwise the real, uninitialized i18next instance resolves
// validation messages to '' and the assertions below see the FormErrorMessage fallback text instead.
vi.mock('i18next', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

const { addToastMock } = vi.hoisted(() => ({ addToastMock: vi.fn() }));

vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('@/core/providers/toastProvider', () => ({
  addToast: addToastMock,
  useToast: () => ({ addToast: addToastMock }),
}));

vi.mock('@/modules/clients/requests', () => ({
  getClients: vi.fn(),
  addNewClient: vi.fn(),
}));
const getClientsMock = requests.getClients as unknown as ReturnType<typeof vi.fn>;
const addNewClientMock = requests.addNewClient as unknown as ReturnType<typeof vi.fn>;

const existingClient = {
  archivedAt: '',
  color: '#000000',
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

const onCreatedMock = vi.fn();

const renderForm = (): void => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ClientForm onCancel={vi.fn()} onCreated={onCreatedMock} />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  getClientsMock.mockResolvedValue({ data: { count: 1, results: [existingClient] } });
});

describe('ClientForm', () => {
  it('rejects a name already used by another client without calling the create mutation', async () => {
    const user = userEvent.setup();
    renderForm();

    await waitFor(() => expect(getClientsMock).toHaveBeenCalled());
    const nameInput = screen.getByLabelText(/client_name/);
    await user.type(nameInput, 'Acme');
    await user.click(screen.getByRole('button', { name: /common.save/ }));

    expect(await screen.findByText('common.error.name_is_already_in_use')).toBeVisible();
    expect(addNewClientMock).not.toHaveBeenCalled();
  });

  it('submits a valid new client name', async () => {
    addNewClientMock.mockResolvedValueOnce({ data: { ...existingClient, id: 'client-2', name: 'New Co' } });
    const user = userEvent.setup();
    renderForm();

    await waitFor(() => expect(getClientsMock).toHaveBeenCalled());
    await user.type(screen.getByLabelText(/client_name/), 'New Co');
    await user.click(screen.getByRole('button', { name: /common.save/ }));

    await waitFor(() => expect(addNewClientMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(onCreatedMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'client-2', name: 'New Co' })),
    );
  });

  it('shows a success toast once the client is created', async () => {
    addNewClientMock.mockResolvedValueOnce({ data: { ...existingClient, id: 'client-2', name: 'New Co' } });
    const user = userEvent.setup();
    renderForm();

    await waitFor(() => expect(getClientsMock).toHaveBeenCalled());
    await user.type(screen.getByLabelText(/client_name/), 'New Co');
    await user.click(screen.getByRole('button', { name: /common.save/ }));

    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith({ content: 'toast_message.clients.client_added' }));
  });
});
