import { useUpdateOrganizationMutation } from '@/modules/organizations/hooks/useUpdateOrganizationMutation';
import { OrganizationUpdateRequestSchema } from '@/modules/organizations/models/organizationUpdate.model';
import * as requests from '@/modules/organizations/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/organizations/requests', () => ({ editOrganization: vi.fn() }));
const editOrganizationMock = requests.editOrganization as unknown as ReturnType<typeof vi.fn>;

const getContextOrganizationBySlugMock = vi.fn();
let contextOrganizationSlug = 'acme';
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({
    get contextOrganizationSlug() {
      return contextOrganizationSlug;
    },
    getContextOrganizationBySlug: getContextOrganizationBySlugMock,
  }),
}));

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  contextOrganizationSlug = 'acme';
  vi.clearAllMocks();
  getContextOrganizationBySlugMock.mockResolvedValue(undefined);
});

describe('OrganizationUpdateRequestSchema', () => {
  it('rejects an empty name', () => {
    const result = OrganizationUpdateRequestSchema.safeParse({ name: '' });
    expect(!result.success && result.error.issues[0].message).toBe('organizations.error.name_required');
  });
});

describe('useUpdateOrganizationMutation', () => {
  it('edits the organization and invalidates both the list and the single entry', async () => {
    editOrganizationMock.mockResolvedValueOnce(undefined);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateOrganizationMutation(), { wrapper });
    result.current.mutate({ slug: 'acme', name: 'Acme Renamed' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(editOrganizationMock).toHaveBeenCalledWith('acme', 'Acme Renamed');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['organizations'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['organization', 'acme'], exact: false });
  });

  it('refreshes the context organization bridge when the edited slug is the active one', async () => {
    editOrganizationMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useUpdateOrganizationMutation(), { wrapper });
    result.current.mutate({ slug: 'acme', name: 'Acme Renamed' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getContextOrganizationBySlugMock).toHaveBeenCalledWith('acme');
  });

  it('does not refresh the bridge when editing a non-active organization', async () => {
    contextOrganizationSlug = 'other-org';
    editOrganizationMock.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useUpdateOrganizationMutation(), { wrapper });
    result.current.mutate({ slug: 'acme', name: 'Acme Renamed' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getContextOrganizationBySlugMock).not.toHaveBeenCalled();
  });

  it('keeps a successful edit successful when the subscribed context refresh fails', async () => {
    editOrganizationMock.mockResolvedValueOnce(undefined);
    getContextOrganizationBySlugMock.mockRejectedValueOnce(new Error('context refresh failed'));

    const { result } = renderHook(() => useUpdateOrganizationMutation(), { wrapper });
    result.current.mutate({ slug: 'acme', name: 'Acme Renamed' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getContextOrganizationBySlugMock).toHaveBeenCalledWith('acme');
  });
});
