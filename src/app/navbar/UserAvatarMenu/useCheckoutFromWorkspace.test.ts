import { queryClient } from '@/core/api';
import {
  getContextOrganizationIdFromLS,
  removeContextOrganizationIdFromLS,
  removeContextOrganizationSlugFromLS,
  saveContextOrganizationIdInLS,
} from '@/modules/organizations/utils';
import { renderHook } from '@testing-library/react';
import { useCheckoutFromWorkspace } from './useCheckoutFromWorkspace';

const providerMocks = vi.hoisted(() => ({ clients: vi.fn(), projects: vi.fn(), workspace: vi.fn() }));
vi.mock('@/modules/clients/ClientsProvider', () => ({ useClients: providerMocks.clients }));
vi.mock('@/modules/projects/ProjectsProvider', () => ({ useProjects: providerMocks.projects }));
vi.mock('@/modules/organizations/WorkspaceProvider', () => ({ useWorkspace: providerMocks.workspace }));

const { removeAllUnitsMock } = vi.hoisted(() => ({ removeAllUnitsMock: vi.fn() }));
vi.mock('@/modules/workingTime/UnitWorkspaceProvider', () => ({ removeAllUnits: removeAllUnitsMock }));

const removeAllClientsMock = vi.fn();
const removeAllProjectsMock = vi.fn();
const resetContextOrganizationIdMock = vi.fn(() => removeContextOrganizationIdFromLS());

beforeEach(() => {
  removeAllUnitsMock.mockClear();
  removeAllClientsMock.mockClear();
  removeAllProjectsMock.mockClear();
  resetContextOrganizationIdMock.mockClear();
  providerMocks.clients.mockReturnValue({ removeAllClients: removeAllClientsMock });
  providerMocks.projects.mockReturnValue({ removeAllProjects: removeAllProjectsMock });
  providerMocks.workspace.mockReturnValue({ resetContextOrganizationId: resetContextOrganizationIdMock });
  queryClient.clear();
  // The real, shared queryClient retries once by default -- avoids adding react-query's retry
  // backoff delay to the rejected-request assertion below.
  queryClient.setDefaultOptions({ queries: { retry: false } });
});

afterEach(() => {
  removeContextOrganizationSlugFromLS();
  removeContextOrganizationIdFromLS();
});

describe('useCheckoutFromWorkspace', () => {
  it('clears workspace state and cached workspace queries', () => {
    queryClient.setQueryData(['workUnitOverride', 'old-workspace', 'wu-1'], { revision: 1 });
    queryClient.setQueryData(['workUnitOverrideHistory', 'old-workspace', 'wu-1', 3, 1], { results: [] });
    queryClient.setQueryData(['pivotTable', 'old-workspace', '{}', 'no-filters'], { response: null });

    const { result } = renderHook(() => useCheckoutFromWorkspace());
    result.current();

    expect(removeAllProjectsMock).toHaveBeenCalledTimes(1);
    expect(removeAllClientsMock).toHaveBeenCalledTimes(1);
    expect(removeAllUnitsMock).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['workUnitOverride', 'old-workspace', 'wu-1'])).toBeUndefined();
    expect(queryClient.getQueryData(['workUnitOverrideHistory', 'old-workspace', 'wu-1', 3, 1])).toBeUndefined();
    expect(queryClient.getQueryData(['pivotTable', 'old-workspace', '{}', 'no-filters'])).toBeUndefined();
    expect(resetContextOrganizationIdMock).toHaveBeenCalledTimes(1);
  });

  it('clears the persisted organization id via resetContextOrganizationId', () => {
    saveContextOrganizationIdInLS('org-123');

    const { result } = renderHook(() => useCheckoutFromWorkspace());
    result.current();

    expect(getContextOrganizationIdFromLS()).toBeNull();
    expect(resetContextOrganizationIdMock).toHaveBeenCalledTimes(1);
  });
});
