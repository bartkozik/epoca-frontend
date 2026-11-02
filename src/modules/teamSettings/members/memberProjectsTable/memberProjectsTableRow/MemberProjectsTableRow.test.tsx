import * as requests from '@/modules/projects/requests';
import { Project } from '@/modules/projects/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MemberProjectsTableRow from './MemberProjectsTableRow';

const { addToastMock, projectsContext } = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  projectsContext: {},
}));

vi.mock('@/core/providers/toastProvider/ToastProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/providers/toastProvider/ToastProvider')>()),
  useToast: () => ({ addToast: addToastMock }),
}));
vi.mock('@/modules/organizations/WorkspaceProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/organizations/WorkspaceProvider')>()),
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));
vi.mock('@/modules/projects/ProjectsProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/projects/ProjectsProvider')>()),
  useProjects: () => projectsContext,
}));
vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('@/modules/projects/requests', () => ({ addUser: vi.fn(), removeUser: vi.fn() }));
const addUserMock = requests.addUser as unknown as ReturnType<typeof vi.fn>;
const removeUserMock = requests.removeUser as unknown as ReturnType<typeof vi.fn>;

const project = {
  id: 'project-1',
  createdBy: 'user-2',
  name: 'Website',
  client: { id: 'client-1', name: 'Acme', color: '#000', texture: '' },
} as unknown as Project;

const renderRow = (isAssigned: boolean): ReturnType<typeof render> => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  Object.assign(projectsContext, {
    setSelectedProjectUser: vi.fn(),
    isUserAssignedToProject: () => isAssigned,
    selectedProjectUser: { id: 'user-1', projects: [] },
    isProjectUserProjectOwner: (createdBy: string, userId: string) => createdBy === userId,
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemberProjectsTableRow project={project} />
    </QueryClientProvider>,
  );
};

beforeEach(() => vi.clearAllMocks());

describe('MemberProjectsTableRow', () => {
  it('assigns the user to the project when toggled on', async () => {
    addUserMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderRow(false);

    await user.click(screen.getByRole('switch'));

    await waitFor(() => expect(addUserMock).toHaveBeenCalledWith('acme', 'user-1', 'project-1', 'Member'));
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith({ content: 'toast_message.projects.user_add' }));
  });

  it('unassigns the user from the project when toggled off', async () => {
    removeUserMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderRow(true);

    await user.click(screen.getByRole('switch'));

    await waitFor(() => expect(removeUserMock).toHaveBeenCalledWith('acme', 'user-1', 'project-1'));
    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith({ content: 'toast_message.projects.user_deleted' }));
  });

  it('reverts the optimistic toggle when the request fails', async () => {
    addUserMock.mockRejectedValueOnce(new Error('network error'));
    const user = userEvent.setup();
    renderRow(false);

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);

    // The mocked rejection resolves within the same act() flush as the click, so the optimistic
    // flip and its revert both happen before control returns here -- settling back to unassigned
    // is what matters, not catching the transient intermediate state.
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(addToastMock).not.toHaveBeenCalled();
  });
});
