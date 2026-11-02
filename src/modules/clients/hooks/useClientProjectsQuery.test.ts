import { useClientProjectsQuery } from '@/modules/clients/hooks/useClientProjectsQuery';
import { clientProjectsQueryKey } from '@/modules/clients/queryKeys';
import * as requests from '@/modules/clients/requests';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/modules/clients/requests', () => ({ getClientProjects: vi.fn() }));
const getClientProjectsMock = requests.getClientProjects as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/modules/organizations/WorkspaceProvider', () => ({
  useWorkspace: () => ({ contextOrganizationSlug: 'acme' }),
}));

// createElement instead of JSX: this file stays `.ts` (matching this repo's
// check-file/filename-naming-convention, which only exempts `use*.test.tsx` from PascalCase),
// so it can't use JSX syntax, which only parses in `.tsx`.
const wrapper = ({ children }: { children: ReactNode }): ReactElement => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('clientProjectsQueryKey', () => {
  it('is a flat key of the entity prefix, the organization slug, and the client id', () => {
    expect(clientProjectsQueryKey('acme', 'client-1')).toEqual(['clientProjects', 'acme', 'client-1']);
  });
});

describe('useClientProjectsQuery', () => {
  it('is disabled until enabled is explicitly true (the dropdown fetches on first open, not on mount)', () => {
    const { result } = renderHook(() => useClientProjectsQuery('client-1', false), { wrapper });

    expect(getClientProjectsMock).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches once enabled', async () => {
    getClientProjectsMock.mockResolvedValueOnce({ data: { results: [] } });

    const { result } = renderHook(() => useClientProjectsQuery('client-1', true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getClientProjectsMock).toHaveBeenCalledWith('acme', 'client-1');
  });
});
