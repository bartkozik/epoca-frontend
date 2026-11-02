import { useCreateOrganizationMutation } from '@/modules/organizations/hooks/useCreateOrganizationMutation';
import { OrganizationCreateRequestSchema } from '@/modules/organizations/models/organizationCreate.model';
import * as requests from '@/modules/organizations/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/organizations/requests', () => ({ addNewOrganization: vi.fn() }));
const addNewOrganizationMock = requests.addNewOrganization as unknown as ReturnType<typeof vi.fn>;

const refreshAfterPermissionGrantMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/modules/auth/AuthProvider', () => ({
  useAuth: () => ({ refreshAfterPermissionGrant: refreshAfterPermissionGrantMock }),
}));

const rawOrganization = {
  archivedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'user-1',
  id: 'org-1',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'user-1',
  name: 'Acme',
  slug: 'acme',
};

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }): ReactElement =>
  createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});

describe('OrganizationCreateRequestSchema', () => {
  it('accepts a valid name and slug', () => {
    expect(OrganizationCreateRequestSchema.safeParse({ name: 'Acme', slug: 'acme' }).success).toBe(true);
  });

  it('rejects an empty name with the i18n key as the message', () => {
    const result = OrganizationCreateRequestSchema.safeParse({ name: '', slug: 'acme' });
    expect(!result.success && result.error.issues[0].message).toBe('organizations.error.name_required');
  });

  it('rejects a slug with uppercase letters or spaces', () => {
    const result = OrganizationCreateRequestSchema.safeParse({ name: 'Acme', slug: 'Acme Corp' });
    expect(!result.success && result.error.issues[0].message).toBe('organizations.error.slug_invalid');
  });
});

describe('useCreateOrganizationMutation', () => {
  it('creates an organization, invalidates the list, and refreshes permissions', async () => {
    addNewOrganizationMock.mockResolvedValueOnce({ data: rawOrganization });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateOrganizationMutation(), { wrapper });
    result.current.mutate({ name: 'Acme', slug: 'acme' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(addNewOrganizationMock).toHaveBeenCalledWith('Acme', 'acme');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['organizations'], exact: false });
    expect(refreshAfterPermissionGrantMock).toHaveBeenCalled();
  });
});
