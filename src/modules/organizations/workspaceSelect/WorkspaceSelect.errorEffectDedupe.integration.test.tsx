import { showToastForError } from '@/core/utils/helpers';
import * as requests from '@/modules/organizations/requests';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import WorkspaceSelect from './WorkspaceSelect';


vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual('react-router-dom')),
  useNavigate: () => vi.fn(),
}));

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/core/theme/button', () => ({
  __esModule: true,
  default: ({ label, onClick }: { label?: string; onClick?: () => void }) => <button onClick={onClick}>{label}</button>,
}));
vi.mock('@/core/theme/icon', () => ({ __esModule: true, default: () => null, icons: { arrowRight: 'arrow-right' } }));
vi.mock('@/core/theme/itemLogo', () => ({ __esModule: true, default: () => null }));
vi.mock('@/core/theme/loadingArea', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/core/theme/logoImage', () => ({ __esModule: true, default: () => null }));

vi.mock('@/modules/organizations/requests', () => ({ getOrganizations: vi.fn() }));
const getOrganizationsMock = requests.getOrganizations as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/core/utils/helpers', () => ({ showToastForError: vi.fn() }));
const showToastForErrorMock = showToastForError as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/modules/organizations/utils', () => ({
  saveContextOrganizationSlugInLS: vi.fn(),
}));

const logoutMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/modules/auth/AuthProvider', () => ({ useAuth: () => ({ logout: logoutMock }) }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    checkIfContextOrganizationSlugIsInLocalStorage: vi.fn(),
    getContextOrganizationBySlug: vi.fn().mockResolvedValue(undefined),
  }),
}));

const renderWorkspaceSelect = (): void => {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceSelect />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  logoutMock.mockResolvedValue(undefined);
});

describe('WorkspaceSelect error side effect dedupe', () => {
  it('shows the data-fetch-error toast exactly once on a non-401 failure', async () => {
    getOrganizationsMock.mockRejectedValue(
      Object.assign(new Error('server error'), { isAxiosError: true, response: { status: 500 } }),
    );

    renderWorkspaceSelect();

    await waitFor(() => expect(showToastForErrorMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(showToastForErrorMock).toHaveBeenCalledTimes(1);
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it('calls logout exactly once on a 401 failure, without showing a toast', async () => {
    getOrganizationsMock.mockRejectedValue(
      Object.assign(new Error('unauthorized'), { isAxiosError: true, response: { status: 401 } }),
    );

    renderWorkspaceSelect();

    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(showToastForErrorMock).not.toHaveBeenCalled();
  });
});
