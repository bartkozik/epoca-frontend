import * as requests from '@/modules/organizations/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDeassignMemberConfirmation } from './useDeassignMemberConfirmation';

vi.mock('@/modules/organizations/requests', () => ({
  deassignUserFromOrganization: vi.fn(),
}));
const deassignUserFromOrganizationMock = requests.deassignUserFromOrganization as unknown as ReturnType<typeof vi.fn>;

const { addToastMock, fetchContextOrganizationUsersMock, removeContextOrganizationUserMock } = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  fetchContextOrganizationUsersMock: vi.fn(),
  removeContextOrganizationUserMock: vi.fn(),
}));

vi.mock('@/core/providers/toastProvider/ToastProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/providers/toastProvider/ToastProvider')>()),
  useToast: () => ({ addToast: addToastMock }),
}));
vi.mock('@/modules/organizations/WorkspaceProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/organizations/WorkspaceProvider')>()),
  useWorkspace: () => ({
    contextOrganizationSlug: 'acme',
    fetchContextOrganizationUsers: fetchContextOrganizationUsersMock,
    removeContextOrganizationUser: removeContextOrganizationUserMock,
  }),
}));

vi.mock('@/core/utils/helpers', () => ({ showToastForError: vi.fn() }));

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});

describe('useDeassignMemberConfirmation', () => {
  it('starts closed with no target user', () => {
    const { result } = renderHook(() => useDeassignMemberConfirmation(), { wrapper });

    expect(result.current.isOpen).toBe(false);
  });

  it('opens the confirmation for the given user id', () => {
    const { result } = renderHook(() => useDeassignMemberConfirmation(), { wrapper });

    act(() => result.current.openConfirmation('user-2'));

    expect(result.current.isOpen).toBe(true);
  });

  it('closeConfirmation clears the target without calling the mutation', () => {
    const { result } = renderHook(() => useDeassignMemberConfirmation(), { wrapper });

    act(() => result.current.openConfirmation('user-2'));
    act(() => result.current.closeConfirmation());

    expect(result.current.isOpen).toBe(false);
    expect(deassignUserFromOrganizationMock).not.toHaveBeenCalled();
  });

  it('confirmDeassign calls the mutation for the opened user and closes on success', async () => {
    deassignUserFromOrganizationMock.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useDeassignMemberConfirmation(), { wrapper });

    act(() => result.current.openConfirmation('user-2'));
    act(() => result.current.confirmDeassign());

    await waitFor(() => expect(deassignUserFromOrganizationMock).toHaveBeenCalledWith('acme', 'user-2'));
    await waitFor(() => expect(result.current.isOpen).toBe(false));
    expect(fetchContextOrganizationUsersMock).toHaveBeenCalled();
  });

  it('confirmDeassign does nothing when no user is targeted', () => {
    const { result } = renderHook(() => useDeassignMemberConfirmation(), { wrapper });

    act(() => result.current.confirmDeassign());

    expect(deassignUserFromOrganizationMock).not.toHaveBeenCalled();
  });

  it('keeps the confirmation open when the mutation fails', async () => {
    deassignUserFromOrganizationMock.mockRejectedValueOnce(new Error('failed'));
    const { result } = renderHook(() => useDeassignMemberConfirmation(), { wrapper });

    act(() => result.current.openConfirmation('user-2'));
    act(() => result.current.confirmDeassign());

    await waitFor(() => expect(deassignUserFromOrganizationMock).toHaveBeenCalled());
    expect(result.current.isOpen).toBe(true);
  });
});
